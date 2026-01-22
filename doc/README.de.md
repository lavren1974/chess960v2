# Chess960v2 — Doppelte Randomisierung im Fischer-Schach (Chess960)

Sprachen: [English](README.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Français](README.fr.md) | Deutsch

Chess960v2 bringt eine doppelte Zufallsauswahl der Startaufstellungen. So lassen sich Engine‑Turniere mit variablen Ausgangspositionen fahren und neue Strategien unter völlig unvorhersehbaren Eröffnungen erforschen.

## Inhaltsverzeichnis
- [Was bedeutet „Chess960v2“?](#was-bedeutet-chess960v2)
- [Warum Stockfish 15.1?](#warum-stockfish-151)
- [Über den Autor](#über-den-autor)
- [Projektüberblick](#projektüberblick)
- [Voraussetzungen](#voraussetzungen)
- [Datenbank (Supabase)](#datenbank-supabase)
- [Stockfish 15.1 installieren](#stockfish-151-installieren)
- [Verwendung](#verwendung)
  - [Agenten importieren](#1-agenten-importieren-960-pro-farbe--1920)
  - [Paarungen erzeugen](#2-paarungen-erzeugen)
  - [Partien spielen](#3-partien-spielen-worker)
- [Konfigurationsoptionen](#konfigurationsoptionen)
- [Umgebungsvariablen (Übersicht)](#umgebungsvariablen-übersicht)
- [Web‑UI](#webui)
- [Fehlerbehebung](#fehlerbehebung)
- [Lizenz und Beiträge](#lizenz-und-beiträge)

## Was bedeutet „Chess960v2“?
„v2“ ist nicht nur „Version 2“. Es steht für einen neuen Freiheitsgrad: Wenn es im Chess960 960 Startaufstellungen gibt, wird dieses Feld durch die Möglichkeit der Wahl nochmals vervielfacht – praktisch ein unendliches Kreativfeld.

## Warum Stockfish 15.1?
Diese Version ist die letzte, die NNUE standardmäßig nicht verwendet. Dadurch liegt der Fokus auf reiner Rechenleistung und der Vielfalt der vom Motor gefundenen Pläne.

## Über den Autor
Nikolay Lavrenov. Open‑Source‑Projekt, gemeinsam mit der Community entwickelt.

---

## Projektüberblick
- `files/` — SQL‑Schema für Supabase/Postgres (`schemas.txt`).
- `import_positions/` — Go‑Tool zum Import aller Chess960‑Agenten aus CSV.
- `draw/` — Go‑Planer, der Paarungen erzeugt und in `public.matches` schreibt.
- `game/` — Go‑Worker, der Partien (Stockfish oder UCI) spielt und PGN/Resultate schreibt.
- `web/` — Next.js‑App (optional) zur Visualisierung.

---

## Voraussetzungen
- Go 1.21+
- Supabase‑Projekt (oder direktes Postgres) und API‑Schlüssel
- Stockfish 15.1 im `PATH`
- Linux/macOS/Windows

---

## Datenbank (Supabase)
1) Supabase SQL Editor öffnen.
2) `./files/schemas.txt` ausführen.
3) Mindestens ein Championship anlegen:
```sql
insert into public.championships (name, description) values ('Championship 1', 'Initial run');
```

---

## Stockfish 15.1 installieren
Binärdatei im `PATH` verfügbar machen.

Schritt 1: Ausführbar machen
```bash
ls -l ~/stockfish
chmod +x ~/stockfish
```

Schritt 2 (empfohlen): nach `/usr/local/bin` verschieben
```bash
sudo mv ~/stockfish /usr/local/bin/stockfish
```

Prüfen:
```bash
stockfish --version
```

Hinweise
- Windows: sicherstellen, dass `stockfish.exe` im `PATH` liegt.
- macOS: Homebrew kann eine andere Version installieren; Pfad in `game/config.json` setzen.

---

## Verwendung

### 1) Agenten importieren (960 pro Farbe = 1920)
`import_positions` liest `chess960original.csv` und schreibt in `public.agents` (REST).

- Umgebung
  - `import_positions/.env.example` → `import_positions/.env` kopieren.
  - `SUPABASE_URL` und Schlüssel mit Schreibrechten setzen (Service‑Role bevorzugt).

- Start
```bash
cd import_positions
go run main.go
```

### 2) Paarungen erzeugen
`draw` erzeugt Paarungen und schreibt sie in `public.matches`.

- Umgebung
  - `draw/.env.example` → `draw/.env` kopieren.
  - Entweder `DATABASE_URL`/`PG*` (direktes Postgres) oder `SUPABASE_URL` + `SUPABASE_KEY` (REST).

- Beispiel (10 pro Farbe, Championship 1)
```bash
cd draw
go run . -n 10 -c 1
```

- Vollständig (960 pro Farbe)
```bash
go run . -n 960 -c 1
```

### 3) Partien spielen (Worker)
`game` verarbeitet offene Matches, startet die Engines und schreibt PGN/Resultat.

- Bauen und starten
```bash
cd game
go mod tidy
go build
./chess960v2 -config config.json -supabase
```

- Konfiguration
  - `game/config.sample.json` → `game/config.json`.
  - Optional `.env` mit `SUPABASE_URL` und Schlüssel (Service‑Role bevorzugt).

Minimale Config
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

Volle Config
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

Hinweise
- `search_mode="time"` mit `time_per_move_ms` oder `search_mode="depth"` mit `search_depth` verwenden.
- `pause_duration_seconds` ist in Sekunden.
- `multi_pv=1` wählt nur die beste Variante.
- `game/.env` aus `game/.env.example` erstellen und `SUPABASE_URL` + Schlüssel setzen.

---

## Konfigurationsoptionen
- `engine` (string): Name/Pfad des Engine‑Binaries (z. B. `stockfish`, `stockfish.exe`, `/usr/local/bin/stockfish`).
- `time_per_move_ms` (int): Millisekunden pro Zug bei `search_mode = "time"`.
- `search_depth` (int): Feste Suchtiefe bei `search_mode = "depth"`.
- `search_mode` (string): `"time"` oder `"depth"` (Alias `"movetime"` entspricht `"time"`).
- `max_moves` (int): Maximale Halbzüge (Plies) bis zum Abbruch; Standard 500.
- `enable_chess960` (bool): Aktiviert 960‑Semantik und setzt `UCI_Chess960=true` für nicht‑standardisierte Starts.
- `start_fen` (string): Optionaler Start‑FEN; überschreibt die Standard‑Startstellung.
- `enable_nnue` (bool): Setzt Engine‑Option „Use NNUE“ (falls unterstützt).
- `randomness_mode` (string): `"multipv"` um bei `multi_pv > 1` aus Top‑Varianten zu wählen; sonst deterministisch bester Zug.
- `multi_pv` (int): MultiPV‑Wert der Engine; `1` = nur beste Variante.
- `random_seed` (int): Zufalls‑Seed; `0` = zeitbasiert.
- `hash_size_mb` (int): Größe der Transpositionstabelle (UCI `Hash`) in MB.
- `threads` (int): Engine‑Threads (UCI `Threads`).
- `syzygy_path` (string): Pfad zu Syzygy‑Endspieldatenbanken.
- `pgn_event` / `pgn_variant` / `pgn_site` (string): PGN‑Tags.
- `pgn_annotator` (string): Optionales PGN‑Tag `Annotator`.
- `pgn_white` / `pgn_black` / `pgn_round` (string): Optionale PGN‑Overrides (nützlich im Supabase‑Modus).
- `enforce_draws` (bool): Automatischer Stopp bei Dreifachwiederholung, 50‑Züge‑Regel oder unzureichendem Material. Standard true. CLI: `-enforce-draws=true|false`.
- `concurrent_matches` (int): Parallele Matches im Supabase‑Modus; Standard 1.
- `pause_every_n_matches` (int): Pause nach N beendeten Matches (0 deaktiviert).
- `pause_duration_seconds` (int): Pausenlänge in Sekunden (Standard 120 bei aktivierter Pause).
- `max_total_matches` (int): Beenden nach so vielen Matches; `0` = unbegrenzt.
- `championship_id` (int): Championship‑ID für Tabellen/Aktualisierungen.
- `elo_k_factor` (float): ELO‑K‑Faktor; Standard 20.
- `engine_a` / `engine_b` (Objekt): Seitenspezifische Overrides (Schlüssel: `engine`, `time_per_move_ms`, `search_depth`, `search_mode`, `enable_nnue`, `multi_pv`, `hash_size_mb`, `threads`, `syzygy_path`).
- `pgn_san_strict` (bool): Reserviert/experimentell; SAN‑Ausgabe ist Chess960‑fähig.

## Umgebungsvariablen (Übersicht)
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` oder `PG*` für direktes Postgres

---

## Web‑UI
- `cd web && npm install`
- Entwicklung: `npm run dev`
- Produktion: `npm run build && npm start`
- `web/env.example` → `web/.env.local` kopieren und URL/Schlüssel setzen

---

## Fehlerbehebung
- RLS/Schreiben: Service‑Role‑Schlüssel für schreibende Prozesse nutzen.
- Engine‑Pfad: unter Windows ggf. absoluter Pfad oder `stockfish.exe` nötig.
- Schema: `files/schemas.txt` erneut anwenden, falls Spalten/Tabellen fehlen.

---

## Lizenz und Beiträge
Open Source; PRs und Issues willkommen.
