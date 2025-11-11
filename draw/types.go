package main

type Agent struct {
    ID      int64  `json:"id"`
    SpID    int    `json:"sp_id"`
    MiniFEN string `json:"mini_fen"`
    Color   string `json:"color"`
}

type Match struct {
    PlayerWhite int64   `json:"player_white"`
    PlayerBlack int64   `json:"player_black"`
    PGN         *string `json:"pgn,omitempty"`
    Status      *bool   `json:"status,omitempty"`
    Round       int64   `json:"round"`
    ChampionshipID int64   `json:"championship_id"`
    Result         *string `json:"result,omitempty"`
}
