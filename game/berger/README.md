# Berger

Small Go CLI to recompute and update Berger (Buchholz-style) scores for Chess960 standings stored in Supabase. It pulls standings and all finished matches for a championship from `public.sf_standings` and `public.sf_matches`, sums opponents' points (win=100%, draw=50%), and patches `bergvizer_score` back to `public.sf_standings`.

## Usage
- Ensure `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_KEY`).
- Championship id is required: `-championship 1`
- Dry-run: `go run ./berger/cmd/berger -championship 1 -dry-run`
- Target specific players: `go run ./berger/cmd/berger -championship 1 -players 1001,2001 -dry-run`
- Persist updates: rerun without `-dry-run`.
- Debug per-match contributions: add `-debug`.

## Files
- `cmd/berger/main.go` — CLI entrypoint
- `main.go` — package entrypoint
- `types.go` — light DTOs for Supabase rows
- `util.go` — env/flag helpers
- `data.go` — Supabase fetch helpers
- `supabase.go` — REST wrapper and pagination
- `compute.go` — result parsing and Berger math


```
// вывод в консоль, без изменеия в базе данных
go run ./berger/cmd/berger -championship 1 -dry-run

// без вывода в консоль, с изменеиями в базе данных
go run ./berger/cmd/berger -championship 1
```
