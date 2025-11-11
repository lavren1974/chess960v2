package main

type Side int

const (
    White Side = iota
    Black
)

func (s Side) String() string {
    if s == White { return "White" }
    return "Black"
}
