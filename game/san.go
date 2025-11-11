package main

import (
    "bytes"
    "fmt"
    "strings"
    "time"

    corchess "github.com/corentings/chess"
)

// buildSANPGN converts UCI moves into a SAN PGN using the corentings/chess library,
// which is Chess960-aware. It attaches common headers and the starting FEN.
func buildSANPGN(cfg *Config, startFEN string, use960 bool, movesUCI []string, forcedResult string, forcedTermination string) (string, error) {
    // Prepare tag pairs mirroring pgnHeader defaults
    tags := []*corchess.TagPair{
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
        tags = append(tags, &corchess.TagPair{Key: "Variant", Value: orDefault(cfg.PGNVariant, "Chess960")})
    } else if cfg.PGNVariant != "" {
        tags = append(tags, &corchess.TagPair{Key: "Variant", Value: cfg.PGNVariant})
    }
    if cfg.PGNAnnot != "" {
        tags = append(tags, &corchess.TagPair{Key: "Annotator", Value: cfg.PGNAnnot})
    }

    // Initialize a game with UCI parsing and initial FEN
    opts := []func(*corchess.Game){
        corchess.UseNotation(corchess.UCINotation{}),
        corchess.TagPairs(tags),
    }
    if startFEN != "" {
        fenOpt, err := corchess.FEN(startFEN)
        if err != nil { return "", fmt.Errorf("invalid start FEN: %w", err) }
        opts = append(opts, fenOpt)
    }
    g := corchess.NewGame(opts...)
    for i, tok := range movesUCI {
        if err := g.MoveStr(tok); err != nil {
            return "", fmt.Errorf("apply move %d (%s): %w", i+1, tok, err)
        }
    }

    // Switch to SAN for presentation and render
    positions := g.Positions()
    moves := g.Moves()
    sanNotation := corchess.AlgebraicNotation{}
    sanMoves := make([]string, len(moves))
    for i, move := range moves { sanMoves[i] = sanNotation.Encode(positions[i], move) }

    // Analyse repetition/50-move/insufficient material/etc.
    ruleEvents, err := analyzeGameRules(startFEN, movesUCI, sanMoves)
    if err != nil { return "", err }

    // If an automatic draw was enforced during search, reflect it in the
    // underlying game state so the PGN movetext ends with the correct result
    // instead of "*". Where possible, use the library's Draw(...) to set
    // outcome/method; this also allows annotateTermination to align with Method.
    if forcedTermination != "" {
        switch strings.ToLower(forcedTermination) {
        case "threefold repetition":
            _ = g.Draw(corchess.ThreefoldRepetition)
        case "fifty-move rule":
            _ = g.Draw(corchess.FiftyMoveRule)
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
            prefix := fmt.Sprintf("%d.%s", ev.MoveNumber, func() string { if ev.Side == corchess.White { return "" } else { return ".." } }())
            moveLabel := prefix + ev.MoveSAN
            if ev.Details != "" { evs = append(evs, fmt.Sprintf("%s (%s)", ev.Rule, moveLabel)) } else { evs = append(evs, fmt.Sprintf("%s (%s)", ev.Rule, moveLabel)) }
        }
        g.AddTagPair("RuleEvents", strings.Join(evs, "; "))
    }

    // Render SAN PGN
    corchess.UseNotation(corchess.AlgebraicNotation{})(g)
    var b bytes.Buffer
    b.WriteString(g.String())
    b.WriteString("\n")
    return b.String(), nil
}
