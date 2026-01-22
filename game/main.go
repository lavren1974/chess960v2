package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	// corchess "github.com/corentings/chess"
	// chess "github.com/notnil/chess"
	// "github.com/notnil/chess/uci"

	"berger"

	chess "github.com/lavren1974/chess960"
	uci "github.com/lavren1974/chess960/uci"
)

// Config holds match + engine settings. Supports either a single block (applied to both)
// or per-side overrides via EngineA / EngineB.
// Types moved to config.go and types.go

func main() {
	// Load environment from .env if present (for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
	loadDotEnv(".env")

	cfgPath := flag.String("config", "config.json", "Path to config JSON")
	outPGN := flag.String("out", "", "Optional output PGN file path (defaults stdout)")
	debug := flag.Bool("debug", false, "Enable UCI debug log to stdout")
	// Supabase integration flags
	sbUse := flag.Bool("supabase", false, "Enable: fetch pending match from Supabase and update its PGN+status")
	sbURL := flag.String("supabase-url", os.Getenv("SUPABASE_URL"), "Supabase base URL (e.g., http://localhost:8000)")
	sbDefaultKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	sbKey := flag.String("supabase-key", sbDefaultKey, "Supabase service role key (defaults to SUPABASE_SERVICE_ROLE_KEY)")
	var enforceArg boolFlag
	flag.Var(&enforceArg, "enforce-draws", "Auto-stop on automatic draws (threefold/50-move/insufficient)")
	flag.Parse()

	cfg, err := loadConfig(*cfgPath)
	if err != nil {
		fatal("load config: %v", err)
	}
	// Apply CLI override for draw enforcement if provided
	if enforceArg.set {
		if cfg.EnforceDraws == nil {
			t := enforceArg.value
			cfg.EnforceDraws = &t
		} else {
			*cfg.EnforceDraws = enforceArg.value
		}
	}

	// Positional override via CLI: custom back-rank layouts
	// Usage: ./chess960v2 WHITE_RANK BLACK_RANK
	// Example: NQBRKNRB bnrqknrb -> FEN for engine and SAN derived accordingly
	if args := flag.Args(); len(args) == 2 {
		wRank := args[0]
		bRank := args[1]
		if err := validateRank(wRank, true); err != nil {
			fatal("white rank invalid: %v", err)
		}
		if err := validateRank(bRank, false); err != nil {
			fatal("black rank invalid: %v", err)
		}
		engFen, err := fenForEngineFromRanks(wRank, bRank)
		if err != nil {
			fatal("build engine FEN: %v", err)
		}
		cfg.StartFEN = engFen
		// Ensure engines receive Chess960 semantics for castling from arbitrary starts
		cfg.EnableChess960 = true
	}

	// Parallel or single-run mode
	// Set global ELO K-factor from config
	eloK = cfg.EloKFactor
	// Prefer service role key for RLS-protected writes when available
	if *sbUse {
		if srv := os.Getenv("SUPABASE_SERVICE_ROLE_KEY"); srv != "" {
			*sbKey = srv
		}
		if *sbURL == "" || *sbKey == "" {
			fatal("supabase mode requires -supabase-url and SUPABASE_SERVICE_ROLE_KEY (or pass the service role via -supabase-key)")
		}
		fmt.Fprintf(os.Stderr, "Supabase mode: %s (role=service_role)\n", orDefault(*sbURL, "(none)"))
	}

	if *sbUse && cfg.ConcurrentMatches > 1 {
		runSupabasePool(cfg, *debug, *outPGN, *sbURL, *sbKey)
		return
	}

	// Single-run flow (existing behavior)
	var matchID *int64
	var whiteID, blackID int64
	if *sbUse {
		if *sbURL == "" || *sbKey == "" {
			fatal("supabase mode requires -supabase-url and SUPABASE_SERVICE_ROLE_KEY (or pass the service role via -supabase-key)")
		}
		id, whiteMini, blackMini, round, wID, bID, _, err := fetchPendingSupabaseMatch(*sbURL, *sbKey, cfg.RoundStart, cfg.RoundEnd, cfg.ChampionshipID)
		if err != nil {
			fatal("supabase fetch: %v", err)
		}
		if id == 0 {
			fatal("supabase: no pending matches (status=false)")
		}
		// Try to claim before starting to avoid duplicate work across workers
		matchID = &id
		cfg.PGNWhite = formatPlayerTag(wID, whiteMini, White)
		cfg.PGNBlack = formatPlayerTag(bID, blackMini, Black)
		if round != nil {
			cfg.PGNRound = strconv.FormatInt(*round, 10)
		}
		whiteID, blackID = wID, bID
		// Build start FEN from database-provided mini_fen ranks
		if whiteMini != "" && blackMini != "" {
			if engFen, err := fenForEngineFromRanks(whiteMini, blackMini); err == nil {
				cfg.StartFEN = engFen
				cfg.EnableChess960 = true
			}
		}
	}
	out, err := playMatchOnce(cfg, flag.Args(), *debug)
	if err != nil {
		fatal("play match: %v", err)
	}
	if *outPGN == "" {
		fmt.Println(out)
	} else {
		if err := os.MkdirAll(filepath.Dir(*outPGN), 0o755); err != nil {
			fatal("mkdir: %v", err)
		}
		if err := os.WriteFile(*outPGN, []byte(out), 0o644); err != nil {
			fatal("write pgn: %v", err)
		}
		fmt.Printf("Saved PGN to %s\n", *outPGN)
	}
	if *sbUse && matchID != nil {
		applied, err := updateSupabaseMatch(*sbURL, *sbKey, *matchID, out, whiteID, blackID, cfg.ChampionshipID)
		if err != nil {
			fatal("supabase update: %v", err)
		}
		if applied {
			fmt.Printf("Completed match id=%d\n", *matchID)
		} else {
			fmt.Fprintf(os.Stderr, "Skipped already-completed match id=%d\n", *matchID)
		}
	}
}

