package db

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SystemConfig stores dynamic system settings in database
type SystemConfig struct {
	Key       string    `gorm:"primaryKey;type:varchar(100)" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (SystemConfig) TableName() string {
	return "system_configs"
}

// GetConfigValue retrieves a system config value or returns defaultValue
func GetConfigValue(gormDB *gorm.DB, key, defaultValue string) string {
	if gormDB == nil {
		gormDB = DB
	}
	if gormDB == nil {
		return defaultValue
	}

	var cfg SystemConfig
	if err := gormDB.Where("key = ?", key).First(&cfg).Error; err != nil {
		return defaultValue
	}
	if cfg.Value == "" {
		return defaultValue
	}
	return cfg.Value
}

// SetConfigValue updates or inserts a system config key-value pair
func SetConfigValue(gormDB *gorm.DB, key, value string) error {
	if gormDB == nil {
		gormDB = DB
	}
	cfg := SystemConfig{
		Key:       key,
		Value:     value,
		UpdatedAt: time.Now(),
	}
	return gormDB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&cfg).Error
}

// GetAllConfigs retrieves all system configs as a map
func GetAllConfigs(gormDB *gorm.DB) (map[string]string, error) {
	if gormDB == nil {
		gormDB = DB
	}
	var configs []SystemConfig
	if err := gormDB.Find(&configs).Error; err != nil {
		return nil, err
	}

	result := make(map[string]string)
	for _, c := range configs {
		result[c.Key] = c.Value
	}
	return result, nil
}
