package main

import (
	"strings"
	"testing"

	chess "github.com/lavren1974/chess960"
)

// Regression reproducer for UCI fallback on Chess960.
func TestSANCase_BRKNQRNB_bnnbrkrq(t *testing.T) {
	startFEN := "bnnbrkrq/pppppppp/8/8/8/8/PPPPPPPP/BRKNQRNB w KQkq - 0 1"
	moves := strings.Fields("g2g3 e7e5 b2b4 f8g8 d2d3 c7c6 f2f4 d7d6 g1f3 b8d7 b4b5 b7b6 b5c6 a8c6 e2e4 d8f6 d1e3 c8e7 e3c4 e5f4 a1f6 d7f6 f3d4 d6d5 c4d6 d5e4 d3e4 e8d8 d4c6 e7c6 e4e5 c6a5 g3f4 h7h5 e1h4 f6g4 h4g3 h8h6 c1b1 g4e5 d6f5 d8d1 c1d1 f8d8 d1e2 h6f6 f4e5 h5h4 e5f6 h4g3 h2g3 d8e8 e2d3 e8d8 f5d4 g7f6 f1f6 g8g7 f6f5 d8d7 f5d5 d7c7 d4b5 c7e7 b5d4 e7c7 d4b5 c7e7 d5d4 a5b7 h1b7 e7b7 b5d6 b7b8 d3e4 b8h8 d6f5 g7g6 d4d6 g6g5 f5e3 h8e8 e4f3 e8e5 e3d5 e5f5 f3g2 f5e5 g2f3 e5f5 d5f4 f5c5 d6d5 c5d5 f4d5 g5f5 a2a3 f5e5 d5c3 a7a6 f3e3 b6b5 c3e2 f7f6 g3g4 a6a5 e2d4 a5a4 d4b5 f6f5 g4g5 f5f4 e3f3 e5e6 f3f4 e6d5 g5g6 d5c5 b5c3 c5d4 c3a4 d4c4 g6g7 c4d4 f4f5 d4e3 g7g8q e3f3 c2c4 f3e2 c4c5 e2d1 c5c6 d1d2 c6c7 d2d1 c7c8q d1e2 g8g2 e2d1 a4b2 d1e1 c8c1")
	out, err := buildSANPGN(&Config{}, startFEN, true, moves, "", "")
	if err != nil {
		t.Fatalf("buildSANPGN error: %v", err)
	}
	if strings.Contains(out, "g2g3") {
		t.Fatalf("SAN fallback detected: starts with UCI moves:\n%s", out[:200])
	}
}

func TestApplyC960Step_BRKNQRNB(t *testing.T) {
	startFEN := "bnnbrkrq/pppppppp/8/8/8/8/PPPPPPPP/BRKNQRNB w KQkq - 0 1"
	moves := strings.Fields("g2g3 e7e5 b2b4 f8g8 d2d3 c7c6 f2f4 d7d6 g1f3 b8d7 b4b5 b7b6 b5c6 a8c6 e2e4 d8f6 d1e3 c8e7 e3c4 e5f4 a1f6 d7f6 f3d4 d6d5 c4d6 d5e4 d3e4 e8d8 d4c6 e7c6 e4e5 c6a5 g3f4 h7h5 e1h4 f6g4 h4g3 h8h6 c1b1 g4e5 d6f5 d8d1 c1d1 f8d8 d1e2 h6f6 f4e5 h5h4 e5f6 h4g3 h2g3 d8e8 e2d3 e8d8 f5d4 g7f6 f1f6 g8g7 f6f5 d8d7 f5d5 d7c7 d4b5 c7e7 b5d4 e7c7 d4b5 c7e7 d5d4 a5b7 h1b7 e7b7 b5d6 b7b8 d3e4 b8h8 d6f5 g7g6 d4d6 g6g5 f5e3 h8e8 e4f3 e8e5 e3d5 e5f5 f3g2 f5e5 g2f3 e5f5 d5f4 f5c5 d6d5 c5d5 f4d5 g5f5 a2a3 f5e5 d5c3 a7a6 f3e3 b6b5 c3e2 f7f6 g3g4 a6a5 e2d4 a5a4 d4b5 f6f5 g4g5 f5f4 e3f3 e5e6 f3f4 e6d5 g5g6 d5c5 b5c3 c5d4 c3a4 d4c4 g6g7 c4d4 f4f5 d4e3 g7g8q e3f3 c2c4 f3e2 c4c5 e2d1 c5c6 d1d2 c6c7 d2d1 c7c8q d1e2 g8g2 e2d1 a4b2 d1e1 c8c1")
	fenOpt, err := chess.FEN(startFEN)
	if err != nil {
		t.Fatalf("fen: %v", err)
	}
	g := chess.NewGame(chess.UseNotation(chess.UCINotation{}), fenOpt)
	for i, mv := range moves {
		if err := applyC960UCIMove(g, mv); err != nil {
			t.Fatalf("apply move %d (%s) failed: %v\nfen: %s", i+1, mv, err, g.FEN())
		}
	}
}

