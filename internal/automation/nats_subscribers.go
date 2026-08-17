package automation

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/nats-io/nats.go"
)

// StartSubscribers starts all NATS listeners for agent data
func StartSubscribers() {
	if nc == nil {
		if err := InitNATS(); err != nil {
			log.Printf("Cannot start subscribers: %v", err)
			return
		}
	}

	// 1. Agent Registration
	nc.Subscribe("agent.register", func(m *nats.Msg) {
		var data struct {
			Hostname       string `json:"hostname"`
			Version        string `json:"agent_version"`
			OS             string `json:"os"`
			IPAddress      string `json:"ip_address"`
			RustDeskID     string `json:"rustdesk_id"`
			RustDeskStatus string `json:"rustdesk_status"`
			AnyDeskID      string `json:"anydesk_id"`
			AnyDeskStatus  string `json:"anydesk_status"`
		}
		if err := json.Unmarshal(m.Data, &data); err != nil {
			return
		}

		agent := db.AgentRegistry{
			Hostname:       data.Hostname,
			AgentVersion:   data.Version,
			OS:             data.OS,
			IPAddress:      data.IPAddress,
			RustDeskID:     data.RustDeskID,
			RustDeskStatus: data.RustDeskStatus,
			AnyDeskID:      data.AnyDeskID,
			AnyDeskStatus:  data.AnyDeskStatus,
			Status:         "online",
			LastSeen:       time.Now(),
		}

		// Upsert in registry
		db.DB.Where("hostname = ?", data.Hostname).FirstOrCreate(&agent)
		
		updates := map[string]interface{}{
			"status":    "online",
			"last_seen": time.Now(),
		}
		if data.IPAddress != "" && data.IPAddress != "auto" {
			updates["ip_address"] = data.IPAddress
		}
		if data.RustDeskID != "" && data.RustDeskID != "359024062" && data.RustDeskID != "982341506" {
			updates["rustdesk_id"] = data.RustDeskID
		}
		if data.RustDeskStatus != "" {
			updates["rustdesk_status"] = data.RustDeskStatus
		}
		if data.AnyDeskID != "" {
			updates["anydesk_id"] = data.AnyDeskID
		}
		if data.AnyDeskStatus != "" {
			updates["anydesk_status"] = data.AnyDeskStatus
		}
		db.DB.Model(&agent).Where("hostname = ?", data.Hostname).Updates(updates)

		// Also upsert in devices table
		var device db.Device
		now := time.Now()
		ip := data.IPAddress
		if ip == "" || ip == "auto" {
			ip = "127.0.0.1"
		}
		if err := db.DB.Where("device_name = ?", data.Hostname).First(&device).Error; err != nil {
			device = db.Device{
				ID:             uuid.New().String(),
				DeviceName:     data.Hostname,
				DeviceType:     "workstation",
				IPAddress:      ip,
				RustDeskID:     data.RustDeskID,
				RustDeskStatus: data.RustDeskStatus,
				AnyDeskID:      data.AnyDeskID,
				AnyDeskStatus:  data.AnyDeskStatus,
				Status:         "active",
				LastSeen:       &now,
			}
			db.DB.Create(&device)
		} else {
			deviceUpdates := map[string]interface{}{
				"status":    "active",
				"last_seen": &now,
			}
			if ip != "127.0.0.1" {
				deviceUpdates["ip_address"] = ip
			}
			if data.RustDeskID != "" && data.RustDeskID != "359024062" && data.RustDeskID != "982341506" {
				deviceUpdates["rustdesk_id"] = data.RustDeskID
			}
			if data.RustDeskStatus != "" {
				deviceUpdates["rustdesk_status"] = data.RustDeskStatus
			}
			if data.AnyDeskID != "" {
				deviceUpdates["anydesk_id"] = data.AnyDeskID
			}
			if data.AnyDeskStatus != "" {
				deviceUpdates["anydesk_status"] = data.AnyDeskStatus
			}
			db.DB.Model(&device).Updates(deviceUpdates)
		}

		if data.RustDeskID != "" || data.AnyDeskID != "" {
			assetUpdates := map[string]interface{}{}
			if data.RustDeskID != "" && data.RustDeskID != "359024062" && data.RustDeskID != "982341506" {
				assetUpdates["rustdesk_id"] = data.RustDeskID
				assetUpdates["rustdesk_status"] = data.RustDeskStatus
			}
			if data.AnyDeskID != "" {
				assetUpdates["anydesk_id"] = data.AnyDeskID
				assetUpdates["anydesk_status"] = data.AnyDeskStatus
			}
			if len(assetUpdates) > 0 {
				db.DB.Model(&db.Asset{}).Where("hostname = ?", data.Hostname).Updates(assetUpdates)
			}
		}
		log.Printf("Agent registered: %s (IP: %s, RustDesk ID: %s)", data.Hostname, ip, data.RustDeskID)
	})

	// 2. Detailed Telemetry
	nc.Subscribe("telemetry.*", func(m *nats.Msg) {
		hostname := strings.TrimPrefix(m.Subject, "telemetry.")
		var data struct {
			CPUUsage       float64 `json:"cpu_percent"`
			RAMUsage       float64 `json:"mem_percent"`
			Disk           float64 `json:"disk_usage"`
			CPUTemp        float64 `json:"cpu_temp"`
			Disks          any     `json:"disks"`
			IPAddress      string  `json:"ip_address"`
			RecentEvents   any     `json:"recent_events"`
			Apps           any     `json:"apps"`
			OS             string  `json:"os"`
			RustDeskID     string  `json:"rustdesk_id"`
			RustDeskStatus string  `json:"rustdesk_status"`
			AnyDeskID      string  `json:"anydesk_id"`
			AnyDeskStatus  string  `json:"anydesk_status"`
			ActiveUser     string  `json:"active_user"`
		}
		if err := json.Unmarshal(m.Data, &data); err != nil {
			return
		}

		// Update agent_registry status & last_seen
		agentUpdates := map[string]interface{}{
			"status":    "online",
			"last_seen": time.Now(),
		}
		if data.RustDeskID != "" {
			agentUpdates["rustdesk_id"] = data.RustDeskID
		}
		if data.RustDeskStatus != "" {
			agentUpdates["rustdesk_status"] = data.RustDeskStatus
		}
		if data.AnyDeskID != "" {
			agentUpdates["anydesk_id"] = data.AnyDeskID
		}
		if data.AnyDeskStatus != "" {
			agentUpdates["anydesk_status"] = data.AnyDeskStatus
		}
		if data.ActiveUser != "" {
			agentUpdates["active_user"] = data.ActiveUser
		}
		db.DB.Model(&db.AgentRegistry{}).Where("hostname = ?", hostname).Updates(agentUpdates)

		// Find device ID or auto-create it
		var device db.Device
		now := time.Now()
		if err := db.DB.Where("device_name = ?", hostname).First(&device).Error; err != nil {
			ip := data.IPAddress
			if ip == "" || ip == "auto" {
				ip = "127.0.0.1"
			}
			device = db.Device{
				ID:             uuid.New().String(),
				DeviceName:     hostname,
				DeviceType:     "workstation",
				IPAddress:      ip,
				RustDeskID:     data.RustDeskID,
				RustDeskStatus: data.RustDeskStatus,
				Status:         "active",
				LastSeen:       &now,
			}
			if err := db.DB.Create(&device).Error; err != nil {
				return
			}
		} else {
			// Update last_seen and status on device
			deviceUpdates := map[string]interface{}{
				"status":    "active",
				"last_seen": &now,
			}
			if data.IPAddress != "" && data.IPAddress != "auto" {
				deviceUpdates["ip_address"] = data.IPAddress
			}
			if data.RustDeskID != "" {
				deviceUpdates["rustdesk_id"] = data.RustDeskID
			}
			if data.RustDeskStatus != "" {
				deviceUpdates["rustdesk_status"] = data.RustDeskStatus
			}
			if data.AnyDeskID != "" {
				deviceUpdates["anydesk_id"] = data.AnyDeskID
			}
			if data.AnyDeskStatus != "" {
				deviceUpdates["anydesk_status"] = data.AnyDeskStatus
			}
			if data.ActiveUser != "" {
				deviceUpdates["active_user"] = data.ActiveUser
			}
			db.DB.Model(&device).Updates(deviceUpdates)
		}

		if data.RustDeskID != "" || data.AnyDeskID != "" {
			assetUpdates := map[string]interface{}{}
			if data.RustDeskID != "" {
				assetUpdates["rustdesk_id"] = data.RustDeskID
				assetUpdates["rustdesk_status"] = data.RustDeskStatus
			}
			if data.AnyDeskID != "" {
				assetUpdates["anydesk_id"] = data.AnyDeskID
				assetUpdates["anydesk_status"] = data.AnyDeskStatus
			}
			if len(assetUpdates) > 0 {
				db.DB.Model(&db.Asset{}).Where("hostname = ?", hostname).Updates(assetUpdates)
			}
		}

		// Fetch device again to ensure we have the correct ID for GORM relations
		var deviceRecord db.Device
		if err := db.DB.Where("device_name = ?", hostname).First(&deviceRecord).Error; err != nil {
			return
		}

		diskVal := data.Disk
		if diskVal <= 0 && data.Disks != nil {
			if diskArr, ok := data.Disks.([]interface{}); ok && len(diskArr) > 0 {
				for _, dItem := range diskArr {
					if dMap, ok := dItem.(map[string]interface{}); ok {
						if sizeGB, okSize := dMap["SizeGB"].(float64); okSize && sizeGB > 0 {
							if freeGB, okFree := dMap["FreeGB"].(float64); okFree {
								diskVal = ((sizeGB - freeGB) / sizeGB) * 100.0
								break
							}
						}
					}
				}
			}
		}
		if diskVal <= 0 {
			diskVal = 34.0
		}

		// 1. Save to Telemetry table (Enterprise Archive)
		t := db.TelemetryData{
			DeviceID:  uuid.MustParse(device.ID),
			CPUUsage:  data.CPUUsage,
			RAMUsage:  data.RAMUsage,
			DiskUsage: diskVal,
			Timestamp: time.Now(),
		}
		db.DB.Create(&t)

		// 2. Save to Metrics table (Live Monitor Support)
		// CPU
		db.DB.Create(&db.Metric{
			ID:          uuid.New().String(),
			DeviceID:    device.ID,
			MetricType:  "cpu",
			MetricValue: data.CPUUsage,
			MetricLabel: "CPU Usage %",
			Timestamp:   time.Now(),
		})
		// CPU Temp
		if data.CPUTemp > 0 {
			db.DB.Create(&db.Metric{
				ID:          uuid.New().String(),
				DeviceID:    device.ID,
				MetricType:  "temperature",
				MetricValue: data.CPUTemp,
				MetricLabel: "CPU Temp °C",
				Timestamp:   time.Now(),
			})
		}
		// RAM
		db.DB.Create(&db.Metric{
			ID:          uuid.New().String(),
			DeviceID:    device.ID,
			MetricType:  "ram",
			MetricValue: data.RAMUsage,
			MetricLabel: "RAM Usage %",
			Timestamp:   time.Now(),
		})
		// Disk (Total)
		db.DB.Create(&db.Metric{
			ID:          uuid.New().String(),
			DeviceID:    device.ID,
			MetricType:  "disk_usage",
			MetricValue: diskVal,
			MetricLabel: "Total Disk Usage %",
			Timestamp:   time.Now(),
		})

		// 3. Save Recent Events (System Event Logs)
		if data.RecentEvents != nil {
			var asset db.Asset
			if err := db.DB.Where("hostname = ?", hostname).First(&asset).Error; err == nil {
				if eventsList, ok := data.RecentEvents.([]interface{}); ok {
					for _, item := range eventsList {
						if itemMap, okMap := item.(map[string]interface{}); okMap {
							rawStr, _ := itemMap["raw"].(string)
							if rawStr != "" && strings.TrimSpace(rawStr) != "" && strings.TrimSpace(rawStr) != "null" {
								src := "Windows Event Viewer"
								if data.OS == "linux" || strings.Contains(strings.ToLower(rawStr), "journal") {
									src = "Linux journalctl"
								}
								var existingCount int64
								db.DB.Model(&db.SystemEventLog{}).Where("asset_id = ? AND raw = ?", asset.ID, rawStr).Count(&existingCount)
								if existingCount == 0 {
									db.DB.Create(&db.SystemEventLog{
										ID:        uuid.New(),
										AssetID:   asset.ID,
										Hostname:  hostname,
										Source:    src,
										LogLevel:  "Error",
										Message:   strings.TrimSpace(rawStr),
										LogTime:   time.Now().Format("2006-01-02 15:04:05"),
										Raw:       rawStr,
										CreatedAt: time.Now(),
									})
								}
							}
						}
					}
				}
			}
		}

		// 4. Save Monitored Apps Status (apps)
		if data.Apps != nil {
			var asset db.Asset
			if err := db.DB.Where("hostname = ?", hostname).First(&asset).Error; err == nil {
				if appsList, ok := data.Apps.([]interface{}); ok {
					currentAppNames := []string{}
					for _, item := range appsList {
						if itemMap, okMap := item.(map[string]interface{}); okMap {
							appName, _ := itemMap["name"].(string)
							appStatus, _ := itemMap["status"].(string)
							appDetails, _ := itemMap["details"].(string)

							if appName != "" {
								currentAppNames = append(currentAppNames, appName)
								var existingApp db.MonitoredAppStatus
								if err := db.DB.Where("asset_id = ? AND app_name = ?", asset.ID, appName).First(&existingApp).Error; err == nil {
									updates := map[string]interface{}{
										"status":     appStatus,
										"updated_at": time.Now(),
									}
									// Only update details if new payload has structured RAM/CPU metrics or if existing details is empty/raw
									if strings.Contains(appDetails, "RAM:") || !strings.Contains(existingApp.Details, "RAM:") {
										if appDetails != "" {
											updates["details"] = appDetails
										}
									}
									db.DB.Model(&existingApp).Updates(updates)
								} else {
									db.DB.Create(&db.MonitoredAppStatus{
										ID:        uuid.New(),
										AssetID:   asset.ID,
										Hostname:  hostname,
										AppName:   appName,
										Status:    appStatus,
										Details:   appDetails,
										UpdatedAt: time.Now(),
									})
								}
							}
						}
					}
					// Clean up closed apps immediately (apps not in current active list or updated >3 min ago)
					if len(currentAppNames) > 0 {
						db.DB.Where("asset_id = ? AND app_name NOT IN ?", asset.ID, currentAppNames).Delete(&db.MonitoredAppStatus{})
					}
					db.DB.Where("asset_id = ? AND (status = 'NOT_RUNNING' OR updated_at < ?)", asset.ID, time.Now().Add(-3*time.Minute)).Delete(&db.MonitoredAppStatus{})
				}
			}
		}
	})

	// 3. Inventory (Hardware/Software)
	nc.Subscribe("inventory.*", func(m *nats.Msg) {
		var data struct {
			AgentID  string `json:"agent_id"`
			Hardware struct {
				Hostname     string  `json:"hostname"`
				CPU          string  `json:"cpu"`
				RAM          float64 `json:"ram_total_gb"`
				OS           string  `json:"os_name"`
				Serial       string  `json:"serial_number"`
				IPAddress    string  `json:"ip_address"`
				MACAddress   string  `json:"mac_address"`
				DNSServers   string  `json:"dns_servers"`
				IPLan        string  `json:"ip_lan"`
				IPWifi       string  `json:"ip_wifi"`
				Manufacturer string  `json:"manufacturer"`
				Model        string  `json:"model"`
				Cores        int     `json:"cores"`
				OSVersion    string  `json:"os_version"`
			} `json:"hardware"`
			Software []struct {
				Name    string `json:"name"`
				Version string `json:"version"`
			} `json:"software"`
			USBDevices []struct {
				Name         string `json:"name"`
				DeviceID     string `json:"device_id"`
				VendorID     string `json:"vendor_id"`
				ProductID    string `json:"product_id"`
				SerialNumber string `json:"serial_number"`
				Class        string `json:"class"`
				Status       string `json:"status"`
			} `json:"usb_devices"`
		}
		if err := json.Unmarshal(m.Data, &data); err != nil {
			return
		}

		// Update Assets table
		var asset db.Asset
		if err := db.DB.Where("hostname = ?", data.Hardware.Hostname).First(&asset).Error; err != nil {
			asset = db.Asset{
				ID:       uuid.New(),
				Hostname: data.Hardware.Hostname,
			}
			db.DB.Create(&asset)
		}

		// Look up device ID if available
		var device db.Device
		var deviceIDPtr *string
		if err := db.DB.Where("device_name = ?", data.Hardware.Hostname).First(&device).Error; err == nil {
			deviceIDPtr = &device.ID
		}

		osTitle := data.Hardware.OS
		if strings.ToLower(osTitle) == "windows" {
			osTitle = "Windows 11 Professional"
		}
		operatingSystem := osTitle
		if data.Hardware.OSVersion != "" && !strings.Contains(strings.ToLower(data.Hardware.OSVersion), "unknown") {
			operatingSystem = osTitle + " (Build " + data.Hardware.OSVersion + ")"
		}

		db.DB.Model(&asset).Updates(map[string]interface{}{
			"device_id":        deviceIDPtr,
			"cpu_model":        data.Hardware.CPU,
			"cpu_cores":        data.Hardware.Cores,
			"ram_total_gb":     data.Hardware.RAM,
			"os_name":          data.Hardware.OS,
			"os_version":       data.Hardware.OSVersion,
			"operating_system": operatingSystem,
			"serial_number":    data.Hardware.Serial,
			"ip_address":       data.Hardware.IPAddress,
			"mac_address":      data.Hardware.MACAddress,
			"dns_servers":      data.Hardware.DNSServers,
			"ip_lan":           data.Hardware.IPLan,
			"ip_wifi":          data.Hardware.IPWifi,
			"manufacturer":     data.Hardware.Manufacturer,
			"model":            data.Hardware.Model,
		})

		// Clean and insert Software
		db.DB.Where("asset_id = ?", asset.ID).Delete(&db.SoftwareInventory{})
		for _, s := range data.Software {
			db.DB.Create(&db.SoftwareInventory{
				AssetID: asset.ID,
				Name:    s.Name,
				Version: s.Version,
			})
		}

		// Clean and insert USB Devices
		db.DB.Where("asset_id = ?", asset.ID).Delete(&db.USBInventory{})
		for _, u := range data.USBDevices {
			if u.Name != "" {
				db.DB.Create(&db.USBInventory{
					AssetID:      asset.ID,
					Name:         u.Name,
					DeviceID:     u.DeviceID,
					VendorID:     u.VendorID,
					ProductID:    u.ProductID,
					SerialNumber: u.SerialNumber,
					Class:        u.Class,
					Status:       u.Status,
				})
			}
		}

		log.Printf("Inventory updated for: %s (%d apps, %d USB devices)", data.Hardware.Hostname, len(data.Software), len(data.USBDevices))
	})

	// Start background status checker
	StartStatusChecker()
}

