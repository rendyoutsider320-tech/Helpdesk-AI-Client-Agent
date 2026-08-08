package embeddings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/helpdesk-ai/core/internal/db"
)

type QdrantConfig struct {
	URL            string
	APIKey         string
	Collection     string
	Distance       string
	VectorSize     int
	EmbeddingModel string
}

type openAIEmbeddingRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type openAIEmbeddingResponseData struct {
	Embedding []float64 `json:"embedding"`
}

type openAIEmbeddingResponse struct {
	Data []openAIEmbeddingResponseData `json:"data"`
}

type qdrantVectorConfig struct {
	Size     int    `json:"size"`
	Distance string `json:"distance"`
}

type qdrantCollectionRequest struct {
	Vectors interface{} `json:"vectors"`
}

type qdrantPoint struct {
	ID      string                 `json:"id"`
	Vector  []float64              `json:"vector"`
	Payload map[string]interface{} `json:"payload,omitempty"`
}

type qdrantSearchRequest struct {
	Vector      []float64 `json:"vector"`
	Top         int       `json:"top"`
	WithPayload bool      `json:"with_payload"`
	WithVector  bool      `json:"with_vector"`
}

type qdrantSearchResult struct {
	ID      string                 `json:"id"`
	Score   float64                `json:"score"`
	Payload map[string]interface{} `json:"payload"`
}

type qdrantSearchResponse struct {
	Result []qdrantSearchResult `json:"result"`
}

func GetQdrantConfig() (*QdrantConfig, error) {
	url := strings.TrimSpace(os.Getenv("QDRANT_URL"))
	if url == "" {
		return nil, errors.New("QDRANT_URL is not configured")
	}

	model := getEmbeddingModel()
	if model == "" {
		if getEmbeddingProvider() == "ollama" {
			model = "bge-m3"
		} else {
			model = "text-embedding-3-small"
		}
	}

	vectorSize := embeddingVectorSize(model)
	if vectorSize == 0 {
		vectorSize = 1536
	}

	collection := strings.TrimSpace(os.Getenv("QDRANT_COLLECTION"))
	if collection == "" {
		collection = "helpdesk-ai"
	}

	return &QdrantConfig{
		URL:            strings.TrimRight(url, "/"),
		APIKey:         strings.TrimSpace(os.Getenv("QDRANT_API_KEY")),
		Collection:     collection,
		Distance:       "Cosine",
		VectorSize:     vectorSize,
		EmbeddingModel: model,
	}, nil
}

func embeddingVectorSize(model string) int {
	switch model {
	case "text-embedding-3-large":
		return 3072
	case "text-embedding-3-small", "text-embedding-ada-002":
		return 1536
	case "bge-m3":
		return 1024
	case "bge-small":
		return 384
	default:
		return 1024
	}
}

func getEmbeddingModel() string {
	model := strings.TrimSpace(os.Getenv("EMBEDDING_MODEL"))
	if model != "" {
		return model
	}

	return strings.TrimSpace(os.Getenv("OPENAI_EMBEDDINGS_MODEL"))
}

func getEmbeddingProvider() string {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("EMBEDDING_PROVIDER")))
	if provider != "" {
		return provider
	}

	if strings.TrimSpace(os.Getenv("OLLAMA_URL")) != "" {
		return "ollama"
	}

	if strings.TrimSpace(os.Getenv("OPENAI_API_KEY")) != "" {
		return "openai"
	}

	return ""
}

func GenerateEmbedding(ctx context.Context, input string) ([]float64, error) {
	provider := getEmbeddingProvider()
	if provider == "ollama" {
		ollamaURL := strings.TrimSpace(os.Getenv("OLLAMA_URL"))
		if ollamaURL == "" {
			return nil, errors.New("OLLAMA_URL is not configured for Ollama embeddings")
		}

		model := getEmbeddingModel()
		if model == "" {
			model = "bge-m3"
		}

		apiKey := strings.TrimSpace(os.Getenv("OLLAMA_API_KEY"))
		return queryOllamaEmbedding(ctx, ollamaURL, apiKey, input, model)
	}

	if provider == "openai" {
		apiKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
		if apiKey == "" {
			return nil, errors.New("OPENAI_API_KEY is not configured for OpenAI embeddings")
		}

		model := getEmbeddingModel()
		if model == "" {
			model = "text-embedding-3-small"
		}

		return queryOpenAIEmbedding(ctx, apiKey, input, model)
	}

	return nil, errors.New("no embedding provider configured; set EMBEDDING_PROVIDER, OPENAI_API_KEY, or OLLAMA_URL")
}