// boolFlag captures whether a boolean flag was explicitly set.
type boolFlag struct {
	set   bool
	value bool
}

// formatPlayerTag builds the PGN name for a player based on id rules.
// White ids 1001-1960 -> w-{id-1001}; Black ids 2001-2960 -> b-{id-2001}.
// Falls back to provided fallback or raw id when outside the ranges.
func formatPlayerTag(id int64, fallback string, side Side) string {
	switch side {
	case White:
		if id >= 1001 && id <= 1961 {
			return fmt.Sprintf("w-%d", id-1000)
		}
	case Black:
		if id >= 2001 && id <= 2961 {
			return fmt.Sprintf("b-%d", id-2000)
		}
	}
	if fallback != "" {
		return fallback
	}
	if id != 0 {
		return fmt.Sprintf("%d", id)
	}
	return ""
}

func (b *boolFlag) String() string {
	if b == nil {
		return ""
	}
	if b.value {
		return "true"
	}
	return "false"
}

func (b *boolFlag) Set(s string) error {
	v, err := strconv.ParseBool(s)
	if err != nil {
		return err
	}
	b.value = v
	b.set = true
	return nil
}

// playMatchOnce encapsulates the full match flow and returns the SAN PGN.
func playMatchOnce(base *Config, args []string, debug bool) (string, error) {
	// Make a shallow copy of config to allow per-match mutation of fields like PGNWhite/Black and StartFEN
	cfg := *base
	// Random seed per match to avoid identical sequences (fallback to time if zero)
	randSrc := rand.New(rand.NewSource(func() int64 {
		if cfg.RandomSeed != 0 {
			return cfg.RandomSeed ^ time.Now().UnixNano()
		}
		return time.Now().UnixNano()
	}()))

	// Positional overrides via args or config defaults
	if len(args) == 2 {
		wRank := args[0]
		bRank := args[1]
		if cfg.PGNWhite == "" {
			cfg.PGNWhite = wRank
		}
		if cfg.PGNBlack == "" {
			cfg.PGNBlack = bRank
		}
		if err := validateRank(wRank, true); err != nil {
			return "", fmt.Errorf("white rank invalid: %w", err)
		}
		if err := validateRank(bRank, false); err != nil {
			return "", fmt.Errorf("black rank invalid: %w", err)
		}
		engFen, err := fenForEngineFromRanks(wRank, bRank)
		if err != nil {
			return "", fmt.Errorf("build engine FEN: %w", err)
		}
		cfg.StartFEN = engFen
		cfg.EnableChess960 = true
	}

	startFEN, err := chooseStartFEN(&cfg, randSrc)
	if err != nil {
		return "", fmt.Errorf("start FEN: %w", err)
	}
	startFEN = normalizeFENCastling(startFEN)
	use960 := cfg.EnableChess960 && !isStandardStartFEN(startFEN)
	sanFEN := startFEN
	// If this is a Chess960 start and we have an engine FEN with conservative rights,
	// compute X-FEN (KQkq) for SAN rendering when possible.
	if use960 {
		if xf, err := xfenFromEngineStartFEN(startFEN); err == nil {
			sanFEN = xf
		}
	}

	engWhite, whiteOpts, err := buildEngine(Side(White), &cfg, debug, use960)
	if err != nil {
		return "", fmt.Errorf("white engine: %w", err)
	}
	defer engWhite.Close()
	engBlack, blackOpts, err := buildEngine(Side(Black), &cfg, debug, use960)
	if err != nil {
		return "", fmt.Errorf("black engine: %w", err)
	}
	defer engBlack.Close()

	var movesUCI []string
	side := White
	maxPlies := cfg.MaxMoves * 2
	if cfg.MaxMoves <= 0 {
		maxPlies = 1000
	}

	enforce := true
	if cfg.EnforceDraws != nil {
		enforce = *cfg.EnforceDraws
	}
	var sim *chess.Game
	repetitionCounts := map[string]int{}
	if enforce {
		opts := []func(*chess.Game){chess.UseNotation(chess.UCINotation{})}
		if sanFEN != "" {
			if fenOpt, err := chess.FEN(sanFEN); err == nil {
				opts = append(opts, fenOpt)
			}
		}
		sim = chess.NewGame(opts...)
		repetitionCounts[positionKey(sim.Position())] = 1
	}
	forcedResult := ""
	forcedTermination := ""

	for ply := 0; ply < maxPlies; ply++ {
		eng := engWhite
		eopts := whiteOpts
		if side == Black {
			eng = engBlack
			eopts = blackOpts
		}
		cmdPos := rawPositionCmd{fen: startFEN, moves: movesUCI}
		cmdGo := uci.CmdGo{}
		switch strings.ToLower(eopts.mode) {
		case "depth":
			if eopts.depth > 0 {
				cmdGo.Depth = eopts.depth
			} else {
				cmdGo.Depth = 12
			}
		default:
			if eopts.movetime <= 0 {
				eopts.movetime = 1000
			}
			cmdGo.MoveTime = time.Duration(eopts.movetime) * time.Millisecond
		}
		if err := eng.Run(cmdPos, cmdGo); err != nil {
			es := err.Error()
			if strings.Contains(es, "(none)") || strings.Contains(es, "best move not found") {
				break
			}
			return "", fmt.Errorf("uci go: %w", err)
		}
		mv := eng.SearchResults().BestMove
		if strings.EqualFold(cfg.Randomness, "multipv") && eopts.multipv > 1 {
			topMoves := collectTopMovesMoves(eng, startFEN, movesUCI, eopts)
			if len(topMoves) > 0 {
				mv = topMoves[randSrc.Intn(len(topMoves))]
			}
		}
		if mv == nil {
			break
		}
		muci := chess.UCINotation{}.Encode(nil, mv)
		movesUCI = append(movesUCI, muci)
		if enforce {
			if err := applyC960UCIMove(sim, muci); err == nil {
				if sim.Method() != chess.Checkmate {
					key := positionKey(sim.Position())
					repetitionCounts[key]++
					if repetitionCounts[key] >= 3 {
						forcedResult = "1/2-1/2"
						forcedTermination = "Threefold repetition"
						break
					}
					if sim.Position().HalfMoveClock() >= 100 {
						forcedResult = "1/2-1/2"
						forcedTermination = "Fifty-move rule"
						break
					}
					if insuff, _ := hasInsufficientMaterial(sim.Position().Board()); insuff {
						forcedResult = "1/2-1/2"
						forcedTermination = "Insufficient material"
						break
					}
				}
			}
		}
		if side == White {
			side = Black
		} else {
			side = White
		}
	}
	return buildSANPGN(&cfg, sanFEN, use960, movesUCI, forcedResult, forcedTermination)
}

