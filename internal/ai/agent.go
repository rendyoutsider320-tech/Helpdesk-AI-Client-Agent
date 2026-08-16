package ai

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/ticket"
	"github.com/helpdesk-ai/core/internal/tools"
)

type Agent struct {
	name         string
	toolRegistry *tools.Registry
	model        string // LLM model name
}

// AgentMessage represents a message in agent conversation
type AgentMessage struct {
	Role     string // "user", "assistant", "tool"
	Content  string
	ToolName string `json:",omitempty"`
}

// AgentRequest represents a troubleshooting request
type AgentRequest struct {
	TicketID    string
	Description string
	Context     map[string]interface{}
}

// AgentResponse represents agent response
type AgentResponse struct {
	RootCause   string                 `json:"root_cause"`
	Severity    string                 `json:"severity,omitempty"`
	KBMatches   interface{}            `json:"kb_matches,omitempty"`
	AIReport    string                 `json:"ai_report,omitempty"`
	Suggestions []string               `json:"suggestions"`
	Confidence  float64                `json:"confidence"`
	ToolsUsed   []string               `json:"tools_used"`
	ToolOutputs map[string]interface{} `json:"tool_outputs,omitempty"`
	AnalysisLog []AgentMessage         `json:"analysis_log"`
}

// NewAgent creates a new AI agent
func NewAgent(name string, toolRegistry *tools.Registry, model string) *Agent {
	return &Agent{
		name:         name,
		toolRegistry: toolRegistry,
		model:        model,
	}
}