// Mirrors buildSANPGN loop to locate the failing move.
func TestBuildLoop_BRKNQRNB(t *testing.T) {
	startFEN := "bnnbrkrq/pppppppp/8/8/8/8/PPPPPPPP/BRKNQRNB w KQkq - 0 1"
	moves := strings.Fields("g2g3 e7e5 b2b4 f8g8 d2d3 c7c6 f2f4 d7d6 g1f3 b8d7 b4b5 b7b6 b5c6 a8c6 e2e4 d8f6 d1e3 c8e7 e3c4 e5f4 a1f6 d7f6 f3d4 d6d5 c4d6 d5e4 d3e4 e8d8 d4c6 e7c6 e4e5 c6a5 g3f4 h7h5 e1h4 f6g4 h4g3 h8h6 c1b1 g4e5 d6f5 d8d1 c1d1 f8d8 d1e2 h6f6 f4e5 h5h4 e5f6 h4g3 h2g3 d8e8 e2d3 e8d8 f5d4 g7f6 f1f6 g8g7 f6f5 d8d7 f5d5 d7c7 d4b5 c7e7 b5d4 e7c7 d4b5 c7e7 d5d4 a5b7 h1b7 e7b7 b5d6 b7b8 d3e4 b8h8 d6f5 g7g6 d4d6 g6g5 f5e3 h8e8 e4f3 e8e5 e3d5 e5f5 f3g2 f5e5 g2f3 e5f5 d5f4 f5c5 d6d5 c5d5 f4d5 g5f5 a2a3 f5e5 d5c3 a7a6 f3e3 b6b5 c3e2 f7f6 g3g4 a6a5 e2d4 a5a4 d4b5 f6f5 g4g5 f5f4 e3f3 e5e6 f3f4 e6d5 g5g6 d5c5 b5c3 c5d4 c3a4 d4c4 g6g7 c4d4 f4f5 d4e3 g7g8q e3f3 c2c4 f3e2 c4c5 e2d1 c5c6 d1d2 c6c7 d2d1 c7c8q d1e2 g8g2 e2d1 a4b2 d1e1 c8c1")
	tags := []*chess.TagPair{{Key: "FEN", Value: startFEN}}
	fenOpt, err := chess.FEN(startFEN)
	if err != nil {
		t.Fatalf("fen: %v", err)
	}
	g := chess.NewGame(chess.UseNotation(chess.UCINotation{}), chess.TagPairs(tags), fenOpt)
	for i, mv := range moves {
		if err := applyC960UCIMove(g, mv); err != nil {
			t.Fatalf("build loop failed at move %d (%s): %v\nfen: %s", i+1, mv, err, g.FEN())
		}
	}
}

