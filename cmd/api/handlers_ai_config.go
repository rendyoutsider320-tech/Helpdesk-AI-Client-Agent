package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/helpdesk-ai/core/internal/ai"
	"github.com/helpdesk-ai/core/internal/db"
)

// handleGetAIConfig returns current active AI configuration
func handleGetAIConfig(c *gin.Context) {
	config := ai.GetAIConfig()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"config":  config,
	})
}

// handleUpdateAIConfig updates AI configuration in DB and hot-reloads memory
func handleUpdateAIConfig(c *gin.Context) {
	role, exists := c.Get("user_role")
	if !exists || role == "" {
		role, _ = c.Get("role")
	}
	roleStr, _ := role.(string)

	// Restrict modifications to Admin or Technician
	if roleStr != "" && roleStr != "admin" && roleStr != "technician" {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Akses ditolak. Hanya Admin atau Teknisi yang diizinkan mengubah konfigurasi model AI.",
		})
		return
	}

	var req ai.AIConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload tidak valid: " + err.Error()})
		return
	}

	updatedConfig, err := ai.UpdateAIConfig(db.DB, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menguji atau menyalakan hot-reload: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Berhasil! Model AI diperbarui ke '%s' tanpa restart server (Hot-Reload).", updatedConfig.LLMModel),
		"config":  updatedConfig,
	})
}

type ollamaTagsResponse struct {
	Models []struct {
		Name       string    `json:"name"`
		Model      string    `json:"model"`
		ModifiedAt time.Time `json:"modified_at"`
		Size       int64     `json:"size"`
	} `json:"models"`
}

// handleGetAIModels fetches available models dynamically from Ollama /api/tags & Cloud options
func handleGetAIModels(c *gin.Context) {
	currentConfig := ai.GetAIConfig()
	ollamaURL := currentConfig.OllamaURL
	if ollamaURL == "" {
		ollamaURL = "http://ollama:11434"
	}
	if !strings.HasPrefix(ollamaURL, "http://") && !strings.HasPrefix(ollamaURL, "https://") {
		ollamaURL = "http://" + ollamaURL
	}

	var installedOllamaModels []string
	defaultLocalModels := []string{"qwen3:8b-q4_K_M", "bge-m3", "qwen2.5", "llama3", "mistral", "deepseek-r1"}

	client := &http.Client{Timeout: 5 * time.Second}
	reqURL := strings.TrimRight(ollamaURL, "/") + "/api/tags"

	resp, err := client.Get(reqURL)
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var tagsResp ollamaTagsResponse
		if err := json.NewDecoder(resp.Body).Decode(&tagsResp); err == nil {
			for _, m := range tagsResp.Models {
				installedOllamaModels = append(installedOllamaModels, m.Name)
			}
		}
	}

	// If Ollama is offline or returns no models, fallback to default model list
	if len(installedOllamaModels) == 0 {
		installedOllamaModels = defaultLocalModels
	}

	cloudModels := []string{
		"gemini-3.6-flash",
		"gemini-3.5-flash",
		"gemini-3.1-pro",
		"gemini-2.0-flash",
		"gemini-1.5-flash",
		"gemini-1.5-pro",
		"gpt-4o",
		"gpt-4o-mini",
		"claude-3-5-sonnet",
		"deepseek-chat",
	}

	embeddingModels := []string{
		"bge-m3",
		"nomic-embed-text",
		"text-embedding-3-small",
	}

	c.JSON(http.StatusOK, gin.H{
		"success":                 true,
		"installed_ollama_models": installedOllamaModels,
		"cloud_models":            cloudModels,
		"embedding_models":        embeddingModels,
		"current_config":          currentConfig,
	})
}

// handleTestAIModel runs a lightweight prompt against a selected model to verify connection
func handleTestAIModel(c *gin.Context) {
	var req struct {
		Model  string `json:"model" binding:"required"`
		Prompt string `json:"prompt"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Prompt == "" {
		req.Prompt = "Tes koneksi sistem Helpdesk AI. Jawab secara singkat dalam 1 kalimat bahwa kamu aktif."
	}

	cfg := ai.GetAIConfig()

	// Handle Google Gemini models
	if strings.HasPrefix(strings.ToLower(req.Model), "gemini") {
		geminiKey := cfg.GeminiAPIKey
		if geminiKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Model Gemini dipilih, tetapi Gemini API Key belum diisi pada form di atas.",
			})
			return
		}

		// Create artificial context
		resText, err := ai.QueryGeminiTest(c.Request.Context(), geminiKey, req.Prompt, req.Model)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"model":    req.Model,
			"response": resText,
		})
		return
	}

	ollamaURL := cfg.OllamaURL
	if ollamaURL == "" {
		ollamaURL = "http://ollama:11434"
	}
	if !strings.HasPrefix(ollamaURL, "http://") && !strings.HasPrefix(ollamaURL, "https://") {
		ollamaURL = "http://" + ollamaURL
	}

	reqPayload := map[string]interface{}{
		"model":  req.Model,
		"prompt": req.Prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.2,
			"num_predict": 2048,
		},
	}

	jsonBytes, _ := json.Marshal(reqPayload)
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Post(strings.TrimRight(ollamaURL, "/")+"/api/generate", "application/json", bytes.NewBuffer(jsonBytes))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Gagal menghubungi server Ollama (%s): %v", ollamaURL, err),
		})
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		if strings.Contains(string(bodyBytes), "not found") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   fmt.Sprintf("Model '%s' belum di-pull/di-download di server Ollama. Silakan pilih model yang sudah terpasang (seperti qwen3:8b-q4_K_M atau qwen2.5:1.5b) atau jalankan 'ollama pull %s' di server Anda.", req.Model, req.Model),
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   fmt.Sprintf("Ollama mengembalikan respon HTTP %d: %s", resp.StatusCode, string(bodyBytes)),
		})
		return
	}

	var result struct {
		Response string `json:"response"`
	}
	_ = json.Unmarshal(bodyBytes, &result)

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"model":    req.Model,
		"response": result.Response,
	})
}
