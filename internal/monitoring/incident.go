package monitoring

import (
	"log"
	"time"

	"github.com/helpdesk-ai/core/internal/db"
)

// DetectAndCreateIncident mendeteksi apakah perlu membuat insiden baru berdasarkan hasil probe
func DetectAndCreateIncident(monitor db.WebsiteMonitor, res ProbeResult) {
	if res.Available {
		// Jika sekarang available, resolve insiden yang open
		AutoResolveIncidents(monitor.ID)
		return
	}

	// Cek apakah sudah ada open incident untuk monitor ini
	var existing db.WebsiteMonitorIncident
	err := db.DB.Where("monitor_id = ? AND status = 'open'", monitor.ID).First(&existing).Error
	if err == nil {
		// Sudah ada incident yang open, update saja
		return
	}

	// Tentukan severity
	severity := "warning"
	if !res.Available {
		severity = "critical"
	}

	title := "Website " + monitor.Name + " tidak dapat dijangkau"
	desc := "Monitor mendeteksi bahwa " + monitor.URL + " tidak merespon. Error: " + res.ErrorMessage

	incident := db.WebsiteMonitorIncident{
		MonitorID:    monitor.ID,
		Title:        title,
		Description:  desc,
		Severity:     severity,
		Status:       "open",
		StartedAt:    time.Now(),
		ErrorMessage: res.ErrorMessage,
		AffectedChecks: []string{"availability"},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := db.DB.Create(&incident).Error; err != nil {
		log.Printf("Error creating incident for monitor %s: %v", monitor.ID, err)
	} else {
		log.Printf("Incident created for monitor %s (%s)", monitor.Name, monitor.URL)
	}
}

// AutoResolveIncidents menutup semua open incident untuk monitor yang kembali online
func AutoResolveIncidents(monitorID string) {
	var incidents []db.WebsiteMonitorIncident
	if err := db.DB.Where("monitor_id = ? AND status = 'open'", monitorID).Find(&incidents).Error; err != nil {
		return
	}

	now := time.Now()
	for _, inc := range incidents {
		duration := int(now.Sub(inc.StartedAt).Seconds())
		if err := db.DB.Model(&inc).Updates(map[string]interface{}{
			"status":           "resolved",
			"resolved_at":      now,
			"duration_seconds": duration,
			"updated_at":       now,
		}).Error; err != nil {
			log.Printf("Error resolving incident %s: %v", inc.ID, err)
		}
	}
}

// ListIncidents mengembalikan daftar insiden
func ListIncidents(monitorID string, limit int) ([]db.WebsiteMonitorIncident, error) {
	var incidents []db.WebsiteMonitorIncident
	q := db.DB.Preload("Monitor").Order("started_at DESC").Limit(limit)
	if monitorID != "" {
		q = q.Where("monitor_id = ?", monitorID)
	}
	return incidents, q.Find(&incidents).Error
}

// GetUptimeStats menghitung uptime % untuk monitor dalam window waktu tertentu
func GetUptimeStats(monitorID string, windowHours int) (float64, int, int) {
	since := time.Now().Add(-time.Duration(windowHours) * time.Hour)

	var total int64
	var up int64
	db.DB.Model(&db.WebsiteMonitorMetric{}).
		Where("monitor_id = ? AND timestamp >= ?", monitorID, since).
		Count(&total)

	db.DB.Model(&db.WebsiteMonitorMetric{}).
		Where("monitor_id = ? AND timestamp >= ? AND available = true", monitorID, since).
		Count(&up)

	if total == 0 {
		return 100.0, 0, 0
	}

	uptime := float64(up) / float64(total) * 100.0
	down := int(total - up)
	return uptime, int(up), down
}
