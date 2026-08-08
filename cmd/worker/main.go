package main

import (
	"context"
	"fmt"
	"log"

	"github.com/helpdesk-ai/core/internal/ai"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/tools"
)

// Worker process for handling background AI analysis tasks
func main() {
	// Initialize database
	if err := db.InitDB(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer func() {
		if err := db.CloseDB(); err != nil {
			log.Printf("CloseDB error: %v", err)
		}
	}()

	// Initialize tool registry
	toolRegistry := tools.InitializeToolRegistry()

	// Initialize AI orchestrator
	agentOrchestrator := ai.InitializeAgents(toolRegistry)

	log.Println("AI Worker started, listening for analysis tasks...")

	// In production, this would listen to a message queue (Redis, RabbitMQ, etc.)
	// For now, just demonstrate the capability
	demonstrateAnalysis(agentOrchestrator)
}

func demonstrateAnalysis(orchestrator *ai.Orchestrator) {
	request := ai.AgentRequest{
		TicketID:    "ticket-001",
		Description: "RTR-HO-01 (Head Office Router) experiencing 85% packet loss, affecting all users",
		Context: map[string]interface{}{
			"device_id": "router-001",
			"severity":  "critical",
		},
	}

	ctx := context.Background()
	response, err := orchestrator.AnalyzeIncident(ctx, request)
	if err != nil {
		log.Printf("Analysis error: %v", err)
		return
	}

	fmt.Println("\n========== AI ANALYSIS REPORT ==========")
	fmt.Printf("Ticket: %s\n", request.TicketID)
	fmt.Printf("Root Cause: %s\n", response.RootCause)
	fmt.Printf("Confidence: %.2f%%\n", response.Confidence*100)
	fmt.Printf("Tools Used: %v\n", response.ToolsUsed)
	fmt.Println("\nSuggestions:")
	for i, suggestion := range response.Suggestions {
		fmt.Printf("  %d. %s\n", i+1, suggestion)
	}
	fmt.Println("=========================================")
}
