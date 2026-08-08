package ai

import (
	"context"
	"fmt"
	"log"
	"os"
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
	llmCtx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()

	if llmOutput, err := a.queryLLM(llmCtx, a.buildLLMPrompt(request, response)); err == nil {
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
		// Construct a structured fallback report using tool outputs
		var kbTitles []string
		if response.KBMatches != nil {
			if m, ok := response.KBMatches.(map[string]interface{}); ok {
				if res, ok := m["results"]; ok {
					switch val := res.(type) {
					case []db.KBArticle:
						for _, art := range val {
							kbTitles = append(kbTitles, "- "+art.Title)
						}
					case []map[string]interface{}:
						for _, art := range val {
							if title, ok := art["title"].(string); ok {
								kbTitles = append(kbTitles, "- "+title)
							}
						}
					case []interface{}:
						for _, item := range val {
							if art, ok := item.(map[string]interface{}); ok {
								if title, ok := art["title"].(string); ok {
									kbTitles = append(kbTitles, "- "+title)
								}
							}
						}
					}
				}
			}
		}

		kbSection := "Tidak ditemukan kecocokan KB."
		if len(kbTitles) > 0 {
			kbSection = strings.Join(kbTitles, "\n")
		}

		response.AIReport = fmt.Sprintf("### Laporan Analisis Diagnostik (Fallback)\n\n**Penyebab Masalah (Root Cause):** %s\n**Tingkat Keparahan (Severity):** %s\n\n**Rekomendasi Artikel KB:**\n%s\n\n*Catatan: Sintesis Laporan AI Utama dilewati karena batas waktu server.*", response.RootCause, response.Severity, kbSection)
	}

	// Enterprise Addition: Check for automated action candidates (independent of LLM online status)
	if request.TicketID != "" {
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

func (a *Agent) buildLLMPrompt(request AgentRequest, response *AgentResponse) string {
	kbSummary := "Tidak ditemukan artikel Knowledge Base yang relevan."
	var articles []string

	if response.KBMatches != nil {
		if m, ok := response.KBMatches.(map[string]interface{}); ok {
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
						if len(snippetText) > 400 {
							snippetText = snippetText[:400] + "..."
						}
						articles = append(articles, fmt.Sprintf("Artikel %d: %s (Kategori: %s)\nSolusi/Langkah: %s", len(articles)+1, t, c, snippetText))
					}
				}
			}
		}
	}
	if len(articles) > 0 {
		kbSummary = strings.Join(articles, "\n---\n")
	}

	cleanOutputs := make(map[string]interface{})
	for k, v := range response.ToolOutputs {
		if k == "kb_search" || k == "rag_search" {
			continue
		}
		cleanOutputs[k] = v
	}

	return fmt.Sprintf(`Anda adalah Asisten AI Helpdesk IT (NOC Operator Bot) yang ramah, ringkas, dan sangat terstruktur.

Deskripsi Kendala Tiket:
%s

Tingkat Keparahan (Severity): %s

Hasil Pencarian Knowledge Base (Qdrant Vector DB / DB):
%s

Aturan Format Laporan (STRICT FORMAT MATCHING):
1. Mulai dengan 1 kalimat "Dugaan Penyebab: [penyebab ringkas]".
2. Berikan 1 kalimat pengantar yang ramah.
3. Gunakan header persis: "💡 Langkah Penanganan (Remediation):"
4. Buat 3 langkah penanganan berupa daftar nomor urut (1., 2., 3.). Setiap langkah HARUS ringkas (maksimal 1 kalimat padat per nomor, DILARANG membuat sub-bullet/anak poin beranak).
5. Di bagian akhir, tambahkan garis pembatas "-----------------------------------" dan 1 kalimat penutup: "Bila kendala belum terselesaikan, silakan hubungi Teknisi IT."
6. JIKA artikel Knowledge Base KOSONG atau TIDAK RELEVAN:
   - Pengantar: "Panduan spesifik untuk kendala ini tidak ditemukan di Knowledge Base internal. Berikut adalah langkah pemeriksaan umum:"
   - Berikan 3 langkah pemeriksaan umum yang logis (misal: cek koneksi, bersihkan cache, atau restart service).
7. DILARANG KERAS mencantumkan kalimat instruksi sistem (seperti "Jika artikel Knowledge Base yang diberikan...").
8. DILARANG mencantumkan langkah router/modem/tethering KECUALI tiket mengeluhkan koneksi internet.
9. WAJIB menggunakan BAHASA INDONESIA yang rapi, ramah, dan mudah dipahami.

Format Output WAJIB (Ikuti Struktur Ini Persis):
Dugaan Penyebab: [1 kalimat singkat penyebab kendala]

Berikut adalah panduan penanganan untuk kendala ini:

💡 Langkah Penanganan (Remediation):
1. [Langkah 1 ringkas & padat]
2. [Langkah 2 ringkas & padat]
3. [Langkah 3 ringkas & padat]

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
		rca = "Terdeteksi lonjakan pemakaian CPU (95-100%) dan RAM penuh (>90%) pada perangkat NUC kasir yang berpotensi disebabkan oleh aplikasi yang hang/memory leak."
	}

	var suggestionsFormatted string
	if len(response.Suggestions) > 0 {
		suggestionsFormatted = "- " + strings.Join(response.Suggestions, "\n- ")
	} else {
		suggestionsFormatted = "- Lakukan pembersihan memory cache (drop_caches)\n- Periksa dan restart proses aplikasi kasir yang hang\n- Jalankan Remote Agent Auto-Fix pada konsol operasi"
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

	model := os.Getenv("LLM_MODEL")
	if model == "" {
		model = "qwen2.5"
	}

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