// Second sequence that still fell back to UCI in PGN output.
func TestBuildLoop_BRKNQRNB_Case2(t *testing.T) {
	startFEN := "bnnbrkrq/pppppppp/8/8/8/8/PPPPPPPP/BRKNQRNB w KQkq - 0 1"
	moves := strings.Fields("g2g3 f8g8 e2e3 e7e6 e1e2 d7d5 c2c4 b7b6 b2b4 b8d7 d1c3 c7c6 c4d5 e6d5 b4b5 d8f6 b5c6 a8c6 g1h3 c8e7 d2d4 h7h5 h3f4 h5h4 a1b2 h8h7 b2a3 e8c8 c1f1 c6b7 c3d5 h4g3 h2g3 e7d5 f4d5 c8c2 e2g4 f8d8 h1e4 g7g6 g1g2 c2a2 f1h1 h7g7 a3b4 b7d5 e4d5 a2a4 d5c6 a4b4 b1b4 d7f8 b4a4 a7a5 g4e2 d8c8 a4c4 f6e7 c6d5 c8c4 e2c4 g7f6 e3e4 f8e6 e4e5 f6f5 c4c6 e6d4 c6e8 e7f8 d5f7 f5f7 h1h8 g8g7 h8h7 g7h7 e8f7 f8g7 f7d7 d4b3 d7h3 h7g8 h3e6 g8f8 e6g6 g7e5 g6f5 f8g8 f5e5 a5a4 e5b8 g8g7 b8b6 g7f7 b6a7 f7e6 a7a4 e6d6 a4b3 d6e5 b3d3 e5f6 d3d6 f6f7 g3g4 f7g7 d6e6 g7h7 g4g5 h7g7 g5g6 g7h6 f2f4 h6g7 e6f7 g7h8 f7h7")
	tags := []*chess.TagPair{{Key: "FEN", Value: startFEN}}
	fenOpt, err := chess.FEN(startFEN)
	if err != nil {
		t.Fatalf("fen: %v", err)
	}
	g := chess.NewGame(chess.UseNotation(chess.UCINotation{}), chess.TagPairs(tags), fenOpt)
	for i, mv := range moves {
		if err := applyC960UCIMove(g, mv); err != nil {
			t.Fatalf("build loop case2 failed at move %d (%s): %v\nfen: %s", i+1, mv, err, g.FEN())
		}
	}
}

// Third sequence still falling back to UCI (NRBBQKNR vs bnqnrbkr).
func TestBuildLoop_NRBBQKNR_bnqnrbkr(t *testing.T) {
	startFEN := "bnqnrbkr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w KQkq - 0 1"
	moves := strings.Fields("e2e4 b7b6 a1b3 e7e5 d2d3 c7c5 d1g4 c5c4 e1c3 d8e6 b3d2 c4d3 c2d3 b8c6 a2a3 h7h5 g4h3 g7g5 h3e6 d7e6 b2b4 c8d7 g1e2 e8c8 b4b5 c6b4 c3e5 f8g7 e5g5 b4d3 f1h1 h8h6 g5e3 h6g6 b1b3 d3c5 b3b4 g7h6 e3d4 d7c7 d4c3 h6g7 c3h3 f7f5 e2g3 c7f7 b4c4 f5f4 g3e2 a8b7 f2f3 e6e5 e2c3 c8d8 h3f5 g6f6 f5e5 c5d3 e5g5 d3c1 e4e5 f7g6 d2e4 g6g5 e4g5 f6g6 h2h4 c1b3 f1e1 d8e8 c4f4 g7e5 g1h1 g6g7 f4b4 b3c5 f3f4 c5d3 e1e5 d3e5 f4e5 e8e5 b4d4 g7c7 c3e4 b7e4 g5e4 e5b5 h1h2 c7e7 e4g5 b5b3 a3a4 g8g7 d4d5 b3b4 g5f3 b4a4 d5h5 a7a5 h5g5 g7h6 g2g4 a4b4 g5h5 h6g7 h5g5 g7f8 f3e5 e7c7 g5f5 f8g8 f5f1 a5a4 h4h5 a4a3 e5d3 b4b3 d3f2 a3a2 f1a1 c7c2 h2g2 b3b1 a1a2 c2a2 g2f3 b1f1 g4g5 a2f2 f3e4 f2f5 e4d3 f1h1 d3c4 f5g5 c4d4 h1h5 d4c3 h5h4 c3d2 g5g3 d2e2 h4h2 e2f1 b6b5 f1e1 g3g1")
	tags := []*chess.TagPair{{Key: "FEN", Value: startFEN}}
	fenOpt, err := chess.FEN(startFEN)
	if err != nil {
		t.Fatalf("fen: %v", err)
	}
	g := chess.NewGame(chess.UseNotation(chess.UCINotation{}), chess.TagPairs(tags), fenOpt)
	for i, mv := range moves {
		if err := applyC960UCIMove(g, mv); err != nil {
			t.Fatalf("build loop case3 failed at move %d (%s): %v\nfen: %s", i+1, mv, err, g.FEN())
		}
		if i+1 == 31 || i+1 == 68 {
			t.Logf("after %d: %s", i+1, g.FEN())
		}
	}
}

