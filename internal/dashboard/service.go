package dashboard

import (
	"strings"
	"time"

	"github.com/helpdesk-ai/core/internal/db"
)

type TicketAgeSummary struct {
	TotalOpen         int64   `json:"total_open"`
	AverageOpenHours  float64 `json:"average_open_hours"`
	OverdueCount      int64   `json:"overdue_count"`
	SlaDueSoonCount   int64   `json:"sla_due_soon_count"`
	AssignedOpenCount int64   `json:"assigned_open_count"`
	StaleOpenCount    int64   `json:"stale_open_count"`
	CsatScore         float64 `json:"csat_score"`
}

type DeviceHealthSummary struct {
	TotalDevices   int64 `json:"total_devices"`
	ActiveDevices  int64 `json:"active_devices"`
	OfflineDevices int64 `json:"offline_devices"`
	StaleDevices   int64 `json:"stale_devices"`
	CriticalAlerts int64 `json:"critical_alerts"`
}

type TechnicianWorkloadEntry struct {
	TechnicianID    string `json:"technician_id"`
	TechnicianName  string `json:"technician_name"`
	Status          string `json:"status"`
	AssignedTickets int64  `json:"assigned_tickets"`
}

type SeverityTrend struct {
	Severity string `json:"severity"`
	Count    int64  `json:"count"`
}

type TicketCategoryTrend struct {
	Category string `json:"category"`
	Count    int64  `json:"count"`
}

type TrendAnalytics struct {
	SeverityTrends []SeverityTrend       `json:"severity_trends"`
	CategoryTrends []TicketCategoryTrend `json:"category_trends"`
}

type SLAPerformanceSummary struct {
	SlaMetPercentage float64 `json:"sla_met_percentage"`
	SlaHealthyCount  int64   `json:"sla_healthy_count"`
	SlaWarningCount  int64   `json:"sla_warning_count"`
	SlaBreachCount   int64   `json:"sla_breach_count"`
	AverageResponse  float64 `json:"average_response_minutes"` // in minutes
	ReopenRate       float64 `json:"reopen_rate"`              // percentage
}

type DashboardSummary struct {
	CriticalAlerts     int64                     `json:"critical_alerts"`
	TicketAge          TicketAgeSummary          `json:"ticket_age"`
	DeviceHealth       DeviceHealthSummary       `json:"device_health"`
	TechnicianWorkload []TechnicianWorkloadEntry `json:"technician_workload"`
	SLAPerformance     SLAPerformanceSummary     `json:"sla_performance"`
}

func classifyTicketCategory(title string) string {
	lower := strings.ToLower(title)
	switch {
	case strings.Contains(lower, "password") || strings.Contains(lower, "reset"):
		return "Reset Password"
	case strings.Contains(lower, "vpn"):
		return "VPN Error"
	case strings.Contains(lower, "printer"):
		return "Printer"
	case strings.Contains(lower, "email"):
		return "Email"
	case strings.Contains(lower, "network") || strings.Contains(lower, "internet"):
		return "Network"
	case strings.Contains(lower, "server") || strings.Contains(lower, "database") || strings.Contains(lower, "db"):
		return "Server / Database"
	case strings.Contains(lower, "login") || strings.Contains(lower, "masuk"):
		return "Login"
	default:
		return "Other"
	}
}

func GetTrendAnalytics() (*TrendAnalytics, error) {
	var tickets []db.Ticket
	if err := db.DB.Find(&tickets).Error; err != nil {
		return nil, err
	}

	severityCounts := make(map[string]int64)
	categoryCounts := make(map[string]int64)

	for _, ticket := range tickets {
		severity := ticket.Severity
		if severity == "" {
			severity = "unknown"
		}
		severityCounts[severity]++
		categoryCounts[classifyTicketCategory(ticket.Title)]++
	}

	severityTrends := make([]SeverityTrend, 0, len(severityCounts))
	for severity, count := range severityCounts {
		severityTrends = append(severityTrends, SeverityTrend{Severity: severity, Count: count})
	}

	categoryTrends := make([]TicketCategoryTrend, 0, len(categoryCounts))
	for category, count := range categoryCounts {
		categoryTrends = append(categoryTrends, TicketCategoryTrend{Category: category, Count: count})
	}

	return &TrendAnalytics{
		SeverityTrends: severityTrends,
		CategoryTrends: categoryTrends,
	}, nil
}

