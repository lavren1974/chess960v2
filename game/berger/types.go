package berger

import "encoding/json"

// standingRow mirrors the sf_standings table shape we need.
type standingRow struct {
	ID             int64        `json:"id"`
	PlayerID       int64        `json:"player_id"`
	Points         json.Number  `json:"points"`
	BergvizerScore *json.Number `json:"bergvizer_score"`
	ChampionshipID int64        `json:"championship_id"`
}

// matchRow mirrors the sf_matches table shape we need.
type matchRow struct {
	ID             int64  `json:"id"`
	PlayerWhite    int64  `json:"player_white"`
	PlayerBlack    int64  `json:"player_black"`
	Result         string `json:"result"`
	Status         bool   `json:"status"`
	ChampionshipID int64  `json:"championship_id"`
}
