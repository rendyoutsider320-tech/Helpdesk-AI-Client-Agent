package ai

import (
	"log"
	"os"
	"strings"
	"sync"

	"github.com/helpdesk-ai/core/internal/db"
	"gorm.io/gorm"
)

// AIConfig represents the active AI configuration
type AIConfig struct {
	LLMModel          string `json:"llm_model"`
	EmbeddingModel    string `json:"embedding_model"`
	EmbeddingProvider string `json:"embedding_provider"`
	OllamaURL         string `json:"ollama_url"`
	OpenAIKey         string `json:"openai_api_key"`
	OpenAIBase        string `json:"openai_api_base"`
	GeminiAPIKey      string `json:"gemini_api_key"`
}

var (
	globalConfig AIConfig
	configMutex  sync.RWMutex
	initialized  bool
)

// InitAIConfig initializes AI configuration from Database and fallback to Environment variables
func InitAIConfig(gormDB *gorm.DB) AIConfig {
	configMutex.Lock()
	defer configMutex.Unlock()

	// Helper to resolve env default
	envOrDefault := func(envKey, fallback string) string {
		v := os.Getenv(envKey)
		if v != "" {
			return v
		}
		return fallback
	}

	// 1. Read from Env / Defaults
	defaultOllamaURL := envOrDefault("OLLAMA_URL", "http://ollama:11434")
	if !strings.HasPrefix(defaultOllamaURL, "http://") && !strings.HasPrefix(defaultOllamaURL, "https://") {
		defaultOllamaURL = "http://" + defaultOllamaURL
	}

	defaultLLMModel := envOrDefault("LLM_MODEL", "qwen3:8b-q4_K_M")
	defaultEmbeddingModel := envOrDefault("EMBEDDING_MODEL", "bge-m3")
	defaultEmbeddingProvider := envOrDefault("EMBEDDING_PROVIDER", "ollama")
	defaultOpenAIKey := os.Getenv("OPENAI_API_KEY")
	defaultOpenAIBase := envOrDefault("OPENAI_API_BASE", "https://api.openai.com/v1")
	defaultGeminiAPIKey := os.Getenv("GEMINI_API_KEY")

	// 2. Read DB overrides if DB available
	llmModel := db.GetConfigValue(gormDB, "ai_llm_model", defaultLLMModel)
	embeddingModel := db.GetConfigValue(gormDB, "ai_embedding_model", defaultEmbeddingModel)
	embeddingProvider := db.GetConfigValue(gormDB, "ai_embedding_provider", defaultEmbeddingProvider)
	ollamaURL := db.GetConfigValue(gormDB, "ai_ollama_url", defaultOllamaURL)
	openAIKey := db.GetConfigValue(gormDB, "ai_openai_api_key", defaultOpenAIKey)
	openAIBase := db.GetConfigValue(gormDB, "ai_openai_api_base", defaultOpenAIBase)
	geminiAPIKey := db.GetConfigValue(gormDB, "ai_gemini_api_key", defaultGeminiAPIKey)

	// Ensure DB contains these defaults for persistence if first time
	if gormDB != nil {
		_ = db.SetConfigValue(gormDB, "ai_llm_model", llmModel)
		_ = db.SetConfigValue(gormDB, "ai_embedding_model", embeddingModel)
		_ = db.SetConfigValue(gormDB, "ai_embedding_provider", embeddingProvider)
		_ = db.SetConfigValue(gormDB, "ai_ollama_url", ollamaURL)
		if openAIKey != "" {
			_ = db.SetConfigValue(gormDB, "ai_openai_api_key", openAIKey)
		}
		_ = db.SetConfigValue(gormDB, "ai_openai_api_base", openAIBase)
		if geminiAPIKey != "" {
			_ = db.SetConfigValue(gormDB, "ai_gemini_api_key", geminiAPIKey)
		}
	}

	globalConfig = AIConfig{
		LLMModel:          llmModel,
		EmbeddingModel:    embeddingModel,
		EmbeddingProvider: embeddingProvider,
		OllamaURL:         ollamaURL,
		OpenAIKey:         openAIKey,
		OpenAIBase:        openAIBase,
		GeminiAPIKey:      geminiAPIKey,
	}

	initialized = true
	log.Printf("[AIConfigManager] Initialized: LLM=%s, Embedding=%s, OllamaURL=%s",
		globalConfig.LLMModel, globalConfig.EmbeddingModel, globalConfig.OllamaURL)

	return globalConfig
}

// GetAIConfig returns a copy of active AI configuration
func GetAIConfig() AIConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()

	if !initialized {
		configMutex.RUnlock()
		InitAIConfig(db.DB)
		configMutex.RLock()
	}
	return globalConfig
}

// GetActiveLLMModel returns current LLM model
func GetActiveLLMModel() string {
	cfg := GetAIConfig()
	if cfg.LLMModel != "" {
		return cfg.LLMModel
	}
	return "qwen3:8b-q4_K_M"
}

// GetActiveEmbeddingModel returns current embedding model
func GetActiveEmbeddingModel() string {
	cfg := GetAIConfig()
	if cfg.EmbeddingModel != "" {
		return cfg.EmbeddingModel
	}
	return "bge-m3"
}

// GetActiveOllamaURL returns current Ollama URL
func GetActiveOllamaURL() string {
	cfg := GetAIConfig()
	if cfg.OllamaURL != "" {
		return cfg.OllamaURL
	}
	return "http://ollama:11434"
}

// UpdateAIConfig updates AI settings in DB and hot-reloads in memory
func UpdateAIConfig(gormDB *gorm.DB, newConfig AIConfig) (AIConfig, error) {
	configMutex.Lock()
	defer configMutex.Unlock()

	if gormDB == nil {
		gormDB = db.DB
	}

	if newConfig.LLMModel != "" {
		_ = db.SetConfigValue(gormDB, "ai_llm_model", newConfig.LLMModel)
		globalConfig.LLMModel = newConfig.LLMModel
	}
	if newConfig.EmbeddingModel != "" {
		_ = db.SetConfigValue(gormDB, "ai_embedding_model", newConfig.EmbeddingModel)
		globalConfig.EmbeddingModel = newConfig.EmbeddingModel
	}
	if newConfig.EmbeddingProvider != "" {
		_ = db.SetConfigValue(gormDB, "ai_embedding_provider", newConfig.EmbeddingProvider)
		globalConfig.EmbeddingProvider = newConfig.EmbeddingProvider
	}
	if newConfig.OllamaURL != "" {
		_ = db.SetConfigValue(gormDB, "ai_ollama_url", newConfig.OllamaURL)
		globalConfig.OllamaURL = newConfig.OllamaURL
	}
	if newConfig.OpenAIKey != "" {
		_ = db.SetConfigValue(gormDB, "ai_openai_api_key", newConfig.OpenAIKey)
		globalConfig.OpenAIKey = newConfig.OpenAIKey
	}
	if newConfig.OpenAIBase != "" {
		_ = db.SetConfigValue(gormDB, "ai_openai_api_base", newConfig.OpenAIBase)
		globalConfig.OpenAIBase = newConfig.OpenAIBase
	}
	if newConfig.GeminiAPIKey != "" {
		_ = db.SetConfigValue(gormDB, "ai_gemini_api_key", newConfig.GeminiAPIKey)
		globalConfig.GeminiAPIKey = newConfig.GeminiAPIKey
	}

	log.Printf("[AIConfigManager] HOT-RELOAD SUCCESS: LLM model changed to -> %s", globalConfig.LLMModel)
	return globalConfig, nil
}
