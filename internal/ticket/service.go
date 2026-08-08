package ticket

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
)

// CreateTicketRequest represents a ticket creation request
type CreateTicketRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Severity    string `json:"severity" binding:"required"`
	Category    string `json:"category"`
	SubCategory string `json:"sub_category"`
	Device      string `json:"device"`
	Department  string `json:"department"`
}

// UpdateTicketRequest represents a ticket update request
type UpdateTicketRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Severity    string `json:"severity"`
	Status      string `json:"status"`
}

// CreateTicket creates a new ticket
func CreateTicket(title, description, severity, createdBy string) (*db.Ticket, error) {
	slaDue := CalculateSLA(severity)
	ticket := &db.Ticket{
		ID:          uuid.New().String(),
		TicketNo:    generateTicketNumber(),
		Title:       title,
		Description: description,
		Severity:    severity,
		Status:      "created",
		CreatedBy:   createdBy,
		SLADue:      &slaDue,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	result := db.DB.Create(ticket)
	if result.Error != nil {
		log.Println("Error creating ticket:", result.Error)
		return nil, result.Error
	}

	return ticket, nil
}

// GetTicket retrieves a ticket by ID
func GetTicket(id string) (*db.Ticket, error) {
	var ticket db.Ticket
	result := db.DB.Preload("Creator").Preload("Assignee").Preload("Comments").Preload("Comments.User").Preload("Attachments").
		First(&ticket, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &ticket, nil
}

// ListTickets retrieves all tickets with pagination
func ListTickets(page, pageSize int, filters map[string]interface{}) ([]db.Ticket, int64, error) {
	var tickets []db.Ticket
	var total int64

	query := db.DB.Preload("Creator").Preload("Assignee")

	// Apply filters
	if status, ok := filters["status"].(string); ok && status != "" {
		switch status {
		case "open":
			query = query.Where("status IN ?", []string{"created", "open", "assigned", "in_progress"})
		case "need_approval":
			query = query.Where("status IN ?", []string{"need_approval", "pending"})
		default:
			query = query.Where("status = ?", status)
		}
	}
	if severity, ok := filters["severity"].(string); ok && severity != "" {
		if severity == "critical" {
			query = query.Where("severity IN ?", []string{"critical", "p1_emergency"})
		} else {
			query = query.Where("severity = ?", severity)
		}
	}
	if assignedTo, ok := filters["assigned_to"]; ok {
		query = query.Where("assigned_to = ?", assignedTo)
	}
	if overdue, ok := filters["overdue"]; ok {
		if isOverdue, ok := overdue.(bool); ok && isOverdue {
			now := time.Now()
			query = query.Where("status NOT IN ?", []string{"resolved", "closed", "spam", "archived"}).
				Where("sla_due IS NOT NULL AND sla_due < ?", now)
		} else if isOverdueStr, ok := overdue.(string); ok && (isOverdueStr == "true" || isOverdueStr == "1") {
			now := time.Now()
			query = query.Where("status NOT IN ?", []string{"resolved", "closed", "spam", "archived"}).
				Where("sla_due IS NOT NULL AND sla_due < ?", now)
		}
	}
	if search, ok := filters["search"].(string); ok && search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		query = query.Where("LOWER(ticket_no) LIKE ? OR LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(device) LIKE ?", 
			searchPattern, searchPattern, searchPattern, searchPattern)
	}
	if view, ok := filters["view"]; ok {
		if currentUserID, ok := filters["current_user_id"].(string); ok {
			switch view {
			case "my":
				query = query.Where("created_by = ?", currentUserID)
			case "assigned":
				query = query.Where("assigned_to = ? AND status NOT IN ?", currentUserID, []string{"resolved", "closed", "spam", "archived"})
			case "open":
				query = query.Where("status IN ?", []string{"created", "open", "assigned", "in_progress"})
			case "pending":
				query = query.Where("status IN ?", []string{"need_approval", "pending"})
			case "waiting-customer":
				query = query.Where("status = ?", "waiting_customer")
			case "waiting-vendor":
				query = query.Where("status = ?", "waiting_vendor")
			case "escalated":
				query = query.Where("status = ?", "escalated")
			case "critical":
				query = query.Where("severity IN ?", []string{"critical", "p1_emergency"})
			case "resolved":
				query = query.Where("status = ?", "resolved")
			case "closed":
				query = query.Where("status = ?", "closed")
			case "spam":
				query = query.Where("status = ?", "spam")
			case "archive":
				query = query.Where("status = ?", "archived")
			}
		}
	}

	// Get total count
	query.Model(&db.Ticket{}).Count(&total)

	// Paginate
	offset := (page - 1) * pageSize
	result := query.Offset(offset).Limit(pageSize).Find(&tickets)
	if result.Error != nil {
		return nil, 0, result.Error
	}

	return tickets, total, nil
}

// CountTickets counts tickets for a given filter set
func CountTickets(filters map[string]interface{}) (int64, error) {
	var total int64
	query := db.DB.Model(&db.Ticket{})

	if status, ok := filters["status"]; ok {
		query = query.Where("status = ?", status)
	}
	if severity, ok := filters["severity"]; ok {
		query = query.Where("severity = ?", severity)
	}
	if assignedTo, ok := filters["assigned_to"]; ok {
		query = query.Where("assigned_to = ?", assignedTo)
	}

	if err := query.Count(&total).Error; err != nil {
		return 0, err
	}

	return total, nil
}

// ListRecentTickets returns the most recent tickets limited by count
func ListRecentTickets(limit int) ([]db.Ticket, error) {
	var tickets []db.Ticket
	result := db.DB.Preload("Creator").Preload("Assignee").
		Order("created_at DESC").
		Limit(limit).
		Find(&tickets)
	if result.Error != nil {
		return nil, result.Error
	}

	return tickets, nil
}

// UpdateTicket updates a ticket
func UpdateTicket(id string, updates map[string]interface{}) (*db.Ticket, error) {
	result := db.DB.Model(&db.Ticket{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		log.Println("Error updating ticket:", result.Error)
		return nil, result.Error
	}

	return GetTicket(id)
}

// AssignTicket assigns a ticket to a technician or admin
func AssignTicket(ticketID, technicianID string) (*db.Ticket, error) {
	// Check if technician or admin exists
	var technician db.User
	result := db.DB.First(&technician, "id = ? AND (role = ? OR role = ?)", technicianID, "technician", "admin")
	if result.Error != nil {
		return nil, errors.New("technician or admin not found")
	}

	// Update ticket
	updates := map[string]interface{}{
		"assigned_to": technicianID,
		"status":      "assigned",
		"updated_at":  time.Now(),
	}

	return UpdateTicket(ticketID, updates)
}

// ResolveTicket marks a ticket as resolved
func ResolveTicket(ticketID, resolution string) (*db.Ticket, error) {
	now := time.Now()
	updates := map[string]interface{}{
		"status":      "resolved",
		"resolution":  resolution,
		"resolved_at": now,
		"updated_at":  now,
	}

	return UpdateTicket(ticketID, updates)
}

// CloseTicket closes a ticket
func CloseTicket(ticketID string) (*db.Ticket, error) {
	now := time.Now()
	updates := map[string]interface{}{
		"status":     "closed",
		"closed_at":  now,
		"updated_at": now,
	}

	return UpdateTicket(ticketID, updates)
}

// AddComment adds a comment to a ticket
func AddComment(ticketID, userID, comment string, isInternal bool) (*db.TicketComment, error) {
	ticketComment := &db.TicketComment{
		ID:         uuid.New().String(),
		TicketID:   ticketID,
		UserID:     userID,
		Comment:    comment,
		IsInternal: isInternal,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	result := db.DB.Create(ticketComment)
	if result.Error != nil {
		return nil, result.Error
	}

	return ticketComment, nil
}

// generateTicketNumber generates a unique ticket number under 20 characters
func generateTicketNumber() string {
	// Format: TKT-[10 digit timestamp]-[4 chars UUID] (e.g. TKT-1718880000-abcd)
	// Total length: 4 + 10 + 1 + 4 = 19 characters. Safe for VARCHAR(20).
	return fmt.Sprintf("TKT-%d-%s", time.Now().Unix(), uuid.New().String()[:4])
}

// CalculateSLA calculates the SLA due time based on severity
func CalculateSLA(severity string) time.Time {
	slaHours := map[string]int{
		"low":          72,
		"medium":       48,
		"high":         24,
		"critical":     8,
		"p1_emergency": 1,
	}

	hours := slaHours[severity]
	if hours == 0 {
		hours = 48 // default to medium
	}

	return time.Now().Add(time.Duration(hours) * time.Hour)
}

// ProposeAction suggests an automated action for a ticket and sets status to need_approval
func ProposeAction(ticketID, actionType, target, command string) (*db.TicketAction, error) {
	action := &db.TicketAction{
		ID:         uuid.New().String(),
		TicketID:   ticketID,
		ActionType: actionType,
		Target:     target,
		Command:    command,
		Status:     "proposed",
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := db.DB.Create(action).Error; err != nil {
		return nil, err
	}

	// Insert corresponding approval request
	ticketUUID, _ := uuid.Parse(ticketID)
	actionUUID, _ := uuid.Parse(action.ID)
	var adminUser db.User
	db.DB.Where("role = ? OR username = ?", "admin", "admin").First(&adminUser)
	adminUUID, _ := uuid.Parse(adminUser.ID)

	approval := &db.Approval{
		ID:          uuid.New(),
		TicketID:    ticketUUID,
		JobID:       actionUUID,
		RequestedBy: adminUUID,
		Status:      "pending",
		Reason:      fmt.Sprintf("%s (%s)", actionType, command),
		CreatedAt:   time.Now(),
	}
	if err := db.DB.Create(approval).Error; err != nil {
		log.Printf("Warning: failed to create approval entry: %v", err)
	}

	// Update ticket status to need_approval
	UpdateTicket(ticketID, map[string]interface{}{
		"status": "need_approval",
	})

	return action, nil
}

// ApproveAction approves a proposed action
func ApproveAction(actionID, approvedBy string) (*db.TicketAction, error) {
	var action db.TicketAction
	if err := db.DB.First(&action, "id = ?", actionID).Error; err != nil {
		return nil, err
	}

	updates := map[string]interface{}{
		"status":      "approved",
		"approved_by": approvedBy,
		"updated_at":  time.Now(),
	}

	if err := db.DB.Model(&action).Updates(updates).Error; err != nil {
		return nil, err
	}

	// Automatically update corresponding ticket status to resolved
	now := time.Now()
	UpdateTicket(action.TicketID, map[string]interface{}{
		"status":      "resolved",
		"resolved_at": &now,
	})

	log.Printf("Action %s approved by %s, ticket %s marked as resolved", actionID, approvedBy, action.TicketID)

	return &action, nil
}
