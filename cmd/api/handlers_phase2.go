package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/cmdb"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/monitoring"
	"github.com/helpdesk-ai/core/internal/sre"
)

// === Website Monitors Handlers ===

// handleListWebsiteMonitors - GET /website-monitors
func handleListWebsiteMonitors(c *gin.Context) {
	var monitors []db.WebsiteMonitor
	if err := db.DB.Order("created_at DESC").Find(&monitors).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type monitorWithStatus struct {
		db.WebsiteMonitor
		Available        bool       `json:"available"`
		ResponseTimeMs   int        `json:"response_time_ms"`
		TTFBMs           int        `json:"ttfb_ms"`
		DNSMs            int        `json:"dns_ms"`
		TLSMs            int        `json:"tls_ms"`
		StatusCode       int        `json:"status_code"`
		SSLDaysRemaining int        `json:"ssl_days_remaining"`
		PageSizeBytes    int        `json:"page_size_bytes"`
		CertIssuer       string     `json:"cert_issuer"`
		CertSubject      string     `json:"cert_subject"`
		CertValidTo      *time.Time `json:"cert_valid_to"`
		ErrorMessage     string     `json:"error_message"`
		UptimePercent    float64    `json:"uptime_percent"`
		LastChecked      *time.Time `json:"last_checked"`
	}

	var results []monitorWithStatus
	for _, m := range monitors {
		var metric db.WebsiteMonitorMetric
		ms := monitorWithStatus{WebsiteMonitor: m}

		if err := db.DB.Where("monitor_id = ?", m.ID).Order("timestamp DESC").First(&metric).Error; err == nil {
			ms.Available = metric.Available
			ms.ResponseTimeMs = metric.ResponseTimeMs
			ms.TTFBMs = metric.TTFBMs
			ms.DNSMs = metric.DNSMs
			ms.TLSMs = metric.TLSMs
			ms.StatusCode = metric.StatusCode
			ms.SSLDaysRemaining = metric.SSLDaysRemaining
			ms.PageSizeBytes = metric.PageSizeBytes
			ms.CertIssuer = metric.CertIssuer
			ms.CertSubject = metric.CertSubject
			ms.CertValidTo = metric.CertValidTo
			ms.ErrorMessage = metric.ErrorMessage
			ms.LastChecked = &metric.Timestamp
		}

		uptime, _, _ := monitoring.GetUptimeStats(m.ID, 24)
		ms.UptimePercent = uptime

		results = append(results, ms)
	}

	c.JSON(http.StatusOK, results)
}

