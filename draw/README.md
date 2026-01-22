Draw – Chess960 matches scheduler

Overview
- Pairs agents from two teams (`color = 'w'` and `color = 'b'`) into a round-robin schedule and writes rows to `public.sf_matches`.
- For N players per team, generates N rounds × N matches. Each white plays every black once; `round` column stores the round number (1..N).
- Supports two connection modes:
  - Direct Postgres via `pgx` when DB variables are present in `.env`.
  - Supabase REST fallback using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (RLS requires the service role key).

Schema expectations
- Table `public.sf_agents`: contains players with columns `id`, `sp_id`, `mini_fen`, `color` in {'w','b'}.
- Table `public.championships`: stores competitions; referenced by matches.
- Table `public.sf_matches`:
  - Required columns: `id`, `created_at`, `player_white`, `player_black`, `pgn`, `status`, `round`, `championship_id`, `result`.
  - Notes:
    - `championship_id` references `public.championships(id)` and is set from the CLI argument (default 1).
    - `result` is inserted empty (NULL) by this tool.
  - Recommended indexes:
    - `idx_sf_matches_player_white (player_white)`
    - `idx_sf_matches_player_black (player_black)`
    - `idx_sf_matches_players_pair (player_white, player_black)`
    - `idx_sf_matches_championship (championship_id)`

Configuration (.env)
- Direct Postgres (preferred if present):
  - `DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=disable`
  - or the standard PG variables: `PGHOST`, `PGPORT` (5432), `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE` (default `disable`).
- Supabase REST fallback:
  - `SUPABASE_URL=http://localhost:8000`
  - `SUPABASE_SERVICE_ROLE_KEY=...` (service role key needed because all tables use RLS).

Usage
- Build: `go build .`
- Generate all-vs-all for full rosters (default championship 1): `go run .`
- Specify championship id:
  - `go run . -c 2`
  - `go run . --championship 2`
  - Positional second arg also supported: `go run . 3 2` (N=3, championship=2)
- Limit N players per team (also N rounds):
  - `go run . 3`
  - `go run . -n 3`

Behavior
- Equalizes the two teams to the smaller size and shuffles the initial black order to vary the schedule.
- Deduplication: avoids inserting rows that already exist for the same `(player_white, player_black, round)` within the specified `championship_id`. Re-running the tool for the same championship is idempotent.

Project layout (package `main`)
- `main.go`: CLI entry; parses flags, picks connection mode, orchestrates schedule + insert.
- `env.go`: Environment and `.env` loader helpers.
- `types.go`: Shared structs (`Agent`, `Match`).
- `rest.go`: Supabase REST client and helpers.
- `pg.go`: Direct Postgres logic using `pgx` and bulk insert.
- `schedule.go`: Round-robin schedule generation.

```
TRUNCATE public.standings RESTART IDENTITY;
TRUNCATE public.sf_matches RESTART IDENTITY;
TRUNCATE public.championships RESTART IDENTITY;

TRUNCATE public.sf_agents, public.sf_elo_history, public.sf_matches, public.sf_standings RESTART IDENTITY CASCADE;

TRUNCATE public.games RESTART IDENTITY CASCADE;

TRUNCATE public.sf_agents RESTART IDENTITY CASCADE;
TRUNCATE public.sf_matches RESTART IDENTITY CASCADE;


UPDATE public.sf_agents 
SET current_elo = 2000;

```

`go run . -n 10 -c 1`


SELECT *
FROM public.games
WHERE pgn LIKE '%O-O%'
  AND (pgn LIKE '%O-O-O%' OR pgn LIKE '%O-O%' AND pgn NOT LIKE '%O-O-O%');

SELECT *
FROM public.sf_matches
WHERE pgn LIKE '%O-O%'
  AND (pgn LIKE '%O-O-O%' OR pgn LIKE '%O-O%' AND pgn NOT LIKE '%O-O-O%');
