package main

import (
	"math/rand"
	"strings"

	chess "github.com/lavren1974/chess960"
)

func chooseStartFEN(cfg *Config, r *rand.Rand) (string, error) {
	if cfg.StartFEN != "" {
		return cfg.StartFEN, nil
	}
	// If no explicit FEN or ranks were provided, default to standard start.
	// Arbitrary Chess960 setups are primarily provided via CLI or config White/Black.
	return chess.StartingPosition().String(), nil
}

func isStandardStartFEN(fen string) bool {
	std := chess.StartingPosition().String()
	return strings.HasPrefix(fen, strings.Split(std, " ")[0])
}

func chess960FEN(index int) string {
	if index < 0 {
		index = 0
	}
	if index > 959 {
		index = index % 960
	}
	squares := []int{0, 1, 2, 3, 4, 5, 6, 7}
	back := make([]rune, 8)
	for i := range back {
		back[i] = '.'
	}
	lightFiles := []int{1, 3, 5, 7}
	l := index % 4
	index /= 4
	lf := lightFiles[l]
	back[lf] = 'b'
	squares = removeFile(squares, lf)
	darkFiles := []int{0, 2, 4, 6}
	d := index % 4
	index /= 4
	df := darkFiles[d]
	back[df] = 'b'
	squares = removeFile(squares, df)
	q := index % 6
	index /= 6
	qf := squares[q]
	back[qf] = 'q'
	squares = removeAt(squares, q)
	k := index % 10
	index /= 10
	knightPairs := combinations(squares, 2)
	n1, n2 := knightPairs[k][0], knightPairs[k][1]
	back[n1], back[n2] = 'n', 'n'
	if idxOf(squares, n1) > idxOf(squares, n2) {
		squares = removeAt(squares, idxOf(squares, n1))
		squares = removeAt(squares, idxOf(squares, n2))
	} else {
		squares = removeAt(squares, idxOf(squares, n2))
		squares = removeAt(squares, idxOf(squares, n1))
	}
	if len(squares) != 3 {
		panic("internal squares len !=3")
	}
	back[squares[0]], back[squares[1]], back[squares[2]] = 'r', 'k', 'r'
	return string(back)
}

func removeFile(a []int, file int) []int {
	out := a[:0]
	for _, v := range a {
		if v != file {
			out = append(out, v)
		}
	}
	return out
}
func removeAt(a []int, i int) []int { return append(append([]int{}, a[:i]...), a[i+1:]...) }
func idxOf(a []int, v int) int {
	for i, x := range a {
		if x == v {
			return i
		}
	}
	return -1
}

func combinations(a []int, r int) [][]int {
	if r != 2 {
		panic("only r=2 supported here")
	}
	var out [][]int
	for i := 0; i < len(a); i++ {
		for j := i + 1; j < len(a); j++ {
			out = append(out, []int{a[i], a[j]})
		}
	}
	return out
}
