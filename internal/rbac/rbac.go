package rbac

import (
	"log"
	"net/http"

	"github.com/casbin/casbin/v2"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"github.com/gin-gonic/gin"
	"github.com/helpdesk-ai/core/internal/db"
)

var enforcer *casbin.Enforcer

func InitRBAC() error {
	var err error

	adapter, err := gormadapter.NewAdapterByDB(db.DB)
	if err != nil {
		return err
	}

	enforcer, err = casbin.NewEnforcer(
		"internal/rbac/model.conf",
		adapter,
	)
	if err != nil {
		return err
	}

	if err := enforcer.LoadPolicy(); err != nil {
		return err
	}

	// Seed initial rules if empty
	if len(enforcer.GetPolicy()) == 0 {
		log.Println("Seeding initial Casbin policies to GORM DB...")
		initialPolicies := [][]string{
			{"admin", "ticket", "create"},
			{"admin", "ticket", "read"},
			{"admin", "ticket", "update"},
			{"admin", "ticket", "delete"},
			{"admin", "ticket", "assign"},
			{"admin", "ticket", "resolve"},
			{"admin", "device", "create"},
			{"admin", "device", "read"},
			{"admin", "device", "update"},
			{"admin", "device", "delete"},
			{"admin", "alert", "read"},
			{"admin", "user", "create"},
			{"admin", "user", "read"},
			{"admin", "user", "update"},
			{"admin", "user", "delete"},
			{"admin", "report", "read"},

			{"manager", "ticket", "read"},
			{"manager", "ticket", "update"},
			{"manager", "ticket", "delete"},
			{"manager", "device", "read"},
			{"manager", "alert", "read"},
			{"manager", "user", "read"},
			{"manager", "report", "read"},

			{"supervisor", "ticket", "read"},
			{"supervisor", "ticket", "update"},
			{"supervisor", "ticket", "assign"},
			{"supervisor", "device", "read"},
			{"supervisor", "alert", "read"},
			{"supervisor", "report", "read"},

			{"agent", "ticket", "create"},
			{"agent", "ticket", "read"},
			{"agent", "ticket", "update"},
			{"agent", "agent", "assign"},
			{"agent", "ticket", "resolve"},
			{"agent", "device", "read"},
			{"agent", "alert", "read"},
			{"agent", "knowledge", "read"},
			{"technician", "ticket", "create"},
			{"technician", "ticket", "read"},
			{"technician", "ticket", "update"},
			{"technician", "ticket", "assign"},
			{"technician", "ticket", "resolve"},
			{"technician", "device", "read"},
			{"technician", "alert", "read"},
			{"technician", "knowledge", "read"},

			{"user", "ticket", "create"},
			{"user", "ticket", "read"},
			{"user", "ticket", "update"},
			{"user", "knowledge", "read"},
		}
		for _, p := range initialPolicies {
			_, _ = enforcer.AddPolicy(p[0], p[1], p[2])
		}
		enforcer.AddGroupingPolicy("admin", "admin")
		enforcer.AddGroupingPolicy("manager", "manager")
		enforcer.AddGroupingPolicy("supervisor", "supervisor")
		enforcer.AddGroupingPolicy("agent", "agent")
		enforcer.AddGroupingPolicy("technician", "technician")
		enforcer.AddGroupingPolicy("user", "user")
		_ = enforcer.SavePolicy()
	}

	// Add missing policies for website monitors and CMDB if not already present
	policiesToCheck := [][]string{
		{"admin", "monitoring", "create"},
		{"admin", "monitoring", "read"},
		{"admin", "monitoring", "update"},
		{"admin", "monitoring", "delete"},
		{"admin", "cmdb", "create"},
		{"admin", "cmdb", "read"},
		{"admin", "cmdb", "update"},
		{"admin", "cmdb", "delete"},
		{"admin", "ticket", "resolve"},

		{"manager", "monitoring", "read"},
		{"manager", "cmdb", "read"},

		{"supervisor", "monitoring", "read"},
		{"supervisor", "cmdb", "read"},

		{"agent", "monitoring", "read"},
		{"agent", "cmdb", "read"},
		{"technician", "monitoring", "read"},
		{"technician", "cmdb", "read"},

		{"user", "monitoring", "read"},
		{"user", "cmdb", "read"},
	}
	for _, p := range policiesToCheck {
		hasPolicy := enforcer.HasPolicy(p[0], p[1], p[2])
		if !hasPolicy {
			_, _ = enforcer.AddPolicy(p[0], p[1], p[2])
		}
	}
	_ = enforcer.SavePolicy()

	return nil
}

// CheckPermission checks if a user has permission to perform an action on a resource
func CheckPermission(userID, action, resource string) bool {
	// Get user role
	var user db.User
	if db.DB.First(&user, "id = ?", userID).RowsAffected == 0 {
		return false
	}

	// Check permission
	result, err := enforcer.Enforce(user.Role, action, resource)
	if err != nil {
		log.Println("Error checking permission:", err)
		return false
	}

	return result
}

// GetUserPermissions returns all permissions for a user's role
func GetUserPermissions(userID string) ([][]string, error) {
	var user db.User
	if db.DB.First(&user, "id = ?", userID).RowsAffected == 0 {
		return nil, nil
	}

	permissions := enforcer.GetPermissionsForUser(user.Role)
	return permissions, nil
}

// HasRole checks if a user has a specific role
func HasRole(userID, role string) bool {
	var user db.User
	if db.DB.First(&user, "id = ?", userID).RowsAffected == 0 {
		return false
	}

	return user.Role == role
}

// Roles
const (
	RoleAdmin      = "admin"
	RoleTechnician = "technician"
	RoleUser       = "user"
)

// Actions
const (
	ActionCreate  = "create"
	ActionRead    = "read"
	ActionUpdate  = "update"
	ActionDelete  = "delete"
	ActionAssign  = "assign"
	ActionResolve = "resolve"
)

// Resources
const (
	ResourceTicket    = "ticket"
	ResourceDevice    = "device"
	ResourceAlert     = "alert"
	ResourceUser      = "user"
	ResourceReport    = "report"
	ResourceKnowledge = "knowledge"
)

// Authorize enforces RBAC and ABAC on the request
func Authorize(action, resource string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		userRole := c.GetString("user_role")
		if userID == "" || userRole == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		// 1. RBAC check via Casbin
		allowed, err := enforcer.Enforce(userRole, action, resource)
		if err != nil || !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "permission denied (RBAC)"})
			c.Abort()
			return
		}

		// 2. ABAC check for ticket resource
		if resource == ResourceTicket && (action == ActionRead || action == ActionUpdate || action == ActionDelete) {
			ticketID := c.Param("id")
			if ticketID != "" {
				var tkt db.Ticket
				if err := db.DB.First(&tkt, "id = ?", ticketID).Error; err == nil {
					// Admin, Manager, Supervisor, Technician, and Agent have global access
					if userRole != "admin" && userRole != "manager" && userRole != "supervisor" && userRole != "technician" && userRole != "agent" {
						isOwner := tkt.CreatedBy == userID
						isAssignee := tkt.AssignedTo != nil && *tkt.AssignedTo == userID
						
						if !isOwner && !isAssignee {
							c.JSON(http.StatusForbidden, gin.H{"error": "permission denied (ABAC: not ticket owner or assignee)"})
							c.Abort()
							return
						}
					}
				}
			}
		}

		c.Next()
	}
}
