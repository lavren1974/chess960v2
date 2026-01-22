package main

import (
    "context"
    "fmt"
    "strings"
    "time"
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
)

// Postgres helpers
func postgresDSNFromEnv() string {
    if dsn := getenv("DATABASE_URL"); dsn != "" {
        return dsn
    }
    host := getenv("PGHOST")
    user := getenv("PGUSER")
    pass := getenv("PGPASSWORD")
    db := getenv("PGDATABASE")
    port := getenv("PGPORT")
    if host == "" || user == "" || db == "" {
        return ""
    }
    if port == "" { port = "5432" }
    sslmode := getenv("PGSSLMODE")
    if sslmode == "" { sslmode = "disable" }
    return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", urlQueryEscape(user), urlQueryEscape(pass), host, port, db, sslmode)
}

func urlQueryEscape(s string) string {
    r := strings.NewReplacer("@", "%40", ":", "%3A", "/", "%2F", "?", "%3F", "#", "%23")
    return r.Replace(s)
}

func runWithPostgres(dsn string, n int, championshipID int64) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    pool, err := pgxpool.New(ctx, dsn)
    if err != nil {
        return err
    }
    defer pool.Close()

    whites, err := fetchAgentsByColorDB(ctx, pool, "w", n)
    if err != nil {
        return err
    }
    blacks, err := fetchAgentsByColorDB(ctx, pool, "b", n)
    if err != nil {
        return err
    }
    if len(whites) == 0 || len(blacks) == 0 {
        return fmt.Errorf("no agents found for one or both teams")
    }
    if len(whites) > len(blacks) { whites = whites[:len(blacks)] }
    if len(blacks) > len(whites) { blacks = blacks[:len(whites)] }

    // Build schedule arrays
    nPairs := len(whites)
    whiteIDs := make([]int64, nPairs)
    blackIDs := make([]int64, nPairs)
    for i := 0; i < nPairs; i++ {
        whiteIDs[i] = whites[i].ID
        blackIDs[i] = blacks[i].ID
    }
    rounds := make([]int64, nPairs)
    for i := 0; i < nPairs; i++ { rounds[i] = int64(i+1) }

    // Generate full round-robin arrays
    total := nPairs * nPairs
    insW := make([]int64, 0, total)
    insB := make([]int64, 0, total)
    insR := make([]int64, 0, total)
    rot := append([]int64(nil), blackIDs...)
    for r := 0; r < nPairs; r++ {
        roundNo := int64(r+1)
        for i := 0; i < nPairs; i++ {
            insW = append(insW, whiteIDs[i])
            insB = append(insB, rot[i])
            insR = append(insR, roundNo)
        }
        if nPairs > 1 {
            last := rot[nPairs-1]
            copy(rot[1:], rot[:nPairs-1])
            rot[0] = last
        }
    }

    existing, err := fetchExistingTriplesDB(ctx, pool, whiteIDs, blackIDs, rounds, championshipID)
    if err != nil {
        existing = map[[3]int64]struct{}{}
    }

    filteredW := make([]int64, 0, len(insW))
    filteredB := make([]int64, 0, len(insB))
    filteredR := make([]int64, 0, len(insR))
    skipped := 0
    for i := 0; i < len(insW); i++ {
        key := [3]int64{insW[i], insB[i], insR[i]}
        if _, ok := existing[key]; ok {
            skipped++
            continue
        }
        filteredW = append(filteredW, insW[i])
        filteredB = append(filteredB, insB[i])
        filteredR = append(filteredR, insR[i])
    }

    if err := insertMatchesDB(ctx, pool, filteredW, filteredB, filteredR, championshipID); err != nil {
        return fmt.Errorf("insert matches failed: %w", err)
    }
    fmt.Printf("Draw complete. New matches: %d, skipped existing: %d, total planned: %d\n", len(filteredW), skipped, len(insW))
    return nil
}

func fetchAgentsByColorDB(ctx context.Context, pool *pgxpool.Pool, color string, limit int) ([]Agent, error) {
    baseSQL := `SELECT id, sp_id, mini_fen, color FROM public.sf_agents WHERE color = $1 ORDER BY id ASC`
    var rows pgx.Rows
    var err error
    if limit > 0 {
        rows, err = pool.Query(ctx, baseSQL+" LIMIT $2", color, limit)
    } else {
        rows, err = pool.Query(ctx, baseSQL, color)
    }
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    out := make([]Agent, 0)
    for rows.Next() {
        var a Agent
        if err := rows.Scan(&a.ID, &a.SpID, &a.MiniFEN, &a.Color); err != nil {
            return nil, err
        }
        out = append(out, a)
    }
    return out, rows.Err()
}

func fetchExistingTriplesDB(ctx context.Context, pool *pgxpool.Pool, whiteIDs, blackIDs, rounds []int64, championshipID int64) (map[[3]int64]struct{}, error) {
    if len(whiteIDs) == 0 || len(blackIDs) == 0 || len(rounds) == 0 {
        return map[[3]int64]struct{}{}, nil
    }
    sql := `SELECT player_white, player_black, round FROM public.sf_matches WHERE player_white = ANY($1::bigint[]) AND player_black = ANY($2::bigint[]) AND round = ANY($3::bigint[]) AND championship_id = $4`
    rows, err := pool.Query(ctx, sql, whiteIDs, blackIDs, rounds, championshipID)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    set := make(map[[3]int64]struct{})
    for rows.Next() {
        var w, b, r int64
        if err := rows.Scan(&w, &b, &r); err != nil {
            return nil, err
        }
        set[[3]int64{w, b, r}] = struct{}{}
    }
    return set, rows.Err()
}

func insertMatchesDB(ctx context.Context, pool *pgxpool.Pool, whites, blacks, rounds []int64, championshipID int64) error {
    if len(whites) == 0 {
        return nil
    }
    sql := `INSERT INTO public.sf_matches (player_white, player_black, round, championship_id)
            SELECT w, b, r, $4
            FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[]) AS t(w, b, r)
            LEFT JOIN public.sf_matches m ON (m.player_white = w AND m.player_black = b AND m.round = r AND m.championship_id = $4)
            WHERE m.id IS NULL`
    const chunk = 20000
    for i := 0; i < len(whites); i += chunk {
        j := i + chunk
        if j > len(whites) { j = len(whites) }
        if _, err := pool.Exec(ctx, sql, whites[i:j], blacks[i:j], rounds[i:j], championshipID); err != nil {
            return err
        }
    }
    return nil
}