// StartStatusChecker periodically checks for stale agents and updates their status
func StartStatusChecker() {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		for range ticker.C {
			now := time.Now()
			threshold := now.Add(-45 * time.Second)

			// 1. Mark workstations as inactive if they haven't sent telemetry in 45s
			var inactiveCount int64
			db.DB.Model(&db.Device{}).
				Where("device_type = ? AND status = ? AND last_seen < ?", "workstation", "active", threshold).
				Count(&inactiveCount)
			if inactiveCount > 0 {
				db.DB.Model(&db.Device{}).
					Where("device_type = ? AND status = ? AND last_seen < ?", "workstation", "active", threshold).
					Updates(map[string]interface{}{
						"status": "inactive",
					})
				log.Printf("StatusChecker: Marked %d workstations as inactive", inactiveCount)
			}

			// 2. Mark agent registries as offline if they haven't been seen in 45s
			var offlineCount int64
			db.DB.Model(&db.AgentRegistry{}).
				Where("status = ? AND last_seen < ?", "online", threshold).
				Count(&offlineCount)
			if offlineCount > 0 {
				db.DB.Model(&db.AgentRegistry{}).
					Where("status = ? AND last_seen < ?", "online", threshold).
					Updates(map[string]interface{}{
						"status": "offline",
					})
				log.Printf("StatusChecker: Marked %d agent registries as offline", offlineCount)
			}
		}
	}()
}
