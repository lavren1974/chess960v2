package main

import (
    "fmt"
    "strings"
    "time"
)

func pgnHeader(cfg *Config, startFEN string, use960 bool) []string {
    var tags []string
    add := func(k, v string) { if v != "" { tags = append(tags, fmt.Sprintf("[%s \"%s\"]", k, v)) } }
    add("Event", orDefault(cfg.PGNEvent, "Chess960 Engine Match"))
    add("Site", orDefault(cfg.PGNSite, "Computer"))
    add("Date", time.Now().Format("2006.01.02"))
    add("Round", orDefault(cfg.PGNRound, "1"))
    add("White", "EngineA")
    add("Black", "EngineB")
    add("Result", "*")
    add("Variant", orDefault(cfg.PGNVariant, func() string { if use960 { return "Chess960" }; return "Standard" }()))
    add("FEN", startFEN)
    if cfg.PGNAnnot != "" { add("Annotator", cfg.PGNAnnot) }
    return tags
}

func buildPGN(tags []string, moves []string) string {
    var b strings.Builder
    for _, t := range tags { b.WriteString(t); b.WriteString("\n") }
    b.WriteString("\n")
    moveNum := 1
    for i := 0; i < len(moves); i += 2 {
        b.WriteString(fmt.Sprintf("%d. %s", moveNum, moves[i]))
        if i+1 < len(moves) {
            b.WriteString(" ")
            b.WriteString(moves[i+1])
        }
        b.WriteString(" ")
        moveNum++
    }
    b.WriteString("*\n")
    return b.String()
}
