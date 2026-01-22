package main

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	chess "github.com/lavren1974/chess960"
)

// buildSANPGN converts UCI moves into a SAN PGN using the corentings/chess library,
// which is Chess960-aware. It attaches common headers and the starting FEN.
func buildSANPGN(cfg *Config, startFEN string, use960 bool, movesUCI []string, forcedResult string, forcedTermination string) (string, error) {
	// Prepare tag pairs mirroring pgnHeader defaults
	tags := []*chess.TagPair{
		{Key: "Event", Value: orDefault(cfg.PGNEvent, "Chess960 Engine Match")},
		{Key: "Site", Value: orDefault(cfg.PGNSite, "Computer")},
		{Key: "Date", Value: time.Now().Format("2006.01.02")},
		{Key: "Round", Value: orDefault(cfg.PGNRound, "1")},
		{Key: "White", Value: orDefault(cfg.PGNWhite, "EngineA")},
		{Key: "Black", Value: orDefault(cfg.PGNBlack, "EngineB")},
		{Key: "Result", Value: "*"},
		{Key: "FEN", Value: startFEN},
	}
	if use960 {
		tags = append(tags, &chess.TagPair{Key: "Variant", Value: orDefault(cfg.PGNVariant, "Chess960")})
	} else if cfg.PGNVariant != "" {
		tags = append(tags, &chess.TagPair{Key: "Variant", Value: cfg.PGNVariant})
	}
	if cfg.PGNAnnot != "" {
		tags = append(tags, &chess.TagPair{Key: "Annotator", Value: cfg.PGNAnnot})
	}

	// Normalize FEN for Chess960 SAN parsing (Shredder-style castling rights)
	fenForGame := startFEN

	// Initialize a game with UCI parsing and initial FEN
	opts := []func(*chess.Game){
		chess.UseNotation(chess.UCINotation{}),
		chess.TagPairs(tags),
	}
	if fenForGame != "" {
		fenOpt, err := chess.FEN(fenForGame)
		if err != nil && use960 {
			// Try repairing castling rights from back ranks for Chess960 starts
			if repaired, ok := repairStartFENFor960(startFEN); ok {
				if fenOpt2, err2 := chess.FEN(repaired); err2 == nil {
					fenForGame = repaired
					fenOpt = fenOpt2
				} else {
					return "", fmt.Errorf("invalid start FEN: %w", err2)
				}
			} else {
				return "", fmt.Errorf("invalid start FEN: %w", err)
			}
		} else if err != nil {
			return "", fmt.Errorf("invalid start FEN: %w", err)
		}
		opts = append(opts, fenOpt)
	}
	g := chess.NewGame(opts...)
	for _, tok := range movesUCI {
		if err := applyC960UCIMove(g, tok); err != nil {
			// If the SAN conversion fails (often due to missing/incorrect castling rights),
			// try to repair the starting FEN once by deriving Shredder-style rights
			// from the back ranks. Only retry when we can actually improve the FEN.
			if repaired, ok := repairStartFENFor960(startFEN); ok && repaired != startFEN {
				return buildSANPGN(cfg, repaired, use960, movesUCI, forcedResult, forcedTermination)
			}
			return buildUCIPGN(tags, startFEN, movesUCI, forcedResult, forcedTermination), nil
		}
	}

	// Switch to SAN for presentation and render
	positions := g.Positions()
	moves := g.Moves()
	sanNotation := chess.AlgebraicNotation{}
	sanMoves := make([]string, len(moves))
	for i, move := range moves {
		sanMoves[i] = sanNotation.Encode(positions[i], move)
	}

	// Analyse repetition/50-move/insufficient material/etc.
	ruleEvents, err := analyzeGameRules(fenForGame, movesUCI, sanMoves)
	if err != nil {
		return "", err
	}

	// If an automatic draw was enforced during search, reflect it in the
	// underlying game state so the PGN movetext ends with the correct result
	// instead of "*". Where possible, use the library's Draw(...) to set
	// outcome/method; this also allows annotateTermination to align with Method.
	if forcedTermination != "" {
		switch strings.ToLower(forcedTermination) {
		case "threefold repetition":
			_ = g.Draw(chess.ThreefoldRepetition)
		case "fifty-move rule":
			_ = g.Draw(chess.FiftyMoveRule)
		}
	}

	// Ensure standard result/method tags; prefer library-derived values
	ensureResultTag(g)
	annotateTermination(g)
	// Keep human-friendly Termination phrasing if provided by the match loop
	if forcedTermination != "" {
		g.AddTagPair("Termination", forcedTermination)
	}

	// Optional: add a summary tag for rule events
	if len(ruleEvents) > 0 {
		var evs []string
		for _, ev := range ruleEvents {
			prefix := fmt.Sprintf("%d.%s", ev.MoveNumber, func() string {
				if ev.Side == chess.White {
					return ""
				} else {
					return ".."
				}
			}())
			moveLabel := prefix + ev.MoveSAN
			if ev.Details != "" {
				evs = append(evs, fmt.Sprintf("%s (%s)", ev.Rule, moveLabel))
			} else {
				evs = append(evs, fmt.Sprintf("%s (%s)", ev.Rule, moveLabel))
			}
		}
		g.AddTagPair("RuleEvents", strings.Join(evs, "; "))
	}

	// Render SAN PGN
	chess.UseNotation(chess.AlgebraicNotation{})(g)
	var b bytes.Buffer
	b.WriteString(g.String())
	b.WriteString("\n")
	return b.String(), nil
}

// buildUCIPGN is a lenient fallback that emits a PGN using raw UCI moves when SAN conversion fails.
func buildUCIPGN(tags []*chess.TagPair, startFEN string, moves []string, forcedResult, forcedTermination string) string {
	var b bytes.Buffer
	for _, t := range tags {
		fmt.Fprintf(&b, "[%s \"%s\"]\n", t.Key, t.Value)
	}
	if forcedTermination != "" {
		fmt.Fprintf(&b, "[Termination \"%s\"]\n", forcedTermination)
	}
	if startFEN != "" {
		fmt.Fprintf(&b, "[FEN \"%s\"]\n", startFEN)
	}
	b.WriteString("\n")
	moveNo := 1
	whiteToMove := true
	for _, m := range moves {
		if whiteToMove {
			fmt.Fprintf(&b, "%d. %s ", moveNo, m)
		} else {
			fmt.Fprintf(&b, "%s ", m)
			moveNo++
		}
		whiteToMove = !whiteToMove
	}
	b.WriteString("\n")
	return b.String()
}