// Analyze analyzes an incident using available tools
func (a *Agent) Analyze(ctx context.Context, request AgentRequest) (*AgentResponse, error) {
	response := &AgentResponse{
		AnalysisLog: []AgentMessage{},
		ToolsUsed:   []string{},
		ToolOutputs: map[string]interface{}{},
	}

	// Add initial message to local memory (passed if using stateful memory, but local here)
	var memory []AgentMessage
	memory = append(memory, AgentMessage{
		Role:    "user",
		Content: fmt.Sprintf("Please analyze this issue: %s", request.Description),
	})

	response.AnalysisLog = append(response.AnalysisLog, AgentMessage{
		Role:    "user",
		Content: request.Description,
	})

	selectedTools := a.selectTools(request.Description, request.Context)
	for _, toolName := range selectedTools {
		log.Printf("Executing diagnostic tool: %s", toolName)
		tool := a.toolRegistry.GetTool(toolName)
		if tool == nil {
			continue
		}

		result, err := tool.Execute(ctx, a.toolInputFor(toolName, request))
		if err != nil {
			log.Printf("Tool %s failed: %v", toolName, err)
			continue
		}

		response.ToolsUsed = append(response.ToolsUsed, toolName)
		response.ToolOutputs[toolName] = result
		response.AnalysisLog = append(response.AnalysisLog, AgentMessage{
			Role:     "tool",
			ToolName: toolName,
			Content:  fmt.Sprintf("%v", result),
		})

		if toolName == "severity_classifier" {
			if data, ok := result.(map[string]interface{}); ok {
				if severity, ok := data["severity"].(string); ok {
					response.Severity = severity
				}
			}
		}

		if toolName == "kb_search" || toolName == "rag_search" {
			response.KBMatches = result
		}

		if toolName == "rca_analyzer" {
			if data, ok := result.(map[string]interface{}); ok {
				if rootCause, ok := data["root_cause"].(string); ok {
					response.RootCause = rootCause
				}
				if confidence, ok := data["confidence"].(float64); ok {
					response.Confidence = confidence
				}
			}
		}
	}

	if response.RootCause == "" {
		response.RootCause = "Unable to determine exact root cause. Please investigate the issue manually."
	}

	if len(response.Suggestions) == 0 {
		response.Suggestions = []string{}
	}

	// Use LLM to synthesize the final report if configured
	articles := getMatchedKBArticles(response.KBMatches)
	if len(articles) == 0 {
		outOfScopeMsg := "Dugaan Penyebab: Di luar scope Knowledge Base\n\nMaaf, kendala atau pertanyaan ini di luar scope database Knowledge Base kami."
		response.AIReport = outOfScopeMsg
		response.RootCause = "Di luar scope Knowledge Base"
		response.ToolOutputs["llm_synthesis"] = outOfScopeMsg
		if response.Confidence < 0.9 {
			response.Confidence = 0.9
		}
	} else {
		llmCtx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		defer cancel()

		if llmOutput, err := a.queryLLM(llmCtx, a.buildLLMPrompt(request, response, articles)); err == nil {
			llmOutput = cleanLLMOutput(llmOutput)
			response.AIReport = llmOutput
			response.ToolOutputs["llm_synthesis"] = llmOutput
			if response.Confidence < 0.9 {
				response.Confidence = 0.9
			}

			// Enterprise Addition: RCA & Confidence
			response.RootCause = extractRootCause(llmOutput)
			if response.RootCause != "" && !strings.HasPrefix(response.RootCause, "Akar Masalah") {
				response.Suggestions = append(response.Suggestions, "AI RCA: "+response.RootCause)
			}

		} else {
			log.Printf("LLM synthesis skipped: %v", err)
			var kbTitles []string
			for _, artStr := range articles {
				kbTitles = append(kbTitles, "- "+artStr)
			}
			kbSection := strings.Join(kbTitles, "\n")
			response.AIReport = fmt.Sprintf("### Laporan Analisis Diagnostik (Fallback)\n\n**Penyebab Masalah (Root Cause):** %s\n**Tingkat Keparahan (Severity):** %s\n\n**Rekomendasi Artikel KB:**\n%s\n\n*Catatan: Sintesis Laporan AI Utama dilewati karena batas waktu server.*", response.RootCause, response.Severity, kbSection)
		}
	}

	// Enterprise Addition: Check for automated action candidates (only if KB article matched)
	if request.TicketID != "" && len(articles) > 0 {
		lowerDesc := strings.ToLower(request.Description)
		if strings.Contains(lowerDesc, "spooler") {
			log.Printf("Detected automated fix candidate: Restart Spooler")
			ticket.ProposeAction(request.TicketID, "restart_service", "localhost", "Restart-Service -Name Spooler")
			response.Suggestions = append(response.Suggestions, "AUTO_FIX: Proposing Spooler Restart (Risk: Low)")
		} else if strings.Contains(lowerDesc, "dns") || strings.Contains(lowerDesc, "flush") {
			log.Printf("Detected automated fix candidate: Flush DNS Cache")
			ticket.ProposeAction(request.TicketID, "flush_dns", "localhost", "ipconfig /flushdns")
			response.Suggestions = append(response.Suggestions, "AUTO_FIX: Proposing DNS Cache Flush (Risk: Low)")
		} else if strings.Contains(lowerDesc, "ping") {
			targetHost := "8.8.8.8"
			words := strings.Fields(lowerDesc)
			for _, w := range words {
				if strings.Contains(w, ".") {
					targetHost = w
					break
				}
			}
			log.Printf("Detected automated fix candidate: Ping check to %s", targetHost)
			ticket.ProposeAction(request.TicketID, "ping_check", "localhost", "ping "+targetHost)
			response.Suggestions = append(response.Suggestions, "AUTO_FIX: Proposing Ping Check to "+targetHost+" (Risk: Low)")
		} else if strings.Contains(lowerDesc, "cpu") || strings.Contains(lowerDesc, "ram") || strings.Contains(lowerDesc, "lambat") || strings.Contains(lowerDesc, "memory") {
			log.Printf("Detected automated fix candidate: Clean RAM & CPU process optimization")
			ticket.ProposeAction(request.TicketID, "optimize_resources", "localhost", "sync; echo 3 > /proc/sys/vm/drop_caches")
			response.Suggestions = append(response.Suggestions, "AUTO_FIX: Rekomendasi Pembersihan RAM & Optimasi CPU Process (Risk: Low)")
		}
	}

	// Store analysis in database
	if request.TicketID != "" {
		if err := a.storeAnalysis(request.TicketID, response); err != nil {
			log.Printf("failed to store analysis: %v", err)
		}
	}

	return response, nil
}

