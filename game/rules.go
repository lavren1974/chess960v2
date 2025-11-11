package main

import (
    "fmt"
    "strings"

    corchess "github.com/corentings/chess"
)

type ruleEvent struct {
    Rule       string
    Ply        int
    MoveNumber int
    Side       corchess.Color
    MoveSAN    string
    Details    string
}

func analyzeGameRules(startFEN string, movesUCI, movesSAN []string) ([]ruleEvent, error) {
    opts := []func(*corchess.Game){corchess.UseNotation(corchess.UCINotation{})}
    if startFEN != "" {
        fenOpt, err := corchess.FEN(startFEN)
        if err != nil { return nil, fmt.Errorf("invalid FEN tag: %w", err) }
        opts = append(opts, fenOpt)
    }
    sim := corchess.NewGame(opts...)

    repetitionCounts := map[string]int{}
    repetitionCounts[positionKey(sim.Position())] = 1

    events := []ruleEvent{}
    seen := map[string]bool{}

    for ply, move := range movesUCI {
        if err := sim.MoveStr(move); err != nil {
            return nil, fmt.Errorf("replaying move %d (%s): %w", ply+1, move, err)
        }
        pos := sim.Position()

        key := positionKey(pos)
        repetitionCounts[key]++
        if !seen["threefold"] && repetitionCounts[key] >= 3 {
            events = append(events, newRuleEvent("Threefold repetition (automatic draw)", ply, movesSAN))
            events[len(events)-1].Details = fmt.Sprintf("repetition count = %d", repetitionCounts[key])
            seen["threefold"] = true
        }

        if !seen["fiftymove"] && pos.HalfMoveClock() >= 100 {
            events = append(events, newRuleEvent("Fifty-move rule (automatic draw)", ply, movesSAN))
            events[len(events)-1].Details = fmt.Sprintf("half-move clock = %d", pos.HalfMoveClock())
            seen["fiftymove"] = true
        }

        if !seen["insufficient"] {
            if insufficient, reason := hasInsufficientMaterial(pos.Board()); insufficient {
                events = append(events, newRuleEvent("Insufficient material (automatic draw)", ply, movesSAN))
                if reason != "" {
                    events[len(events)-1].Details = reason
                }
                seen["insufficient"] = true
            }
        }
    }

    return events, nil
}

func newRuleEvent(rule string, ply int, sanMoves []string) ruleEvent {
    moveIndex := ply
    moveNumber := (moveIndex / 2) + 1
    side := corchess.White
    if moveIndex%2 == 1 { side = corchess.Black }
    moveSAN := ""
    if moveIndex >= 0 && moveIndex < len(sanMoves) { moveSAN = sanMoves[moveIndex] }
    return ruleEvent{Rule: rule, Ply: moveIndex + 1, MoveNumber: moveNumber, Side: side, MoveSAN: moveSAN}
}

func positionKey(pos *corchess.Position) string {
    fen := pos.String()
    parts := strings.Split(fen, " ")
    if len(parts) < 4 { return fen }
    return strings.Join(parts[:4], " ")
}

func hasInsufficientMaterial(board *corchess.Board) (bool, string) {
    pieceMap := board.SquareMap()

    counts := map[corchess.PieceType]int{}
    bishops := make([]corchess.Square, 0)
    for sq, piece := range pieceMap {
        switch piece.Type() {
        case corchess.Queen, corchess.Rook, corchess.Pawn:
            return false, ""
        }
        counts[piece.Type()]++
        if piece.Type() == corchess.Bishop { bishops = append(bishops, sq) }
    }

    if counts[corchess.Bishop] == 0 && counts[corchess.Knight] == 0 { return true, "only kings remain" }
    if counts[corchess.Bishop] == 1 && counts[corchess.Knight] == 0 { return true, "king and bishop vs king" }
    if counts[corchess.Bishop] == 0 && counts[corchess.Knight] == 1 { return true, "king and knight vs king" }

    if counts[corchess.Knight] == 0 && len(bishops) > 0 {
        light := 0
        dark := 0
        for _, sq := range bishops {
            if squareColor(sq) == corchess.White { light++ } else { dark++ }
        }
        if light == 0 || dark == 0 {
            color := "dark"
            if light > 0 { color = "light" }
            return true, fmt.Sprintf("only bishops on %s squares", color)
        }
    }
    return false, ""
}

func squareColor(sq corchess.Square) corchess.Color {
    rank := int(sq) / 8
    file := int(sq) % 8
    if (rank%2) == (file%2) { return corchess.Black }
    return corchess.White
}

// ensureResultTag mirrors validator behavior: if Outcome isn't set, default to "*".
func ensureResultTag(g *corchess.Game) {
    result := g.Outcome().String()
    if result == "" { result = "*" }
    if tag := g.GetTagPair("Result"); tag == nil || tag.Value != result {
        g.AddTagPair("Result", result)
    }
}

// annotateTermination writes Termination tag if Method is known.
func annotateTermination(g *corchess.Game) {
    if g.Method() == corchess.NoMethod { return }
    if tag := g.GetTagPair("Termination"); tag != nil {
        if tag.Value == g.Method().String() { return }
    }
    g.AddTagPair("Termination", g.Method().String())
}
