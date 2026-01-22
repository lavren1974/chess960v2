package berger

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// applyEnv sets an env var when value is non-empty.
func applyEnv(key, val string) {
	if val != "" {
		_ = os.Setenv(key, val)
	}
}

// LoadEnvFile loads simple KEY=VALUE pairs from a .env file if present.
func LoadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"`)
		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
}

func ParsePlayers(csv string) ([]int64, error) {
	var ids []int64
	for _, part := range strings.Split(csv, ",") {
		p := strings.TrimSpace(part)
		if p == "" {
			continue
		}
		v, err := strconv.ParseInt(p, 10, 64)
		if err != nil {
			return nil, err
		}
		ids = append(ids, v)
	}
	return ids, nil
}

func joinInts(ids []int64) string {
	var parts []string
	for _, id := range ids {
		parts = append(parts, fmt.Sprintf("%d", id))
	}
	return strings.Join(parts, ",")
}

func numberToFloat(n json.Number) (float64, error) {
	return n.Float64()
}

func isStatementTimeout(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "statement timeout") || strings.Contains(msg, "57014")
}

type logger struct {
	silent bool
}

func (l logger) Printf(format string, args ...any) {
	if l.silent {
		return
	}
	fmt.Printf(format, args...)
}

func (l logger) Warnf(format string, args ...any) {
	if l.silent {
		return
	}
	fmt.Fprintf(os.Stderr, format, args...)
}
