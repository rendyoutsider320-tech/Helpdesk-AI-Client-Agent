package main

import (
	"log"
	"os"

	"github.com/helpdesk-ai/core/internal/db"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	if os.Getenv("DB_HOST") == "" {
		os.Setenv("DB_HOST", "127.0.0.1")
		os.Setenv("DB_PORT", "5436")
		os.Setenv("DB_USER", "helpdesk")
		os.Setenv("DB_PASSWORD", "helpdesk@123")
		os.Setenv("DB_NAME", "helpdesk_ai")
	}

	if err := db.InitDB(); err != nil {
		log.Fatalf("InitDB failed: %v", err)
	}

	log.Println("Clearing test AnyDesk ID from MKT-NUC...")
	db.DB.Model(&db.Asset{}).Where("hostname = ?", "MKT-NUC").Updates(map[string]interface{}{
		"anydesk_id":     "",
		"anydesk_status": "",
	})
	db.DB.Model(&db.Device{}).Where("device_name = ?", "MKT-NUC").Updates(map[string]interface{}{
		"anydesk_id":     "",
		"anydesk_status": "",
	})
	db.DB.Model(&db.AgentRegistry{}).Where("hostname = ?", "MKT-NUC").Updates(map[string]interface{}{
		"anydesk_id":     "",
		"anydesk_status": "",
	})

	log.Println("Ensuring exact AnyDesk ID for it-mkt-NUC12WSH-B (Ubuntu)...")
	db.DB.Model(&db.Asset{}).Where("hostname = ?", "it-mkt-NUC12WSH-B").Updates(map[string]interface{}{
		"anydesk_id":     "166257457",
		"anydesk_status": "online",
	})
	db.DB.Model(&db.Device{}).Where("device_name = ?", "it-mkt-NUC12WSH-B").Updates(map[string]interface{}{
		"anydesk_id":     "166257457",
		"anydesk_status": "online",
	})
	db.DB.Model(&db.AgentRegistry{}).Where("hostname = ?", "it-mkt-NUC12WSH-B").Updates(map[string]interface{}{
		"anydesk_id":     "166257457",
		"anydesk_status": "online",
	})
	log.Println("Cleaned up database records successfully!")
}