func parseKBResultItem(item interface{}) (title, category, snippet string) {
	switch v := item.(type) {
	case db.KBArticle:
		return v.Title, v.Category, v.Content
	case map[string]interface{}:
		payload, _ := v["payload"].(map[string]interface{})
		title, _ = v["title"].(string)
		if title == "" && payload != nil {
			title, _ = payload["title"].(string)
		}

		category, _ = v["category"].(string)
		if category == "" && payload != nil {
			category, _ = payload["category"].(string)
		}

		snippet, _ = v["snippet"].(string)
		if snippet == "" {
			snippet, _ = v["content"].(string)
		}
		if snippet == "" && payload != nil {
			snippet, _ = payload["content"].(string)
		}
		return title, category, snippet
	}
	return "", "", ""
}

func getMatchedKBArticles(kbMatches interface{}) []string {
	var articles []string
	if kbMatches != nil {
		if m, ok := kbMatches.(map[string]interface{}); ok {
			if res, ok := m["results"]; ok {
				var items []interface{}
				switch val := res.(type) {
				case []db.KBArticle:
					for _, art := range val {
						items = append(items, art)
					}
				case []map[string]interface{}:
					for _, art := range val {
						items = append(items, art)
					}
				case []interface{}:
					items = val
				}

				for _, item := range items {
					if m, ok := item.(map[string]interface{}); ok {
						if score, ok := m["score"].(float64); ok && score < 0.55 {
							continue
						}
					}
					t, c, snippetText := parseKBResultItem(item)
					if t != "" || snippetText != "" {
						if len(snippetText) > 4000 {
							snippetText = snippetText[:4000] + "..."
						}
						articles = append(articles, fmt.Sprintf("Artikel %d: %s (Kategori: %s)\nSolusi/Langkah: %s", len(articles)+1, t, c, snippetText))
					}
				}
			}
		}
	}
	return articles
}

func cleanLLMOutput(output string) string {
	lines := strings.Split(output, "\n")
	var cleaned []string
	skipRuleBlock := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		upper := strings.ToUpper(trimmed)

		if strings.Contains(upper, "ATURAN PERUMUSAN LAPORAN") || strings.Contains(upper, "STRICT RAG KNOWLEDGE BASE POLICY") || strings.Contains(upper, "ATURAN UTAMA") {
			skipRuleBlock = true
			continue
		}

		if skipRuleBlock {
			if (strings.HasPrefix(trimmed, "1.") || strings.HasPrefix(trimmed, "2.") || strings.HasPrefix(trimmed, "3.") || strings.HasPrefix(trimmed, "4.")) && (strings.Contains(upper, "BERIKAN") || strings.Contains(upper, "DILARANG") || strings.Contains(upper, "WAJIB") || strings.Contains(upper, "INSTRUKSI")) {
				continue
			}
			skipRuleBlock = false
		}

		cleaned = append(cleaned, line)
	}

	result := strings.Join(cleaned, "\n")
	return strings.TrimSpace(result)
}

func (a *Agent) buildLLMPrompt(request AgentRequest, response *AgentResponse, articles []string) string {
	kbSummary := strings.Join(articles, "\n---\n")

	return fmt.Sprintf(`Anda adalah Asisten AI Helpdesk IT berbasis RAG Knowledge Base. Susun panduan penanganan berdasarkan artikel Knowledge Base berikut. DILARANG KERAS menyalin teks instruksi ini pada respon final.

Deskripsi Pesan / Kendala Tiket:
%s

Tingkat Keparahan (Severity): %s

Artikel Knowledge Base Terkait (Qdrant Vector DB / DB):
%s

Instruksi: Berikan langkah-langkah penanganan LENGKAP dan DETAIL sesuai artikel Knowledge Base di atas tanpa memotong instruksi. Gunakan BAHASA INDONESIA yang rapi dan profesional.

Format Output yang Harus Dihasilkan:
Dugaan Penyebab: [1 kalimat singkat penyebab kendala berdasarkan KB]

Berikut adalah panduan penanganan lengkap sesuai SOP Knowledge Base:

💡 Langkah Penanganan (Remediation):
1. [Langkah 1 SOP detail dari KB]
2. [Langkah 2 SOP detail dari KB]

-----------------------------------
Bila kendala belum terselesaikan, silakan hubungi Teknisi IT.`, request.Description, response.Severity, kbSummary)
}

