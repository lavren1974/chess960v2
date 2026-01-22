package berger

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

func aggregatePointsFromMatches(matches []matchRow) map[int64]float64 {
	out := map[int64]float64{}
	for _, m := range matches {
		wScore, bScore, ok := parseResultScores(m.Result)
		if !ok {
			continue
		}
		out[m.PlayerWhite] += wScore
		out[m.PlayerBlack] += bScore
	}
	return out
}

func computeBergerTotals(matches []matchRow, points map[int64]float64) map[int64]float64 {
	out := map[int64]float64{}
	for _, m := range matches {
		wScore, bScore, ok := parseResultScores(m.Result)
		if !ok {
			continue
		}
		out[m.PlayerWhite] += wScore * points[m.PlayerBlack]
		out[m.PlayerBlack] += bScore * points[m.PlayerWhite]
	}
	return out
}

func parseResultScores(result string) (float64, float64, bool) {
	r := strings.TrimSpace(strings.ToLower(result))
	switch r {
	case "1-0", "white", "w", "win_white", "white_win", "whitewon":
		return 1.0, 0.0, true
	case "0-1", "black", "b", "win_black", "black_win", "blackwon":
		return 0.0, 1.0, true
	case "1/2-1/2", "0.5-0.5", "0.5", "½-½", "draw", "d", "tie":
		return 0.5, 0.5, true
	default:
		return 0, 0, false
	}
}

func outcomeForPlayer(m matchRow, playerID int64) (opponentID int64, weight float64, ok bool) {
	wScore, bScore, okRes := parseResultScores(m.Result)
	if !okRes {
		return 0, 0, false
	}
	if playerID == m.PlayerWhite {
		return m.PlayerBlack, wScore, true
	}
	if playerID == m.PlayerBlack {
		return m.PlayerWhite, bScore, true
	}
	return 0, 0, false
}

func updateBergvizer(baseURL, key string, standingID int64, score float64) error {
	payload := map[string]any{"bergvizer_score": score}
	buf, _ := json.Marshal(payload)
	path := fmt.Sprintf("/sf_standings?id=eq.%d", standingID)
	resp, err := supabaseRequest(http.MethodPatch, baseURL, key, path, buf, nil, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		body := string(b)
		hint := ""
		if strings.Contains(body, "numeric") || strings.Contains(body, "out of range") || strings.Contains(body, "value too") {
			hint = " (bergvizer_score may exceed column precision; increase numeric scale/precision)"
		}
		return fmt.Errorf("patch failed: %s: %s (bergvizer=%.2f)%s", resp.Status, body, score, hint)
	}
	return nil
}

func computeBergerTotalsPerPlayerConcurrent(baseURL, key string, championshipID int64, standings []standingRow, points map[int64]float64, targetPlayers map[int64]struct{}, conc int, log logger) map[int64]float64 {
	if conc <= 0 {
		conc = 8
	}
	type job struct {
		playerID int64
	}
	type result struct {
		playerID int64
		total    float64
		err      error
	}
	jobs := make(chan job)
	results := make(chan result, conc)
	var wg sync.WaitGroup

	for i := 0; i < conc; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				total, err := computeBergerForPlayer(baseURL, key, championshipID, j.playerID, points, false, log)
				results <- result{playerID: j.playerID, total: total, err: err}
			}
		}()
	}

	go func() {
		for _, s := range standings {
			if len(targetPlayers) > 0 {
				if _, ok := targetPlayers[s.PlayerID]; !ok {
					continue
				}
			}
			jobs <- job{playerID: s.PlayerID}
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()

	totals := map[int64]float64{}
	for r := range results {
		if r.err != nil {
			log.Warnf("compute failed for player %d (champ %d): %v\n", r.playerID, championshipID, r.err)
			continue
		}
		totals[r.playerID] = r.total
	}
	return totals
}

func computeBergerForPlayer(baseURL, key string, championshipID, playerID int64, points map[int64]float64, debug bool, log logger) (float64, error) {
	var total float64
	if debug {
		log.Printf("== player %d (champ %d)\n", playerID, championshipID)
	}
	sideSum := func(side string) error {
		return fetchMatchesForPlayerSide(baseURL, key, championshipID, playerID, side, func(m matchRow) {
			wScore, bScore, ok := parseResultScores(m.Result)
			if !ok {
				if debug {
					log.Printf("  match %d skipped (result %q)\n", m.ID, m.Result)
				}
				return
			}
			var oppID int64
			var weight float64
			if side == "white" {
				oppID = m.PlayerBlack
				weight = wScore
			} else {
				oppID = m.PlayerWhite
				weight = bScore
			}
			oppPts := points[oppID]
			total += weight * oppPts
			if debug {
				log.Printf("  match %d vs %d result=%q weight=%.2f oppPts=%.2f add=%.2f\n", m.ID, oppID, m.Result, weight, oppPts, weight*oppPts)
			}
		})
	}
	if err := sideSum("white"); err != nil {
		return 0, err
	}
	if err := sideSum("black"); err != nil {
		return 0, err
	}
	return total, nil
}

func fetchMatchesForPlayerSide(baseURL, key string, championshipID, playerID int64, side string, visit func(matchRow)) error {
	selectCols := "id,player_white,player_black,result,status,championship_id"
	basePath := fmt.Sprintf("/sf_matches?championship_id=eq.%d&status=eq.true&result=not.is.null&select=%s", championshipID, selectCols)
	if side == "white" {
		basePath += fmt.Sprintf("&player_white=eq.%d", playerID)
	} else {
		basePath += fmt.Sprintf("&player_black=eq.%d", playerID)
	}
	const pageSize = 1000
	var lastID int64
	for {
		path := basePath
		if lastID > 0 {
			path += fmt.Sprintf("&id=gt.%d", lastID)
		}
		path += fmt.Sprintf("&order=id.asc&limit=%d", pageSize)
		resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil, nil, nil)
		if err != nil {
			return err
		}
		var batch []matchRow
		err = func() error {
			defer resp.Body.Close()
			if resp.StatusCode >= 300 {
				b, _ := io.ReadAll(resp.Body)
				return fmt.Errorf("request failed: %s: %s", resp.Status, string(b))
			}
			dec := json.NewDecoder(resp.Body)
			if err := dec.Decode(&batch); err != nil {
				return err
			}
			return nil
		}()
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			break
		}
		for _, m := range batch {
			visit(m)
		}
		lastID = batch[len(batch)-1].ID
		if len(batch) < pageSize {
			break
		}
	}
	return nil
}
