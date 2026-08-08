package embeddings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type ollamaEmbeddingRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type ollamaEmbeddingResponseData struct {
	Embedding []float64 `json:"embedding"`
}

type ollamaEmbeddingResponse struct {
	Data []ollamaEmbeddingResponseData `json:"data"`
}

func queryOllamaEmbedding(ctx context.Context, baseURL, apiKey, input, model string) ([]float64, error) {
	if model == "" {
		model = "bge-m3"
	}

	reqBody := ollamaEmbeddingRequest{
		Model: model,
		Input: []string{input},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/v1/embeddings", strings.TrimRight(baseURL, "/"))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))
	}

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama embedding error: %s", string(body))
	}

	var output ollamaEmbeddingResponse
	if err := json.Unmarshal(body, &output); err != nil {
		return nil, err
	}

	if len(output.Data) == 0 {
		return nil, errors.New("Ollama returned no embedding data")
	}

	return output.Data[0].Embedding, nil
}
