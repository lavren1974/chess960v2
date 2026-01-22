# Chess960v2 — Double‑Random Fischer Random Chess

Languages: English | [Русский](README.ru.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md)

Chess960v2 is an innovative approach to Fischer Random Chess with double randomization of starting positions. You can run tournaments using the chess engine with different starting positions, exploring new strategies and tactics in the face of complete unpredictability in the opening.

## Table of Contents
- [What Does “Chess960v2” Mean?](#what-does-chess960v2-mean)
- [Why Stockfish 15.1?](#why-stockfish-151)
- [About the Creator](#about-the-creator)
- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Database Setup (Supabase)](#database-setup-supabase)
- [Install Stockfish 15.1](#install-stockfish-151)
- [Usage](#usage)
  - [Seed Agents](#1-seed-agents-960-per-color--1920-total)
  - [Draw Matches](#2-draw-matches-schedule-pairings)
  - [Run Games](#3-run-games-engine-worker)
- [Configuration Options](#configuration-options)
- [Environment Variables (summary)](#environment-variables-summary)
- [Web UI (Championship Interface)](#web-ui-championship-interface)
- [Troubleshooting](#troubleshooting)
- [License and Contributions](#license-and-contributions)

## What Does “Chess960v2” Mean?
“v2” isn’t just “version 2.” It symbolizes a new degree of freedom, like squaring the number 960: while Chess960 has 960 random setups, in our format this number is multiplied by the very possibility of choice, creating a virtually infinite field for creativity.

## Why Stockfish 15.1?
We chose this version because it is the last one that doesn’t use the NNUE neural network technology by default. This allows us to focus on pure computational power and the diversity of strategies the engine will find in the given positions.

## About the Creator
Nikolay Lavrenov. Open-source project, developed together with the community.

---

## Project Overview
This repository contains the full pipeline to run large‑scale Chess960v2 experiments backed by Supabase:

- `files/` — SQL schema for Supabase/Postgres (`schemas.txt`).
- `import_positions/` — Go tool to seed all Chess960 agents into the DB from CSV.
- `draw/` — Go scheduler that generates match rows (pairings) into the DB.
- `game/` — Go engine runner that plays matches (Stockfish or any UCI engine) and writes results/PGN back.
- `web/` — Next.js app (optional) for viewing data and progress.

---

## Prerequisites
- Go 1.21+ (recommended)
- Supabase project (or direct PostgreSQL) and API keys
- Stockfish 15.1 installed and available on `PATH`
- OS: Linux/macOS/Windows supported (examples below use Linux)

---

## Database Setup (Supabase)
1) Open Supabase SQL Editor.
2) Paste and run the schema from `./files/schemas.txt`.
3) Create at least one championship row (required by the draw step):
```sql
insert into public.championships (name, description) values ('Championship 1', 'Initial run');
```

---

## Install Stockfish 15.1
Make the Stockfish binary available on your system `PATH`.

Step 1: Make the binary executable
```bash
ls -l ~/stockfish
chmod +x ~/stockfish
```

Step 2 (recommended): Move to `/usr/local/bin`
```bash
sudo mv ~/stockfish /usr/local/bin/stockfish
```

Verify:
```bash
stockfish --version
```

Notes
- Windows: ensure `stockfish.exe` is on `PATH` (e.g., add its folder to Environment Variables) and verify with `stockfish.exe --version`.
- macOS (Homebrew): `brew install stockfish` may install a newer version; you can still point the runner to any path in `game/config.json`.

---

## Usage

### 1) Seed Agents (960 per color = 1920 total)
The `import_positions` tool reads `chess960original.csv` and inserts agents into `public.agents` via Supabase REST.

- Configure environment
  - Copy `import_positions/.env.example` to `import_positions/.env`.
  - Set `SUPABASE_URL` and a key with write access. Prefer `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) or set `SUPABASE_KEY`.

- Run
```bash
cd import_positions
go run main.go
```

Expected: 1920 agents created (unique by `(sp_id, color)`).

### 2) Draw Matches (schedule pairings)
The `draw` tool pairs white‑agents vs black‑agents and inserts rows into `public.matches` for a given championship.

- Configure environment
  - Copy `draw/.env.example` to `draw/.env`.
  - Either provide a direct Postgres DSN (preferred) via `DATABASE_URL` or PG variables, or set `SUPABASE_URL` + `SUPABASE_KEY` for REST mode.

- Run small sample (e.g., 10 per color, championship 1)
```bash
cd draw
go run . -n 10 -c 1
```

- Full championship (960 per color)
```bash
go run . -n 960 -c 1
```

Notes
- Ensure `public.championships` has at least one row; pass its ID with `-c`.
- Re‑running is idempotent for the same `(player_white, player_black, round, championship_id)`.

### 3) Run Games (engine worker)
The `game` worker fetches pending matches, runs engines, writes PGN and results, and updates standings.

- Configure
  - Copy `game/config.sample.json` to `game/config.json` and set your engine path, depth/time settings, threads, etc.
  - Optional: `.env` in `game/` with `SUPABASE_URL` and a key; service role key is preferred for write operations under RLS.

- Build and run (recommended)
```bash
cd game
# Ensure deps and build
go mod tidy
go build

# Run the compiled binary
./chess960v2 -config config.json -supabase
```

Tips
- Set `engine` in `config.json` to the name/path of your Stockfish 15.1 binary (e.g., `stockfish`, `stockfish.exe`, or full path).
- Enable Chess960 handling in config (`enable_chess960: true`). The runner automatically sets `UCI_Chess960` when needed.
- Use `concurrent_matches` to run multiple games in parallel and `pause_every_n_matches` to throttle long runs.

Minimal `config.json` (no comments allowed in JSON)
```json
{
  "engine": "stockfish",
  "search_mode": "depth",
  "search_depth": 20,
  "time_per_move_ms": 1000,
  "max_moves": 500,
  "enable_chess960": true,
  "enable_nnue": false,
  "hash_size_mb": 256,
  "threads": 1,
  "pgn_event": "Chess960 Engine Match",
  "pgn_variant": "Chess960",
  "pgn_site": "Computer",
  "enforce_draws": true
}
```

Full `config.json` example (copy as-is; JSON has no comments)
```json
{
    "engine": "stockfish",
    "time_per_move_ms": 2000,
    "search_depth": 20,
    "search_mode": "time",
    "max_moves": 1000,
    "enable_chess960": true,
    "enable_nnue": false,
    "randomness_mode": "multipv",
    "multi_pv": 1,
    "random_seed": 0,
    "hash_size_mb": 512,
    "threads": 1,
    "syzygy_path": "",
    "pgn_event": "Chess960v2 Championship 2026 - Season 1",
    "pgn_variant": "Chess960",
    "pgn_site": "Chess960v2.com",
    "pgn_san_strict": true,
    "enforce_draws": true,
    "concurrent_matches": 12,
    "berger_concurrency": 8,
    "round_start": 1,
    "round_end": 960,
    "pause_duration_seconds": 300,
    "championship_id": 1,
    "elo_k_factor": 20
}
```

Notes
- Use `search_mode="time"` with `time_per_move_ms` or `search_mode="depth"` with `search_depth`.
- `pause_duration_seconds` is in seconds (not milliseconds).
- `multi_pv=1` picks only the best line when using `randomness_mode: "multipv"`.
- Create `game/.env` from `game/.env.example` and set `SUPABASE_URL` and a key (prefer `SUPABASE_SERVICE_ROLE_KEY`).

---

## Configuration Options
- `engine` (string): Engine executable name or path (e.g., `stockfish`, `stockfish.exe`, `/usr/local/bin/stockfish`).
- `time_per_move_ms` (int): Milliseconds per move when `search_mode = "time"`.
- `search_depth` (int): Fixed depth when `search_mode = "depth"`.
- `search_mode` (string): `"time"` or `"depth"` (`"movetime"` is treated as `"time"`).
- `max_moves` (int): Max half-moves (plies) before early termination; default 500 if omitted.
- `enable_chess960` (bool): Enables 960 semantics and sets `UCI_Chess960=true` for non-standard starts.
- `start_fen` (string): Optional explicit starting FEN; overrides the default start.
- `enable_nnue` (bool): Sets engine option "Use NNUE" to true/false when supported.
- `randomness_mode` (string): `"multipv"` to sample among top lines when `multi_pv > 1`; otherwise deterministic best move.
- `multi_pv` (int): Engine MultiPV setting; `1` selects only the best line.
- `random_seed` (int): RNG seed; `0` means time-based seed.
- `hash_size_mb` (int): Engine transposition table size in MB (UCI `Hash`).
- `threads` (int): Engine threads (UCI `Threads`).
- `syzygy_path` (string): Syzygy endgame tablebase path.
- `pgn_event` / `pgn_variant` / `pgn_site` (strings): PGN tags to label games.
- `pgn_annotator` (string): Optional PGN `Annotator` tag.
- `pgn_white` / `pgn_black` / `pgn_round` (strings): Optional PGN overrides (useful in Supabase mode).
- `enforce_draws` (bool): Auto-stop on threefold, 50-move rule, or insufficient material. Defaults to true. CLI override: `-enforce-draws=true|false`.
- `concurrent_matches` (int): Parallel matches in Supabase mode; default 1.
- `pause_every_n_matches` (int): Pause after N completed matches (0 disables).
- `pause_duration_seconds` (int): Pause duration in seconds (default 120 when pausing is enabled).
- `max_total_matches` (int): Stop after this many matches; `0` means unlimited.
- `championship_id` (int): Championship scope for standings updates.
- `elo_k_factor` (float): ELO K-factor; default 20.
- `engine_a` / `engine_b` (object): Per-side overrides (keys: `engine`, `time_per_move_ms`, `search_depth`, `search_mode`, `enable_nnue`, `multi_pv`, `hash_size_mb`, `threads`, `syzygy_path`).
- `pgn_san_strict` (bool): Reserved/experimental; SAN output is Chess960-aware by default.

## Environment Variables (summary)
Common variables across tools:
- `SUPABASE_URL` — Base URL of your Supabase instance
- `SUPABASE_KEY` — Anon or service key (write requires policies or service role)
- `SUPABASE_SERVICE_ROLE_KEY` — Preferred for workers that write under RLS
- `DATABASE_URL` or `PG*` vars — Direct Postgres connection (for `draw` in Postgres mode)

Each subfolder contains `.env.example` with the most relevant variables.

---

## Web UI (Championship Interface)
- Install deps
  - `cd web`
  - `npm install` (or `pnpm install`)
- Dev server
  - `npm run dev` (or `pnpm dev`)
- Production build
  - `npm run build && npm start` (or `pnpm build && pnpm start`)

Environment
- Copy `web/env.example` to `web/.env.local` (or `.env`) and set your Supabase URL and key.

## Troubleshooting
- RLS and writes: with Row Level Security enabled and no write policies, use `SUPABASE_SERVICE_ROLE_KEY` for workers (`import_positions`, `game`).
- Engine path: on Windows you may need an absolute path or `stockfish.exe`; verify with `stockfish --version`.
- Schema: if any tool complains about tables/columns, re‑apply `files/schemas.txt` in the SQL Editor.

---

## License and Contributions
Open-source, community‑driven project. Contributions are welcome via pull requests and issues.