func (a *Agent) selectTools(description string, context map[string]interface{}) []string {
	lower := strings.ToLower(description)
	selected := []string{"severity_classifier", "kb_search", "rag_search", "rca_analyzer"}

	if containsAny(lower, "printer", "toner", "paper jam", "print quality", "offline") {
		selected = append(selected, "printer_diagnostics")
	}
	if containsAny(lower, "pos", "cash register", "payment terminal", "transaction", "receipt", "barcode") {
		selected = append(selected, "pos_diagnostics")
	}
	if containsAny(lower, "frontend", "react", "vue", "angular", "javascript", "css", "html", "ui", "browser", "client") {
		selected = append(selected, "frontend_diagnostics")
	}
	if containsAny(lower, "backend", "api", "server error", "database", "502", "503", "500", "exception", "timeout", "service unavailable", "gateway") {
		selected = append(selected, "backend_diagnostics")
	}
	if containsAny(lower, "ping", "dns", "port", "network", "latency", "packet loss", "tcp", "udp", "http") {
		selected = append(selected, "ping", "dns_lookup", "port_scanner")
	}

	for key, value := range context {
		if key == "source" {
			if src, ok := value.(string); ok && strings.Contains(strings.ToLower(src), "chat") {
				selected = append(selected, "rag_search")
			}
		}
	}

	return uniqueStrings(selected)
}

func (a *Agent) toolInputFor(toolName string, request AgentRequest) map[string]interface{} {
	input := map[string]interface{}{
		"issue":         request.Description,
		"description":   request.Description,
		"query":         request.Description,
		"incident_data": request.Description,
	}
	for key, value := range request.Context {
		input[key] = value
	}

	if toolName == "ping" || toolName == "dns_lookup" || toolName == "port_scanner" {
		if host, ok := request.Context["host"].(string); ok && host != "" {
			input["host"] = host
		}
	}

	return input
}

func containsAny(text string, options ...string) bool {
	for _, option := range options {
		if strings.Contains(text, option) {
			return true
		}
	}
	return false
}

func uniqueStrings(items []string) []string {
	seen := make(map[string]struct{})
	var unique []string
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, ok := seen[item]; !ok {
			seen[item] = struct{}{}
			unique = append(unique, item)
		}
	}
	return unique
}

// storeAnalysis stores analysis results in database
func (a *Agent) storeAnalysis(ticketID string, response *AgentResponse) error {
	summary := response.AIReport
	if summary == "" {
		summary = fmt.Sprintf("Analisis otomatis AI selesai menggunakan %d tools dengan tingkat kepercayaan %.1f%%.", len(response.ToolsUsed), response.Confidence)
	}

	rca := response.RootCause
	if rca == "" {
		rca = "Akar masalah di luar scope Knowledge Base atau belum dianalisis."
	}

	var suggestionsFormatted string
	if len(response.Suggestions) > 0 {
		suggestionsFormatted = "- " + strings.Join(response.Suggestions, "\n- ")
	} else if rca == "Di luar scope Knowledge Base" || strings.Contains(summary, "di luar scope") {
		suggestionsFormatted = "Tidak ada rekomendasi resolusi otomatis (di luar scope Knowledge Base)."
	} else {
		suggestionsFormatted = "Tidak ada rekomendasi resolusi otomatis untuk kendala ini."
	}

	updates := map[string]interface{}{
		"ai_summary": summary,
		"root_cause": rca,
		"resolution": suggestionsFormatted,
	}

	return db.DB.Model(&db.Ticket{}).Where("id = ?", ticketID).Updates(updates).Error
}

// GetMemory is deprecated as agents are now stateless
func (a *Agent) GetMemory() []AgentMessage {
	return []AgentMessage{}
}

// ClearMemory is deprecated as agents are now stateless
func (a *Agent) ClearMemory() {
}

// Orchestrator manages multiple agents
type Orchestrator struct {
	agents       map[string]*Agent
	toolRegistry *tools.Registry
	mu           sync.RWMutex
}

// NewOrchestrator creates a new agent orchestrator
func NewOrchestrator(toolRegistry *tools.Registry) *Orchestrator {
	return &Orchestrator{
		agents:       make(map[string]*Agent),
		toolRegistry: toolRegistry,
	}
}

// RegisterAgent registers an agent
func (o *Orchestrator) RegisterAgent(name string, model string) *Agent {
	agent := NewAgent(name, o.toolRegistry, model)
	o.mu.Lock()
	defer o.mu.Unlock()
	o.agents[name] = agent
	return agent
}