// runSupabasePool runs matches in parallel based on cfg.ConcurrentMatches, refilling as matches finish.
func runSupabasePool(cfg *Config, debug bool, outPath string, baseURL, key string) {
	conc := cfg.ConcurrentMatches
	if baseURL == "" || key == "" {
		fatal("supabase mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
	}
	pauseDur := time.Duration(cfg.PauseDurationSeconds) * time.Second
	roundStart := cfg.RoundStart
	roundEnd := cfg.RoundEnd
	useRounds := roundStart > 0 && roundEnd > 0
	if !useRounds {
		roundStart = 0
		roundEnd = 0
	}

	for round := roundStart; ; round++ {
		if useRounds && round > roundEnd {
			break
		}
		var roundPtr *int64
		if useRounds {
			r := int64(round)
			roundPtr = &r
			fmt.Printf("Starting round %d...\n", round)
		}
		completed := runSupabaseRound(cfg, debug, outPath, baseURL, key, conc, roundPtr)
		if completed > 0 {
			runBergerAfterRound(baseURL, key, cfg.ChampionshipID, debug, cfg.BergerConcurrency)
			if roundPtr != nil {
				if err := exportStandingsCSV(baseURL, key, cfg.ChampionshipID, int(*roundPtr)); err != nil {
					fmt.Fprintf(os.Stderr, "export standings failed: %v\n", err)
				}
			}
		}
		if !useRounds {
			break
		}
		if round < roundEnd && completed > 0 {
			fmt.Printf("Pause after round %d: sleeping %s...\n", round, pauseDur)
			time.Sleep(pauseDur)
		}
	}
}

// runSupabaseRound runs all pending matches for a specific round (or all rounds when round is nil).
func runSupabaseRound(cfg *Config, debug bool, outPath string, baseURL, key string, conc int, round *int64) int64 {
	var mu sync.Mutex
	inFlight := map[int64]struct{}{}
	var wg sync.WaitGroup
	var completed int64

	// helper to check if id is in flight
	inFlightHas := func(id int64) bool { mu.Lock(); defer mu.Unlock(); _, ok := inFlight[id]; return ok }
	inFlightAdd := func(id int64) { mu.Lock(); inFlight[id] = struct{}{}; mu.Unlock() }
	inFlightDel := func(id int64) { mu.Lock(); delete(inFlight, id); mu.Unlock() }

	// starts a single job goroutine
	startJob := func(id int64, whiteMini, blackMini string, matchRound *int64, whiteID, blackID int64) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Local copy of cfg with player names
			local := *cfg
			local.PGNWhite = formatPlayerTag(whiteID, whiteMini, White)
			local.PGNBlack = formatPlayerTag(blackID, blackMini, Black)
			if matchRound != nil {
				local.PGNRound = strconv.FormatInt(*matchRound, 10)
			}
			// Use DB mini_fen to build start FEN for this match
			if whiteMini != "" && blackMini != "" {
				if engFen, err := fenForEngineFromRanks(whiteMini, blackMini); err == nil {
					local.StartFEN = engFen
					local.EnableChess960 = true
				}
			}
			pgn, err := playMatchOnce(&local, nil, debug)
			if err != nil {
				fmt.Fprintf(os.Stderr, "match id=%d failed: %v\n", id, err)
				inFlightDel(id)
				return
			}
			// Save PGN optionally (per-id filename to avoid race)
			if outPath != "" {
				dir := filepath.Dir(outPath)
				base := filepath.Base(outPath)
				ext := filepath.Ext(base)
				name := strings.TrimSuffix(base, ext)
				file := filepath.Join(dir, name+fmt.Sprintf(".%d", id)+ext)
				if err := os.MkdirAll(dir, 0o755); err == nil {
					_ = os.WriteFile(file, []byte(pgn), 0o644)
				}
			}
			if applied, err := updateSupabaseMatch(baseURL, key, id, pgn, whiteID, blackID, cfg.ChampionshipID); err != nil {
				fmt.Fprintf(os.Stderr, "update supabase id=%d failed: %v\n", id, err)
			} else if applied {
				fmt.Printf("Completed match id=%d\n", id)
				atomic.AddInt64(&completed, 1)
			} else {
				fmt.Fprintf(os.Stderr, "Skipped already-completed match id=%d\n", id)
			}
			inFlightDel(id)
		}()
	}

	// Main refill loop
	for {
		// Fill up to conc
		for {
			mu.Lock()
			curInFlight := len(inFlight)
			// Limit new starts by concurrency
			if curInFlight >= conc {
				mu.Unlock()
				break
			}
			mu.Unlock()
			// fetch a batch and select a not-in-flight id
			rows, err := fetchBatchPending(baseURL, key, 20, round, cfg.ChampionshipID)
			if err != nil {
				fmt.Fprintf(os.Stderr, "supabase fetch: %v\n", err)
				time.Sleep(2 * time.Second)
				break
			}
			var picked *sbMatch
			for _, r := range rows {
				if !inFlightHas(r.ID) {
					rr := r
					picked = &rr
					break
				}
			}
			if picked == nil {
				break
			}
			inFlightAdd(picked.ID)
			var wMini, bMini string
			if picked.WhiteAgent != nil {
				wMini = picked.WhiteAgent.MiniFEN
			}
			if picked.BlackAgent != nil {
				bMini = picked.BlackAgent.MiniFEN
			}
			startJob(picked.ID, wMini, bMini, picked.Round, picked.PlayerWhite, picked.PlayerBlack)
		}

		mu.Lock()
		done := len(inFlight) == 0
		mu.Unlock()
		if done {
			// No in-flight and cannot fill further: exit if queue empty
			rows, err := fetchBatchPending(baseURL, key, 1, round, cfg.ChampionshipID)
			if err == nil && len(rows) == 0 {
				break
			}
			time.Sleep(1 * time.Second)
			continue
		}
		// Some in-flight; wait a bit and try to refill (if not at cycle limit)
		time.Sleep(300 * time.Millisecond)
	}
	wg.Wait()
	return atomic.LoadInt64(&completed)
}