// handleCreateWebsiteMonitor - POST /website-monitors
func handleCreateWebsiteMonitor(c *gin.Context) {
	var req struct {
		URL                string   `json:"url" binding:"required"`
		Name               string   `json:"name" binding:"required"`
		Description        string   `json:"description"`
		Tags               []string `json:"tags"`
		IntervalSeconds    int      `json:"interval_seconds"`
		TimeoutSeconds     int      `json:"timeout_seconds"`
		CheckType          string   `json:"check_type"`
		ExpectedStatusCode int      `json:"expected_status_code"`
		CheckSSL           bool     `json:"check_ssl"`
		FollowRedirects    bool     `json:"follow_redirects"`
		KeywordCheck       string   `json:"keyword_check"`
		Location           string   `json:"location"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.IntervalSeconds == 0 {
		req.IntervalSeconds = 60
	}
	if req.TimeoutSeconds == 0 {
		req.TimeoutSeconds = 15
	}
	if req.CheckType == "" {
		req.CheckType = "HTTPS"
	}
	if req.ExpectedStatusCode == 0 {
		req.ExpectedStatusCode = 200
	}
	if req.Location == "" {
		req.Location = "Jakarta"
	}

	userID, _ := c.Get("userID")
	createdBy, _ := userID.(string)

	m := db.WebsiteMonitor{
		ID:                 uuid.New().String(),
		URL:                req.URL,
		Name:               req.Name,
		Description:        req.Description,
		IntervalSeconds:    req.IntervalSeconds,
		TimeoutSeconds:     req.TimeoutSeconds,
		CheckType:          req.CheckType,
		ExpectedStatusCode: req.ExpectedStatusCode,
		CheckSSL:           req.CheckSSL,
		FollowRedirects:    req.FollowRedirects,
		KeywordCheck:       req.KeywordCheck,
		Location:           req.Location,
		CreatedBy:          createdBy,
		IsActive:           true,
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if len(req.Tags) > 0 {
		m.Tags = req.Tags
	}

	if err := db.DB.Create(&m).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Probe segera setelah dibuat
	go func() {
		_, _ = monitoring.ProbeNow(m.ID)
	}()

	c.JSON(http.StatusCreated, m)
}

// handleGetWebsiteMonitor - GET /website-monitors/:id
func handleGetWebsiteMonitor(c *gin.Context) {
	id := c.Param("id")
	var monitor db.WebsiteMonitor
	if err := db.DB.Where("id = ?", id).First(&monitor).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor tidak ditemukan"})
		return
	}

	// Attach latest metric
	var metric db.WebsiteMonitorMetric
	db.DB.Where("monitor_id = ?", id).Order("timestamp DESC").First(&metric)

	uptime24h, upChecks, downChecks := monitoring.GetUptimeStats(id, 24)
	uptime7d, _, _ := monitoring.GetUptimeStats(id, 168)
	uptime30d, _, _ := monitoring.GetUptimeStats(id, 720)

	c.JSON(http.StatusOK, gin.H{
		"monitor":     monitor,
		"last_metric": metric,
		"uptime": gin.H{
			"24h":        uptime24h,
			"7d":         uptime7d,
			"30d":        uptime30d,
			"up_checks":  upChecks,
			"down_checks": downChecks,
		},
	})
}

// handleUpdateWebsiteMonitor - PUT /website-monitors/:id
func handleUpdateWebsiteMonitor(c *gin.Context) {
	id := c.Param("id")
	var monitor db.WebsiteMonitor
	if err := db.DB.Where("id = ?", id).First(&monitor).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor tidak ditemukan"})
		return
	}

	var req struct {
		Name               string   `json:"name"`
		Description        string   `json:"description"`
		Tags               []string `json:"tags"`
		IntervalSeconds    int      `json:"interval_seconds"`
		TimeoutSeconds     int      `json:"timeout_seconds"`
		CheckType          string   `json:"check_type"`
		ExpectedStatusCode int      `json:"expected_status_code"`
		CheckSSL           *bool    `json:"check_ssl"`
		FollowRedirects    *bool    `json:"follow_redirects"`
		KeywordCheck       string   `json:"keyword_check"`
		Location           string   `json:"location"`
		IsActive           *bool    `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{"updated_at": time.Now()}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.IntervalSeconds > 0 {
		updates["interval_seconds"] = req.IntervalSeconds
	}
	if req.TimeoutSeconds > 0 {
		updates["timeout_seconds"] = req.TimeoutSeconds
	}
	if req.CheckType != "" {
		updates["check_type"] = req.CheckType
	}
	if req.ExpectedStatusCode > 0 {
		updates["expected_status_code"] = req.ExpectedStatusCode
	}
	if req.CheckSSL != nil {
		updates["check_ssl"] = *req.CheckSSL
	}
	if req.FollowRedirects != nil {
		updates["follow_redirects"] = *req.FollowRedirects
	}
	if req.KeywordCheck != "" {
		updates["keyword_check"] = req.KeywordCheck
	}
	if req.Location != "" {
		updates["location"] = req.Location
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if len(req.Tags) > 0 {
		updates["tags"] = req.Tags
	}

	if err := db.DB.Model(&monitor).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, monitor)
}

// handleDeleteWebsiteMonitor - DELETE /website-monitors/:id
func handleDeleteWebsiteMonitor(c *gin.Context) {
	id := c.Param("id")
	var monitor db.WebsiteMonitor
	if err := db.DB.Where("id = ?", id).First(&monitor).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor tidak ditemukan"})
		return
	}

	if err := db.DB.Delete(&monitor).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Monitor berhasil dihapus"})
}

// handleToggleWebsiteMonitor - POST /website-monitors/:id/toggle
func handleToggleWebsiteMonitor(c *gin.Context) {
	id := c.Param("id")
	var monitor db.WebsiteMonitor
	if err := db.DB.Where("id = ?", id).First(&monitor).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor tidak ditemukan"})
		return
	}

	newStatus := !monitor.IsActive
	if err := db.DB.Model(&monitor).Updates(map[string]interface{}{
		"is_active":  newStatus,
		"updated_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":        id,
		"is_active": newStatus,
		"message":   "Status monitor diperbarui",
	})
}

// handleProbeNow - POST /website-monitors/:id/probe
func handleProbeNow(c *gin.Context) {
	id := c.Param("id")
	res, err := monitoring.ProbeNow(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor tidak ditemukan: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"available":       res.Available,
		"response_time_ms": int(res.ResponseTime.Milliseconds()),
		"ttfb_ms":         int(res.TTFB.Milliseconds()),
		"dns_ms":          int(res.DNSTime.Milliseconds()),
		"connect_ms":      int(res.ConnectTime.Milliseconds()),
		"tls_ms":          int(res.TLSTime.Milliseconds()),
		"status_code":     res.StatusCode,
		"ssl_days":        res.SSLDaysRemaining,
		"page_size_bytes": res.PageSizeBytes,
		"redirect_count":  res.RedirectCount,
		"cert_issuer":     res.CertIssuer,
		"cert_subject":    res.CertSubject,
		"cert_valid_to":   res.CertValidTo,
		"keyword_found":   res.KeywordFound,
		"error_message":   res.ErrorMessage,
	})
}

