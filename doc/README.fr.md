# Chess960v2 — Double aléatorisation aux échecs Fischer (Chess960)

Langues : [English](README.md) | [Русский](README.ru.md) | [Español](README.es.md) | Français | [Deutsch](README.de.md)

Chess960v2 propose une double randomisation des positions initiales. Organisez des tournois de moteurs avec des départs variés et explorez de nouvelles stratégies sous des ouvertures totalement imprévisibles.

## Table des matières
- [Que signifie « Chess960v2 » ?](#que-signifie--chess960v2--)
- [Pourquoi Stockfish 15.1 ?](#pourquoi-stockfish-151-)
- [À propos du créateur](#à-propos-du-créateur)
- [Vue d’ensemble du projet](#vue-densemble-du-projet)
- [Prérequis](#prérequis)
- [Base de données (Supabase)](#base-de-données-supabase)
- [Installer Stockfish 15.1](#installer-stockfish-151)
- [Utilisation](#utilisation)
  - [Importer les agents](#1-importer-les-agents-960-par-couleur--1920)
  - [Tirage / planning](#2-tirage--planning-des-matches)
  - [Lancer les parties](#3-lancer-les-parties-worker)
- [Options de configuration](#options-de-configuration)
- [Variables d’environnement (résumé)](#variables-denvironnement-résumé)
- [Interface Web](#interface-web)
- [Dépannage](#dépannage)
- [Licence et contributions](#licence-et-contributions)

## Que signifie « Chess960v2 » ?
« v2 » n’est pas seulement « version 2 ». C’est un nouveau degré de liberté : si Chess960 propose 960 configurations, notre format multiplie cet espace par la possibilité de choix, ouvrant un champ quasiment infini à la créativité.

## Pourquoi Stockfish 15.1 ?
Parce que c’est la dernière version qui n’utilise pas NNUE par défaut. Cela met l’accent sur la puissance de calcul pure et la diversité des plans trouvés par le moteur selon la position.

## À propos du créateur
Nikolay Lavrenov. Projet open source développé avec la communauté.

---

## Vue d’ensemble du projet
- `files/` — Schéma SQL pour Supabase/Postgres (`schemas.txt`).
- `import_positions/` — Outil Go pour insérer tous les agents Chess960 depuis un CSV.
- `draw/` — Planificateur Go qui génère les matches (`public.matches`).
- `game/` — Worker Go qui joue les parties (Stockfish ou UCI) et écrit PGN/résultats.
- `web/` — Application Next.js (facultative) pour visualiser données et progression.

---

## Prérequis
- Go 1.21+
- Projet Supabase (ou Postgres direct) et clés API
- Stockfish 15.1 dans le `PATH`
- Linux/macOS/Windows

---

## Base de données (Supabase)
1) Ouvrez le SQL Editor de Supabase.
2) Exécutez `./files/schemas.txt`.
3) Créez au moins un championnat :
```sql
insert into public.championships (name, description) values ('Championship 1', 'Initial run');
```

---

## Installer Stockfish 15.1
Rendez le binaire accessible via le `PATH`.

Étape 1 : droits d’exécution
```bash
ls -l ~/stockfish
chmod +x ~/stockfish
```

Étape 2 (recommandée) : déplacer vers `/usr/local/bin`
```bash
sudo mv ~/stockfish /usr/local/bin/stockfish
```

Vérification :
```bash
stockfish --version
```

Notes
- Windows : veillez à ce que `stockfish.exe` soit dans le `PATH`.
- macOS : Homebrew peut installer une autre version ; pointez le chemin dans `game/config.json`.

---

## Utilisation

### 1) Importer les agents (960 par couleur = 1920)
`import_positions` lit `chess960original.csv` et insère dans `public.agents` via REST.

- Environnement
  - Copiez `import_positions/.env.example` → `import_positions/.env`.
  - Définissez `SUPABASE_URL` et une clé avec écriture (idéalement `SUPABASE_SERVICE_ROLE_KEY`).

- Exécution
```bash
cd import_positions
go run main.go
```

### 2) Tirage / planning des matches
`draw` crée les paires et les insère dans `public.matches`.

- Environnement
  - Copiez `draw/.env.example` → `draw/.env`.
  - Soit Postgres direct via `DATABASE_URL`/`PG*`, soit REST via `SUPABASE_URL` + `SUPABASE_KEY`.

- Exemple (10 par couleur, championnat 1)
```bash
cd draw
go run . -n 10 -c 1
```

- Complet (960 par couleur)
```bash
go run . -n 960 -c 1
```

### 3) Lancer les parties (worker)
`game` consomme les matches en attente, lance les moteurs et écrit PGN/résultats.

- Compiler et exécuter
```bash
cd game
go mod tidy
go build
./chess960v2 -config config.json -supabase
```

- Configurer
  - Copiez `game/config.sample.json` → `game/config.json`.
  - `.env` optionnel (`SUPABASE_URL` + clé service role recommandé).

Config minimale
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

Config complète
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
- Utilisez `search_mode="time"` avec `time_per_move_ms` ou `search_mode="depth"` avec `search_depth`.
- `pause_duration_seconds` est en secondes.
- `multi_pv=1` choisit uniquement la meilleure ligne.
- Créez `game/.env` à partir de `game/.env.example` avec `SUPABASE_URL` + clé.

---

## Options de configuration
- `engine` (string) : Nom ou chemin de l’exécutable (ex. `stockfish`, `stockfish.exe`, `/usr/local/bin/stockfish`).
- `time_per_move_ms` (int) : Millisecondes par coup lorsque `search_mode = "time"`.
- `search_depth` (int) : Profondeur fixe lorsque `search_mode = "depth"`.
- `search_mode` (string) : `"time"` ou `"depth"` (l’alias `"movetime"` est traité comme `"time"`).
- `max_moves` (int) : Nombre maximal de demi‑coups avant arrêt ; 500 par défaut.
- `enable_chess960` (bool) : Active la sémantique 960 et définit `UCI_Chess960=true` pour les départs non standards.
- `start_fen` (string) : FEN de départ explicite (optionnel) ; remplace la position par défaut.
- `enable_nnue` (bool) : Configure l’option moteur « Use NNUE » (si disponible).
- `randomness_mode` (string) : `"multipv"` pour échantillonner parmi les meilleures lignes quand `multi_pv > 1` ; sinon meilleur coup déterministe.
- `multi_pv` (int) : Réglage MultiPV du moteur ; `1` retient uniquement la meilleure ligne.
- `random_seed` (int) : Graine aléatoire ; `0` = dépend du temps.
- `hash_size_mb` (int) : Taille du Hash (UCI `Hash`) en Mo.
- `threads` (int) : Fils d’exécution du moteur (UCI `Threads`).
- `syzygy_path` (string) : Chemin des tables de finales Syzygy.
- `pgn_event` / `pgn_variant` / `pgn_site` (string) : Étiquettes PGN.
- `pgn_annotator` (string) : Étiquette PGN optionnelle `Annotator`.
- `pgn_white` / `pgn_black` / `pgn_round` (string) : Surcharges PGN (utile en mode Supabase).
- `enforce_draws` (bool) : Arrêt automatique sur triple répétition, règle des 50 coups ou matériel insuffisant. Par défaut true. CLI : `-enforce-draws=true|false`.
- `concurrent_matches` (int) : Nombre de matches parallèles en mode Supabase ; 1 par défaut.
- `pause_every_n_matches` (int) : Pause après N matches terminés (0 = désactivé).
- `pause_duration_seconds` (int) : Durée de pause en secondes (120 par défaut si activée).
- `max_total_matches` (int) : Arrêt après ce nombre de matches ; `0` = illimité.
- `championship_id` (int) : Identifiant du championnat pour la mise à jour des classements.
- `elo_k_factor` (float) : Facteur K pour l’ELO ; 20 par défaut.
- `engine_a` / `engine_b` (objet) : Surcharges par couleur (clés : `engine`, `time_per_move_ms`, `search_depth`, `search_mode`, `enable_nnue`, `multi_pv`, `hash_size_mb`, `threads`, `syzygy_path`).
- `pgn_san_strict` (bool) : Réservé/expérimental ; la sortie SAN gère déjà Chess960.

## Variables d’environnement (résumé)
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` ou `PG*` pour Postgres direct

---

## Interface Web
- `cd web && npm install`
- Dev : `npm run dev`
- Prod : `npm run build && npm start`
- Copier `web/env.example` → `web/.env.local` (URL et clé Supabase)

---

## Dépannage
- RLS : utiliser la clé service role pour les écritures.
- Chemin du moteur : sous Windows, utiliser un chemin absolu si besoin.
- Schéma : réappliquer `files/schemas.txt` en cas d’erreur de colonnes/tables.

---

## Licence et contributions
Projet open source ; PR et issues bienvenus.
