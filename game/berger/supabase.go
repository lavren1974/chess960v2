package berger

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func fetchPaged[T any](baseURL, key, path string) ([]T, error) {
	const pageSize = 1000
	var all []T
	done := false
	for start := 0; ; start += pageSize {
		end := start + pageSize - 1
		resp, err := supabaseRequest(http.MethodGet, baseURL, key, path, nil, &start, &end)
		if err != nil {
			return nil, err
		}
		func() {
			defer resp.Body.Close()
			if resp.StatusCode >= 300 {
				b, _ := io.ReadAll(resp.Body)
				err = fmt.Errorf("request failed: %s: %s", resp.Status, string(b))
				return
			}
			dec := json.NewDecoder(resp.Body)
			dec.UseNumber()
			var batch []T
			if e := dec.Decode(&batch); e != nil {
				err = e
				return
			}
			all = append(all, batch...)
			if len(batch) < pageSize {
				done = true
			}
		}()
		if err != nil {
			return nil, err
		}
		if done {
			break
		}
	}
	return all, nil
}

func supabaseRequest(method, baseURL, key, path string, body []byte, rangeStart, rangeEnd *int) (*http.Response, error) {
	url := strings.TrimRight(baseURL, "/") + "/rest/v1" + path
	req, err := http.NewRequest(method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)
	if rangeStart != nil && rangeEnd != nil {
		req.Header.Set("Range-Unit", "items")
		req.Header.Set("Range", fmt.Sprintf("%d-%d", *rangeStart, *rangeEnd))
	}
	if method == http.MethodPatch || method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Prefer", "return=minimal")
	}
	client := &http.Client{Timeout: 30 * time.Second}
	return client.Do(req)
}