// handleGetWebsiteMonitorMetrics - GET /website-monitors/:id/metrics
func handleGetWebsiteMonitorMetrics(c *gin.Context) {
	monitorID := c.Param("id")
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	limitStr := c.DefaultQuery("limit", "100")

	startTime := time.Now().Add(-24 * time.Hour)
	endTime := time.Now()

	if startTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			startTime = t
		}
	}
	if endTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			endTime = t
		}
	}

	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 1000 {
		limit = 100
	}

	var metrics []db.WebsiteMonitorMetric
	err := db.DB.Where("monitor_id = ? AND timestamp BETWEEN ? AND ?", monitorID, startTime, endTime).
		Order("timestamp ASC").
		Limit(limit).
		Find(&metrics).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, metrics)
}

// handleGetWebsiteMonitorSSL - GET /website-monitors/:id/ssl
func handleGetWebsiteMonitorSSL(c *gin.Context) {
	id := c.Param("id")
	var monitor db.WebsiteMonitor
	if err := db.DB.Where("id = ?", id).First(&monitor).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Monitor tidak ditemukan"})
		return
	}

	var metric db.WebsiteMonitorMetric
	if err := db.DB.Where("monitor_id = ?", id).Order("timestamp DESC").First(&metric).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "Belum ada data SSL"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"monitor_id":        id,
		"url":               monitor.URL,
		"name":              monitor.Name,
		"ssl_days_remaining": metric.SSLDaysRemaining,
		"cert_issuer":       metric.CertIssuer,
		"cert_subject":      metric.CertSubject,
		"cert_fingerprint":  metric.CertFingerprint,
		"cert_valid_from":   metric.CertValidFrom,
		"cert_valid_to":     metric.CertValidTo,
		"last_checked":      metric.Timestamp,
		"ssl_health": func() string {
			switch {
			case metric.SSLDaysRemaining < 0:
				return "unknown"
			case metric.SSLDaysRemaining <= 7:
				return "critical"
			case metric.SSLDaysRemaining <= 30:
				return "warning"
			default:
				return "healthy"
			}
		}(),
	})
}

// handleGetWebsiteMonitorUptime - GET /website-monitors/:id/uptime
func handleGetWebsiteMonitorUptime(c *gin.Context) {
	id := c.Param("id")

	uptime24h, up24, down24 := monitoring.GetUptimeStats(id, 24)
	uptime7d, up7, down7 := monitoring.GetUptimeStats(id, 168)
	uptime30d, up30, down30 := monitoring.GetUptimeStats(id, 720)

	c.JSON(http.StatusOK, gin.H{
		"monitor_id": id,
		"uptime": gin.H{
			"24h": gin.H{
				"percent":    uptime24h,
				"up_checks":  up24,
				"down_checks": down24,
			},
			"7d": gin.H{
				"percent":    uptime7d,
				"up_checks":  up7,
				"down_checks": down7,
			},
			"30d": gin.H{
				"percent":    uptime30d,
				"up_checks":  up30,
				"down_checks": down30,
			},
		},
	})
}

// handleListAllIncidents - GET /website-monitors/incidents
func handleListAllIncidents(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 {
		limit = 50
	}

	incidents, err := monitoring.ListIncidents("", limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, incidents)
}

// handleGetMonitorIncidents - GET /website-monitors/:id/incidents
func handleGetMonitorIncidents(c *gin.Context) {
	id := c.Param("id")
	limitStr := c.DefaultQuery("limit", "20")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 {
		limit = 20
	}

	incidents, err := monitoring.ListIncidents(id, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, incidents)
}

// handleResolveIncident - POST /website-monitors/incidents/:id/resolve
func handleResolveIncident(c *gin.Context) {
	id := c.Param("id")
	var incident db.WebsiteMonitorIncident
	if err := db.DB.Where("id = ?", id).First(&incident).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Insiden tidak ditemukan"})
		return
	}

	now := time.Now()
	duration := int(now.Sub(incident.StartedAt).Seconds())
	if err := db.DB.Model(&incident).Updates(map[string]interface{}{
		"status":           "resolved",
		"resolved_at":      now,
		"duration_seconds": duration,
		"updated_at":       now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Insiden berhasil diselesaikan", "id": id})
}

// handleDeleteAllIncidents - DELETE /website-monitors/incidents
func handleDeleteAllIncidents(c *gin.Context) {
	if err := db.DB.Exec("DELETE FROM website_monitor_incidents").Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Semua insiden berhasil dihapus"})
}

// === SRE / SLO Handlers ===

func handleGetSreDashboard(c *gin.Context) {
	var slos []db.SreSlo
	if err := db.DB.Find(&slos).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, slos)
}

func handleGetSreMetrics(c *gin.Context) {
	stats := sre.CalculateSreStats()
	c.JSON(http.StatusOK, stats)
}

// === CMDB Handlers ===

func handleGetCmdbTopology(c *gin.Context) {
	topology, err := cmdb.GetTopology()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, topology)
}

func handleGetCmdbImpactAnalysis(c *gin.Context) {
	ciID := c.Param("id")
	if ciID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CI ID is required"})
		return
	}

	results, err := cmdb.ResolveImpactChain(ciID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, results)
}