func runBergerAfterRound(baseURL, key string, championshipID int64, debug bool, bergerConcurrency int) {
	if championshipID <= 0 {
		fmt.Fprintln(os.Stderr, "berger: championship_id is not set; skipping")
		return
	}
	opts := berger.Options{
		ChampionshipID:    championshipID,
		DryRun:            true,
		Debug:             debug,
		BaseURL:           baseURL,
		Key:               key,
		PlayerConcurrency: bergerConcurrency,
	}
	if err := berger.Run(opts); err != nil {
		fmt.Fprintf(os.Stderr, "berger dry-run failed: %v\n", err)
	}
	opts.DryRun = false
	opts.Silent = true
	opts.PlayerConcurrency = bergerConcurrency
	if err := berger.Run(opts); err != nil {
		fmt.Fprintf(os.Stderr, "berger update failed: %v\n", err)
	}
}

// fetchBatchPending returns up to limit pending rows ordered by id asc.
func fetchBatchPending(baseURL, key string, limit int, round *int64, championshipID int64) ([]sbMatch, error) {
	sel := "*,white:sf_agents!sf_matches_player_white_fkey(mini_fen),black:sf_agents!sf_matches_player_black_fkey(mini_fen)"
	path := "/sf_matches?status=eq.false"
	if championshipID > 0 {
		path += fmt.Sprintf("&championship_id=eq.%d", championshipID)
	}
	if round != nil {
		path += fmt.Sprintf("&round=eq.%d", *round)
	}
	path += fmt.Sprintf("&select=%s&order=id.asc&limit=%d", url.QueryEscape(sel), limit)
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch pending failed: %s: %s", resp.Status, string(b))
	}
	var rows []sbMatch
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}