// Fourth sequence still reported as UCI output.
func TestBuildLoop_NRBBQKNR_bnqnrbkr_case2(t *testing.T) {
	startFEN := "bnqnrbkr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR w KQkq - 0 1"
	moves := strings.Fields("e2e4 b7b6 d2d3 e7e5 a1b3 d8e6 g1e2 c8d8 f2f4 e5f4 e2f4 b8c6 f4d5 f8d6 f1h1 g8h8 d1h5 c6e7 d5e3 c7c5 e1f2 e7g6 f2f5 g6e5 f5f2 c5c4 e3f5 d6c7 d3c4 a8e4 b3d4 d7d5 b2b3 d5c4 f1e1 e6d4 f5d4 e4g6 h5d1 c4b3 a2b3 e5g4 e1e8 c7h2 g1f1 f8e8 d1g4 g6c2 d4c2 d8d3 g4e2 d3c2 b1a1 h2e5 e2b5 c2b3 f2e2 e8e7 a1a7 e7a7 e2e5 a7a8 c1d2 a8d8 b5e2 h7h6 d2e1 b3c2 e2f3 c2c8 e1f2 d8e8 e5f4 b6b5 f1g1 c8c4 f4f5 c4c1 g1h2 c1g5 f5c2 b5b4 c2c6 e8b8 f2g3 b8d8 c6b6 g5e7 b6b5 g7g6 b5c4 g8f8 c4f4 b4b3 f4c1 f8g8 c1c3 e7e6 c3b4 h6h5 f3b7 d8d3 b7e4 d3d1 e4f3 d1d8 b4b5 g8h7 b5b4 d8d3 b4b5 d3d2 b5b8 b3b2 g3e5 e6e5 b8e5 b2b1q f3e4 b1b2 e5f4 h7g8 e4f3 d2d4 f4g5 b2f2 h2h3 f2e1 f3h5 e1h1 h3g3 h1e1 g3h3 e1h1 h3g3 h1h5 g5c1 h5h4 g3f3 d4b4 c1c8 g8h7 c8c1 b4b3 f3e2 h4d4 c1c2 b3e3 e2f1 d4a1 c2b1 a1b1 f1f2 b1e1")
	roundTripSAN(t, startFEN, moves)
}

// roundTripSAN asserts we can replay and render SAN without falling back to UCI.
func roundTripSAN(t *testing.T, startFEN string, moves []string) {
	t.Helper()
	tags := []*chess.TagPair{{Key: "FEN", Value: startFEN}}
	fenOpt, err := chess.FEN(startFEN)
	if err != nil {
		t.Fatalf("fen: %v", err)
	}
	g := chess.NewGame(chess.UseNotation(chess.UCINotation{}), chess.TagPairs(tags), fenOpt)
	for i, mv := range moves {
		if err := applyC960UCIMove(g, mv); err != nil {
			t.Fatalf("replay failed at move %d (%s): %v\nfen: %s", i+1, mv, err, g.FEN())
		}
	}
	out, err := buildSANPGN(&Config{}, startFEN, true, moves, "", "")
	if err != nil {
		t.Fatalf("buildSANPGN error: %v", err)
	}
	if strings.Contains(out, moves[0]) {
		t.Fatalf("SAN fallback detected; PGN starts with UCI tokens")
	}
}
