# Chess960v2 — Doble aleatoriedad en Ajedrez Fischer (Chess960)

Idiomas: [English](README.md) | [Русский](README.ru.md) | Español | [Français](README.fr.md) | [Deutsch](README.de.md)

Chess960v2 es un enfoque innovador del Chess960 con doble aleatorización de las posiciones iniciales. Permite organizar torneos de motores con distintas posiciones de salida y explorar nuevas estrategias bajo aperturas totalmente impredecibles.

## Tabla de contenidos
- [¿Qué significa “Chess960v2”?](#qué-significa-chess960v2)
- [¿Por qué Stockfish 15.1?](#por-qué-stockfish-151)
- [Sobre el creador](#sobre-el-creador)
- [Visión general del proyecto](#visión-general-del-proyecto)
- [Requisitos previos](#requisitos-previos)
- [Base de datos (Supabase)](#base-de-datos-supabase)
- [Instalar Stockfish 15.1](#instalar-stockfish-151)
- [Uso](#uso)
  - [Cargar agentes](#1-cargar-agentes-960-por-color--1920)
  - [Generar emparejamientos](#2-generar-emparejamientos-matches)
  - [Ejecutar partidas](#3-ejecutar-partidas-worker)
- [Opciones de configuración](#opciones-de-configuración)
- [Variables de entorno (resumen)](#variables-de-entorno-resumen)
- [Interfaz web (web)](#interfaz-web-web)
- [Solución de problemas](#solución-de-problemas)
- [Licencia y contribuciones](#licencia-y-contribuciones)

## ¿Qué significa “Chess960v2”?
“v2” no es solo “versión 2”. Simboliza un nuevo grado de libertad: si en Chess960 hay 960 configuraciones, en nuestro formato esa potencia se multiplica por la posibilidad de elección, creando un campo prácticamente infinito para la creatividad.

## ¿Por qué Stockfish 15.1?
Elegimos esta versión porque es la última que no usa NNUE por defecto. Así nos centramos en la potencia de cálculo pura y en la diversidad de estrategias que el motor encuentra para cada posición.

## Sobre el creador
Nikolay Lavrenov. Proyecto de código abierto desarrollado junto con la comunidad.

---

## Visión general del proyecto
Este repositorio contiene el flujo completo para experimentos a gran escala con Chess960v2 sobre Supabase:

- `files/` — Esquema SQL para Supabase/Postgres (`schemas.txt`).
- `import_positions/` — Herramienta en Go que inserta todos los agentes Chess960 desde CSV.
- `draw/` — Programador en Go que genera emparejamientos y los inserta en `public.matches`.
- `game/` — Worker en Go que ejecuta partidas (Stockfish u otro UCI) y escribe PGN/resultados.
- `web/` — App Next.js (opcional) para visualizar datos y progreso.

---

## Requisitos previos
- Go 1.21+
- Proyecto Supabase (o PostgreSQL directo) y claves API
- Stockfish 15.1 en el `PATH`
- SO: Linux/macOS/Windows (los ejemplos usan Linux)

---

## Base de datos (Supabase)
1) Abra el SQL Editor de Supabase.
2) Ejecute el esquema desde `./files/schemas.txt`.
3) Cree al menos un campeonato (requerido por draw):
```sql
insert into public.championships (name, description) values ('Championship 1', 'Initial run');
```

---

## Instalar Stockfish 15.1
Haga que el binario esté en el `PATH`.

Paso 1: permisos de ejecución
```bash
ls -l ~/stockfish
chmod +x ~/stockfish
```

Paso 2 (recomendado): mover a `/usr/local/bin`
```bash
sudo mv ~/stockfish /usr/local/bin/stockfish
```

Verificar:
```bash
stockfish --version
```

Notas
- Windows: asegúrese de que `stockfish.exe` esté en el `PATH`.
- macOS: con Homebrew puede instalar otra versión; apunte la ruta en `game/config.json`.

---

## Uso

### 1) Cargar agentes (960 por color = 1920)
`import_positions` lee `chess960original.csv` e inserta en `public.agents` vía REST.

- Entorno
  - Copie `import_positions/.env.example` a `import_positions/.env`.
  - Defina `SUPABASE_URL` y una clave con escritura; mejor `SUPABASE_SERVICE_ROLE_KEY`.

- Ejecutar
```bash
cd import_positions
go run main.go
```

### 2) Generar emparejamientos (matches)
`draw` crea emparejamientos y los inserta en `public.matches`.

- Entorno
  - Copie `draw/.env.example` a `draw/.env`.
  - Use `DATABASE_URL`/`PG*` para Postgres directo o `SUPABASE_URL` + `SUPABASE_KEY` para REST.

- Muestra (10 por color, campeonato 1)
```bash
cd draw
go run . -n 10 -c 1
```

- Completo (960 por color)
```bash
go run . -n 960 -c 1
```

### 3) Ejecutar partidas (worker)
`game` consume matches pendientes, ejecuta motores y escribe PGN/resultados.

- Compilar y ejecutar
```bash
cd game
go mod tidy
go build
./chess960v2 -config config.json -supabase
```

- Configurar
  - Copie `game/config.sample.json` → `game/config.json`.
  - `.env` opcional con `SUPABASE_URL` y clave (mejor service role).

Config mínima
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

Config completa
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

Notas
- Use `search_mode="time"` con `time_per_move_ms` o `search_mode="depth"` con `search_depth`.
- `pause_duration_seconds` está en segundos.
- `multi_pv=1` elige solo la mejor línea.
- Cree `game/.env` desde `game/.env.example` con `SUPABASE_URL` y clave.

---

## Opciones de configuración
- `engine` (string): Nombre o ruta del ejecutable del motor (p. ej., `stockfish`, `stockfish.exe`, `/usr/local/bin/stockfish`).
- `time_per_move_ms` (int): Milisegundos por jugada si `search_mode = "time"`.
- `search_depth` (int): Profundidad fija si `search_mode = "depth"`.
- `search_mode` (string): `"time"` o `"depth"` (el alias `"movetime"` se trata como `"time"`).
- `max_moves` (int): Máximo de semi‑jugadas (plies) antes de terminar; por defecto 500.
- `enable_chess960` (bool): Activa semántica 960 y ajusta `UCI_Chess960=true` en el motor para salidas no estándar.
- `start_fen` (string): FEN inicial explícito opcional; sobrescribe la posición por defecto.
- `enable_nnue` (bool): Ajusta la opción "Use NNUE" del motor (si está soportado).
- `randomness_mode` (string): `"multipv"` para muestrear entre las mejores líneas cuando `multi_pv > 1`; de lo contrario, mejor jugada determinista.
- `multi_pv` (int): Ajuste MultiPV del motor; `1` selecciona solo la mejor línea.
- `random_seed` (int): Semilla de aleatoriedad; `0` usa tiempo.
- `hash_size_mb` (int): Tamaño de la tabla de transposiciones (UCI `Hash`) en MB.
- `threads` (int): Hilos del motor (UCI `Threads`).
- `syzygy_path` (string): Ruta a las tablas de finales Syzygy.
- `pgn_event` / `pgn_variant` / `pgn_site` (string): Etiquetas PGN.
- `pgn_annotator` (string): Etiqueta PGN opcional `Annotator`.
- `pgn_white` / `pgn_black` / `pgn_round` (string): Sobrescritura opcional de etiquetas PGN (útil en modo Supabase).
- `enforce_draws` (bool): Detiene automáticamente por triple repetición, regla de 50 jugadas o material insuficiente. Por defecto true. CLI: `-enforce-draws=true|false`.
- `concurrent_matches` (int): Partidas en paralelo en modo Supabase; por defecto 1.
- `pause_every_n_matches` (int): Pausa tras N partidas completadas (0 desactiva).
- `pause_duration_seconds` (int): Duración de la pausa en segundos (120 por defecto cuando hay pausa).
- `max_total_matches` (int): Límite total de partidas para este proceso; `0` es ilimitado.
- `championship_id` (int): Id del campeonato para actualizar clasificaciones.
- `elo_k_factor` (float): Factor K de ELO; por defecto 20.
- `engine_a` / `engine_b` (objeto): Overrides por color (claves: `engine`, `time_per_move_ms`, `search_depth`, `search_mode`, `enable_nnue`, `multi_pv`, `hash_size_mb`, `threads`, `syzygy_path`).
- `pgn_san_strict` (bool): Reservado/experimental; la salida SAN ya respeta Chess960.

## Variables de entorno (resumen)
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` o `PG*` para Postgres directo

---

## Interfaz web (web)
- `cd web && npm install`
- Desarrollo: `npm run dev`
- Producción: `npm run build && npm start`
- Copie `web/env.example` → `web/.env.local` con URL/clave de Supabase

---

## Solución de problemas
- RLS y escritura: use service role para procesos que escriben.
- Ruta del motor: en Windows puede necesitar un camino absoluto o `stockfish.exe`.
- Esquema: re‑aplique `files/schemas.txt` si faltan columnas/tablas.

---

## Licencia y contribuciones
Proyecto abierto; se aceptan PRs e issues.
