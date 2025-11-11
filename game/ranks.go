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

// fenFromRanks builds an X-FEN-compatible FEN line for Chess960 from provided
// white and black back-rank strings. It encodes castling rights using rook file
// letters (Shredder-FEN style), which is required for correct 960 castling
// validation by SAN converters.
func fenFromRanks(whiteUpper, blackLower string) (string, error) {
    if err := validateRank(whiteUpper, true); err != nil { return "", err }
    if err := validateRank(blackLower, false); err != nil { return "", err }
    // Use standard FEN castling rights (KQkq). Chess960 logic is handled by the library.
    rights := "KQkq"
    fen := fmt.Sprintf("%s/pppppppp/8/8/8/8/PPPPPPPP/%s w %s - 0 1", strings.ToLower(blackLower), strings.ToUpper(whiteUpper), rights)
    return fen, nil
}

// fenForEngineFromRanks builds a conservative FEN for engines/positioning that
// leaves castling rights as '-' (engines rely on UCI_Chess960 flag).
func fenForEngineFromRanks(whiteUpper, blackLower string) (string, error) {
    if err := validateRank(whiteUpper, true); err != nil { return "", err }
    if err := validateRank(blackLower, false); err != nil { return "", err }
    fen := fmt.Sprintf("%s/pppppppp/8/8/8/8/PPPPPPPP/%s w - - 0 1", strings.ToLower(blackLower), strings.ToUpper(whiteUpper))
    return fen, nil
}

// (no X-FEN letters; SAN library expects standard KQkq rights)

// xfenFromEngineStartFEN attempts to build an X-FEN style starting FEN
// (with KQkq) suitable for SAN rendering from a conservative engine FEN
// (typically with castling rights "-"). This assumes an initial position
// layout (full pieces on ranks 1 and 8 without digits in those ranks).
func xfenFromEngineStartFEN(engineFEN string) (string, error) {
    parts := strings.Split(engineFEN, " ")
    if len(parts) < 1 { return "", fmt.Errorf("invalid FEN") }
    ranks := strings.Split(parts[0], "/")
    if len(ranks) != 8 { return "", fmt.Errorf("invalid board layout") }
    // Expect 8 letters on ranks 8 and 1 for a fresh start position
    if len(ranks[0]) != 8 || len(ranks[7]) != 8 {
        return "", fmt.Errorf("unsupported compressed ranks for start")
    }
    black := strings.ToLower(ranks[0])
    white := strings.ToUpper(ranks[7])
    return fenFromRanks(white, black)
}
