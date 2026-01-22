package main

import (
	chess "github.com/lavren1974/chess960"
)

// applyC960UCIMove tries to apply the given UCI move to the game, and if it fails,
// detects Chess960 UCI castling encodings (king moves onto its own rook) and rewrites
// them to SAN castle tokens ("O-O"/"O-O-O").
func applyC960UCIMove(g *chess.Game, tok string) error {
	// First, try as-is.
	if err := g.MoveStr(tok); err == nil {
		return nil
	} else {
		// fallthrough to Chess960 castling check and final fallback to legal move lookup
		if len(tok) < 4 {
			return err
		}
		s1 := uciToSquare(tok[0:2])
		s2 := uciToSquare(tok[2:4])
		if s1 == chess.NoSquare || s2 == chess.NoSquare {
			return err
		}
		pos := g.Position()
		p1 := pos.Board().Piece(s1)
		p2 := pos.Board().Piece(s2)
		if p1.Type() != chess.King || p2.Type() != chess.Rook || p1.Color() != p2.Color() || s1.Rank() != s2.Rank() {
			// Try to match any legal move with same s1/s2 (covers plain king steps the parser rejected)
			for _, mv := range g.ValidMoves() {
				if mv.S1() == s1 && mv.S2() == s2 {
					return g.Move(mv)
				}
			}
			return err
		}
		// Chess960 castling encoded as king-to-own-rook: map to actual castle move.
		wantTag := chess.KingSideCastle
		if s2.File() < s1.File() {
			wantTag = chess.QueenSideCastle
		}
		for _, mv := range g.ValidMoves() {
			if mv.HasTag(wantTag) {
				return g.Move(mv)
			}
		}
		// As a fallback, try standard SAN castles.
		if wantTag == chess.KingSideCastle {
			if err2 := g.MoveStr("O-O"); err2 == nil {
				return nil
			}
		} else {
			if err2 := g.MoveStr("O-O-O"); err2 == nil {
				return nil
			}
		}
		// If castle rewrite failed, still try direct legal move match.
		for _, mv := range g.ValidMoves() {
			if mv.S1() == s1 && mv.S2() == s2 {
				return g.Move(mv)
			}
		}
		return err
	}
}

// uciToSquare converts "e2" style tokens to squares, returning NoSquare on error.
func uciToSquare(tok string) chess.Square {
	if len(tok) != 2 {
		return chess.NoSquare
	}
	file := tok[0] - 'a'
	rank := tok[1] - '1'
	if file > 7 || rank > 7 {
		return chess.NoSquare
	}
	return chess.NewSquare(chess.File(file), chess.Rank(rank))
}
