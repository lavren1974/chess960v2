# Chess960v2 — Двойная рандомизация в шахматах Фишера (Chess960)

Языки: [English](README.md) | Русский | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md)

Chess960v2 — это новый подход к «шахматам Фишера» с двойной рандомизацией стартовых позиций. Вы можете проводить турниры движков с разными начальными расстановками и исследовать стратегии в условиях полной непредсказуемости дебюта.

## Содержание
- [Что означает «Chess960v2»](#что-означает-chess960v2)
- [Почему Stockfish 15.1](#почему-stockfish-151)
- [Об авторе](#об-авторе)
- [Обзор проекта](#обзор-проекта)
- [Предварительные требования](#предварительные-требования)
- [Настройка базы данных (Supabase)](#настройка-базы-данных-supabase)
- [Установка Stockfish 15.1](#установка-stockfish-151)
- [Использование](#использование)
  - [Импорт агентов](#1-импорт-агентов-960-за-белых--960-за-чёрных--1920)
  - [Жеребьёвка матчей](#2-жеребьёвка-матчей-расписание)
  - [Запуск партий](#3-запуск-партий-движковый-воркер)
- [Параметры конфигурации](#параметры-конфигурации)
- [Переменные окружения (сводка)](#переменные-окружения-сводка)
- [Веб‑интерфейс (Championship UI)](#вебинтерфейс-championship-ui)
- [Диагностика](#диагностика)
- [Лицензия и вклад](#лицензия-и-вклад)

## Что означает «Chess960v2»
«v2» — не просто «версия 2». Это символ новой степени свободы: если в классическом Chess960 существует 960 начальных раскладок, то в нашем формате эта мощность умножается самой возможностью выбора, рождая практически бесконечное поле для творчества.

## Почему Stockfish 15.1
Мы выбираем Stockfish 15.1, потому что это последняя версия, которая по умолчанию не использует NNUE. Это позволяет сфокусироваться на «чистой» вычислительной силе и разнообразии стратегий, которые движок находит в заданных позициях.

## Об авторе
Николай Лавренов. Открытый проект, развиваемый вместе с сообществом.

---

## Обзор проекта
Этот репозиторий содержит полный конвейер для исследований Chess960v2 с использованием Supabase:

- `files/` — SQL‑схема для Supabase/Postgres (`schemas.txt`).
- `import_positions/` — утилита на Go для загрузки всех агентов Chess960 из CSV в БД.
- `draw/` — планировщик на Go, формирующий расписание и вставляющий строки в `public.matches`.
- `game/` — воркер‑движок на Go, запускающий партии (Stockfish или любой UCI) и записывающий PGN/результаты.
- `web/` — интерфейс на Next.js (опционально) для просмотра данных и прогресса.

---

## Предварительные требования
- Go 1.21+ (рекомендуется)
- Проект Supabase (или прямой доступ к PostgreSQL) и ключи API
- Установленный Stockfish 15.1 в `PATH`
- Поддерживаемые ОС: Linux / macOS / Windows (примеры далее для Linux)

---

## Настройка базы данных (Supabase)
1) Откройте SQL Editor в Supabase.
2) Вставьте и выполните SQL из `./files/schemas.txt`.
3) Создайте хотя бы одну запись чемпионата (требуется для шага жеребьёвки):
```sql
insert into public.championships (name, description) values ('Championship 1', 'Initial run');
```

---

## Установка Stockfish 15.1
Сделайте бинарник доступным в системном `PATH`.

Шаг 1: права на выполнение
```bash
ls -l ~/stockfish
chmod +x ~/stockfish
```

Шаг 2 (рекомендуется): переместить в `/usr/local/bin`
```bash
sudo mv ~/stockfish /usr/local/bin/stockfish
```

Проверка:
```bash
stockfish --version
```

Примечания
- Windows: убедитесь, что `stockfish.exe` в `PATH` (или укажите полный путь); проверьте `stockfish.exe --version`.
- macOS (Homebrew): `brew install stockfish` может поставить более новую версию; путь к нужному бинарю можно указать в `game/config.json`.

---

## Использование

### 1) Импорт агентов (960 за белых + 960 за чёрных = 1920)
`import_positions` читает `chess960original.csv` и вставляет агентов в `public.agents` через REST Supabase.

- Настройка окружения
  - Скопируйте `import_positions/.env.example` → `import_positions/.env`.
  - Установите `SUPABASE_URL` и ключ с правом записи. Предпочтительно `SUPABASE_SERVICE_ROLE_KEY` (обходит RLS) или `SUPABASE_KEY`.

- Запуск
```bash
cd import_positions
go run main.go
```

Ожидаемо: создано 1920 агентов (уникальность по `(sp_id, color)`).

### 2) Жеребьёвка матчей (расписание)
`draw` формирует пары белых против чёрных и вставляет строки в `public.matches` для выбранного чемпионата.

- Настройка окружения
  - Скопируйте `draw/.env.example` → `draw/.env`.
  - Либо укажите строку подключения к Postgres (`DATABASE_URL` или переменные `PG*`), либо `SUPABASE_URL` + `SUPABASE_KEY` для REST‑режима.

- Небольшой пример (10 на цвет, чемпионат id=1)
```bash
cd draw
go run . -n 10 -c 1
```

- Полный чемпионат (960 на цвет)
```bash
go run . -n 960 -c 1
```

Примечания
- В `public.championships` должна быть хотя бы одна запись; её id передаётся через `-c`.
- Повторный запуск идемпотентен для одинаковых `(player_white, player_black, round, championship_id)`.

### 3) Запуск партий (движковый воркер)
`game` выбирает ожидающие матчи, запускает движки, пишет PGN/результат и обновляет таблицы (включая текущую таблицу мест и ELO).

- Сборка и запуск
```bash
cd game
go mod tidy
go build
./chess960v2 -config config.json -supabase
```

- Конфигурация
  - Скопируйте `game/config.sample.json` → `game/config.json` и задайте путь к движку, режим поиска, потоки и т.д.
  - Опционально: `.env` в `game/` с `SUPABASE_URL` и ключом; для записи при включённом RLS предпочтителен `SUPABASE_SERVICE_ROLE_KEY`.

Подсказки
- Установите `engine` в `config.json` равным имени/пути бинаря Stockfish 15.1 (например, `stockfish`, `stockfish.exe` или абсолютный путь).
- При `enable_chess960: true` воркер автоматически проставит `UCI_Chess960` в движок для нестандартных стартовых рядов.
- `concurrent_matches` позволяет запускать несколько партий параллельно; `pause_every_n_matches` помогает делать паузы на длинных сериях.

Минимальный `config.json` (без комментариев; JSON их не поддерживает)
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

Полный `config.json` (скопируйте как есть)
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

Заметки
- Используйте `search_mode="time"` вместе с `time_per_move_ms` или `search_mode="depth"` с `search_depth`.
- `pause_duration_seconds` измеряется в секундах.
- При `randomness_mode: "multipv"` и `multi_pv=1` выбирается только лучшая линия.
- Создайте `game/.env` из `game/.env.example` и укажите `SUPABASE_URL` и ключ (лучше `SUPABASE_SERVICE_ROLE_KEY`).

---

## Параметры конфигурации
- `engine` (string): имя или путь к движку (например, `stockfish`, `stockfish.exe`, `/usr/local/bin/stockfish`).
- `time_per_move_ms` (int): миллисекунды на ход при `search_mode = "time"`.
- `search_depth` (int): фиксированная глубина при `search_mode = "depth"`.
- `search_mode` (string): `"time"` или `"depth"` (алиас `"movetime"` = `"time"`).
- `max_moves` (int): максимум полуходов (ply) до досрочного завершения; по умолчанию 500.
- `enable_chess960` (bool): включает семантику 960 и выставляет `UCI_Chess960=true` для нестандартных стартов.
- `start_fen` (string): явный стартовый FEN; перекрывает стандартную начальную позицию.
- `enable_nnue` (bool): устанавливает опцию движка "Use NNUE" (если поддерживается).
- `randomness_mode` (string): `"multipv"` — выбор из топ‑линий при `multi_pv > 1`; иначе детерминированный лучший ход.
- `multi_pv` (int): настройка MultiPV у движка; `1` — только лучшая линия.
- `random_seed` (int): зерно ГПСЧ; `0` — использование времени.
- `hash_size_mb` (int): размер хеша (UCI `Hash`) в мегабайтах.
- `threads` (int): число потоков движка (UCI `Threads`).
- `syzygy_path` (string): путь к базам окончаний Syzygy.
- `pgn_event` / `pgn_variant` / `pgn_site` (string): теги PGN.
- `pgn_annotator` (string): опциональный тег PGN `Annotator`.
- `pgn_white` / `pgn_black` / `pgn_round` (string): опциональные переопределения тегов (удобно в режиме Supabase).
- `enforce_draws` (bool): авто‑остановка при троекратном повторении, правиле 50 ходов или недостаточном материале. По умолчанию `true`. CLI: `-enforce-draws=true|false`.
- `concurrent_matches` (int): число параллельных партий в режиме Supabase; по умолчанию 1.
- `pause_every_n_matches` (int): пауза после N завершённых партий (0 — без пауз).
- `pause_duration_seconds` (int): длительность паузы в секундах (по умолчанию 120 при включённых паузах).
- `max_total_matches` (int): остановка после указанного числа партий; `0` — без ограничения.
- `championship_id` (int): ID чемпионата для обновления таблицы результатов.
- `elo_k_factor` (float): K‑фактор для рейтинга ELO; по умолчанию 20.
- `engine_a` / `engine_b` (object): переопределения для сторон (ключи: `engine`, `time_per_move_ms`, `search_depth`, `search_mode`, `enable_nnue`, `multi_pv`, `hash_size_mb`, `threads`, `syzygy_path`).
- `pgn_san_strict` (bool): зарезервировано/экспериментально; SAN уже учитывает Chess960.

## Переменные окружения (сводка)
Общие для инструментов:
- `SUPABASE_URL` — базовый URL вашего проекта Supabase
- `SUPABASE_KEY` — anon или service‑role ключ (для записи нужен доступ по политикам или service‑role)
- `SUPABASE_SERVICE_ROLE_KEY` — предпочтителен для воркеров, пишущих при включённом RLS
- `DATABASE_URL` или переменные `PG*` — прямое подключение к Postgres (для `draw` в режиме Postgres)

В каждой подпапке есть `.env.example` с нужными переменными.

---

## Веб‑интерфейс (Championship UI)
- Установка зависимостей
  - `cd web`
  - `npm install` (или `pnpm install`)
- Режим разработки
  - `npm run dev` (или `pnpm dev`)
- Продакшен‑сборка
  - `npm run build && npm start` (или `pnpm build && pnpm start`)

Окружение
- Скопируйте `web/env.example` → `web/.env.local` (или `.env`) и задайте URL и ключ Supabase.

---

## Диагностика
- RLS и запись: при включённом Row Level Security и отсутствии write‑политик используйте `SUPABASE_SERVICE_ROLE_KEY` для утилит, которые пишут (например, `import_positions`, `game`).
- Путь к движку: в Windows может потребоваться абсолютный путь или `stockfish.exe`; проверьте `stockfish --version`.
- Схема: если какая‑то утилита сообщает о проблемах со столбцами/таблицами, переиспользуйте `files/schemas.txt` в SQL Editor.

---

## Лицензия и вклад
Открытый проект, приветствуются PR и обсуждения в Issues.
