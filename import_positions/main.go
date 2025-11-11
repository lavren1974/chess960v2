package main

import (
    "context"
    "encoding/csv"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "strconv"
    "strings"
    "time"

	"github.com/joho/godotenv"
)

type Agent struct {
	ID      int64  `json:"id"`
	SPID    int    `json:"sp_id"`
	MiniFEN string `json:"mini_fen"`
	Color   string `json:"color"`
}

type SupabaseClient struct {
    URL  string
    Key  string
    HTTP *http.Client
}

func NewSupabaseClient() *SupabaseClient {
    loadEnv()
    // Prefer service role for writes (RLS bypass). Fallback to SUPABASE_KEY.
    // Also trim any accidental whitespace in env values.
    baseURL := strings.TrimSpace(getEnv("SUPABASE_URL"))
    serviceKey := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
    key := strings.TrimSpace(os.Getenv("SUPABASE_KEY"))
    if serviceKey != "" {
        key = serviceKey
    }
    return &SupabaseClient{
        URL:  strings.TrimRight(baseURL, "/"),
        Key:  key,
        HTTP: &http.Client{Timeout: 30 * time.Second},
    }
}

func (s *SupabaseClient) InsertAgents(agents []Agent) error {
    body, err := json.Marshal(agents)
    if err != nil {
        return fmt.Errorf("ошибка сериализации JSON: %w", err)
    }

	url := fmt.Sprintf("%s/rest/v1/agents", s.URL)
	req, err := http.NewRequestWithContext(context.Background(), "POST", url, strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("ошибка создания запроса: %w", err)
	}

    req.Header.Set("apikey", s.Key)
    req.Header.Set("Authorization", "Bearer "+s.Key)
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Content-Profile", "public")
    req.Header.Set("Accept-Profile", "public")
    req.Header.Set("Prefer", "resolution=ignore-duplicates,return=minimal")

	resp, err := s.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("ошибка выполнения запроса: %w", err)
	}
	defer resp.Body.Close()

	// Читаем ответ на случай ошибки
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 201 && resp.StatusCode != 200 {
		return fmt.Errorf("ошибка от Supabase (%d): %s", resp.StatusCode, string(respBody))
	}

    return nil
}

func (s *SupabaseClient) Preflight() error {
    url := fmt.Sprintf("%s/rest/v1/", s.URL)
    req, err := http.NewRequestWithContext(context.Background(), "HEAD", url, nil)
    if err != nil {
        return fmt.Errorf("ошибка создания preflight-запроса: %w", err)
    }
    req.Header.Set("apikey", s.Key)
    req.Header.Set("Authorization", "Bearer "+s.Key)
    resp, err := s.HTTP.Do(req)
    if err != nil {
        return fmt.Errorf("ошибка preflight-запроса: %w", err)
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 500 {
        return fmt.Errorf("preflight ошибка от сервера (%d)", resp.StatusCode)
    }
    return nil
}

func (s *SupabaseClient) InsertAgentsBatched(all []Agent, batchSize int) error {
    if batchSize <= 0 {
        batchSize = 500
    }
    for i := 0; i < len(all); i += batchSize {
        end := i + batchSize
        if end > len(all) {
            end = len(all)
        }
        batch := all[i:end]
        if err := s.insertWithRetry(batch, 5); err != nil {
            return fmt.Errorf("ошибка вставки батча %d-%d: %w", i, end-1, err)
        }
    }
    return nil
}

func (s *SupabaseClient) insertWithRetry(batch []Agent, maxRetries int) error {
    var lastErr error
    backoff := 500 * time.Millisecond
    for attempt := 0; attempt <= maxRetries; attempt++ {
        err := s.InsertAgents(batch)
        if err == nil {
            return nil
        }
        lastErr = err
        if attempt == maxRetries {
            break
        }
        time.Sleep(backoff)
        if backoff < 8*time.Second {
            backoff *= 2
        }
    }
    return lastErr
}

// --- Вспомогательные функции ---

func loadEnv() {
	if err := godotenv.Load(); err != nil {
		log.Fatal("❌ Не удалось загрузить .env файл")
	}
}

func getEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatal("❌ Отсутствует переменная окружения: " + key)
	}
	return value
}

// safeInt parses string to int, trimming spaces and BOM
func safeInt(s string) (int, error) {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\ufeff") // Удаляем BOM, если есть
	return strconv.Atoi(s)
}

// --- Основной код ---

func main() {
    client := NewSupabaseClient()

    if err := client.Preflight(); err != nil {
        log.Fatal("❌ Preflight не пройден:", err)
    }

	file, err := os.Open("chess960original.csv")
	if err != nil {
		log.Fatal("❌ Не удалось открыть CSV:", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		log.Fatal("❌ Ошибка чтения CSV:", err)
	}

	fmt.Printf("📦 Обработка %d строк из CSV...\n", len(records))

	var agents []Agent
	successCount := 0

	for _, record := range records {
		if len(record) < 3 {
			log.Printf("⚠️ Пропущена строка (меньше 3 колонок): %v", record)
			continue
		}

		// Парсим sp_id с защитой от BOM и пробелов
		spID, err := safeInt(record[0])
		if err != nil {
			log.Printf("⚠️ Ошибка парсинга sp_id '%s': %v", record[0], err)
			continue
		}

		whiteFEN := strings.TrimSpace(record[1])
		blackFEN := strings.TrimSpace(record[2])

		// Агент за белых
		agents = append(agents, Agent{
			ID:      int64(spID + 1000),
			SPID:    spID,
			MiniFEN: whiteFEN,
			Color:   "w",
		})

		// Агент за чёрных
		agents = append(agents, Agent{
			ID:      int64(spID + 2000),
			SPID:    spID,
			MiniFEN: blackFEN,
			Color:   "b",
		})

		successCount++
	}

    fmt.Printf("✅ Сформировано %d агентов (%d позиций). Отправка батчами...\n", len(agents), successCount)

    err = client.InsertAgentsBatched(agents, 500)
    if err != nil {
        log.Fatal("❌ Ошибка при вставке в Supabase:", err)
    }

	fmt.Println("🎉 Успешно: все агенты загружены в таблицу `agents`!")
	fmt.Println("💡 Теперь ты можешь использовать id=1000..1959 (белые) и id=2000..2959 (чёрные)")
}
