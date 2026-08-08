package main

import (
	"context"
	"log"
	"os"

	"github.com/joho/godotenv"

	"github.com/helpdesk-ai/core/internal/ai"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/tools"
)

func init() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	log.Println("DB_HOST =", os.Getenv("DB_HOST"))
	log.Println("DB_PORT =", os.Getenv("DB_PORT"))
	log.Println("DB_USER =", os.Getenv("DB_USER"))
	log.Println("DB_PASSWORD =", os.Getenv("DB_PASSWORD"))
	log.Println("DB_NAME =", os.Getenv("DB_NAME"))
}

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

	// Initialize AI agent
	agent := ai.NewAgent("default-agent", toolRegistry, "gpt-4")

	// Example analysis request
	request := ai.AgentRequest{
		TicketID:    "ticket-001",
		Description: "PostgreSQL connection failing on production server",
		Context: map[string]interface{}{
			"severity": "critical",
		},
	}

	log.Println("🤖 AI Agent Worker Starting")
	log.Printf("📋 Analyzing request: %s\n", request.Description)

	ctx := context.Background()
	response, err := agent.Analyze(ctx, request)
	if err != nil {
		log.Fatal("Analysis failed:", err)
	}

	log.Printf("✅ Analysis complete:\n%+v\n", response)
	log.Println("🤖 AI Agent Worker Finished")
}
