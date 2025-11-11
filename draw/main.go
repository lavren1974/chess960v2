package main

import (
    "flag"
    "fmt"
    "math/rand"
    "os"
    "strconv"
    "time"
)

func main() {
    // Flags: -n or first positional argument
    var nFlag int
    var championshipID int
    flag.IntVar(&nFlag, "n", 0, "number of players from each team to draw (default: all)")
    flag.IntVar(&championshipID, "c", 1, "championship id to assign to inserted matches")
    flag.IntVar(&championshipID, "championship", 1, "championship id to assign to inserted matches")
    flag.Parse()
    if nFlag == 0 && flag.NArg() >= 1 {
        if v, err := strconv.Atoi(flag.Arg(0)); err == nil && v > 0 {
            nFlag = v
        }
    }
    // Optional second positional arg for championship id
    if flag.NArg() >= 2 {
        if v, err := strconv.Atoi(flag.Arg(1)); err == nil && v > 0 {
            championshipID = v
        }
    }

    rand.Seed(time.Now().UnixNano())

    // Prefer direct DB if configured; fallback to Supabase REST.
    if dsn := postgresDSNFromEnv(); dsn != "" {
        if err := runWithPostgres(dsn, nFlag, int64(championshipID)); err != nil {
            fmt.Fprintf(os.Stderr, "error: %v\n", err)
            os.Exit(1)
        }
        return
    }

    // Supabase REST mode
    whites, err := fetchAgentsByColor("w", 0)
    if err != nil {
        fmt.Fprintf(os.Stderr, "error: %v\n", err)
        os.Exit(1)
    }
    blacks, err := fetchAgentsByColor("b", 0)
    if err != nil {
        fmt.Fprintf(os.Stderr, "error: %v\n", err)
        os.Exit(1)
    }
    if len(whites) == 0 || len(blacks) == 0 {
        fmt.Fprintln(os.Stderr, "no agents found for one or both teams")
        os.Exit(1)
    }

    // Limit if requested
    if nFlag > 0 {
        if nFlag < len(whites) {
            whites = whites[:nFlag]
        }
        if nFlag < len(blacks) {
            blacks = blacks[:nFlag]
        }
    }

    // Prepare equal-sized pools
    n := len(whites)
    if len(blacks) < n { n = len(blacks) }
    whites = whites[:n]
    blacks = blacks[:n]

    // Randomize initial black order and build schedule
    rand.Shuffle(len(blacks), func(i, j int) { blacks[i], blacks[j] = blacks[j], blacks[i] })
    whiteIDs := make([]int64, n)
    blackIDs := make([]int64, n)
    for i := 0; i < n; i++ { whiteIDs[i] = whites[i].ID; blackIDs[i] = blacks[i].ID }
    rounds := make([]int64, n)
    for i := 0; i < n; i++ { rounds[i] = int64(i+1) }
    schedule := generateSchedule(whiteIDs, blackIDs)

    // Fetch existing triples for these players and rounds
    existing, err := fetchExistingTriples(whiteIDs, blackIDs, rounds, int64(championshipID))
    if err != nil {
        fmt.Fprintf(os.Stderr, "warning: could not fetch existing matches, proceeding without dedupe: %v\n", err)
        existing = map[[3]int64]struct{}{}
    }

    toInsert := make([]Match, 0, len(schedule))
    skipped := 0
    for _, m := range schedule {
        key := [3]int64{m.PlayerWhite, m.PlayerBlack, m.Round}
        if _, ok := existing[key]; ok {
            skipped++
            continue
        }
        m.ChampionshipID = int64(championshipID)
        toInsert = append(toInsert, m)
    }

    if err := insertMatches(toInsert); err != nil {
        fmt.Fprintf(os.Stderr, "error inserting matches: %v\n", err)
        os.Exit(1)
    }

    fmt.Printf("Draw complete. New matches: %d, skipped existing: %d, total planned: %d\n", len(toInsert), skipped, len(schedule))
}