type standingsRow struct {
	ID             int64        `json:"id"`
	PlayerID       int64        `json:"player_id"`
	GamesPlayed    int          `json:"games_played"`
	Wins           int          `json:"wins"`
	Draws          int          `json:"draws"`
	Losses         int          `json:"losses"`
	Points         json.Number  `json:"points"`
	BergvizerScore *json.Number `json:"bergvizer_score"`
	ChampionshipID int64        `json:"championship_id"`
}

func exportStandingsCSV(baseURL, key string, championshipID int64, round int) error {
	if championshipID <= 0 {
		return fmt.Errorf("championship_id is not set")
	}
	if round <= 0 {
		return fmt.Errorf("round is not set")
	}
	rows, err := fetchStandings(baseURL, key, championshipID)
	if err != nil {
		return err
	}
	dir := filepath.Join("rounds", fmt.Sprintf("%d", championshipID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(dir, fmt.Sprintf("%d.csv", round))
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	if err := w.Write([]string{
		"id",
		"player_id",
		"games_played",
		"wins",
		"draws",
		"losses",
		"points",
		"bergvizer_score",
		"championship_id",
	}); err != nil {
		return err
	}
	for _, r := range rows {
		berg := ""
		if r.BergvizerScore != nil {
			berg = r.BergvizerScore.String()
		}
		if err := w.Write([]string{
			fmt.Sprintf("%d", r.ID),
			fmt.Sprintf("%d", r.PlayerID),
			fmt.Sprintf("%d", r.GamesPlayed),
			fmt.Sprintf("%d", r.Wins),
			fmt.Sprintf("%d", r.Draws),
			fmt.Sprintf("%d", r.Losses),
			r.Points.String(),
			berg,
			fmt.Sprintf("%d", r.ChampionshipID),
		}); err != nil {
			return err
		}
	}
	w.Flush()
	return w.Error()
}

func fetchStandings(baseURL, key string, championshipID int64) ([]standingsRow, error) {
	selectCols := "id,player_id,games_played,wins,draws,losses,points,bergvizer_score,championship_id"
	path := fmt.Sprintf("/sf_standings?championship_id=eq.%d&select=%s&order=id.asc", championshipID, url.QueryEscape(selectCols))
	const pageSize = 1000
	var all []standingsRow
	for start := 0; ; start += pageSize {
		end := start + pageSize - 1
		resp, err := supabaseRequestRange(http.MethodGet, baseURL, key, path, nil, &start, &end)
		if err != nil {
			return nil, err
		}
		var batch []standingsRow
		err = func() error {
			defer resp.Body.Close()
			if resp.StatusCode >= 300 {
				b, _ := io.ReadAll(resp.Body)
				return fmt.Errorf("fetch standings failed: %s: %s", resp.Status, string(b))
			}
			dec := json.NewDecoder(resp.Body)
			dec.UseNumber()
			if err := dec.Decode(&batch); err != nil {
				return err
			}
			return nil
		}()
		if err != nil {
			return nil, err
		}
		all = append(all, batch...)
		if len(batch) < pageSize {
			break
		}
	}
	return all, nil
}

// Supabase REST client (minimal): fetch first pending and update PGN+status
type sbAgent struct {
	MiniFEN string `json:"mini_fen"`
}

type sbMatch struct {
	ID             int64    `json:"id"`
	CreatedAt      string   `json:"created_at"`
	PlayerWhite    int64    `json:"player_white"`
	PlayerBlack    int64    `json:"player_black"`
	PGN            string   `json:"pgn"`
	Status         bool     `json:"status"`
	ClaimedAt      *string  `json:"claimed_at"`
	Round          *int64   `json:"round"`
	ChampionshipID int64    `json:"championship_id"`
	WhiteAgent     *sbAgent `json:"white"`
	BlackAgent     *sbAgent `json:"black"`
}

func supabaseRequest(method, baseURL, key, path string, body []byte) (*http.Response, error) {
	url := strings.TrimRight(baseURL, "/") + "/rest/v1" + path
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)
	if method == http.MethodPatch || method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Prefer", "return=minimal")
	}
	client := &http.Client{Timeout: 30 * time.Second}
	return client.Do(req)
}

func supabaseRequestRange(method, baseURL, key, path string, body []byte, rangeStart, rangeEnd *int) (*http.Response, error) {
	url := strings.TrimRight(baseURL, "/") + "/rest/v1" + path
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)
	if rangeStart != nil && rangeEnd != nil {
		req.Header.Set("Range-Unit", "items")
		req.Header.Set("Range", fmt.Sprintf("%d-%d", *rangeStart, *rangeEnd))
	}
	if method == http.MethodPatch || method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Prefer", "return=minimal")
	}
	client := &http.Client{Timeout: 30 * time.Second}
	return client.Do(req)
}

