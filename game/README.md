Chess960 Engine Match (Go)

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
  - from the database in Supabase mode (via agents' `mini_fen`).
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
  - `-supabase-key` anon/service key (defaults to env `SUPABASE_KEY`; when `SUPABASE_SERVICE_ROLE_KEY` is present, it is preferred automatically)
- Behavior:
  - Reads first pending row from `public.matches` ordered by `id`.
  - Sets PGN `White`/`Black` headers from related `agents.mini_fen` via `player_white` / `player_black` FKs.
  - Writes the PGN back to the row (`pgn`), sets `result`, and marks `status=true`.
  - Updates `public.standings` for both players scoped by a championship:
    - Add `"championship_id"` to `config.json` (if omitted, the match’s `championship_id` is used).
    - Win: `wins += 1`, `points += 1.0`; Draw: `draws += 1`, `points += 0.5`; Loss: `losses += 1`.
    - Always: `games_played += 1` for both players (upsert behavior).
  - Start position is built from agents' `mini_fen` for each match; engine settings come from config.
  - Parallelism: set `"concurrent_matches": N` in `config.json` to run N matches in parallel. When a match finishes, a new pending match is started until the queue is empty.
  - Throttling: to periodically pause after a number of completed games, add e.g. `"pause_every_n_matches": 100` and optionally `"pause_duration_seconds": 120` (default 120). The scheduler waits for current in‑flight games to finish, pauses, then resumes.
  - Cap total matches: set `"max_total_matches": M` to stop after M games in this run (waits for in‑flight to finish).

.env support
- Place a `.env` file alongside the binary or when running `go run .` in the project dir.
- Example `.env`:
  - `SUPABASE_URL=http://localhost:8000/`
  - `SUPABASE_KEY=eyJhbGciOiJIUzI1` (anon)
  - `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1` (service role; with RLS enabled and no write policies, workers must use this key)

RLS note
- With the new schema enabling Row Level Security and only SELECT policies, write operations (claiming matches, updating `matches`, inserting into `elo_history`, and upserting `standings`) require the service role to bypass RLS. Ensure the worker runs with `SUPABASE_SERVICE_ROLE_KEY` available (it is preferred automatically), or pass it via `-supabase-key`.
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
