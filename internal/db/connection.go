package db

import (
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

// InitDB initializes the database connection
func InitDB() error {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
	)

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
		return err
	}

	// Apply SQL migrations
	if err := applySQLMigrations(); err != nil {
		log.Fatal("Failed to apply SQL migrations:", err)
		return err
	}

	// Seed default users and technician presence if no users exist
	var userCount int64
	if err := DB.Model(&User{}).Count(&userCount).Error; err != nil {
		return err
	}
	if userCount == 0 {
		if err := applySeedData(); err != nil {
			log.Fatal("Failed to apply seed data:", err)
			return err
		}
	}

	// Set connection pool settings
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := SetupPartitions(DB); err != nil {
		log.Printf("Warning: Partition setup encountered issues: %v", err)
	}

	if err := DB.AutoMigrate(&Device{}, &AgentRegistry{}, &RefreshToken{}, &BlacklistedToken{}, &Ticket{}, &TechnicianPresence{}, &Asset{}, &SoftwareInventory{}, &USBInventory{}, &SystemEventLog{}, &MonitoredAppStatus{}); err != nil {
		log.Printf("Warning: Failed to auto-migrate security tables: %v", err)
	}



	log.Println("Database initialized successfully")
	return nil
}

func applySQLMigrations() error {
	migrations := []struct {
		table string
		path  string
	}{
		{"users", "migrations/001_initial_schema.up.sql"},
		{"ticket_actions", "migrations/003_add_ticket_actions.up.sql"},
		{"assets", "migrations/004_enterprise_cmdb_and_events.up.sql"},
		{"agent_registry", "migrations/005_enterprise_complete_schema.up.sql"},
		{"", "migrations/006_add_telegram_chat_id.up.sql"},
		{"", "migrations/007_enlarge_ticket_no.up.sql"},
		{"", "migrations/007_add_dns_servers_to_assets.up.sql"},
		{"", "migrations/008_rename_presence_table.up.sql"},
		{"website_monitors", "migrations/009_website_sre_cmdb_schema.up.sql"},
		{"", "migrations/010_website_monitor_full.up.sql"},
		{"", "migrations/011_add_is_online_to_users.up.sql"},
		{"", "migrations/012_add_ticket_status_values.up.sql"},
		{"ai_conversations", "migrations/013_add_ai_chat_persistence.up.sql"},
		{"", "migrations/014_add_ticket_enterprise_fields.up.sql"},
		{"", "migrations/015_add_ip_lan_and_ip_wifi_to_assets.up.sql"},
	}

	for _, m := range migrations {
		if m.table != "" && DB.Migrator().HasTable(m.table) {
			log.Printf("SQL migration %s skipped (table %s already exists)", m.path, m.table)
			continue
		}
		if m.path == "migrations/015_add_ip_lan_and_ip_wifi_to_assets.up.sql" && DB.Migrator().HasColumn(&Asset{}, "ip_lan") {
			log.Printf("SQL migration %s skipped (column ip_lan already exists)", m.path)
			continue
		}
		if m.path == "migrations/006_add_telegram_chat_id.up.sql" && DB.Migrator().HasColumn(&Ticket{}, "telegram_chat_id") {
			log.Printf("SQL migration %s skipped (column telegram_chat_id already exists)", m.path)
			continue
		}
		if m.path == "migrations/007_add_dns_servers_to_assets.up.sql" && DB.Migrator().HasColumn(&Asset{}, "dns_servers") {
			log.Printf("SQL migration %s skipped (column dns_servers already exists)", m.path)
			continue
		}
		if m.path == "migrations/007_enlarge_ticket_no.up.sql" {
			var colType string
			DB.Raw("SELECT data_type FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'ticket_no'").Scan(&colType)
			if colType == "character varying" {
				var charLen int
				DB.Raw("SELECT character_maximum_length FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'ticket_no'").Scan(&charLen)
				if charLen >= 50 {
					log.Printf("SQL migration %s skipped (column already enlarged)", m.path)
					continue
				}
			}
		}
		if m.path == "migrations/008_rename_presence_table.up.sql" && DB.Migrator().HasTable("technician_presences") {
			log.Printf("SQL migration %s skipped (table technician_presences already exists)", m.path)
			continue
		}
		if m.path == "migrations/011_add_is_online_to_users.up.sql" && DB.Migrator().HasColumn(&User{}, "is_online") {
			log.Printf("SQL migration %s skipped (column is_online already exists)", m.path)
			continue
		}

		content, err := os.ReadFile(m.path)
		if err != nil {
			log.Printf("Warning: failed to read migration %s: %v", m.path, err)
			continue
		}

		if err := DB.Exec(string(content)).Error; err != nil {
			return fmt.Errorf("failed to execute migration %s: %v", m.path, err)
		}
		log.Printf("SQL migration %s applied successfully", m.path)
	}

	return nil
}

func applySeedData() error {
	seedPath := "migrations/002_seed_data.up.sql"
	content, err := os.ReadFile(seedPath)
	if err != nil {
		return err
	}

	if err := DB.Exec(string(content)).Error; err != nil {
		return err
	}

	log.Println("Seed data applied successfully")
	return nil
}

// CloseDB closes the database connection
func CloseDB() error {
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// GetRecentTickets retrieves the most recent tickets from the database
func GetRecentTickets(limit int) ([]Ticket, error) {
	var tickets []Ticket
	err := DB.Order("created_at DESC").Limit(limit).Find(&tickets).Error
	return tickets, err
}
