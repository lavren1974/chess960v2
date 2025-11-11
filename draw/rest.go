package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "strconv"
    "strings"
    "time"
)

func supabaseRequest(method, table string, query map[string]string, body any) (*http.Response, error) {
    base := strings.TrimRight(getenv("SUPABASE_URL"), "/")
    anonKey := getenv("SUPABASE_KEY")
    svcKey := getenv("SUPABASE_SERVICE_ROLE_KEY")
    if base == "" || (anonKey == "" && svcKey == "") {
        return nil, fmt.Errorf("missing SUPABASE_URL and key (SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY)")
    }
    url := base + "/rest/v1/" + table
    if len(query) > 0 {
        parts := make([]string, 0, len(query))
        for k, v := range query {
            parts = append(parts, k+"="+escape(v))
        }
        url += "?" + strings.Join(parts, "&")
    }
    var buf *bytes.Reader
    if body != nil {
        b, err := json.Marshal(body)
        if err != nil {
            return nil, err
        }
        buf = bytes.NewReader(b)
    } else {
        buf = bytes.NewReader(nil)
    }
    req, err := http.NewRequest(method, url, buf)
    if err != nil {
        return nil, err
    }
    // Use service role key for mutating requests to bypass RLS, if available.
    keyToUse := anonKey
    if (method == http.MethodPost || method == http.MethodPatch || method == http.MethodDelete) && svcKey != "" {
        keyToUse = svcKey
    }
    req.Header.Set("apikey", keyToUse)
    req.Header.Set("Authorization", "Bearer "+keyToUse)
    if method == http.MethodPost || method == http.MethodPatch {
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Prefer", "return=representation")
    }
    client := &http.Client{Timeout: 60 * time.Second}
    return client.Do(req)
}

func escape(v string) string {
    r := strings.NewReplacer(" ", "%20", ",", "%2C", ")", "%29", "(", "%28", "=", "%3D", "\"", "%22")
    return r.Replace(v)
}

func fetchAgentsByColor(color string, limit int) ([]Agent, error) {
    q := map[string]string{
        "select": "id,sp_id,mini_fen,color",
        "color":  "eq." + color,
        "order":  "id.asc",
    }
    if limit > 0 {
        q["limit"] = strconv.Itoa(limit)
    }
    resp, err := supabaseRequest(http.MethodGet, "agents", q, nil)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 300 {
        b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
        return nil, fmt.Errorf("fetch agents %s failed: %s: %s", color, resp.Status, string(b))
    }
    var out []Agent
    dec := json.NewDecoder(resp.Body)
    if err := dec.Decode(&out); err != nil {
        return nil, err
    }
    return out, nil
}

func fetchExistingTriples(whiteIDs, blackIDs, rounds []int64, championshipID int64) (map[[3]int64]struct{}, error) {
    if len(whiteIDs) == 0 || len(blackIDs) == 0 || len(rounds) == 0 {
        return map[[3]int64]struct{}{}, nil
    }
    mkIn := func(ids []int64) string {
        parts := make([]string, len(ids))
        for i, id := range ids {
            parts[i] = strconv.FormatInt(id, 10)
        }
        return "in.(" + strings.Join(parts, ",") + ")"
    }
    q := map[string]string{
        "select":          "player_white,player_black,round",
        "player_white":    mkIn(whiteIDs),
        "player_black":    mkIn(blackIDs),
        "round":           mkIn(rounds),
        "championship_id": "eq." + strconv.FormatInt(championshipID, 10),
    }
    resp, err := supabaseRequest(http.MethodGet, "matches", q, nil)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 300 {
        b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
        return nil, fmt.Errorf("fetch existing matches failed: %s: %s", resp.Status, string(b))
    }
    var rows []struct {
        PlayerWhite int64 `json:"player_white"`
        PlayerBlack int64 `json:"player_black"`
        Round       int64 `json:"round"`
    }
    dec := json.NewDecoder(resp.Body)
    if err := dec.Decode(&rows); err != nil {
        return nil, err
    }
    set := make(map[[3]int64]struct{}, len(rows))
    for _, r := range rows {
        set[[3]int64{r.PlayerWhite, r.PlayerBlack, r.Round}] = struct{}{}
    }
    return set, nil
}

func insertMatches(matches []Match) error {
    if len(matches) == 0 {
        return nil
    }
    const chunkSize = 500
    for i := 0; i < len(matches); i += chunkSize {
        j := i + chunkSize
        if j > len(matches) {
            j = len(matches)
        }
        chunk := matches[i:j]
        resp, err := supabaseRequest(http.MethodPost, "matches", nil, chunk)
        if err != nil {
            return err
        }
        b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
        resp.Body.Close()
        if resp.StatusCode >= 300 {
            return fmt.Errorf("insert matches failed: %s: %s", resp.Status, string(b))
        }
    }
    return nil
}
