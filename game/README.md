Chess960 Engine Match (Go)


```
ALTER TABLE public.sf_standings                                                                                                                                                          
ALTER COLUMN bergvizer_score TYPE numeric(14,2);    
```



At a Glance
- Head‑to‑head UCI engine runner with first‑class Chess960 support.
- Arbitrary starting ranks via CLI (or from DB in Supabase mode).
- Outputs clean SAN PGNs that import in common viewers.
- Optional automatic draw enforcement (threefold/50‑move/insufficient).

Overview
- Runs head-to-head engine games (Stockfish or any UCI engine) using Go.
- Supports classical chess and Chess960 (Fischer Random) starts.
- Fully configuration-driven via a JSON file (engine paths, time/depth mode, 960 start, NNUE, hash, threads, etc.).
- Outputs viewer-friendly SAN PGN using a Chess960-aware converter.

Why This Tool
- Quickly reproduce, debug, and analyze Chess960 engine games without a GUI.
- Share portable PGNs compatible with Lichess/ChessBase and other viewers.
- Experiment with non‑standard back ranks beyond the 960 catalog.

Features
- UCI orchestration: initializes engines, sets options, and iterates moves.
- Chess960 awareness: auto-enables `UCI_Chess960` when the starting ranks are non‑standard.
- Start positions:
  - `start_fen` (explicit),
  - CLI ranks to override (`./chess960v2 WHITE BLACK`), or
  - from the database in Supabase mode (via `sf_agents.mini_fen`).
- Time or depth control:
  - `search_mode: "time"` with `time_per_move_ms`, or
  - `search_mode: "depth"` with `search_depth`.
- Engine options: Hash, Threads, NNUE toggle, Syzygy path, MultiPV, and ponder off by default.
- MultiPV sampling: optional simple randomness from top lines.
- Debug logging: `-debug` prints UCI traffic for troubleshooting.
- Output: SAN PGN (e.g., `1. e4 e5 2. Nf3 Nc6 ...`).

Supabase Integration (optional)
- Fetch a pending pairing (status=false) and update the row with the generated PGN, `result`, and `status=true`.
- Flags:
  - `-supabase` enable Supabase mode
  - `-supabase-url` base URL (or env `SUPABASE_URL` from `.env`)
  - `-supabase-key` service role key (defaults to env `SUPABASE_SERVICE_ROLE_KEY`)
- Behavior:
  - Reads first pending row from `public.sf_matches` ordered by `id`.
  - Sets PGN `White`/`Black` headers from related `sf_agents.mini_fen` via `player_white` / `player_black` FKs.
  - Writes the PGN back to the row (`pgn`), sets `result`, and marks `status=true`.
  - Updates `public.sf_standings` for both players scoped by a championship:
    - Add `"championship_id"` to `config.json` (if omitted, the match’s `championship_id` is used).
    - Win: `wins += 1`, `points += 1.0`; Draw: `draws += 1`, `points += 0.5`; Loss: `losses += 1`.
    - Always: `games_played += 1` for both players (upsert behavior).
  - Start position is built from `sf_agents.mini_fen` for each match; engine settings come from config.
  - Parallelism: set `"concurrent_matches": N` in `config.json` to run N matches in parallel. When a match finishes, a new pending match is started until the queue is empty.
  - Berger parallelism: set `"berger_concurrency": N` to control per-player Berger fetch workers (fallback mode).
  - Rounds: set `"round_start": S` and `"round_end": E` to process rounds S..E in order; after each round completes, the scheduler waits `"pause_duration_seconds": 120` (default 120) before continuing.
  - Claims: `claimed_at` is set when a match is completed; pending matches are always discovered via `status=false`.
  - Berger: after each round that completes at least one match, the program recomputes Berger scores (dry-run output, then DB update).
  - Standings export: after each round that completes at least one match, the standings are exported to `rounds/<championship_id>/<round>.csv`.
  - Note: `bergvizer_score` can exceed 100000 in long tournaments; ensure the column uses a large enough numeric precision (e.g., `numeric(12,2)`).

