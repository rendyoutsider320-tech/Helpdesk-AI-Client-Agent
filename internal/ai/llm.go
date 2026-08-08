package ai

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
)

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIRequest struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens"`
}

type openAIResponseChoice struct {
	Message openAIChatMessage `json:"message"`
}

type openAIResponse struct {
	Choices []openAIResponseChoice `json:"choices"`
}

type ollamaOptions struct {
	Temperature float64 `json:"temperature"`
	NumPredict  int     `json:"num_predict"`
}

type ollamaRequest struct {
	Model   string        `json:"model"`
	Prompt  string        `json:"prompt"`
	Stream  bool          `json:"stream"`
	Options ollamaOptions `json:"options"`
}

func (a *Agent) queryLLM(ctx context.Context, prompt string) (string, error) {
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		return queryOpenAI(ctx, key, prompt, a.model)
	}

	if baseURL := os.Getenv("OLLAMA_URL"); baseURL != "" {
		return queryOllama(ctx, baseURL, prompt, a.model)
	}

	return "", errors.New("no LLM provider configured; set OPENAI_API_KEY or OLLAMA_URL")
}

func queryOpenAI(ctx context.Context, apiKey, prompt, model string) (string, error) {
	if model == "" {
		model = "gpt-4"
	}

	baseURL := os.Getenv("OPENAI_API_BASE")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	reqBody := openAIRequest{
		Model: model,
		Messages: []openAIChatMessage{
			{Role: "system", Content: "You are a helpful AI assistant for IT helpdesk ticket analysis. Please always respond in Indonesian (Bahasa Indonesia)."},
			{Role: "user", Content: prompt},
		},
		Temperature: 0.2,
		MaxTokens:   512,
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/chat/completions", strings.TrimRight(baseURL, "/")), bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", apiKey))

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OpenAI API error: %s", string(body))
	}

	var output openAIResponse
	if err := json.Unmarshal(body, &output); err != nil {
		return "", err
	}

	if len(output.Choices) == 0 {
		return "", errors.New("OpenAI returned no choices")
	}

	return output.Choices[0].Message.Content, nil
}

func queryOllama(ctx context.Context, baseURL, prompt, model string) (string, error) {
	if model == "" {
		model = os.Getenv("LLM_MODEL")
		if model == "" {
			model = "qwen2.5"
		}
	}

	reqBody := ollamaRequest{
		Model:  model,
		Prompt: prompt,
		Stream: false,
		Options: ollamaOptions{
			Temperature: 0.2,
			NumPredict:  512,
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("%s/api/generate", strings.TrimRight(baseURL, "/"))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Ollama API error: %s", string(body))
	}

	// Ollama may return plain text or JSON.
	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err == nil {
		if result, ok := parsed["result"].(map[string]interface{}); ok {
			if text, ok := result["content"].(string); ok {
				return text, nil
			}
		}
		if text, ok := parsed["content"].(string); ok {
			return text, nil
		}
		if text, ok := parsed["response"].(string); ok {
			return text, nil
		}
	}

	return string(body), nil
}