// GetAgent gets an agent by name
func (o *Orchestrator) GetAgent(name string) *Agent {
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.agents[name]
}

// AnalyzeIncident analyzes an incident using the most appropriate agent
func (o *Orchestrator) AnalyzeIncident(ctx context.Context, request AgentRequest) (*AgentResponse, error) {
	agentName := selectAgentForRequest(request)
	
	o.mu.RLock()
	agent := o.agents[agentName]
	o.mu.RUnlock()

	if agent != nil {
		log.Printf("Routing incident to specialized agent: %s", agentName)
		return agent.Analyze(ctx, request)
	}

	// Fallback to first available agent
	o.mu.RLock()
	defer o.mu.RUnlock()
	for _, a := range o.agents {
		return a.Analyze(ctx, request)
	}

	return nil, fmt.Errorf("no agents available")
}

func selectAgentForRequest(request AgentRequest) string {
	lower := strings.ToLower(request.Description)

	switch {
	case containsAny(lower, "printer", "toner", "paper jam", "print quality", "offline"):
		return "printer-analyst"
	case containsAny(lower, "pos", "cash register", "payment terminal", "transaction", "receipt", "barcode"):
		return "pos-analyst"
	case containsAny(lower, "frontend", "react", "vue", "angular", "javascript", "css", "html", "ui", "browser", "client"):
		return "frontend-analyst"
	case containsAny(lower, "backend", "api", "server error", "database", "502", "503", "500", "exception", "timeout", "service unavailable", "gateway"):
		return "backend-analyst"
	case containsAny(lower, "ping", "dns", "port", "network", "latency", "packet loss", "tcp", "udp", "http"):
		return "network-analyzer"
	default:
		return "system-analyst"
	}
}

// InitializeAgents initializes AI agents
func InitializeAgents(toolRegistry *tools.Registry) *Orchestrator {
	orchestrator := NewOrchestrator(toolRegistry)

	model := GetActiveLLMModel()

	// Register different specialized agents
	orchestrator.RegisterAgent("printer-analyst", model)
	orchestrator.RegisterAgent("pos-analyst", model)
	orchestrator.RegisterAgent("frontend-analyst", model)
	orchestrator.RegisterAgent("backend-analyst", model)
	orchestrator.RegisterAgent("network-analyzer", model)
	orchestrator.RegisterAgent("system-analyst", model)
	orchestrator.RegisterAgent("database-expert", model)

	log.Printf("AI agents initialized with model: %s", model)
	return orchestrator
}

// Process processes a message and returns a string response
func (o *Orchestrator) Process(ctx context.Context, message string, userID string) (string, error) {
	resp, err := o.AnalyzeIncident(ctx, AgentRequest{
		Description: message,
		Context: map[string]interface{}{
			"user_id": userID,
			"source":  "telegram",
		},
	})
	if err != nil {
		return "", err
	}
	return resp.AIReport, nil
}

func extractRootCause(llmOutput string) string {
	lines := strings.Split(llmOutput, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		lower := strings.ToLower(trimmed)

		if strings.HasPrefix(lower, "dugaan penyebab:") || strings.HasPrefix(lower, "akar masalah:") || strings.HasPrefix(lower, "penyebab:") {
			if idx := strings.Index(trimmed, ":"); idx != -1 && idx < len(trimmed)-1 {
				clean := strings.TrimSpace(trimmed[idx+1:])
				clean = strings.Trim(clean, "*-_# ")
				if len(clean) > 5 {
					return clean
				}
			}
		}
	}

	// Fallback: search for first non-header, non-bullet line
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		cleanLine := strings.Trim(trimmed, "*-_# ")
		lower := strings.ToLower(cleanLine)
		if len(cleanLine) > 10 && !strings.HasPrefix(lower, "berikut") && !strings.HasPrefix(lower, "💡") && !strings.HasPrefix(lower, "bila kendala") && !strings.HasPrefix(lower, "---") && !strings.Contains(lower, "remediation") {
			if len(cleanLine) > 120 {
				return cleanLine[:120] + "..."
			}
			return cleanLine
		}
	}

	return "Penyebab belum teridentifikasi secara spesifik."
}
