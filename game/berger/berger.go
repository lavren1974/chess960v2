package berger

import (
	"fmt"
	"math"
	"strings"
)

type Options struct {
	ChampionshipID    int64
	Players           []int64
	DryRun            bool
	Debug             bool
	BaseURL           string
	Key               string
	Silent            bool
	PlayerConcurrency int
}

func Run(opts Options) error {
	log := logger{silent: opts.Silent}
	if opts.ChampionshipID <= 0 {
		return fmt.Errorf("championship is required; provide ChampionshipID > 0")
	}
	if opts.PlayerConcurrency <= 0 {
		opts.PlayerConcurrency = 8
	}

	baseURL := strings.TrimRight(opts.BaseURL, "/")
	key := opts.Key
	if baseURL == "" || key == "" {
		return fmt.Errorf("baseURL and key are required")
	}

	standings, err := fetchStandings(baseURL, key, opts.ChampionshipID, nil, log)
	if err != nil {
		return fmt.Errorf("fetch standings: %w", err)
	}
	if len(standings) == 0 {
		log.Printf("No standings rows found for championship %d; nothing to do\n", opts.ChampionshipID)
		return nil
	}

	targetPlayers := map[int64]struct{}{}
	for _, id := range opts.Players {
		targetPlayers[id] = struct{}{}
	}

	champIDs := []int64{opts.ChampionshipID}

	matchesByChamp := map[int64][]matchRow{}
	usePerPlayer := map[int64]bool{}
	for _, cid := range champIDs {
		ms, err := fetchMatches(baseURL, key, cid)
		if err != nil {
			log.Warnf("warning: match fetch failed for championship %d; using per-player queries: %v\n", cid, err)
			usePerPlayer[cid] = true
			continue
		}
		if len(ms) == 0 {
			log.Warnf("warning: no matches found for championship %d\n", cid)
		}
		matchesByChamp[cid] = ms
	}

	byChampionship := map[int64][]standingRow{}
	for _, s := range standings {
		byChampionship[s.ChampionshipID] = append(byChampionship[s.ChampionshipID], s)
	}

	updated := 0
	for champID, champStandings := range byChampionship {
		matches := matchesByChamp[champID]
		if matches == nil && !usePerPlayer[champID] {
			var err error
			matches, err = fetchMatches(baseURL, key, champID)
			if err != nil {
				log.Warnf("warning: match fetch failed for championship %d; using per-player queries: %v\n", champID, err)
				usePerPlayer[champID] = true
			}
			if matches != nil {
				matchesByChamp[champID] = matches
			}
		}

		points := map[int64]float64{}
		for _, s := range champStandings {
			if v, err := numberToFloat(s.Points); err == nil {
				points[s.PlayerID] = v
			} else {
				log.Warnf("warning: unable to parse points for player %d: %v\n", s.PlayerID, err)
			}
		}
		if matches != nil {
			for pid, v := range aggregatePointsFromMatches(matches) {
				if cur, ok := points[pid]; !ok || v > cur {
					points[pid] = v
				}
			}
		}

		var totals map[int64]float64
		var matchesByPlayer map[int64][]matchRow
		if usePerPlayer[champID] {
			if !opts.Debug {
				totals = computeBergerTotalsPerPlayerConcurrent(baseURL, key, champID, champStandings, points, targetPlayers, opts.PlayerConcurrency, log)
			}
		} else {
			if opts.Debug {
				matchesByPlayer = map[int64][]matchRow{}
				for _, m := range matches {
					matchesByPlayer[m.PlayerWhite] = append(matchesByPlayer[m.PlayerWhite], m)
					matchesByPlayer[m.PlayerBlack] = append(matchesByPlayer[m.PlayerBlack], m)
				}
				totals = map[int64]float64{}
			} else {
				totals = computeBergerTotals(matches, points)
			}
		}

		for _, s := range champStandings {
			if len(targetPlayers) > 0 {
				if _, ok := targetPlayers[s.PlayerID]; !ok {
					continue
				}
			}
			var total float64
			if usePerPlayer[champID] {
				if opts.Debug {
					var err error
					total, err = computeBergerForPlayer(baseURL, key, champID, s.PlayerID, points, opts.Debug, log)
					if err != nil {
						log.Warnf("compute failed for player %d (champ %d): %v\n", s.PlayerID, champID, err)
						continue
					}
				} else if v, ok := totals[s.PlayerID]; ok {
					total = v
				} else {
					log.Warnf("compute failed for player %d (champ %d): no result\n", s.PlayerID, champID)
					continue
				}
			} else if opts.Debug {
				log.Printf("== player %d (champ %d)\n", s.PlayerID, s.ChampionshipID)
				for _, m := range matchesByPlayer[s.PlayerID] {
					oppID, weight, ok := outcomeForPlayer(m, s.PlayerID)
					if !ok {
						if opts.Debug {
							log.Printf("  match %d skipped (result %q)\n", m.ID, m.Result)
						}
						continue
					}
					oppPts := points[oppID]
					total += weight * oppPts
					log.Printf("  match %d vs %d result=%q weight=%.2f oppPts=%.2f add=%.2f\n", m.ID, oppID, m.Result, weight, oppPts, weight*oppPts)
				}
			} else {
				total = totals[s.PlayerID]
			}
			total = math.Round(total*100) / 100

			if opts.DryRun {
				prev := ""
				if s.BergvizerScore != nil {
					if v, err := numberToFloat(*s.BergvizerScore); err == nil {
						prev = fmt.Sprintf(" (was %.2f)", v)
					}
				}
				log.Printf("[dry-run] player %d champ %d bergvizer=%.2f%s\n", s.PlayerID, s.ChampionshipID, total, prev)
				continue
			}
			if err := updateBergvizer(baseURL, key, s.ID, total); err != nil {
				log.Warnf("update failed for standing id=%d (player %d): %v\n", s.ID, s.PlayerID, err)
				continue
			}
			updated++
		}
	}

	if opts.DryRun {
		log.Printf("Dry run complete.\n")
	} else {
		log.Printf("Updated %d standings rows.\n", updated)
	}
	return nil
}