.env support
- Place a `.env` file alongside the binary or when running `go run .` in the project dir.
- Example `.env`:
  - `SUPABASE_URL=http://localhost:8000/`
  - `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1` (service role; with RLS enabled and no write policies, workers must use this key)

RLS note
- With the new schema enabling Row Level Security and only SELECT policies, write operations (claiming matches, updating `sf_matches`, inserting into `sf_elo_history`, and upserting `sf_standings`) require the service role to bypass RLS. Ensure the worker runs with `SUPABASE_SERVICE_ROLE_KEY` available (or pass that value via `-supabase-key`); anon keys no longer work for writes.
- Values are loaded at startup and used as defaults for flags.

Quick Start
1) Build
- `go build .`

2) Configure (example `config.json`)
```
{
  "engine": "stockfish-15-1-avx2", 
  "search_mode": "depth",
  "search_depth": 20,
  "time_per_move_ms": 1000,
  "max_moves": 500,
  "enable_chess960": true,
  "enable_nnue": false,
  "randomness_mode": "multipv",
  "multi_pv": 3,
  "random_seed": 0,
  "hash_size_mb": 256,
  "threads": 1,
  "syzygy_path": "",
  "pgn_event": "Chess960 Engine Match",
  "pgn_variant": "Chess960",
  "pgn_site": "Computer"
}
```

3) Run
- Use config-driven defaults (no CLI args):
  - `go run . -config config.json -out result.pgn`
  - If `start_fen` is omitted, standard starting position is used unless overridden by CLI or Supabase.
  - Add `-debug` to see UCI I/O.
- Or override start via CLI back-ranks (White then Black):
  - `go run . NQBRKNRB bnrqknrb`
    - Produces FEN `bnrqknrb/pppppppp/8/8/8/8/PPPPPPPP/NQBRKNRB w KQkq - 0 1`
    - Automatically enables `UCI_Chess960` for engines.

Notes
- Engine path on Windows may require `.exe` or a full path.
- With `enable_chess960 = true` and a non‑standard back‑rank FEN/ID or ranks, the app sets `UCI_Chess960=true` on the engine.
- SAN conversion uses `github.com/corentings/chess` (same approach as `validator/`) and respects Chess960 castling and disambiguation.

Config keys (additions)
- `championship_id`: numeric ID used to scope standings updates.
- `elo_k_factor`: floating K-factor for ELO updates (default 20).
- `berger_concurrency`: per-player Berger worker count when fallback mode is used (default 8).

Auto-draw enforcement
- Config (default on): `"enforce_draws": true`
- CLI override (optional): `-enforce-draws=true|false` (overrides config)
- When enabled, the engine loop stops and sets `Result "1/2-1/2"` on:
  - Threefold repetition (Chess960 site rule)
  - 50-move rule (100 half-moves without pawn move or capture)
  - Insufficient material

Project Structure
- `main.go` — CLI, orchestration, match loop, PGN write (SAN)
- `config.go` — config structs and loader
- `types.go` — shared simple types (e.g., Side)
- `engine.go` — UCI engine setup and helpers (position, multipv sampling)
- `startpos.go` — start position utilities (standard/960, FEN generator)
- `pgn.go` — legacy UCI writer (kept for reference)

Design Choices
- Engines are orchestrated via UCI; moves are collected in UCI and converted to SAN for compatibility.
- Chess960 start positions are generated and tagged correctly, and the UCI flag is applied as needed.
- The implementation favors simplicity and debuggability; SAN conversion mirrors `validator/`.

Roadmap (optional)
- Better MultiPV sampling (capture all k best lines per move).
- Automatic result tagging / termination method detection.

Documentation
- Localized quick guides live under `doc/`:
  - English: `doc/README.en.md`
  - Français: `doc/README.fr.md`
  - Español: `doc/README.es.md`
  - Deutsch: `doc/README.de.md`
  - Русский: `doc/README.ru.md`

Related
- A reference validator and SAN converter lives under `validator/` (batch conversion, CSV exports, draw‑rule audits).

`./chess960v2.exe -config config.json -supabase`
`./chess960v2 -config config.json -supabase`
