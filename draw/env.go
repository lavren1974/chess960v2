package main

import (
    "bufio"
    "errors"
    "os"
    "path/filepath"
    "strings"
)

func getenv(key string) string {
    v := os.Getenv(key)
    if v != "" {
        return v
    }
    if err := loadDotEnv(".env"); err == nil {
        return os.Getenv(key)
    }
    if p, err := findUp(".env"); err == nil {
        _ = loadDotEnv(p)
        return os.Getenv(key)
    }
    return ""
}

func findUp(name string) (string, error) {
    dir, err := os.Getwd()
    if err != nil {
        return "", err
    }
    for {
        cand := filepath.Join(dir, name)
        if _, err := os.Stat(cand); err == nil {
            return cand, nil
        }
        parent := filepath.Dir(dir)
        if parent == dir {
            return "", errors.New("not found")
        }
        dir = parent
    }
}

func loadDotEnv(path string) error {
    f, err := os.Open(path)
    if err != nil {
        return err
    }
    defer f.Close()
    s := bufio.NewScanner(f)
    for s.Scan() {
        line := strings.TrimSpace(s.Text())
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }
        if i := strings.Index(line, "="); i >= 0 {
            k := strings.TrimSpace(line[:i])
            v := strings.TrimSpace(line[i+1:])
            v = strings.Trim(v, "\"'")
            os.Setenv(k, v)
        }
    }
    return s.Err()
}

