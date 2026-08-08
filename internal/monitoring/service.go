package monitoring

import (
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
)

// AlertService handles alert management
type AlertService struct{}

// CreateAlert creates a new alert or updates an existing active alert for the same source/metric
func (as *AlertService) CreateAlert(deviceID, severity, metric, value, message string) (*db.Alert, error) {
	// Check if there is already an active alert for this device/monitor and metric
	var existing db.Alert
	db.DB.Limit(1).Find(&existing, "device_id = ? AND metric = ? AND status = ?", deviceID, metric, "active")
	if existing.ID != "" {
		// Update the existing alert with latest info if severity or message changed
		updates := map[string]interface{}{
			"severity":   severity,
			"value":      value,
			"message":    message,
			"updated_at": time.Now(),
		}
		db.DB.Model(&existing).Updates(updates)
		return &existing, nil
	}

	alert := &db.Alert{
		ID:        uuid.New().String(),
		DeviceID:  &deviceID,
		Severity:  severity,
		Metric:    metric,
		Value:     value,
		Message:   message,
		Status:    "active",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	result := db.DB.Create(alert)
	if result.Error != nil {
		log.Println("Error creating alert:", result.Error)
		return nil, result.Error
	}

	return alert, nil
}

// GetActiveAlerts gets all active alerts
func (as *AlertService) GetActiveAlerts() ([]db.Alert, error) {
	var alerts []db.Alert
	result := db.DB.Where("status = ?", "active").Find(&alerts)
	return alerts, result.Error
}

// CountActiveAlerts returns the number of active alerts
func (as *AlertService) CountActiveAlerts() (int64, error) {
	var total int64
	result := db.DB.Model(&db.Alert{}).
		Where("status = ?", "active").
		Count(&total)
	return total, result.Error
}

// ListRecentAlerts returns recent active alerts ordered by creation time
func (as *AlertService) ListRecentAlerts(limit int) ([]db.Alert, error) {
	var alerts []db.Alert
	result := db.DB.Where("status = ?", "active").
		Order("created_at DESC").
		Limit(limit).
		Find(&alerts)
	return alerts, result.Error
}

// ResolveAlert resolves an alert
func (as *AlertService) ResolveAlert(alertID string) error {
	return db.DB.Model(&db.Alert{}).
		Where("id = ?", alertID).
		Updates(map[string]interface{}{
			"status":      "resolved",
			"resolved_at": time.Now(),
		}).Error
}

// MonitoringEngine represents the monitoring system
type MonitoringEngine struct {
	alertService *AlertService
	stopChan     chan bool
}

// NewMonitoringEngine creates a new monitoring engine
func NewMonitoringEngine() *MonitoringEngine {
	return &MonitoringEngine{
		alertService: &AlertService{},
		stopChan:     make(chan bool),
	}
}

// Start starts the monitoring engine
func (me *MonitoringEngine) Start() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-me.stopChan:
				return
			case <-ticker.C:
				me.collectMetrics()
			}
		}
	}()
}

// Stop stops the monitoring engine
func (me *MonitoringEngine) Stop() {
	me.stopChan <- true
}

// collectMetrics collects metrics from all devices
func (me *MonitoringEngine) collectMetrics() {
	var devices []db.Device
	if db.DB.Find(&devices).Error != nil {
		return
	}

	for _, device := range devices {
		// Simulate metric collection
		metric := &db.Metric{
			ID:          uuid.New().String(),
			DeviceID:    device.ID,
			MetricType:  "cpu",
			MetricValue: 45.5,
			Timestamp:   time.Now(),
		}

		db.DB.Create(metric)

		// Check for alerts (simple threshold check)
		if metric.MetricValue > 80 {
			_, err := me.alertService.CreateAlert(
				device.ID,
				"warning",
				"cpu",
				"45.5%",
				"CPU usage on "+device.DeviceName+" is high",
			)
			if err != nil {
				log.Printf("failed to create alert for device %s: %v", device.ID, err)
			}
		}
	}

	log.Println("Metrics collected successfully")
}

// CreateDevice creates a new device for monitoring
func CreateDevice(name, deviceType, ipAddress, macAddress, location string) (*db.Device, error) {
	device := &db.Device{
		ID:         uuid.New().String(),
		DeviceName: name,
		DeviceType: deviceType,
		IPAddress:  ipAddress,
		MACAddress: macAddress,
		Location:   location,
		Status:     "active",
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	result := db.DB.Create(device)
	if result.Error != nil {
		return nil, result.Error
	}

	return device, nil
}

// GetDeviceMetrics gets metrics for a device
func GetDeviceMetrics(deviceID string, limit int) ([]db.Metric, error) {
	var metrics []db.Metric
	result := db.DB.
		Where("device_id = ?", deviceID).
		Order("timestamp DESC").
		Limit(limit).
		Find(&metrics)
	return metrics, result.Error
}
