Chess960 Engine Match (Go)

Кратко
- Запуск матчей UCI-движков с полноценной поддержкой Chess960.
- Произвольные стартовые ряды через CLI (или из БД в режиме Supabase).
- Вывод SAN PGN, совместимых с популярными просмотрщиками.
- Опциональная автоостановка по ничьим (троекратное, 50-ходовое, недостаток материала).

Обзор
- Запускает матчи UCI-движков (Stockfish или любой UCI) на Go.
- Поддерживает классические шахматы и Chess960 (Fischer Random).
- Полностью управляется через JSON-конфиг (пути к движкам, время/глубина, старт Chess960, NNUE, hash, threads и т.д.).
- Формирует SAN PGN, учитывающие правила Chess960.

Зачем
- Быстро воспроизводить, отлаживать и анализировать Chess960-партии без GUI.
- Делиться переносимыми PGN, совместимыми с Lichess/ChessBase и другими просмотрщиками.
- Экспериментировать с нестандартными задними рядами вне каталога 960.

Возможности
- Оркестрация UCI: инициализация движков, установка опций, цикл ходов.
- Chess960: автоустановка `UCI_Chess960` при нестандартных стартах.
- Стартовые позиции:
  - `start_fen` (явно),
  - через CLI (`./chess960v2 WHITE BLACK`), или
  - из БД в режиме Supabase (через `sf_agents.mini_fen`).
- Контроль времени или глубины:
  - `search_mode: "time"` с `time_per_move_ms`, или
  - `search_mode: "depth"` с `search_depth`.
- Опции движка: Hash, Threads, NNUE, Syzygy, MultiPV; ponder выключен по умолчанию.
- MultiPV-выбор: простая случайность из лучших линий.
- Логи отладки: `-debug` печатает UCI-трафик.
- Вывод: SAN PGN (например, `1. e4 e5 2. Nf3 Nc6 ...`).

Интеграция Supabase (опционально)
- Берет несыгранную пару (status=false) и обновляет строку PGN, `result` и `status=true`.
- Флаги:
  - `-supabase` включить режим Supabase
  - `-supabase-url` базовый URL (или env `SUPABASE_URL` из `.env`)
  - `-supabase-key` service role ключ (по умолчанию `SUPABASE_SERVICE_ROLE_KEY`)
- Поведение:
  - Читает первую несыгранную строку из `public.sf_matches` по `id`.
  - Заполняет заголовки PGN `White`/`Black` по `sf_agents.mini_fen` через FK `player_white` / `player_black`.
  - Записывает PGN в поле `pgn`, ставит `result` и `status=true`.
  - Обновляет `public.sf_standings` в рамках чемпионата:
    - Добавьте `"championship_id"` в `config.json` (если не задан, берется `match.championship_id`).
    - Победа: `wins += 1`, `points += 1.0`; ничья: `draws += 1`, `points += 0.5`; поражение: `losses += 1`.
    - Всегда: `games_played += 1` для обоих игроков (upsert).
  - Стартовая позиция строится из `sf_agents.mini_fen` для каждого матча; настройки движка берутся из конфигурации.
  - Параллельность: `"concurrent_matches": N` в `config.json` запускает N матчей параллельно. После завершения матча запускается следующий.
  - Параллельность Бергера: `"berger_concurrency": N` задает число воркеров для fallback-режима.
  - Раунды: `"round_start": S` и `"round_end": E` обрабатывают раунды S..E; после каждого раунда ожидание `"pause_duration_seconds": 120` (по умолчанию 120).
  - Claims: `claimed_at` ставится при завершении матча; ожидаются только `status=false`.
  - Berger: после каждого раунда с сыгранными партиями пересчитываются коэффициенты Бергера (dry-run, затем запись).
  - Экспорт: после раунда standings пишутся в `rounds/<championship_id>/<round>.csv`.
  - Примечание: `bergvizer_score` может превышать 100000 в длинных турнирах; используйте достаточную точность (например, `numeric(12,2)`).

.env
- Положите `.env` рядом с бинарем или при запуске `go run .` в каталоге проекта.
- Пример `.env`:
  - `SUPABASE_URL=http://localhost:8000/`
  - `SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1` (service role; при RLS без write-политик нужен этот ключ)

RLS
- При включенном RLS и только SELECT-политиках записи требуют service role (обновление `sf_matches`, вставки `sf_elo_history`, upsert `sf_standings`).
- Значения загружаются при старте и используются как дефолты для флагов.

Быстрый старт
1) Сборка
- `go build .`

2) Конфиг (пример `config.json`)
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

3) Запуск
- Использовать конфиг по умолчанию (без CLI-аргументов):
  - `go run . -config config.json -out result.pgn`
  - Если `start_fen` не указан, берется стандартная позиция, если не переопределено CLI или Supabase.
  - Добавьте `-debug` для просмотра UCI I/O.
- Переопределить старт через CLI ряды (White затем Black):
  - `go run . NQBRKNRB bnrqknrb`
    - FEN `bnrqknrb/pppppppp/8/8/8/8/PPPPPPPP/NQBRKNRB w KQkq - 0 1`
    - Автоматически включает `UCI_Chess960`.

Примечания
- На Windows путь к движку может требовать `.exe` или полный путь.
- При `enable_chess960 = true` и нестандартном старте приложение ставит `UCI_Chess960=true`.
- SAN-конвертация использует `github.com/corentings/chess` (как в `validator/`) и учитывает правила Chess960.

Ключи конфига (дополнения)
- `championship_id`: ID чемпионата для обновления таблицы.
- `elo_k_factor`: K-фактор для рейтинга (по умолчанию 20).
- `berger_concurrency`: число воркеров для расчета Бергера в fallback-режиме (по умолчанию 8).

Автоничьи
- Конфиг (по умолчанию включено): `"enforce_draws": true`
- CLI override (опционально): `-enforce-draws=true|false` (перекрывает конфиг)
- При включении цикл останавливается и ставится `Result "1/2-1/2"` при:
  - Троекратном повторении (правило Chess960)
  - Правиле 50 ходов (100 полуходов без пешки/взятия)
  - Недостатке материала

Структура проекта
- `main.go` — CLI, оркестрация, матч-цикл, PGN (SAN)
- `config.go` — конфиги и загрузка
- `types.go` — общие типы (например, Side)
- `engine.go` — запуск UCI и helpers (позиция, multipv)
- `startpos.go` — утилиты стартовых позиций (standard/960, FEN)
- `pgn.go` — legacy UCI writer (оставлен для справки)

Решения по дизайну
- Оркестрация через UCI; ходы собираются в UCI и конвертируются в SAN.
- Старт Chess960 формируется корректно, `UCI_Chess960` включается автоматически.
- Реализация простая и отлаживаемая; SAN-конвертация как в `validator/`.

Планы (опционально)
- Улучшить MultiPV-выбор (сохранять k лучших линий на ход).
- Автоматическое определение результата/завершения.

Документация
- Локальные гайды в `doc/`:
  - English: `doc/README.en.md`
  - Русский: `doc/README.ru.md`

Related
- Референсный validator и SAN-конвертер в `validator/` (batch conversion, CSV exports, draw-rule audits).

`./chess960v2.exe -config config.json -supabase`
`./chess960v2 -config config.json -supabase`
