package db

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// SetupPartitions initializes table partitioning for high-growth tables.
// Due to GORM's limitations, we execute raw SQL to convert tables to partitioned tables.
func SetupPartitions(db *gorm.DB) error {
	log.Println("Initializing PostgreSQL Partitioning Strategy...")

	// Function to partition a table by month
	partitionTable := func(tableName, partitionColumn string) error {
		// 1. Rename existing table to a temporary name
		tempTable := fmt.Sprintf("%s_old", tableName)
		if err := db.Exec(fmt.Sprintf("ALTER TABLE IF EXISTS %s RENAME TO %s;", tableName, tempTable)).Error; err != nil {
			log.Printf("Warning: Could not rename table %s: %v", tableName, err)
		}

		// 2. Recreate the table as partitioned
		// We extract the schema from the old table using LIKE
		createPartitionedSQL := fmt.Sprintf(`
			CREATE TABLE IF NOT EXISTS %s (
				LIKE %s INCLUDING DEFAULTS INCLUDING CONSTRAINTS
			) PARTITION BY RANGE (%s);
		`, tableName, tempTable, partitionColumn)

		if err := db.Exec(createPartitionedSQL).Error; err != nil {
			return fmt.Errorf("failed to create partitioned table %s: %v", tableName, err)
		}

		// 3. Create partitions for the current and next 2 months
		now := time.Now()
		for i := 0; i < 3; i++ {
			targetMonth := now.AddDate(0, i, 0)
			startDate := time.Date(targetMonth.Year(), targetMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
			endDate := startDate.AddDate(0, 1, 0)

			partitionName := fmt.Sprintf("%s_y%04dm%02d", tableName, startDate.Year(), startDate.Month())
			
			createPartitionSQL := fmt.Sprintf(`
				CREATE TABLE IF NOT EXISTS %s PARTITION OF %s
				FOR VALUES FROM ('%s') TO ('%s');
			`, partitionName, tableName, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))

			if err := db.Exec(createPartitionSQL).Error; err != nil {
				return fmt.Errorf("failed to create partition %s: %v", partitionName, err)
			}
		}

		// 4. (Optional) Migrate data from old table to new partitioned table
		// In a real production migration, this would be a background batch process.
		log.Printf("Partitioning setup complete for table: %s", tableName)
		return nil
	}

	// Apply partitioning to critical tables
	if err := partitionTable("telemetry", "timestamp"); err != nil {
		log.Printf("Telemetry partitioning error: %v", err)
	}
	
	if err := partitionTable("audit_logs", "timestamp"); err != nil {
		log.Printf("Audit logs partitioning error: %v", err)
	}

	if err := partitionTable("website_monitor_metrics", "timestamp"); err != nil {
		log.Printf("Website monitor metrics partitioning error: %v", err)
	}

	return nil
}