// supabaseRequestPrefer is like supabaseRequest but allows a custom Prefer header value
// for methods that support it (PATCH/POST). When prefer is empty, defaults are used.
func supabaseRequestPrefer(method, baseURL, key, path string, body []byte, prefer string) (*http.Response, error) {
	url := strings.TrimRight(baseURL, "/") + "/rest/v1" + path
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)
	if method == http.MethodPatch || method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
		if prefer != "" {
			req.Header.Set("Prefer", prefer)
		} else {
			req.Header.Set("Prefer", "return=minimal")
		}
	}
	client := &http.Client{Timeout: 30 * time.Second}
	return client.Do(req)
}

func fetchPendingSupabaseMatch(baseURL, key string, roundStart, roundEnd int, championshipID int64) (int64, string, string, *int64, int64, int64, int64, error) {
	// GET first unclaimed pending match
	sel := "*,white:sf_agents!sf_matches_player_white_fkey(mini_fen),black:sf_agents!sf_matches_player_black_fkey(mini_fen)"
	path := "/sf_matches?status=eq.false"
	if championshipID > 0 {
		path += fmt.Sprintf("&championship_id=eq.%d", championshipID)
	}
	order := "id.asc"
	if roundStart > 0 && roundEnd > 0 {
		path += fmt.Sprintf("&round=gte.%d&round=lte.%d", roundStart, roundEnd)
		order = "round.asc,id.asc"
	}
	path += "&select=" + url.QueryEscape(sel) + "&order=" + order + "&limit=1"
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil)
	if err != nil {
		return 0, "", "", nil, 0, 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return 0, "", "", nil, 0, 0, 0, fmt.Errorf("fetch pending failed: %s: %s", resp.Status, string(b))
	}
	var rows []sbMatch
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(&rows); err != nil {
		return 0, "", "", nil, 0, 0, 0, err
	}
	if len(rows) == 0 {
		return 0, "", "", nil, 0, 0, 0, nil
	}
	m := rows[0]
	var w, b string
	if m.WhiteAgent != nil {
		w = m.WhiteAgent.MiniFEN
	}
	if m.BlackAgent != nil {
		b = m.BlackAgent.MiniFEN
	}
	return m.ID, w, b, m.Round, m.PlayerWhite, m.PlayerBlack, m.ChampionshipID, nil
}

// updateSupabaseMatch updates the match row (pgn, status=true, result),
// and updates standings for both players under the given championship ID.
// updateSupabaseMatch returns applied=true when it actually transitioned the match to completed
// and performed standings/ELO updates; applied=false when the match was already completed by another worker.
func updateSupabaseMatch(baseURL, key string, id int64, pgn string, whiteID, blackID int64, championshipID int64) (bool, error) {
	// Parse result from PGN (Result tag or trailing token)
	result := parseResultFromPGN(pgn)

	// 1) Update match row
	now := time.Now().UTC().Format(time.RFC3339)
	mPayload := struct {
		PGN       string `json:"pgn"`
		Status    bool   `json:"status"`
		Result    string `json:"result"`
		ClaimedAt string `json:"claimed_at"`
	}{PGN: pgn, Status: true, Result: result, ClaimedAt: now}
	mBuf, _ := json.Marshal(mPayload)
	// Important: claim-and-complete atomically by only updating when status is still false.
	// This gates downstream standings/Elo updates to run exactly once per match.
	mPath := fmt.Sprintf("/sf_matches?id=eq.%d&status=eq.false", id)
	mResp, err := supabaseRequestPrefer(http.MethodPatch, baseURL, key, mPath, mBuf, "return=representation")
	if err != nil {
		return false, err
	}
	defer mResp.Body.Close()
	if mResp.StatusCode >= 300 {
		b, _ := io.ReadAll(mResp.Body)
		return false, fmt.Errorf("update match failed: %s: %s", mResp.Status, string(b))
	}
	// If no rows were updated (empty array), another worker already processed it.
	var updRows []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(mResp.Body).Decode(&updRows); err == nil {
		if len(updRows) == 0 {
			// Already completed, skip idempotent side-effects
			return false, nil
		}
	} else {
		// If decode fails (unexpected body), proceed conservatively
	}

	// 2) Update standings for each player
	if championshipID == 0 {
		// If not provided in config, we still proceed but default to the match's championship_id if needed.
		// Try to fetch the match to get its championship_id.
		if cid, err := fetchMatchChampionshipID(baseURL, key, id); err == nil {
			championshipID = cid
		}
	}
	if championshipID == 0 {
		// If still zero, skip standings safely
		return true, nil
	}

	switch result {
	case "1-0":
		// White win
		_ = upsertStandingDelta(baseURL, key, whiteID, championshipID, 1, 0, 0, 1.0)
		_ = upsertStandingDelta(baseURL, key, blackID, championshipID, 0, 0, 1, 0.0)
	case "0-1":
		// Black win
		_ = upsertStandingDelta(baseURL, key, whiteID, championshipID, 0, 0, 1, 0.0)
		_ = upsertStandingDelta(baseURL, key, blackID, championshipID, 1, 0, 0, 1.0)
	case "1/2-1/2":
		// Draw
		_ = upsertStandingDelta(baseURL, key, whiteID, championshipID, 0, 1, 0, 0.5)
		_ = upsertStandingDelta(baseURL, key, blackID, championshipID, 0, 1, 0, 0.5)
	default:
		// Unknown result; do nothing to standings
	}

	// 3) Update ELO ratings and record history
	if err := applyAndRecordElo(baseURL, key, whiteID, blackID, championshipID, id, result); err != nil {
		// Do not fail the whole update if ELO step fails; log to stderr and proceed
		fmt.Fprintf(os.Stderr, "elo update failed for match id=%d: %v\n", id, err)
	}
	return true, nil
}

