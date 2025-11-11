package main

import (
    "bufio"
    "encoding/json"
    "os"
    "strings"
)

type Config struct {
    Engine      string      `json:"engine"`
    EngineA     *EngineConf `json:"engine_a"`
    EngineB     *EngineConf `json:"engine_b"`

    TimePerMoveMS int    `json:"time_per_move_ms"`
    SearchDepth   int    `json:"search_depth"`
    SearchMode    string `json:"search_mode"`
    MaxMoves      int    `json:"max_moves"`

    EnableChess960 bool   `json:"enable_chess960"`
    StartFEN       string `json:"start_fen"`

    EnableNNUE *bool  `json:"enable_nnue"`
    Randomness string `json:"randomness_mode"`
    MultiPV    int    `json:"multi_pv"`
    RandomSeed int64  `json:"random_seed"`
    HashSizeMB int    `json:"hash_size_mb"`
    Threads    int    `json:"threads"`
    SyzygyPath string `json:"syzygy_path"`

    PGNEvent   string `json:"pgn_event"`
    PGNVariant string `json:"pgn_variant"`
    PGNSite    string `json:"pgn_site"`
    PGNAnnot   string `json:"pgn_annotator"`

    // Optional: override PGN player names (used when pulling pairings from Supabase)
    PGNWhite   string `json:"pgn_white"`
    PGNBlack   string `json:"pgn_black"`
    PGNRound   string `json:"pgn_round"`

    // Enforcement
    EnforceDraws *bool `json:"enforce_draws"`

    // Parallelism: number of matches to run in parallel when using Supabase mode
    ConcurrentMatches int `json:"concurrent_matches"`

    // Throttling: pause after N completed matches to free memory/resources
    // If zero or negative, no periodic pause is applied.
    PauseEveryNMatches   int `json:"pause_every_n_matches"`
    // Pause duration in seconds (default 120 when PauseEveryNMatches > 0)
    PauseDurationSeconds int `json:"pause_duration_seconds"`

    // Optional hard cap on total matches to run in this process. 0 means unlimited.
    MaxTotalMatches int `json:"max_total_matches"`

    // Championship ID used when writing to standings
    ChampionshipID int64 `json:"championship_id"`

    // Elo K-factor used for rating updates (default 20 when <= 0)
    EloKFactor float64 `json:"elo_k_factor"`
}

type EngineConf struct {
    EnginePath     string `json:"engine"`
    TimePerMoveMS  *int   `json:"time_per_move_ms"`
    SearchDepth    *int   `json:"search_depth"`
    SearchMode     string `json:"search_mode"`
    EnableNNUE     *bool  `json:"enable_nnue"`
    MultiPV        *int   `json:"multi_pv"`
    HashSizeMB     *int   `json:"hash_size_mb"`
    Threads        *int   `json:"threads"`
    SyzygyPath     string `json:"syzygy_path"`
}

func loadConfig(path string) (*Config, error) {
    f, err := os.Open(path)
    if err != nil { return nil, err }
    defer f.Close()
    dec := json.NewDecoder(bufio.NewReader(f))
    var cfg Config
    if err := dec.Decode(&cfg); err != nil { return nil, err }
    if cfg.SearchMode == "" {
        if cfg.TimePerMoveMS > 0 { cfg.SearchMode = "time" } else { cfg.SearchMode = "depth" }
    }
    if strings.EqualFold(cfg.SearchMode, "movetime") { cfg.SearchMode = "time" }
    if cfg.MaxMoves == 0 { cfg.MaxMoves = 500 }
    if cfg.EnforceDraws == nil { t := true; cfg.EnforceDraws = &t }
    if cfg.ConcurrentMatches <= 0 { cfg.ConcurrentMatches = 1 }
    if cfg.PauseEveryNMatches > 0 && cfg.PauseDurationSeconds <= 0 { cfg.PauseDurationSeconds = 120 }
    if cfg.EloKFactor <= 0 { cfg.EloKFactor = 20 }
    return &cfg, nil
}

func orDefault(s, dv string) string { if s == "" { return dv }; return s }
