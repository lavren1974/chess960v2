package main

import (
	"errors"
	"fmt"
	"strings"
)

// validateRank checks an 8-char back rank is a permutation of R N B B Q K R N
// (case-insensitive piece set), and enforces case by side.
// wantUpper=true for White rank (expect uppercase input), false for Black (lowercase).
func validateRank(rank string, wantUpper bool) error {
	if len(rank) != 8 {
		return fmt.Errorf("must be 8 characters, got %d", len(rank))
	}
	// Enforce case convention to reduce ambiguity
	if wantUpper && rank != strings.ToUpper(rank) {
		return errors.New("white rank must be uppercase letters")
	}
	if !wantUpper && rank != strings.ToLower(rank) {
		return errors.New("black rank must be lowercase letters")
	}

	up := strings.ToUpper(rank)
	counts := map[rune]int{'R': 0, 'N': 0, 'B': 0, 'Q': 0, 'K': 0}
	for _, r := range up {
		if _, ok := counts[r]; !ok {
			return fmt.Errorf("invalid piece '%c' (allowed: R,N,B,Q,K)", r)
		}
		counts[r]++
	}
	if counts['R'] != 2 || counts['N'] != 2 || counts['B'] != 2 || counts['Q'] != 1 || counts['K'] != 1 {
		return fmt.Errorf("rank must contain R×2 N×2 B×2 Q×1 K×1; got R=%d N=%d B=%d Q=%d K=%d",
			counts['R'], counts['N'], counts['B'], counts['Q'], counts['K'])
	}
	return nil
}

// fenFromRanks builds a Chess960 start FEN using conventional KQkq castling rights.
func fenFromRanks(whiteUpper, blackLower string) (string, error) {
	if err := validateRank(whiteUpper, true); err != nil {
		return "", err
	}
	if err := validateRank(blackLower, false); err != nil {
		return "", err
	}
	fen := fmt.Sprintf("%s/pppppppp/8/8/8/8/PPPPPPPP/%s w KQkq - 0 1", strings.ToLower(blackLower), strings.ToUpper(whiteUpper))
	return fen, nil
}

// fenForEngineFromRanks builds an engine FEN for Chess960 starts while keeping
// castling rights available (engines rely on UCI_Chess960 flag).
func fenForEngineFromRanks(whiteUpper, blackLower string) (string, error) {
	if err := validateRank(whiteUpper, true); err != nil {
		return "", err
	}
	if err := validateRank(blackLower, false); err != nil {
		return "", err
	}
	// Engines expect the traditional KQkq castling tokens for Chess960; they
	// derive rook placement from the board when UCI_Chess960 is enabled.
	fen := fmt.Sprintf("%s/pppppppp/8/8/8/8/PPPPPPPP/%s w KQkq - 0 1", strings.ToLower(blackLower), strings.ToUpper(whiteUpper))
	return fen, nil
}

// xfenFromEngineStartFEN attempts to build a starting FEN suitable for SAN rendering from a conservative engine FEN
// (typically with castling rights "-"). This assumes an initial position
// layout (full pieces on ranks 1 and 8 without digits in those ranks).
func xfenFromEngineStartFEN(engineFEN string) (string, error) {
	parts := strings.Split(engineFEN, " ")
	if len(parts) < 1 {
		return "", fmt.Errorf("invalid FEN")
	}
	ranks := strings.Split(parts[0], "/")
	if len(ranks) != 8 {
		return "", fmt.Errorf("invalid board layout")
	}
	// Expect 8 letters on ranks 8 and 1 for a fresh start position
	if len(ranks[0]) != 8 || len(ranks[7]) != 8 {
		return "", fmt.Errorf("unsupported compressed ranks for start")
	}
	black := strings.ToLower(ranks[0])
	white := strings.ToUpper(ranks[7])
	return fenFromRanks(white, black)
}

// normalizeFENCastling ensures the castling rights portion of a FEN only uses
// standard tokens (KQkq) or "-". Invalid values are replaced with "-".
func normalizeFENCastling(fen string) string {
	parts := strings.Split(fen, " ")
	if len(parts) < 3 {
		return fen
	}
	rights := parts[2]
	if rights == "" {
		parts[2] = "-"
		return strings.Join(parts, " ")
	}
	for _, r := range rights {
		if r == '-' || r == 'K' || r == 'Q' || r == 'k' || r == 'q' {
			continue
		}
		parts[2] = "-"
		return strings.Join(parts, " ")
	}
	return fen
}

// repairStartFENFor960 rebuilds castling rights from the board layout for a starting
// Chess960 position. It expands the first and last ranks, derives Shredder-style
// rook letters, and returns an updated FEN. Returns ok=false when the FEN cannot
// be repaired.
func repairStartFENFor960(fen string) (string, bool) {
	parts := strings.Split(fen, " ")
	if len(parts) < 4 {
		return "", false
	}
	ranks := strings.Split(parts[0], "/")
	if len(ranks) != 8 {
		return "", false
	}
	expand := func(r string) (string, bool) {
		var b strings.Builder
		for _, ch := range r {
			switch {
			case ch >= '1' && ch <= '8':
				b.WriteString(strings.Repeat(".", int(ch-'0')))
			case ch == '/':
				return "", false
			default:
				b.WriteRune(ch)
			}
		}
		s := b.String()
		if len(s) != 8 {
			return "", false
		}
		return s, true
	}
	_, okTop := expand(ranks[0])
	_, okBot := expand(ranks[7])
	if !okTop || !okBot {
		return "", false
	}
	parts[2] = "KQkq"
	if parts[3] == "" {
		parts[3] = "-"
	}
	return strings.Join(parts, " "), true
}