// applyAndRecordElo calculates new ELO ratings for both players based on the match result
// and updates sf_agents.current_elo, also inserting rows into sf_elo_history.
func applyAndRecordElo(baseURL, key string, whiteID, blackID int64, championshipID, matchID int64, result string) error {
	// Map result to scores
	ws, bs, ok := resultToScores(result)
	if !ok {
		// Unknown/unfinished result, nothing to do
		return nil
	}
	// Idempotency: only apply ELO if neither player's history row exists for this match.
	wExists, err := eloHistoryExistsForPlayerMatch(baseURL, key, whiteID, matchID)
	if err != nil {
		return err
	}
	bExists, err := eloHistoryExistsForPlayerMatch(baseURL, key, blackID, matchID)
	if err != nil {
		return err
	}
	if wExists || bExists {
		return nil
	}
	// Fetch current ratings
	wElo, err := fetchAgentElo(baseURL, key, whiteID)
	if err != nil {
		return err
	}
	bElo, err := fetchAgentElo(baseURL, key, blackID)
	if err != nil {
		return err
	}

	// Expected scores
	eW := 1.0 / (1.0 + math.Pow(10, float64(bElo-wElo)/400.0))
	eB := 1.0 / (1.0 + math.Pow(10, float64(wElo-bElo)/400.0))

	// K-factor (tunable via config)
	k := eloK
	if k <= 0 {
		k = 20
	}
	newWElo := int(math.Round(float64(wElo) + k*(ws-eW)))
	newBElo := int(math.Round(float64(bElo) + k*(bs-eB)))

	// Update sf_agents table
	if err := updateAgentElo(baseURL, key, whiteID, newWElo); err != nil {
		return err
	}
	if err := updateAgentElo(baseURL, key, blackID, newBElo); err != nil {
		return err
	}

	// Insert history rows
	if err := insertEloHistory(baseURL, key, whiteID, championshipID, matchID, wElo, newWElo); err != nil {
		return err
	}
	if err := insertEloHistory(baseURL, key, blackID, championshipID, matchID, bElo, newBElo); err != nil {
		return err
	}
	return nil
}

// eloK is a package-scoped ELO K-factor set from config at startup.
var eloK float64 = 20

// resultToScores converts a PGN result token into white/black numeric scores.
func resultToScores(result string) (white, black float64, ok bool) {
	switch result {
	case "1-0":
		return 1.0, 0.0, true
	case "0-1":
		return 0.0, 1.0, true
	case "1/2-1/2":
		return 0.5, 0.5, true
	default:
		return 0, 0, false
	}
}

