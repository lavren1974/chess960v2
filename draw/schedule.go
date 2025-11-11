package main

// generateSchedule builds a round-robin schedule for equal-sized pools.
// It returns N rounds x N matches where N = len(whiteIDs) = len(blackIDs).
func generateSchedule(whiteIDs, blackIDs []int64) []Match {
    n := len(whiteIDs)
    if len(blackIDs) < n {
        n = len(blackIDs)
    }
    whiteIDs = whiteIDs[:n]
    blackIDs = blackIDs[:n]

    schedule := make([]Match, 0, n*n)
    rot := append([]int64(nil), blackIDs...)
    for r := 0; r < n; r++ {
        roundNo := int64(r + 1)
        for i := 0; i < n; i++ {
            schedule = append(schedule, Match{PlayerWhite: whiteIDs[i], PlayerBlack: rot[i], Round: roundNo})
        }
        if n > 1 {
            last := rot[n-1]
            copy(rot[1:], rot[:n-1])
            rot[0] = last
        }
    }
    return schedule
}

