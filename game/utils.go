package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func fatal(format string, a ...any) {
    fmt.Fprintf(os.Stderr, "error: "+format+"\n", a...)
    os.Exit(1)
}

// loadDotEnv reads simple KEY=VALUE pairs from a .env file
// and sets them into the process environment. Lines starting with
// '#' or ';' are ignored. Surrounding quotes are stripped.
func loadDotEnv(path string) {
    f, err := os.Open(path)
    if err != nil {
        return
    }
    defer f.Close()
    s := bufio.NewScanner(f)
    for s.Scan() {
        line := strings.TrimSpace(s.Text())
        if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
            continue
        }
        // Allow optional leading 'export '
        if strings.HasPrefix(line, "export ") { line = strings.TrimSpace(line[len("export "):]) }
        eq := strings.IndexByte(line, '=')
        if eq <= 0 { continue }
        key := strings.TrimSpace(line[:eq])
        val := strings.TrimSpace(line[eq+1:])
        // Strip surrounding quotes
        if (strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"")) || (strings.HasPrefix(val, "'") && strings.HasSuffix(val, "'")) {
            if len(val) >= 2 { val = val[1:len(val)-1] }
        }
        _ = os.Setenv(key, val)
    }
}
