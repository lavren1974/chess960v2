package main

import (
	"fmt"
	"strings"

	chess "github.com/lavren1974/chess960"
)

type ruleEvent struct {
	Rule       string
	Ply        int
	MoveNumber int
	Side       chess.Color
	MoveSAN    string
	Details    string
}

func analyzeGameRules(startFEN string, movesUCI, movesSAN []string) ([]ruleEvent, error) {
	opts := []func(*chess.Game){chess.UseNotation(chess.UCINotation{})}
	if startFEN != "" {
		fenOpt, err := chess.FEN(startFEN)
		if err != nil {
			return nil, fmt.Errorf("invalid FEN tag: %w", err)
		}
		opts = append(opts, fenOpt)
	}
	sim := chess.NewGame(opts...)

	repetitionCounts := map[string]int{}
	repetitionCounts[positionKey(sim.Position())] = 1

	events := []ruleEvent{}
	seen := map[string]bool{}

	for ply, move := range movesUCI {
		if err := applyC960UCIMove(sim, move); err != nil {
			// If we cannot replay a move (e.g., Chess960 castling edge case), skip rule analysis gracefully.
			return events, nil
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
	side := chess.White
	if moveIndex%2 == 1 {
		side = chess.Black
	}
	moveSAN := ""
	if moveIndex >= 0 && moveIndex < len(sanMoves) {
		moveSAN = sanMoves[moveIndex]
	}
	return ruleEvent{Rule: rule, Ply: moveIndex + 1, MoveNumber: moveNumber, Side: side, MoveSAN: moveSAN}
}

func positionKey(pos *chess.Position) string {
	fen := pos.String()
	parts := strings.Split(fen, " ")
	if len(parts) < 4 {
		return fen
	}
	return strings.Join(parts[:4], " ")
}

func hasInsufficientMaterial(board *chess.Board) (bool, string) {
	pieceMap := board.SquareMap()

	counts := map[chess.PieceType]int{}
	bishops := make([]chess.Square, 0)
	for sq, piece := range pieceMap {
		switch piece.Type() {
		case chess.Queen, chess.Rook, chess.Pawn:
			return false, ""
		}
		counts[piece.Type()]++
		if piece.Type() == chess.Bishop {
			bishops = append(bishops, sq)
		}
	}

	if counts[chess.Bishop] == 0 && counts[chess.Knight] == 0 {
		return true, "only kings remain"
	}
	if counts[chess.Bishop] == 1 && counts[chess.Knight] == 0 {
		return true, "king and bishop vs king"
	}
	if counts[chess.Bishop] == 0 && counts[chess.Knight] == 1 {
		return true, "king and knight vs king"
	}

	if counts[chess.Knight] == 0 && len(bishops) > 0 {
		light := 0
		dark := 0
		for _, sq := range bishops {
			if squareColor(sq) == chess.White {
				light++
			} else {
				dark++
			}
		}
		if light == 0 || dark == 0 {
			color := "dark"
			if light > 0 {
				color = "light"
			}
			return true, fmt.Sprintf("only bishops on %s squares", color)
		}
	}
	return false, ""
}

func squareColor(sq chess.Square) chess.Color {
	rank := int(sq) / 8
	file := int(sq) % 8
	if (rank % 2) == (file % 2) {
		return chess.Black
	}
	return chess.White
}

// ensureResultTag mirrors validator behavior: if Outcome isn't set, default to "*".
func ensureResultTag(g *chess.Game) {
	result := g.Outcome().String()
	if result == "" {
		result = "*"
	}
	if tag := g.GetTagPair("Result"); tag == nil || tag.Value != result {
		g.AddTagPair("Result", result)
	}
}

// annotateTermination writes Termination tag if Method is known.
func annotateTermination(g *chess.Game) {
	if g.Method() == chess.NoMethod {
		return
	}
	if tag := g.GetTagPair("Termination"); tag != nil {
		if tag.Value == g.Method().String() {
			return
		}
	}
	g.AddTagPair("Termination", g.Method().String())
}