func GetDashboardSummary() (*DashboardSummary, error) {
	now := time.Now()
	openStatuses := []string{"open", "assigned", "in_progress"}

	var totalOpen int64
	if err := db.DB.Model(&db.Ticket{}).
		Where("status IN ?", openStatuses).
		Count(&totalOpen).Error; err != nil {
		return nil, err
	}

	var averageSeconds float64
	if err := db.DB.Model(&db.Ticket{}).
		Select("COALESCE(AVG(EXTRACT(EPOCH FROM now() - created_at)), 0) as average").
		Where("status IN ?", openStatuses).
		Scan(&averageSeconds).Error; err != nil {
		return nil, err
	}

	var overdueCount int64
	if err := db.DB.Model(&db.Ticket{}).
		Where("status IN ?", openStatuses).
		Where("sla_due IS NOT NULL AND sla_due < ?", now).
		Count(&overdueCount).Error; err != nil {
		return nil, err
	}

	var staleOpenCount int64
	if err := db.DB.Model(&db.Ticket{}).
		Where("status IN ?", openStatuses).
		Where("created_at < ?", now.Add(-72*time.Hour)).
		Count(&staleOpenCount).Error; err != nil {
		return nil, err
	}

	var assignedOpenCount int64
	if err := db.DB.Model(&db.Ticket{}).
		Where("status IN ?", openStatuses).
		Where("assigned_to IS NOT NULL").
		Count(&assignedOpenCount).Error; err != nil {
		return nil, err
	}

	var slaDueSoonCount int64
	if err := db.DB.Model(&db.Ticket{}).
		Where("status IN ?", openStatuses).
		Where("sla_due IS NOT NULL AND sla_due >= ? AND sla_due <= ?", now, now.Add(24*time.Hour)).
		Count(&slaDueSoonCount).Error; err != nil {
		return nil, err
	}

	var totalDevices int64
	if err := db.DB.Model(&db.Device{}).Count(&totalDevices).Error; err != nil {
		return nil, err
	}

	var activeDevices int64
	if err := db.DB.Model(&db.Device{}).
		Where("status = ?", "active").
		Count(&activeDevices).Error; err != nil {
		return nil, err
	}

	var offlineDevices int64
	if err := db.DB.Model(&db.Device{}).
		Where("status != ?", "active").
		Count(&offlineDevices).Error; err != nil {
		return nil, err
	}

	var staleDevices int64
	if err := db.DB.Model(&db.Device{}).
		Where("last_seen IS NULL OR last_seen < ?", now.Add(-1*time.Hour)).
		Count(&staleDevices).Error; err != nil {
		return nil, err
	}

	type ticketCountRow struct {
		AssignedTo string
		Count      int64
	}
	var ticketCounts []ticketCountRow
	if err := db.DB.Model(&db.Ticket{}).
		Select("assigned_to, COUNT(*) as count").
		Where("assigned_to IS NOT NULL").
		Where("status IN ?", openStatuses).
		Group("assigned_to").
		Scan(&ticketCounts).Error; err != nil {
		return nil, err
	}

	assignedMap := make(map[string]int64)
	for _, row := range ticketCounts {
		assignedMap[row.AssignedTo] = row.Count
	}

	var technicians []db.User
	if err := db.DB.Where("role = ?", "technician").Find(&technicians).Error; err != nil {
		return nil, err
	}

	var presences []db.TechnicianPresence
	if err := db.DB.Find(&presences).Error; err != nil {
		return nil, err
	}

	statusMap := make(map[string]string)
	for _, presence := range presences {
		statusMap[presence.TechnicianID] = presence.Status
	}

	workload := make([]TechnicianWorkloadEntry, 0, len(technicians))
	for _, technician := range technicians {
		workload = append(workload, TechnicianWorkloadEntry{
			TechnicianID:    technician.ID,
			TechnicianName:  technician.Name,
			Status:          statusMap[technician.ID],
			AssignedTickets: assignedMap[technician.ID],
		})
	}

	var resolvedCount int64
	db.DB.Model(&db.Ticket{}).Where("status IN ?", []string{"resolved", "closed"}).Count(&resolvedCount)

	csatScore := 100.0
	totalForCsat := resolvedCount + overdueCount
	if totalForCsat > 0 {
		csatScore = (float64(resolvedCount) / float64(totalForCsat)) * 100.0
	} else if totalOpen > 0 {
		csatScore = 95.0 // Just a baseline if no resolved tickets yet but there are open tickets
	}

	// Dynamic SLA calculations
	var allTickets []db.Ticket
	if err := db.DB.Find(&allTickets).Error; err != nil {
		return nil, err
	}

	var slaHealthyCount int64
	var slaWarningCount int64
	var slaBreachCount int64
	var responseTimes []float64

	for _, ticket := range allTickets {
		respTime := 0.0
		var comments []db.TicketComment
		db.DB.Where("ticket_id = ? AND user_id != ?", ticket.ID, ticket.CreatedBy).Order("created_at asc").Limit(1).Find(&comments)
		if len(comments) > 0 {
			respTime = comments[0].CreatedAt.Sub(ticket.CreatedAt).Minutes()
		} else if ticket.ResolvedAt != nil {
			respTime = ticket.ResolvedAt.Sub(ticket.CreatedAt).Minutes()
		} else if ticket.AssignedTo != nil {
			respTime = ticket.UpdatedAt.Sub(ticket.CreatedAt).Minutes()
		}
		if respTime > 0 {
			responseTimes = append(responseTimes, respTime)
		}

		if ticket.SLADue == nil {
			slaHealthyCount++
			continue
		}

		if ticket.ResolvedAt != nil {
			if ticket.ResolvedAt.Before(*ticket.SLADue) {
				slaHealthyCount++
			} else {
				slaBreachCount++
			}
		} else {
			if time.Now().After(*ticket.SLADue) {
				slaBreachCount++
			} else if time.Until(*ticket.SLADue) < 4*time.Hour {
				slaWarningCount++
			} else {
				slaHealthyCount++
			}
		}
	}

	averageResponse := 0.0
	if len(responseTimes) > 0 {
		sum := 0.0
		for _, rt := range responseTimes {
			sum += rt
		}
		averageResponse = sum / float64(len(responseTimes))
	}

	var totalTickets int64
	db.DB.Model(&db.Ticket{}).Count(&totalTickets)

	var reopenCount int64
	db.DB.Model(&db.AuditLog{}).Where("action = ? AND resource_type = ?", "reopen", "ticket").Count(&reopenCount)

	reopenRate := 0.0
	if totalTickets > 0 {
		reopenRate = (float64(reopenCount) / float64(totalTickets)) * 100.0
	}

	var activeAlertsCount int64
	db.DB.Model(&db.Alert{}).Where("status = ?", "active").Count(&activeAlertsCount)

	slaMetPercentage := 100.0
	totalSLAEvaluated := slaHealthyCount + slaBreachCount
	if totalSLAEvaluated > 0 {
		slaMetPercentage = (float64(slaHealthyCount) / float64(totalSLAEvaluated)) * 100.0
	}

	return &DashboardSummary{
		CriticalAlerts: activeAlertsCount,
		TicketAge: TicketAgeSummary{
			TotalOpen:         totalOpen,
			AverageOpenHours:  averageSeconds / 3600,
			OverdueCount:      overdueCount,
			SlaDueSoonCount:   slaDueSoonCount,
			AssignedOpenCount: assignedOpenCount,
			StaleOpenCount:    staleOpenCount,
			CsatScore:         csatScore,
		},
		DeviceHealth: DeviceHealthSummary{
			TotalDevices:   totalDevices,
			ActiveDevices:  activeDevices,
			OfflineDevices: offlineDevices,
			StaleDevices:   staleDevices,
			CriticalAlerts: activeAlertsCount,
		},
		TechnicianWorkload: workload,
		SLAPerformance: SLAPerformanceSummary{
			SlaMetPercentage: slaMetPercentage,
			SlaHealthyCount:  slaHealthyCount,
			SlaWarningCount:  slaWarningCount,
			SlaBreachCount:   slaBreachCount,
			AverageResponse:  averageResponse,
			ReopenRate:       reopenRate,
		},
	}, nil
}
