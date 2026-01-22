package berger

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func fetchStandings(baseURL, key string, championshipID int64, playerIDs []int64, log logger) ([]standingRow, error) {
	selectCols := "id,player_id,points,bergvizer_score,championship_id"
	path := "/sf_standings?select=" + selectCols + "&order=id.asc"
	if championshipID > 0 {
		path = fmt.Sprintf("/sf_standings?championship_id=eq.%d&select=%s&order=id.asc", championshipID, selectCols)
	}
	if len(playerIDs) > 0 {
		filter := "&player_id=in.(" + joinInts(playerIDs) + ")"
		candidate := path + filter
		if len(candidate) < 1800 {
			path = candidate
		} else {
			log.Warnf("player filter omitted (URI would be too long); fetching all standings for championship %d\n", championshipID)
		}
	}
	return fetchPaged[standingRow](baseURL, key, path)
}

func fetchMatches(baseURL, key string, championshipID int64) ([]matchRow, error) {
	selectCols := "id,player_white,player_black,result,status,championship_id"
	basePath := fmt.Sprintf("/sf_matches?championship_id=eq.%d&status=eq.true&result=not.is.null&select=%s", championshipID, selectCols)
	const pageSize = 1000
	var all []matchRow
	var lastID int64
	for {
		path := basePath
		if lastID > 0 {
			path += fmt.Sprintf("&id=gt.%d", lastID)
		}
		path += fmt.Sprintf("&order=id.asc&limit=%d", pageSize)
		resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil, nil, nil)
		if err != nil {
			return nil, err
		}
		var batch []matchRow
		err = func() error {
			defer resp.Body.Close()
			if resp.StatusCode >= 300 {
				b, _ := io.ReadAll(resp.Body)
				return fmt.Errorf("request failed: %s: %s", resp.Status, string(b))
			}
			dec := json.NewDecoder(resp.Body)
			if err := dec.Decode(&batch); err != nil {
				return err
			}
			return nil
		}()
		if err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}
		all = append(all, batch...)
		lastID = batch[len(batch)-1].ID
		if len(batch) < pageSize {
			break
		}
	}
	return all, nil
}

func uniqueChampIDsFromStandings(rows []standingRow) []int64 {
	set := map[int64]struct{}{}
	for _, r := range rows {
		set[r.ChampionshipID] = struct{}{}
	}
	var ids []int64
	for id := range set {
		ids = append(ids, id)
	}
	return ids
}