// fetchAgentElo gets sf_agents.current_elo for a given agent id; defaults to 2000 if row not found.
func fetchAgentElo(baseURL, key string, agentID int64) (int, error) {
	path := fmt.Sprintf("/sf_agents?id=eq.%d&select=current_elo&limit=1", agentID)
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("fetch agent elo failed: %s: %s", resp.Status, string(b))
	}
	var rows []struct {
		CurrentElo int `json:"current_elo"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 2000, nil
	}
	return rows[0].CurrentElo, nil
}

// updateAgentElo patches sf_agents.current_elo for the given agent id.
func updateAgentElo(baseURL, key string, agentID int64, newElo int) error {
	payload := map[string]any{"current_elo": newElo}
	buf, _ := json.Marshal(payload)
	path := fmt.Sprintf("/sf_agents?id=eq.%d", agentID)
	resp, err := supabaseRequest(http.MethodPatch, baseURL, key, path, buf)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("update agent elo failed: %s: %s", resp.Status, string(b))
	}
	return nil
}

// insertEloHistory inserts a row into sf_elo_history for a single player.
func insertEloHistory(baseURL, key string, playerID, championshipID, matchID int64, before, after int) error {
	id := nextEloHistoryID()
	payload := map[string]any{
		"id":              id,
		"player_id":       playerID,
		"championship_id": championshipID,
		"match_id":        matchID,
		"elo_before":      before,
		"elo_after":       after,
		"elo_change":      after - before,
	}
	buf, _ := json.Marshal(payload)
	resp, err := supabaseRequest(http.MethodPost, baseURL, key, "/sf_elo_history", buf)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("insert sf_elo_history failed: %s: %s", resp.Status, string(b))
	}
	return nil
}

// nextEloHistoryID generates a unique int64 id for sf_elo_history inserts.
// This is needed because the table requires a non-null id without a default.
func nextEloHistoryID() int64 {
	return atomic.AddInt64(&eloHistoryIDSeed, 1)
}

var eloHistoryIDSeed int64 = time.Now().UnixNano()

// eloHistoryExistsForMatch returns true if there is at least one sf_elo_history row for the given match.
func eloHistoryExistsForMatch(baseURL, key string, matchID int64) (bool, error) {
	path := fmt.Sprintf("/sf_elo_history?match_id=eq.%d&select=id&limit=1", matchID)
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("check sf_elo_history failed: %s: %s", resp.Status, string(b))
	}
	var rows []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return false, err
	}
	return len(rows) > 0, nil
}

// eloHistoryExistsForPlayerMatch returns true if there is an sf_elo_history row for the given player+match.
func eloHistoryExistsForPlayerMatch(baseURL, key string, playerID, matchID int64) (bool, error) {
	path := fmt.Sprintf("/sf_elo_history?player_id=eq.%d&match_id=eq.%d&select=id&limit=1", playerID, matchID)
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("check sf_elo_history (player) failed: %s: %s", resp.Status, string(b))
	}
	var rows []struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return false, err
	}
	return len(rows) > 0, nil
}

// parseResultFromPGN extracts a standard result token from the PGN text.
func parseResultFromPGN(pgn string) string {
	// Prefer [Result "..."] tag
	// Simple scan for common tokens
	if strings.Contains(pgn, "[Result \"1-0\"]") {
		return "1-0"
	}
	if strings.Contains(pgn, "[Result \"0-1\"]") {
		return "0-1"
	}
	if strings.Contains(pgn, "[Result \"1/2-1/2\"]") {
		return "1/2-1/2"
	}
	// Fallback: trailing token
	if strings.Contains(pgn, " 1-0") || strings.HasSuffix(strings.TrimSpace(pgn), "1-0") {
		return "1-0"
	}
	if strings.Contains(pgn, " 0-1") || strings.HasSuffix(strings.TrimSpace(pgn), "0-1") {
		return "0-1"
	}
	if strings.Contains(pgn, " 1/2-1/2") || strings.HasSuffix(strings.TrimSpace(pgn), "1/2-1/2") {
		return "1/2-1/2"
	}
	return "*"
}

// fetchMatchChampionshipID gets sf_matches.championship_id for a given match id.
func fetchMatchChampionshipID(baseURL, key string, matchID int64) (int64, error) {
	path := fmt.Sprintf("/sf_matches?id=eq.%d&select=championship_id&limit=1", matchID)
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("fetch match failed: %s: %s", resp.Status, string(b))
	}
	var rows []struct {
		ChampionshipID int64 `json:"championship_id"`
	}
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(&rows); err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return rows[0].ChampionshipID, nil
}

// upsertStandingDelta ensures an sf_standings row exists for (player_id, championship_id)
// and applies the given deltas: wins, draws, losses, points; always increments games_played by 1.
func upsertStandingDelta(baseURL, key string, playerID, championshipID int64, dWins, dDraws, dLosses int, dPoints float64) error {
	// Fetch current standings row
	q := fmt.Sprintf("/sf_standings?player_id=eq.%d&championship_id=eq.%d", playerID, championshipID)
	resp, err := supabaseRequest(http.MethodGet, baseURL, key, q, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("fetch sf_standings failed: %s: %s", resp.Status, string(b))
	}
	var rows []struct {
		ID          int64   `json:"id"`
		GamesPlayed int     `json:"games_played"`
		Wins        int     `json:"wins"`
		Draws       int     `json:"draws"`
		Losses      int     `json:"losses"`
		Points      float64 `json:"points"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return err
	}

	if len(rows) == 0 {
		// Insert new row
		payload := map[string]any{
			"player_id":       playerID,
			"championship_id": championshipID,
			"games_played":    1,
			"wins":            dWins,
			"draws":           dDraws,
			"losses":          dLosses,
			"points":          math.Round(dPoints*100) / 100,
		}
		buf, _ := json.Marshal(payload)
		resp2, err := supabaseRequest(http.MethodPost, baseURL, key, "/sf_standings", buf)
		if err != nil {
			return err
		}
		defer resp2.Body.Close()
		if resp2.StatusCode >= 300 {
			b, _ := io.ReadAll(resp2.Body)
			return fmt.Errorf("insert sf_standings failed: %s: %s", resp2.Status, string(b))
		}
		return nil
	}

	// Update existing row by filter
	cur := rows[0]
	newPayload := map[string]any{
		"games_played": cur.GamesPlayed + 1,
		"wins":         cur.Wins + dWins,
		"draws":        cur.Draws + dDraws,
		"losses":       cur.Losses + dLosses,
		"points":       math.Round((cur.Points+dPoints)*100) / 100,
	}
	buf, _ := json.Marshal(newPayload)
	path := fmt.Sprintf("/sf_standings?player_id=eq.%d&championship_id=eq.%d", playerID, championshipID)
	resp3, err := supabaseRequest(http.MethodPatch, baseURL, key, path, buf)
	if err != nil {
		return err
	}
	defer resp3.Body.Close()
	if resp3.StatusCode >= 300 {
		b, _ := io.ReadAll(resp3.Body)
		return fmt.Errorf("update sf_standings failed: %s: %s", resp3.Status, string(b))
	}
	return nil
}
