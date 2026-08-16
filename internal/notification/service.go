package notification

import (
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
)

// NotificationService handles notifications
type NotificationService struct{}

// NotificationType represents notification type
type NotificationType string

const (
	TypeTicketCreated  NotificationType = "ticket_created"
	TypeTicketAssigned NotificationType = "ticket_assigned"
	TypeTicketResolved NotificationType = "ticket_resolved"
	TypeAlertCritical  NotificationType = "alert_critical"
	TypeCommentAdded   NotificationType = "comment_added"
	TypeEscalation     NotificationType = "escalation"
)

// CreateNotification creates a new notification
func (ns *NotificationService) CreateNotification(
	userID string,
	title string,
	message string,
	notificationType NotificationType,
	resourceType string,
	resourceID *string,
) (*db.Notification, error) {
	notification := &db.Notification{
		ID:               uuid.New().String(),
		UserID:           userID,
		Title:            title,
		Message:          message,
		NotificationType: string(notificationType),
		ResourceType:     resourceType,
		ResourceID:       resourceID,
		IsRead:           false,
		CreatedAt:        time.Now(),
	}

	result := db.DB.Create(notification)
	if result.Error != nil {
		log.Println("Error creating notification:", result.Error)
		return nil, result.Error
	}

	return notification, nil
}

// GetUnreadNotifications gets unread notifications for a user
func (ns *NotificationService) GetUnreadNotifications(userID string) ([]db.Notification, error) {
	var notifications []db.Notification
	result := db.DB.
		Where("user_id = ? AND is_read = false", userID).
		Order("created_at DESC").
		Find(&notifications)

	return notifications, result.Error
}

// MarkAsRead marks a notification as read
func (ns *NotificationService) MarkAsRead(notificationID string) error {
	return db.DB.Model(&db.Notification{}).
		Where("id = ?", notificationID).
		Updates(map[string]interface{}{
			"is_read": true,
			"read_at": time.Now(),
		}).Error
}

// MarkAllAsRead marks all notifications as read for a user
func (ns *NotificationService) MarkAllAsRead(userID string) error {
	return db.DB.Model(&db.Notification{}).
		Where("user_id = ?", userID).
		Updates(map[string]interface{}{
			"is_read": true,
			"read_at": time.Now(),
		}).Error
}

// DeleteNotification deletes a notification
func (ns *NotificationService) DeleteNotification(notificationID string) error {
	return db.DB.Delete(&db.Notification{}, "id = ?", notificationID).Error
}

// NotifyTicketCreated notifies relevant users when ticket is created
func (ns *NotificationService) NotifyTicketCreated(ticketID string, ticketNo string, createdBy string) error {
	var staff []db.User

	if err := db.DB.Where("role IN ?", []string{"admin", "technician"}).Find(&staff).Error; err != nil {
		return err
	}

	for _, member := range staff {
		_, err := ns.CreateNotification(
			member.ID,
			"New Ticket Created",
			"Ticket "+ticketNo+" has been created",
			TypeTicketCreated,
			"ticket",
			&ticketID,
		)

		if err != nil {
			log.Printf("failed to create notification for staff %s: %v", member.ID, err)
		}
	}

	return nil
}

// NotifyTicketAssigned notifies technician when ticket is assigned
func (ns *NotificationService) NotifyTicketAssigned(ticketID string, ticketNo string, technicianID string) error {
	_, err := ns.CreateNotification(
		technicianID,
		"Ticket Assigned",
		"Ticket "+ticketNo+" has been assigned to you",
		TypeTicketAssigned,
		"ticket",
		&ticketID,
	)

	return err
}

// NotifyTicketResolved notifies creator when ticket is resolved
func (ns *NotificationService) NotifyTicketResolved(ticketID string, ticketNo string, createdBy string) error {
	_, err := ns.CreateNotification(
		createdBy,
		"Ticket Resolved",
		"Your ticket "+ticketNo+" has been resolved",
		TypeTicketResolved,
		"ticket",
		&ticketID,
	)

	return err
}

// NotifyCriticalAlert notifies admins of critical alerts
func (ns *NotificationService) NotifyCriticalAlert(alertID string, message string) error {
	var admins []db.User

	if err := db.DB.Where("role = ?", "admin").Find(&admins).Error; err != nil {
		return err
	}

	for _, admin := range admins {
		_, err := ns.CreateNotification(
			admin.ID,
			"Critical Alert",
			message,
			TypeAlertCritical,
			"alert",
			&alertID,
		)

		if err != nil {
			log.Printf("failed to create critical alert notification for admin %s: %v", admin.ID, err)
		}
	}

	return nil
}

// NotifyCommentAdded notifies relevant users when a comment/reply is added to a ticket
func (ns *NotificationService) NotifyCommentAdded(ticketID string, ticketNo string, commentAuthorID string, commentText string, isInternal bool) error {
	// 1. Fetch the ticket to see who is the creator and assignee
	var ticket db.Ticket
	if err := db.DB.First(&ticket, "id = ?", ticketID).Error; err != nil {
		return err
	}

	// 2. Fetch the author's name/username
	var author db.User
	authorName := "User"
	if err := db.DB.First(&author, "id = ?", commentAuthorID).Error; err == nil {
		authorName = author.Name
		if authorName == "" {
			authorName = author.Username
		}
	}

	// Truncate comment text for the notification preview
	preview := commentText
	if len(preview) > 60 {
		preview = preview[:57] + "..."
	}

	// 3. Determine recipients
	recipients := make(map[string]bool) // userID -> shouldNotify

	// If the author is the customer (ticket.CreatedBy)
	if commentAuthorID == ticket.CreatedBy {
		// Notify the assigned technician
		if ticket.AssignedTo != nil && *ticket.AssignedTo != "" {
			recipients[*ticket.AssignedTo] = true
		}
		// Also notify all admins and technicians
		var staff []db.User
		if err := db.DB.Where("role IN ?", []string{"admin", "technician"}).Find(&staff).Error; err == nil {
			for _, member := range staff {
				if member.ID != commentAuthorID {
					recipients[member.ID] = true
				}
			}
		}
	} else {
		// The author is a technician/admin
		// If it is NOT an internal note, notify the customer (creator)
		if !isInternal && ticket.CreatedBy != "" {
			recipients[ticket.CreatedBy] = true
		}
		// Also notify the assignee (if they are not the author)
		if ticket.AssignedTo != nil && *ticket.AssignedTo != "" && *ticket.AssignedTo != commentAuthorID {
			recipients[*ticket.AssignedTo] = true
		}
		// Notify all admins and technicians (except the author)
		var staff []db.User
		if err := db.DB.Where("role IN ?", []string{"admin", "technician"}).Find(&staff).Error; err == nil {
			for _, member := range staff {
				if member.ID != commentAuthorID {
					recipients[member.ID] = true
				}
			}
		}
	}

	// 4. Create the notifications
	title := "Komentar Baru: " + ticketNo
	msg := fmt.Sprintf("%s: %s", authorName, preview)
	if isInternal {
		title = "Catatan Internal Baru: " + ticketNo
	}

	for rID := range recipients {
		_, err := ns.CreateNotification(
			rID,
			title,
			msg,
			TypeCommentAdded,
			"ticket",
			&ticketID,
		)
		if err != nil {
			log.Printf("failed to create comment notification for user %s: %v", rID, err)
		}
	}

	return nil
}