func queryOpenAIEmbedding(ctx context.Context, apiKey, input, model string) ([]float64, error) {
	baseURL := strings.TrimSpace(os.Getenv("OPENAI_API_BASE"))
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	reqBody := openAIEmbeddingRequest{
		Model: model,
		Input: []string{input},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/embeddings", strings.TrimRight(baseURL, "/")), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenAI embedding error: %s", string(body))
	}

	var output openAIEmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		return nil, err
	}

	if len(output.Data) == 0 {
		return nil, errors.New("OpenAI returned no embedding data")
	}

	return output.Data[0].Embedding, nil
}

func EnsureQdrantCollection(ctx context.Context) error {
	cfg, err := GetQdrantConfig()
	if err != nil {
		return nil
	}

	client := &http.Client{Timeout: 10 * time.Second}
	url := fmt.Sprintf("%s/collections/%s", cfg.URL, cfg.Collection)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	if cfg.APIKey != "" {
		req.Header.Set("X-API-Key", cfg.APIKey)
	}

	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return nil
		}
	}

	return createQdrantCollection(ctx, cfg)
}

func createQdrantCollection(ctx context.Context, cfg *QdrantConfig) error {
	client := &http.Client{Timeout: 10 * time.Second}
	url := fmt.Sprintf("%s/collections/%s", cfg.URL, cfg.Collection)

	payload, err := json.Marshal(qdrantCollectionRequest{
		Vectors: qdrantVectorConfig{
			Size:     cfg.VectorSize,
			Distance: cfg.Distance,
		},
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	if cfg.APIKey != "" {
		req.Header.Set("X-API-Key", cfg.APIKey)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to create qdrant collection: %s", string(body))
	}

	return nil
}

func UpsertQdrantEmbeddings(ctx context.Context, points []qdrantPoint) error {
	cfg, err := GetQdrantConfig()
	if err != nil {
		return err
	}

	payload, err := json.Marshal(map[string]interface{}{
		"points": points,
	})
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/collections/%s/points?wait=true", cfg.URL, cfg.Collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	if cfg.APIKey != "" {
		req.Header.Set("X-API-Key", cfg.APIKey)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant upsert error: %s", string(body))
	}

	return nil
}

func SearchQdrant(ctx context.Context, query string, topK int) ([]map[string]interface{}, error) {
	cfg, err := GetQdrantConfig()
	if err != nil {
		return nil, err
	}

	vector, err := GenerateEmbedding(ctx, query)
	if err != nil {
		return nil, err
	}

	reqBody := qdrantSearchRequest{
		Vector:      vector,
		Top:         topK,
		WithPayload: true,
		WithVector:  false,
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/collections/%s/points/search", cfg.URL, cfg.Collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	if cfg.APIKey != "" {
		req.Header.Set("X-API-Key", cfg.APIKey)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant search error: %s", string(body))
	}

	var output qdrantSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		return nil, err
	}

	results := make([]map[string]interface{}, 0, len(output.Result))
	for _, item := range output.Result {
		// Only include vector search results that satisfy a minimum relevance score
		if item.Score >= 0.55 {
			results = append(results, map[string]interface{}{
				"id":      item.ID,
				"score":   item.Score,
				"payload": item.Payload,
			})
		}
	}

	return results, nil
}

func SyncKBToQdrant(ctx context.Context) error {
	if _, err := GetQdrantConfig(); err != nil {
		return err
	}

	if err := EnsureQdrantCollection(ctx); err != nil {
		return err
	}

	var articles []db.KBArticle
	if err := db.DB.Find(&articles).Error; err != nil {
		return err
	}

	batchSize := 50
	for i := 0; i < len(articles); i += batchSize {
		end := i + batchSize
		if end > len(articles) {
			end = len(articles)
		}

		points := make([]qdrantPoint, 0, end-i)
		for _, article := range articles[i:end] {
			embedding, err := GenerateEmbedding(ctx, fmt.Sprintf("%s %s", article.Title, article.Content))
			if err != nil {
				return err
			}

			points = append(points, qdrantPoint{
				ID:     article.ID,
				Vector: embedding,
				Payload: map[string]interface{}{
					"title":         article.Title,
					"category":      article.Category,
					"content":       article.Content,
					"document_type": "kb_article",
				},
			})
		}

		if err := UpsertQdrantEmbeddings(ctx, points); err != nil {
			return err
		}
	}

	return nil
}
