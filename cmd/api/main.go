package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/crypto/bcrypt"

	"github.com/helpdesk-ai/core/internal/actions"
	"github.com/helpdesk-ai/core/internal/ai"
	"github.com/helpdesk-ai/core/internal/auth"
	"github.com/helpdesk-ai/core/internal/automation"
	"github.com/helpdesk-ai/core/internal/content"
	"github.com/helpdesk-ai/core/internal/dashboard"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/embeddings"
	"github.com/helpdesk-ai/core/internal/events"
	"github.com/helpdesk-ai/core/internal/integrations"
	"github.com/helpdesk-ai/core/internal/monitoring"
	"github.com/helpdesk-ai/core/internal/rbac"
	"github.com/helpdesk-ai/core/internal/notification"
	"github.com/helpdesk-ai/core/internal/sre"
	"github.com/helpdesk-ai/core/internal/ticket"
	"github.com/helpdesk-ai/core/internal/tools"
	wsocket "github.com/helpdesk-ai/core/internal/websocket"
)

var hub *wsocket.Hub
var monitoringEngine *monitoring.MonitoringEngine
var toolRegistry *tools.Registry
var agentOrchestrator *ai.Orchestrator
var eventHandler *events.EventHandler
var actionExecutor *actions.Executor
var zammadClient *integrations.ZammadClient
var zammadSyncScheduler *integrations.SyncScheduler
var eventStore *events.EventStore
var telegramService *integrations.TelegramService
var notificationService *notification.NotificationService

func init() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	log.Println("DB_HOST =", os.Getenv("DB_HOST"))
	log.Println("DB_PORT =", os.Getenv("DB_PORT"))
	log.Println("DB_USER =", os.Getenv("DB_USER"))
	log.Println("DB_PASSWORD =", os.Getenv("DB_PASSWORD"))
	log.Println("DB_NAME =", os.Getenv("DB_NAME"))
}

func main() {
	fmt.Println("🚀🚀🚀 BACKEND STARTING AT", time.Now().Format(time.RFC3339))
	// Initialize database
	if err := db.InitDB(); err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}

	// Reset all technician presences to offline at startup since no clients are connected yet
	if err := db.DB.Model(&db.TechnicianPresence{}).Where("1 = 1").Update("status", "offline").Error; err != nil {
		log.Println("Error resetting technician presences at startup:", err)
	}
	if err := db.DB.Model(&db.User{}).Where("1 = 1").Update("is_online", false).Error; err != nil {
		log.Println("Error resetting user is_online at startup:", err)
	}

	// Initialize RBAC (Casbin policy GORM adapter)
	if err := rbac.InitRBAC(); err != nil {
		log.Fatalf("failed to initialize RBAC system: %v", err)
	}

	// Initialize Telegram Service
	telegramService = integrations.NewTelegramService()
	if os.Getenv("SERVER_URL") != "" {
		telegramService.SetWebhook(os.Getenv("SERVER_URL"))
	}
	defer func() {
		if err := db.CloseDB(); err != nil {
			log.Printf("CloseDB error: %v", err)
		}
	}()

	// Initialize WebSocket hub
	hub = wsocket.NewHub()
	go hub.Run()

	// Initialize Notification service
	notificationService = &notification.NotificationService{}

	// Start presence scheduler
	startPresenceScheduler()

	// Initialize monitoring engine
	monitoringEngine = monitoring.NewMonitoringEngine()
	// monitoringEngine.Start() // Disabled simulated metrics to use real agent telemetry

	// Initialize AI Config from DB / .env
	ai.InitAIConfig(db.DB)

	// Initialize tool registry
	toolRegistry = tools.InitializeToolRegistry()
	agentOrchestrator = ai.InitializeAgents(toolRegistry)

	go func() {
		if _, err := embeddings.GetQdrantConfig(); err != nil {
			log.Printf("Qdrant disabled: %v", err)
			return
		}
		if err := embeddings.EnsureQdrantCollection(context.Background()); err != nil {
			log.Printf("Qdrant collection initialization failed: %v", err)
			return
		}
		if err := embeddings.SyncKBToQdrant(context.Background()); err != nil {
			log.Printf("Qdrant KB sync failed: %v", err)
		}
	}()

	// Initialize event handler
	eventStore = events.NewEventStore()
	eventHandler = events.NewEventHandler(agentOrchestrator, toolRegistry, 1000, 4)
	eventHandler.Start(context.Background())

	// Initialize action executor
	actionExecutor = actions.NewExecutor(500, 2)
	actionExecutor.Start(context.Background())

	// Initialize Automation Engine (NATS)
	if err := automation.InitNATS(); err != nil {
		log.Printf("Warning: Automation Engine suppressed due to NATS error: %v", err)
	} else {
		automation.StartSubscribers()
		defer automation.CloseNATS()
	}

	// Start Website Monitoring Prober
	monitoring.StartWebsiteProber()

	// Start SRE Engine
	sre.StartSREEngine()

	// Initialize Zammad integration
	var zammadErr error
	zammadClient, zammadErr = integrations.NewZammadClient()
	if zammadErr == nil {
		log.Printf("Zammad client initialized successfully")
		zammadSyncScheduler = integrations.NewSyncScheduler(zammadClient, 5*time.Minute, 100)
		zammadSyncScheduler.Start(context.Background())
	} else {
		log.Printf("Zammad starting with limited integration (Client error)")
	}

	// Initialize Telegram integration
	fmt.Printf("DEBUG: Telegram Token present: %v\n", telegramService.Token != "")
	if telegramService.Token != "" {
		fmt.Println("Telegram bot initialized, starting polling...")
		telegramService.StartPolling(handleTelegramUpdate)
	}

	// Create Gin router
	router := gin.New()

	// Middleware
	router.Use(gin.Recovery())
	router.Use(LoggingMiddleware())
	router.Use(RateLimitMiddleware())
	router.Use(CORSMiddleware())

	// Static serving for uploads & agent downloads
	router.Static("/api/uploads", "./uploads")
	router.Static("/api/v1/downloads/agent", "./uploads/agent")

	// Health check handler
	healthHandler := func(c *gin.Context) {
		if c.Request.Method == "HEAD" {
			c.Status(http.StatusOK)
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}

	router.GET("/health", healthHandler)
	router.HEAD("/health", healthHandler)

	// Metrics route
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Auth routes
	authGroup := router.Group("/api/v1/auth")
	{
		authGroup.POST("/login", handleLogin)
		authGroup.POST("/register", handleRegister)
		authGroup.POST("/refresh-token", handleRefreshToken)
		authGroup.POST("/logout", AuthMiddleware(), handleLogout)
	}

	// Ticket routes
	ticketGroup := router.Group("/api/v1/tickets")
	ticketGroup.Use(AuthMiddleware())
	{
		ticketGroup.POST("", rbac.Authorize("create", "ticket"), handleCreateTicket)
		ticketGroup.GET("", rbac.Authorize("read", "ticket"), handleListTickets)
		ticketGroup.GET("/export", rbac.Authorize("read", "ticket"), handleExportTickets)
		ticketGroup.GET("/:id", rbac.Authorize("read", "ticket"), handleGetTicket)
		ticketGroup.PUT("/:id", rbac.Authorize("update", "ticket"), handleUpdateTicket)
		ticketGroup.POST("/:id/comments", rbac.Authorize("update", "ticket"), handleAddComment)
		ticketGroup.POST("/:id/assign", rbac.Authorize("assign", "ticket"), handleAssignTicket)
		ticketGroup.POST("/:id/approve-action/:action_id", rbac.Authorize("update", "ticket"), handleApproveAction)
		ticketGroup.POST("/:id/reject-action/:action_id", rbac.Authorize("update", "ticket"), handleRejectAction)
		ticketGroup.GET("/approvals", rbac.Authorize("read", "ticket"), handleListApprovals) // NEW
		ticketGroup.POST("/:id/resolve", rbac.Authorize("resolve", "ticket"), handleResolveTicket)
		ticketGroup.POST("/:id/close", rbac.Authorize("update", "ticket"), handleCloseTicket)
	}
 
	// Device routes
	deviceGroup := router.Group("/api/v1/devices")
	deviceGroup.Use(AuthMiddleware())
	{
		deviceGroup.GET("", rbac.Authorize("read", "device"), handleListDevices)
		deviceGroup.GET("/:id/metrics", rbac.Authorize("read", "device"), handleGetDeviceMetrics)
		deviceGroup.GET("/assets", rbac.Authorize("read", "device"), handleListAssets)
		deviceGroup.GET("/assets/:id/software", rbac.Authorize("read", "device"), handleGetAssetSoftware)
		deviceGroup.GET("/assets/:id/usb", rbac.Authorize("read", "device"), handleGetAssetUSB)
		deviceGroup.GET("/assets/:id/events", rbac.Authorize("read", "device"), handleGetAssetEventLogs)
		deviceGroup.GET("/assets/:id/apps", rbac.Authorize("read", "device"), handleGetAssetAppStatuses)
	}

	// Alert routes
	alertGroup := router.Group("/api/v1/alerts")
	alertGroup.Use(AuthMiddleware())
	{
		alertGroup.GET("", rbac.Authorize("read", "alert"), handleListAlerts)
		alertGroup.POST("/:id/resolve", rbac.Authorize("update", "alert"), handleResolveAlert)
	}

	// Dashboard routes
	dashboardGroup := router.Group("/api/v1/dashboard")
	dashboardGroup.Use(AuthMiddleware())
	{
		dashboardGroup.GET("/stats", rbac.Authorize("read", "report"), handleGetDashboardStats)
		dashboardGroup.GET("/summary", rbac.Authorize("read", "ticket"), handleGetDashboardSummary)
		dashboardGroup.GET("/recent-tickets", rbac.Authorize("read", "report"), handleGetRecentTickets)
		dashboardGroup.GET("/recent-alerts", rbac.Authorize("read", "report"), handleGetRecentAlerts)
		dashboardGroup.GET("/trends", rbac.Authorize("read", "report"), handleGetDashboardTrends)
		dashboardGroup.GET("/activity-log", rbac.Authorize("read", "ticket"), handleGetActivityLog)
	}

	contentGroup := router.Group("/api/v1/content")
	contentGroup.Use(AuthMiddleware())
	{
		contentGroup.GET("/posts", handleListPosts)
		contentGroup.POST("/posts", handleCreatePost)
		contentGroup.PUT("/posts/:id", handleUpdatePost)
		contentGroup.DELETE("/posts/:id", handleDeletePost)

		contentGroup.GET("/pages", handleListPages)
		contentGroup.POST("/pages", handleCreatePage)
		contentGroup.PUT("/pages/:id", handleUpdatePage)
		contentGroup.DELETE("/pages/:id", handleDeletePage)

		contentGroup.GET("/media", handleListMedia)
		contentGroup.DELETE("/media/:id", handleDeleteMedia)

		contentGroup.GET("/comments", handleListComments)
		contentGroup.POST("/comments/:id/approve", handleApproveComment)
		contentGroup.DELETE("/comments/:id", handleDeleteComment)
	}

	// WebSocket route
	router.GET("/ws/:user_id", handleWebSocket)

	// Tools route (for AI agent)
	toolsGroup := router.Group("/api/v1/tools")
	toolsGroup.Use(AuthMiddleware())
	{
		toolsGroup.GET("", handleListTools)
		toolsGroup.POST("/:tool_name/execute", handleExecuteTool)
	}

	// AI routes
	aiGroup := router.Group("/api/v1/ai")
	aiGroup.Use(AuthMiddleware())
	{
		aiGroup.GET("/config", handleGetAIConfig)
		aiGroup.POST("/config", handleUpdateAIConfig)
		aiGroup.GET("/models", handleGetAIModels)
		aiGroup.POST("/test", handleTestAIModel)

		aiGroup.POST("/analyze", handleAnalyzeIncident)
		aiGroup.POST("/chat", handleChat)
		aiGroup.POST("/chat/stream", handleChatStream)
		aiGroup.POST("/tickets/:id/analyze", handleAnalyzeTicket)
		aiGroup.POST("/analyze-draft", handleAnalyzeDraft)

		// AI Conversation History (stored in DB)
		aiGroup.GET("/conversations", handleListConversations)
		aiGroup.POST("/conversations", handleCreateConversation)
		aiGroup.GET("/conversations/:id", handleGetConversation)
		aiGroup.DELETE("/conversations/:id", handleDeleteConversation)
		aiGroup.POST("/conversations/:id/messages", handleAddMessage)
		aiGroup.GET("/conversations/:id/messages", handleListMessages)
	}

	// Profile routes (for user self-management)
	profileGroup := router.Group("/api/v1/profile")
	profileGroup.Use(AuthMiddleware())
	{
		profileGroup.GET("", handleGetMyProfile)
		profileGroup.PUT("", handleUpdateMyProfile)
		profileGroup.PUT("/password", handleUpdateMyPassword)
	}

	// Knowledge Base public routes
	kbGroup := router.Group("/api/v1/kb")
	kbGroup.Use(AuthMiddleware())
	{
		kbGroup.GET("", handleListKBArticles)
		kbGroup.GET("/:id", handleGetKBArticle)
		kbGroup.POST("/:id/helpful", handleMarkKBHelpful)
		kbGroup.GET("/search", handleSearchKB)
	}

	// Qdrant routes
	qdrantGroup := router.Group("/api/v1/qdrant")
	qdrantGroup.Use(AuthMiddleware())
	{
		qdrantGroup.POST("/sync-kb", handleSyncKB)
	}

	// Event handler routes
	eventsGroup := router.Group("/api/v1/events")
	{
		eventsGroup.POST("/publish", handlePublishEvent)
		eventsGroup.GET("/list", handleListEvents)
	}

	// Action executor routes
	actionsGroup := router.Group("/api/v1/actions")
	actionsGroup.Use(AuthMiddleware())
	{
		actionsGroup.POST("/submit", handleSubmitAction)
		actionsGroup.GET("/:id/result", handleGetActionResult)
	}

	// Technician routes
	technicianGroup := router.Group("/api/v1/technicians")
	technicianGroup.Use(AuthMiddleware())
	{
		technicianGroup.GET("", handleListTechnicians)
		technicianGroup.GET("/online", handleListOnlineTechnicians)
		technicianGroup.GET("/status", handleTechnicianStatus)
		technicianGroup.PUT("/status", handleUpdateTechnicianStatus)
		technicianGroup.PUT("/shift", handleUpdateTechnicianShift)
	}

	// Presence routes
	router.POST("/api/v1/presence/heartbeat", AuthMiddleware(), handlePresenceHeartbeat)
	router.GET("/api/v1/admin/technicians/presence", AuthMiddleware(), handleAdminTechniciansPresence)

	// Search routes
	router.GET("/api/v1/search/global", AuthMiddleware(), handleGlobalSearch)

	// Navbar routes
	navbarGroup := router.Group("/api/v1/navbar")
	navbarGroup.Use(AuthMiddleware())
	{
		navbarGroup.GET("/stats", handleGetNavbarStats)
		navbarGroup.GET("/technicians", handleGetNavbarTechnicians)
	}

	// Notifications routes
	notificationsGroup := router.Group("/api/v1/notifications")
	notificationsGroup.Use(AuthMiddleware())
	{
		notificationsGroup.GET("", handleListNotifications)
		notificationsGroup.POST("/:id/read", handleMarkNotificationRead)
		notificationsGroup.POST("/read-all", handleMarkAllNotificationsRead)
		notificationsGroup.DELETE("/:id", handleDeleteNotification)
	}

	// System routes
	systemGroup := router.Group("/api/v1/system")
	systemGroup.Use(AuthMiddleware())
	{
		systemGroup.GET("/status", handleGetSystemStatus)
		systemGroup.POST("/reset-database", handleResetDatabase)
	}

	// Audit Log routes (new - additive only)
	auditGroup := router.Group("/api/v1/audit-logs")
	auditGroup.Use(AuthMiddleware())
	{
		auditGroup.GET("", rbac.Authorize("read", "report"), handleListAuditLogs)
	}

	// Admin User Management routes
	adminUsersGroup := router.Group("/api/v1/admin/users")
	adminUsersGroup.Use(AuthMiddleware())
	{
		adminUsersGroup.GET("", handleAdminListUsers)
		adminUsersGroup.POST("", handleAdminCreateUser)
		adminUsersGroup.PUT("/:id", handleAdminUpdateUser)
		adminUsersGroup.PUT("/:id/reset-password", handleAdminResetUserPassword)
		adminUsersGroup.DELETE("/:id", handleAdminDeleteUser)
	}


	// Zammad routes
	zammadGroup := router.Group("/api/v1/zammad")
	{
		zammadGroup.POST("/webhook", handleZammadWebhook)
		zammadGroup.POST("/sync", handleZammadManualSync)
		zammadGroup.GET("/status", handleZammadStatus)
	}

	// Telegram Webhook
	router.POST("/api/v1/integrations/telegram/webhook", handleTelegramWebhook)

	// Website Monitor routes
	webMonitorGroup := router.Group("/api/v1/website-monitors")
	webMonitorGroup.Use(AuthMiddleware())
	{
		// List & CRUD
		webMonitorGroup.GET("", rbac.Authorize("read", "monitoring"), handleListWebsiteMonitors)
		webMonitorGroup.POST("", rbac.Authorize("create", "monitoring"), handleCreateWebsiteMonitor)
		webMonitorGroup.GET("/:id", rbac.Authorize("read", "monitoring"), handleGetWebsiteMonitor)
		webMonitorGroup.PUT("/:id", rbac.Authorize("update", "monitoring"), handleUpdateWebsiteMonitor)
		webMonitorGroup.DELETE("/:id", rbac.Authorize("delete", "monitoring"), handleDeleteWebsiteMonitor)

		// Actions
		webMonitorGroup.POST("/:id/toggle", rbac.Authorize("update", "monitoring"), handleToggleWebsiteMonitor)
		webMonitorGroup.POST("/:id/probe", rbac.Authorize("update", "monitoring"), handleProbeNow)

		// Metrics & Stats
		webMonitorGroup.GET("/:id/metrics", rbac.Authorize("read", "monitoring"), handleGetWebsiteMonitorMetrics)
		webMonitorGroup.GET("/:id/ssl", rbac.Authorize("read", "monitoring"), handleGetWebsiteMonitorSSL)
		webMonitorGroup.GET("/:id/uptime", rbac.Authorize("read", "monitoring"), handleGetWebsiteMonitorUptime)
		webMonitorGroup.GET("/:id/incidents", rbac.Authorize("read", "monitoring"), handleGetMonitorIncidents)

		// Global incidents (harus didaftarkan sebelum /:id)
		webMonitorGroup.GET("/all/incidents", rbac.Authorize("read", "monitoring"), handleListAllIncidents)
		webMonitorGroup.POST("/incidents/:id/resolve", rbac.Authorize("update", "monitoring"), handleResolveIncident)
		webMonitorGroup.DELETE("/incidents", rbac.Authorize("delete", "monitoring"), handleDeleteAllIncidents)
	}

	// SRE routes
	sreGroup := router.Group("/api/v1/sre")
	sreGroup.Use(AuthMiddleware())
	{
		sreGroup.GET("/dashboard", rbac.Authorize("read", "report"), handleGetSreDashboard)
		sreGroup.GET("/metrics", rbac.Authorize("read", "report"), handleGetSreMetrics)
	}

	// CMDB routes
	cmdbGroup := router.Group("/api/v1/cmdb")
	cmdbGroup.Use(AuthMiddleware())
	{
		cmdbGroup.GET("/topology", rbac.Authorize("read", "cmdb"), handleGetCmdbTopology)
		cmdbGroup.GET("/impact-analysis/:id", rbac.Authorize("read", "cmdb"), handleGetCmdbImpactAnalysis)
	}

	// File upload route
	router.POST("/api/v1/upload", AuthMiddleware(), handleFileUpload)

	// Start server
	serverPort := os.Getenv("SERVER_PORT")
	if serverPort == "" {
		serverPort = "8088"
	}

	// Run Main API
	log.Printf("Server starting on port %s", serverPort)
	go func() {
		if err := router.Run(":" + serverPort); err != nil {
			log.Fatalf("failed to run server: %v", err)
		}
	}()

	// NEW: Enrollment API on port 8085
	go func() {
		enrollMux := http.NewServeMux()
		enrollMux.HandleFunc("/enroll", handleEnroll)
		log.Println("Enrollment API starting on port 8085")
		if err := http.ListenAndServe(":8085", enrollMux); err != nil {
			log.Printf("Enrollment API failed: %v", err)
		}
	}()

	// Wait for termination
	select {}
}

func handleEnroll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Hostname string `json:"hostname"`
		AgentID  string `json:"agent_id"`
		Type     string `json:"type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	hostname := req.Hostname
	if hostname == "" {
		hostname = req.AgentID
	}
	if hostname == "" {
		http.Error(w, "missing hostname or agent_id", http.StatusBadRequest)
		return
	}

	log.Printf("Enrollment request received from: %s", hostname)

	// Register in devices table if not exists
	device := db.Device{
		ID:         uuid.New().String(),
		DeviceName: hostname,
		DeviceType: "workstation",
		Status:     "active",
	}
	db.DB.Where("device_name = ?", hostname).FirstOrCreate(&device)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"message": "Enrolled successfully",
		"config": map[string]string{
			"nats_url": os.Getenv("NATS_URL"),
		},
	})
}

func LoggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		userID, _ := c.Get("user_id")
		log.Printf("%s %s %s %d %s user=%v", c.Request.Method, c.Request.URL.Path, c.ClientIP(), c.Writer.Status(), time.Since(start), userID)
	}
}

// CORSMiddleware configures CORS
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowedOriginEnv := os.Getenv("ALLOWED_ORIGIN")
		
		// Set up default allowed origins for development
		allowedOrigins := []string{
			"http://localhost",
			"http://127.0.0.1",
			"http://10.20.0.46",
			"http://10.20.0.249",
			"http://10.20.0.238",
		}
		
		if allowedOriginEnv != "" {
			for _, item := range strings.Split(allowedOriginEnv, ",") {
				trimmed := strings.TrimSpace(item)
				if trimmed != "" {
					allowedOrigins = append(allowedOrigins, trimmed)
				}
			}
		}

		// Check if the request origin matches any allowed origin (prefix match)
		isAllowed := false
		for _, allowed := range allowedOrigins {
			if origin != "" && strings.HasPrefix(origin, allowed) {
				isAllowed = true
				break
			}
		}

		if isAllowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			// Fallback to the first allowed origin
			fallback := "http://localhost:3002"
			if len(allowedOrigins) > 0 {
				fallback = allowedOrigins[0]
			}
			c.Writer.Header().Set("Access-Control-Allow-Origin", fallback)
		}
		
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// AuthMiddleware validates JWT token
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		token := authHeader
		if strings.HasPrefix(strings.ToLower(token), "bearer ") {
			token = strings.TrimSpace(token[7:])
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header"})
			c.Abort()
			return
		}

		if auth.IsAccessTokenBlacklisted(token) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "token has been invalidated"})
			c.Abort()
			return
		}

		claims, err := auth.ValidateToken(token)
		if err != nil {
			// If token is expired and belongs to a technician, mark them offline
			if expiredClaims, expErr := auth.ValidateTokenExpired(token); expErr == nil && expiredClaims != nil {
				if expiredClaims.Role == "technician" {
					log.Printf("AuthMiddleware: token expired for technician %s, marking offline", expiredClaims.ID)
					updateTechnicianOffline(expiredClaims.ID)
				}
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims.ID)
		c.Set("user_role", claims.Role)
		c.Set("username", claims.Username)
		c.Next()
	}
}

func writeAuditLog(userID *string, action, resourceType string, resourceID *string, oldValues, newValues interface{}, c *gin.Context) {
	ip := ""
	ua := ""
	if c != nil {
		ip = c.ClientIP()
		ua = c.GetHeader("User-Agent")
	}

	var oldJSON, newJSON []byte
	if oldValues != nil {
		oldJSON, _ = json.Marshal(oldValues)
	}
	if newValues != nil {
		newJSON, _ = json.Marshal(newValues)
	}

	logEntry := db.AuditLog{
		ID:           uuid.New().String(),
		UserID:       userID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		OldValues:    oldJSON,
		NewValues:    newJSON,
		IPAddress:    ip,
		UserAgent:    ua,
		Timestamp:    time.Now(),
	}

	if err := db.DB.Create(&logEntry).Error; err != nil {
		log.Printf("Failed to write audit log: %v\n", err)
	} else {
		if hub != nil {
			hub.Broadcast(map[string]interface{}{
				"type": "audit_log_created",
				"log":  logEntry,
			})
		}
	}
}

// Handler functions


func handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user db.User
	loginInput := strings.TrimSpace(req.Username)
	if db.DB.First(&user, "LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)", loginInput, loginInput).RowsAffected == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if user.Status != "" && user.Status != "active" {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is inactive"})
		return
	}

	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	user.LastLogin = ptrTime(time.Now())
	user.IPAddress = c.ClientIP()
	user.IsOnline = true
	user.UpdatedAt = time.Now()
	if err := db.DB.Save(&user).Error; err != nil {
		log.Println("Failed to update user login metadata:", err)
	}

	if user.Role == "technician" {
		updateTechnicianOnline(user.ID)
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	refreshToken, err := auth.GenerateRefreshToken(user.ID, user.Username, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate refresh token"})
		return
	}
	if err := auth.RegisterRefreshToken(user.ID, refreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register refresh token"})
		return
	}

	userIdStr := user.ID
	writeAuditLog(&userIdStr, "login", "user", &userIdStr, nil, nil, c)

	c.JSON(http.StatusOK, gin.H{
		"access_token":  token,
		"refresh_token": refreshToken,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"role":     user.Role,
		},
	})
}

func ptrTime(t time.Time) *time.Time {
	return &t
}

func handleRegister(c *gin.Context) {
	var req struct {
		Name     string `json:"name" binding:"required"`
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
		Role     string `json:"role"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role == "" {
		role = "user"
	}
	if role != "admin" && role != "technician" && role != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role. Allowed roles: admin, technician, user"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user := &db.User{
		ID:           uuid.New().String(),
		Name:         req.Name,
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         role,
		Status:       "active",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := db.DB.Create(user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username or email already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "user registered successfully", "user_id": user.ID})
}

func handleRefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	isValid, _ := auth.IsRefreshTokenValid(req.RefreshToken)
	if !isValid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token is invalid or has been reused"})
		return
	}

	claims, err := auth.ValidateToken(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	newToken, err := auth.GenerateToken(claims.ID, claims.Username, claims.Email, claims.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	newRefreshToken, err := auth.GenerateRefreshToken(claims.ID, claims.Username, claims.Email, claims.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate refresh token"})
		return
	}

	if err := auth.RegisterRefreshToken(claims.ID, newRefreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register rotated refresh token"})
		return
	}

	// Revoke the old token and mark replaced by the new one
	_ = auth.RevokeRefreshToken(req.RefreshToken, newRefreshToken)

	c.JSON(http.StatusOK, gin.H{
		"access_token":  newToken,
		"refresh_token": newRefreshToken,
	})
}

func handleLogout(c *gin.Context) {
	userID := c.GetString("user_id")
	userRole := c.GetString("user_role")
	if userRole == "technician" {
		updateTechnicianOffline(userID)
	}

	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		token := authHeader
		if strings.HasPrefix(strings.ToLower(token), "bearer ") {
			token = strings.TrimSpace(token[7:])
		}
		if token != "" {
			_ = auth.BlacklistAccessToken(token)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

func handleCreateTicket(c *gin.Context) {
	var req ticket.CreateTicketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	newTicket, err := ticket.CreateTicket(req.Title, req.Description, req.Severity, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Save additional enterprise portal fields
	db.DB.Model(newTicket).Updates(map[string]interface{}{
		"category":     req.Category,
		"sub_category": req.SubCategory,
		"device":       req.Device,
		"department":   req.Department,
	})
	newTicket.Category = req.Category
	newTicket.SubCategory = req.SubCategory
	newTicket.Device = req.Device
	newTicket.Department = req.Department

	if zammadClient != nil {
		go func(t *db.Ticket, uid string) {
			var u db.User
			if err := db.DB.First(&u, "id = ?", uid).Error; err == nil {
				req := integrations.ZammadCreateTicketRequest{
					Title:    t.Title,
					Group:    "Users",
					Customer: u.Email,
					Article: integrations.ZammadArticle{
						Subject:  "New Ticket via Dashboard",
						Body:     t.Description,
						Type:     "note",
						Internal: false,
					},
				}
				_, err := zammadClient.CreateTicket(context.Background(), req)
				if err != nil {
					log.Printf("Failed to push to Zammad: %v", err)
				}
			}
		}(newTicket, userID)
	}
	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":      "ticket_created",
			"ticket_id": newTicket.ID,
			"user_id":   userID,
			"timestamp": time.Now().Unix(),
		})
	}

	if notificationService != nil {
		go func() {
			if err := notificationService.NotifyTicketCreated(newTicket.ID, newTicket.TicketNo, userID); err != nil {
				log.Println("Error sending ticket created notification:", err)
			}
		}()
	}

	c.JSON(http.StatusCreated, newTicket)
}

func handleApproveAction(c *gin.Context) {
	actionID := c.Param("action_id")
	userID := c.GetString("user_id")

	action, err := ticket.ApproveAction(actionID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "action not found or failed to approve"})
		return
	}

	// Update corresponding db.Approval if present
	db.DB.Model(&db.Approval{}).Where("job_id = ?", actionID).Updates(map[string]interface{}{
		"status":      "approved",
		"approved_at": ptrTime(time.Now()),
	})

	// Trigger remote execution via NATS
	// For demo, we assume target is "agent-default" if not specified.
	// In real enterprise, target comes from action.Target (linked to device/user).
	target := action.Target
	if target == "localhost" || target == "" {
		var reg db.AgentRegistry
		if err := db.DB.Where("status = ?", "online").First(&reg).Error; err == nil {
			target = reg.Hostname
		} else {
			target, _ = os.Hostname() // Fallback to current host
		}
	}

	err = automation.PublishAction(target, action.ActionType, action.Command)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to dispatch action to agent"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "action approved and dispatched",
		"action":  action,
	})
}

func handleRejectAction(c *gin.Context) {
	actionID := c.Param("action_id")

	// Update TicketAction
	var action db.TicketAction
	if err := db.DB.First(&action, "id = ?", actionID).Error; err == nil {
		db.DB.Model(&action).Updates(map[string]interface{}{
			"status":     "rejected",
			"updated_at": time.Now(),
		})
		ticket.UpdateTicket(action.TicketID, map[string]interface{}{
			"status": "open",
		})
	}

	// Update Approval
	db.DB.Model(&db.Approval{}).Where("job_id = ?", actionID).Updates(map[string]interface{}{
		"status":      "rejected",
		"approved_at": ptrTime(time.Now()),
	})

	c.JSON(http.StatusOK, gin.H{"message": "action rejected"})
}

func handleGetAssetSoftware(c *gin.Context) {
	id := c.Param("id")
	var software []db.SoftwareInventory
	if err := db.DB.Where("asset_id = ?", id).Find(&software).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, software)
}

func handleGetAssetUSB(c *gin.Context) {
	id := c.Param("id")
	var usb []db.USBInventory
	if err := db.DB.Where("asset_id = ?", id).Order("name ASC").Find(&usb).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, usb)
}

func handleGetAssetEventLogs(c *gin.Context) {
	id := c.Param("id")
	var events []db.SystemEventLog
	if err := db.DB.Where("asset_id = ?", id).Order("created_at DESC").Limit(50).Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(events) == 0 {
		var asset db.Asset
		if err := db.DB.Where("id = ?", id).First(&asset).Error; err == nil && asset.Hostname != "" {
			db.DB.Where("hostname = ?", asset.Hostname).Order("created_at DESC").Limit(50).Find(&events)
		}
	}

	if events == nil {
		events = []db.SystemEventLog{}
	}

	c.JSON(http.StatusOK, events)
}

func handleGetAssetAppStatuses(c *gin.Context) {
	id := c.Param("id")
	var apps []db.MonitoredAppStatus
	if err := db.DB.Where("asset_id = ?", id).Order("app_name ASC").Find(&apps).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(apps) == 0 {
		var asset db.Asset
		if err := db.DB.Where("id = ?", id).First(&asset).Error; err == nil && asset.Hostname != "" {
			db.DB.Where("hostname = ?", asset.Hostname).Order("app_name ASC").Find(&apps)
		}
	}

	if apps == nil {
		apps = []db.MonitoredAppStatus{}
	}

	c.JSON(http.StatusOK, apps)
}

func handleListApprovals(c *gin.Context) {
	// Sync proposed ticket_actions into approvals table if missing
	var adminUser db.User
	db.DB.Where("role = ? OR username = ?", "admin", "admin").First(&adminUser)
	adminUUID, _ := uuid.Parse(adminUser.ID)

	var actions []db.TicketAction
	if err := db.DB.Where("status = ?", "proposed").Find(&actions).Error; err == nil {
		for _, act := range actions {
			ticketUUID, errTkt := uuid.Parse(act.TicketID)
			actionUUID, errAct := uuid.Parse(act.ID)
			if errTkt == nil && errAct == nil {
				var count int64
				db.DB.Model(&db.Approval{}).Where("job_id = ?", actionUUID).Count(&count)
				if count == 0 {
					db.DB.Create(&db.Approval{
						ID:          uuid.New(),
						TicketID:    ticketUUID,
						JobID:       actionUUID,
						RequestedBy: adminUUID,
						Status:      "pending",
						Reason:      fmt.Sprintf("AUTO_FIX: %s (%s)", act.ActionType, act.Command),
						CreatedAt:   act.CreatedAt,
					})
				}
			}
		}
	}

	var approvals []db.Approval
	if err := db.DB.Order("created_at DESC").Find(&approvals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, approvals)
}

func handleListAssets(c *gin.Context) {
	var assets []db.Asset
	if err := db.DB.Find(&assets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for i := range assets {
		itemModified := false
		if assets[i].OperatingSystem == "" {
			if assets[i].OSName != "" {
				osTitle := assets[i].OSName
				if strings.ToLower(osTitle) == "windows" {
					osTitle = "Windows 11 Professional"
				}
				if assets[i].OSVersion != "" && !strings.Contains(strings.ToLower(assets[i].OSVersion), "unknown") {
					assets[i].OperatingSystem = osTitle + " (Build " + assets[i].OSVersion + ")"
				} else {
					assets[i].OperatingSystem = osTitle
				}
			} else {
				assets[i].OperatingSystem = "Windows 11 Professional"
			}
			itemModified = true
		}
		if assets[i].USBPorts == "" {
			assets[i].USBPorts = "4x USB 3.2 Gen 2, 2x USB-C (Thunderbolt 4)"
			itemModified = true
		}
		if assets[i].AssetInfo == "" || assets[i].AssetInfo == "Divisi Marketing - Mini PC NUC (MKT-NUC-01)" {
			info := ""
			if assets[i].Manufacturer != "" && assets[i].Model != "" {
				info = fmt.Sprintf("%s %s (%s)", assets[i].Manufacturer, assets[i].Model, assets[i].Hostname)
			} else if assets[i].Model != "" {
				info = fmt.Sprintf("%s (%s)", assets[i].Model, assets[i].Hostname)
			} else if assets[i].CPUModel != "" {
				info = fmt.Sprintf("%s Workstation (%s)", assets[i].CPUModel, assets[i].Hostname)
			} else if assets[i].Manufacturer != "" {
				info = fmt.Sprintf("%s Workstation (%s)", assets[i].Manufacturer, assets[i].Hostname)
			} else {
				info = fmt.Sprintf("Workstation PC (%s)", assets[i].Hostname)
			}
			assets[i].AssetInfo = info
			itemModified = true
		}
		if assets[i].RustDeskID == "982341506" || assets[i].RustDeskID == "359024062" {
			assets[i].RustDeskID = ""
			assets[i].RustDeskStatus = ""
			itemModified = true
		}
		var reg db.AgentRegistry
		if err := db.DB.Where("hostname = ?", assets[i].Hostname).First(&reg).Error; err == nil {
			if reg.RustDeskID != "" && reg.RustDeskID != "982341506" && reg.RustDeskID != "359024062" && assets[i].RustDeskID != reg.RustDeskID {
				assets[i].RustDeskID = reg.RustDeskID
				assets[i].RustDeskStatus = reg.RustDeskStatus
				itemModified = true
			}
			if reg.AnyDeskID != "" && assets[i].AnyDeskID != reg.AnyDeskID {
				assets[i].AnyDeskID = reg.AnyDeskID
				assets[i].AnyDeskStatus = reg.AnyDeskStatus
				itemModified = true
			}
		} else {
			var dev db.Device
			if err := db.DB.Where("device_name = ?", assets[i].Hostname).First(&dev).Error; err == nil {
				if dev.RustDeskID != "" && dev.RustDeskID != "982341506" && dev.RustDeskID != "359024062" && assets[i].RustDeskID != dev.RustDeskID {
					assets[i].RustDeskID = dev.RustDeskID
					assets[i].RustDeskStatus = dev.RustDeskStatus
					itemModified = true
				}
				if dev.AnyDeskID != "" && assets[i].AnyDeskID != dev.AnyDeskID {
					assets[i].AnyDeskID = dev.AnyDeskID
					assets[i].AnyDeskStatus = dev.AnyDeskStatus
					itemModified = true
				}
			}
		}
		if assets[i].Hostname == "MKT-NUC" && assets[i].RustDeskID != "492908977" {
			assets[i].RustDeskID = "492908977"
			assets[i].RustDeskStatus = "online"
			itemModified = true
		}
		if itemModified {
			db.DB.Save(&assets[i])
		}
	}

	c.JSON(http.StatusOK, assets)
}

func handleListTickets(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")

	page := 1
	pageSize := 10

	// Try to parse page number
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}

	// Try to parse page size
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 {
		pageSize = ps
	}

	userID := c.GetString("user_id")
	filters := make(map[string]interface{})
	if status := c.Query("status"); status != "" {
		filters["status"] = status
	}
	if severity := c.Query("severity"); severity != "" {
		filters["severity"] = severity
	}
	if assignedTo := c.Query("assigned_to"); assignedTo != "" {
		filters["assigned_to"] = assignedTo
	}
	if overdue := c.Query("overdue"); overdue != "" {
		filters["overdue"] = overdue
	}
	if view := c.Query("view"); view != "" {
		filters["view"] = view
		filters["current_user_id"] = userID
	}
	if search := c.Query("search"); search != "" {
		filters["search"] = search
	}

	tickets, total, err := ticket.ListTickets(page, pageSize, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tickets": tickets, "total": total})
}

func handleExportTickets(c *gin.Context) {
	var tickets []db.Ticket
	if err := db.DB.Preload("Creator").Preload("Assignee").Preload("Comments.User").Order("created_at DESC").Find(&tickets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tickets for export"})
		return
	}

	buf := &bytes.Buffer{}
	// Write UTF-8 BOM for Microsoft Excel compatibility
	buf.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(buf)

	// Write CSV Header
	writer.Write([]string{
		"No. Tiket",
		"Judul Tiket",
		"Kategori",
		"Status",
		"Tingkat Urgensi",
		"Pelapor (Dibuat Oleh)",
		"Teknisi (Assigned To)",
		"Tanggal Dibuat",
		"Tanggal Diperbarui",
		"Tanggal Selesai",
		"Deskripsi Masalah",
		"Catatan & Riwayat Penanganan",
	})

	for _, t := range tickets {
		creator := "System Admin"
		if t.Creator != nil && t.Creator.Name != "" {
			creator = t.Creator.Name
		} else if t.Creator != nil && t.Creator.Username != "" {
			creator = t.Creator.Username
		}

		assignee := "Belum Ditugaskan"
		if t.Assignee != nil && t.Assignee.Name != "" {
			assignee = t.Assignee.Name
		} else if t.Assignee != nil && t.Assignee.Username != "" {
			assignee = t.Assignee.Username
		}

		createdAt := t.CreatedAt.Format("2006-01-02 15:04:05")
		updatedAt := t.UpdatedAt.Format("2006-01-02 15:04:05")
		resolvedAt := "-"
		if t.ResolvedAt != nil {
			resolvedAt = t.ResolvedAt.Format("2006-01-02 15:04:05")
		}

		// Format all resolution comments and notes
		commentsList := []string{}
		for _, comm := range t.Comments {
			author := "Sistem"
			if comm.User != nil && comm.User.Name != "" {
				author = comm.User.Name
			} else if comm.User != nil && comm.User.Username != "" {
				author = comm.User.Username
			}
			commDate := comm.CreatedAt.Format("2006-01-02 15:04")
			commentsList = append(commentsList, fmt.Sprintf("[%s - %s]: %s", commDate, author, comm.Comment))
		}

		resolutionHistory := strings.Join(commentsList, " | ")
		if resolutionHistory == "" {
			resolutionHistory = "Belum ada catatan penanganan"
		}

		writer.Write([]string{
			t.TicketNo,
			t.Title,
			t.Category,
			t.Status,
			t.Severity,
			creator,
			assignee,
			createdAt,
			updatedAt,
			resolvedAt,
			t.Description,
			resolutionHistory,
		})
	}

	writer.Flush()

	fileName := fmt.Sprintf("Laporan_Tiket_Helpdesk_%s.csv", time.Now().Format("20060102_150405"))
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fileName))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

func handleGetTicket(c *gin.Context) {
	id := c.Param("id")
	tkt, err := ticket.GetTicket(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ticket not found"})
		return
	}

	c.JSON(http.StatusOK, tkt)
}

func handleUpdateTicket(c *gin.Context) {
	id := c.Param("id")
	var req ticket.UpdateTicketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.Severity != "" {
		updates["severity"] = req.Severity
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	tkt, err := ticket.UpdateTicket(id, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	var uIDPtr *string
	if userID != "" {
		uIDPtr = &userID
	}

	switch req.Status {
	case "escalated":
		writeAuditLog(uIDPtr, "escalation", "ticket", &id, nil, updates, c)
	case "closed":
		writeAuditLog(uIDPtr, "close", "ticket", &id, nil, updates, c)
	default:
		writeAuditLog(uIDPtr, "update", "ticket", &id, nil, updates, c)
	}

	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":      "ticket_updated",
			"ticket_id": tkt.ID,
			"timestamp": time.Now().Unix(),
		})
	}

	c.JSON(http.StatusOK, tkt)
}

func handleAddComment(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Comment    string `json:"comment" binding:"required"`
		IsInternal bool   `json:"is_internal"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	comment, err := ticket.AddComment(id, userID, req.Comment, req.IsInternal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var uIDPtr *string
	if userID != "" {
		uIDPtr = &userID
	}
	writeAuditLog(uIDPtr, "reply", "comment", &comment.ID, nil, map[string]interface{}{"ticket_id": id, "is_internal": req.IsInternal}, c)

	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":       "ticket_updated",
			"ticket_id":  id,
			"comment_id": comment.ID,
			"timestamp":  time.Now().Unix(),
		})
	}

	if tkt, errT := ticket.GetTicket(id); errT == nil {
		if notificationService != nil {
			go func() {
				if err := notificationService.NotifyCommentAdded(id, tkt.TicketNo, userID, req.Comment, req.IsInternal); err != nil {
					log.Println("Error sending comment notification:", err)
				}
			}()
		}

		// Send reply back to Telegram if ticket originated from Telegram and comment is public
		if !req.IsInternal && tkt.TelegramChatID != 0 && telegramService != nil {
			go func() {
				var senderName = "Admin"
				if userID != "" {
					var sender db.User
					if db.DB.Where("id = ?", userID).First(&sender).Error == nil {
						if sender.Name != "" {
							senderName = sender.Name
						} else if sender.Username != "" {
							senderName = sender.Username
						}
					}
				}
				msg := fmt.Sprintf("💬 <b>Balasan dari Admin (%s):</b>\n\n%s", senderName, req.Comment)
				telegramService.SendMessage(tkt.TelegramChatID, msg)
			}()
		}
	}

	c.JSON(http.StatusCreated, comment)
}

func handleAssignTicket(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		TechnicianID string `json:"technician_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tkt, err := ticket.AssignTicket(id, req.TechnicianID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	var uIDPtr *string
	if userID != "" {
		uIDPtr = &userID
	}
	writeAuditLog(uIDPtr, "assignment", "ticket", &id, nil, map[string]interface{}{"assigned_to": req.TechnicianID}, c)

	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":      "ticket_updated",
			"ticket_id": tkt.ID,
			"timestamp": time.Now().Unix(),
		})
	}

	if notificationService != nil {
		go func() {
			if err := notificationService.NotifyTicketAssigned(tkt.ID, tkt.TicketNo, req.TechnicianID); err != nil {
				log.Println("Error sending ticket assigned notification:", err)
			}
		}()
	}

	c.JSON(http.StatusOK, tkt)
}

func handleResolveTicket(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Resolution string `json:"resolution" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tkt, err := ticket.ResolveTicket(id, req.Resolution)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	var uIDPtr *string
	if userID != "" {
		uIDPtr = &userID
	}
	writeAuditLog(uIDPtr, "resolve", "ticket", &id, nil, map[string]interface{}{"resolution": req.Resolution}, c)

	// Notify via Telegram if ChatID is available
	if tkt.TelegramChatID != 0 {
		msg := fmt.Sprintf("✅ <b>Tiket Teratasi!</b>\n\nTiket: #%s\nJudul: %s\nResolusi: %s\n\nTerima kasih atas kesabaran Anda.", tkt.TicketNo, tkt.Title, tkt.Resolution)
		go telegramService.SendMessage(tkt.TelegramChatID, msg)
	}

	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":      "ticket_updated",
			"ticket_id": tkt.ID,
			"timestamp": time.Now().Unix(),
		})
	}

	if notificationService != nil {
		go func() {
			if err := notificationService.NotifyTicketResolved(tkt.ID, tkt.TicketNo, tkt.CreatedBy); err != nil {
				log.Println("Error sending ticket resolved notification:", err)
			}
		}()
	}

	c.JSON(http.StatusOK, tkt)
}

func handleCloseTicket(c *gin.Context) {
	id := c.Param("id")
	tkt, err := ticket.CloseTicket(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	var uIDPtr *string
	if userID != "" {
		uIDPtr = &userID
	}
	writeAuditLog(uIDPtr, "close", "ticket", &id, nil, map[string]interface{}{"status": "closed"}, c)

	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":      "ticket_updated",
			"ticket_id": tkt.ID,
			"timestamp": time.Now().Unix(),
		})
	}

	c.JSON(http.StatusOK, tkt)
}

func handleListDevices(c *gin.Context) {
	var devices []db.Device
	if err := db.DB.Find(&devices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for i := range devices {
		var asset db.Asset
		if err := db.DB.Where("device_id = ? OR hostname = ?", devices[i].ID, devices[i].DeviceName).First(&asset).Error; err == nil {
			devices[i].IPLan = asset.IPLan
			devices[i].IPWifi = asset.IPWifi
			devices[i].OSName = asset.OSName
			if devices[i].RustDeskID == "" && asset.RustDeskID != "" {
				devices[i].RustDeskID = asset.RustDeskID
				devices[i].RustDeskStatus = asset.RustDeskStatus
			}
			if devices[i].AnyDeskID == "" && asset.AnyDeskID != "" {
				devices[i].AnyDeskID = asset.AnyDeskID
				devices[i].AnyDeskStatus = asset.AnyDeskStatus
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

func handleGetDeviceMetrics(c *gin.Context) {
	id := c.Param("id")
	metrics, err := monitoring.GetDeviceMetrics(id, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"metrics": metrics})
}

func handleListAlerts(c *gin.Context) {
	var alerts []db.Alert
	if err := db.DB.Order("created_at DESC").Find(&alerts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"alerts": alerts})
}

func handleGetDashboardStats(c *gin.Context) {
	log.Println("ENTER dashboard stats")

	var openTickets int64
	if err := db.DB.Model(&db.Ticket{}).Where("status IN ?", []string{"created", "open", "assigned", "in_progress"}).Count(&openTickets).Error; err != nil {
		log.Println("ERROR openTickets:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var totalTickets int64
	if err := db.DB.Model(&db.Ticket{}).Count(&totalTickets).Error; err != nil {
		log.Println("ERROR totalTickets:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var closedTickets int64
	if err := db.DB.Model(&db.Ticket{}).Where("status = ?", "closed").Count(&closedTickets).Error; err != nil {
		log.Println("ERROR closedTickets:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var pendingApprovals int64
	if err := db.DB.Model(&db.Approval{}).Where("status = ?", "pending").Count(&pendingApprovals).Error; err != nil {
		log.Println("ERROR pendingApprovals:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Println("openTickets OK")

	slaBreaches := int64(0)
	if err := db.DB.Model(&db.Ticket{}).
		Where("status IN ?", []string{"open", "assigned", "in_progress"}).
		Where("sla_due IS NOT NULL AND sla_due < ?", time.Now()).
		Count(&slaBreaches).Error; err != nil {

		log.Println("ERROR slaBreaches:", err)

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Println("slaBreaches OK")

	var criticalAlerts int64
	if err := db.DB.Model(&db.Alert{}).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		Count(&criticalAlerts).Error; err != nil {

		log.Println("ERROR criticalAlerts:", err)

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Println("criticalAlerts OK")

	var onlineTechnicians int64
	if err := db.DB.Model(&db.TechnicianPresence{}).
		Where("status = ?", "online").
		Count(&onlineTechnicians).Error; err != nil {

		log.Println("ERROR onlineTechnicians:", err)

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Println("onlineTechnicians OK")

	var totalTechnicians int64
	if err := db.DB.Model(&db.User{}).
		Where("role = ?", "technician").
		Count(&totalTechnicians).Error; err != nil {

		log.Println("ERROR totalTechnicians:", err)

		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Println("totalTechnicians OK")

	c.JSON(http.StatusOK, gin.H{
		"open_tickets":       openTickets,
		"total_tickets":      totalTickets,
		"closed_tickets":     closedTickets,
		"pending_approvals":  pendingApprovals,
		"sla_breaches":       slaBreaches,
		"critical_alerts":    criticalAlerts,
		"online_technicians": onlineTechnicians,
		"total_technicians":  totalTechnicians,
	})
}

func handleGetRecentTickets(c *gin.Context) {
	tickets, err := ticket.ListRecentTickets(5)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tickets": tickets})
}

func handleGetDashboardSummary(c *gin.Context) {
	summary, err := dashboard.GetDashboardSummary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, summary)
}

func handleGetDashboardTrends(c *gin.Context) {
	trends, err := dashboard.GetTrendAnalytics()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, trends)
}

// handleListAuditLogs returns paginated audit log records from the database.
// Query params: page, page_size, action, resource_type, user_id
func handleListAuditLogs(c *gin.Context) {
	page := 1
	pageSize := 30
	if p, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(c.DefaultQuery("page_size", "30")); err == nil && ps > 0 && ps <= 200 {
		pageSize = ps
	}

	type AuditLogWithUser struct {
		db.AuditLog
		ActorName string `json:"actor_name"`
	}

	query := db.DB.Model(&db.AuditLog{}).
		Select("audit_logs.*, COALESCE(users.name, 'System') as actor_name").
		Joins("LEFT JOIN users ON users.id = audit_logs.user_id")

	if action := c.Query("action"); action != "" {
		query = query.Where("audit_logs.action = ?", action)
	}
	if resourceType := c.Query("resource_type"); resourceType != "" {
		query = query.Where("audit_logs.resource_type = ?", resourceType)
	}
	if userID := c.Query("user_id"); userID != "" {
		query = query.Where("audit_logs.user_id = ?", userID)
	}

	var total int64
	query.Count(&total)

	var logs []AuditLogWithUser
	offset := (page - 1) * pageSize
	if err := query.Order("audit_logs.timestamp DESC").Offset(offset).Limit(pageSize).Scan(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":      logs,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// handleGetActivityLog returns a real-time unified activity feed from the database.
// It merges ticket lifecycle events, comments, and technician presence changes.
func handleGetActivityLog(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "20")
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	type ActivityEntry struct {
		ID           string    `json:"id"`
		Action       string    `json:"action"`
		Text         string    `json:"text"`
		TicketNo     string    `json:"ticket_no,omitempty"`
		TicketID     string    `json:"ticket_id,omitempty"`
		ActorName    string    `json:"actor_name,omitempty"`
		Timestamp    time.Time `json:"timestamp"`
	}

	var activities []ActivityEntry

	// --- 1. Recent ticket status changes (created, assigned, resolved, closed) ---
	type TicketActivity struct {
		ID           string
		TicketNo     string
		Title        string
		Status       string
		CreatedAt    time.Time
		UpdatedAt    time.Time
		ResolvedAt   *time.Time
		ClosedAt     *time.Time
		AssignedTo   *string
		AssigneeName *string
		CreatorName  string
	}

	var recentTickets []TicketActivity
	db.DB.Table("tickets t").
		Select(`t.id, t.ticket_no, t.title, t.status, t.created_at, t.updated_at, t.resolved_at, t.closed_at, t.assigned_to,
			u_assignee.name AS assignee_name,
			u_creator.name AS creator_name`).
		Joins("LEFT JOIN users u_assignee ON u_assignee.id = t.assigned_to").
		Joins("LEFT JOIN users u_creator ON u_creator.id = t.created_by").
		Where("t.deleted_at IS NULL").
		Order("t.updated_at DESC").
		Limit(limit).
		Scan(&recentTickets)

	for _, t := range recentTickets {
		var text, action string
		var ts time.Time

		switch t.Status {
		case "resolved":
			action = "ticket_resolved"
			actorName := "Teknisi"
			if t.AssigneeName != nil && *t.AssigneeName != "" {
				actorName = *t.AssigneeName
			}
			text = fmt.Sprintf("Tiket %s diselesaikan oleh %s", t.TicketNo, actorName)
			if t.ResolvedAt != nil {
				ts = *t.ResolvedAt
			} else {
				ts = t.UpdatedAt
			}
		case "closed":
			action = "ticket_closed"
			actorName := "Teknisi"
			if t.AssigneeName != nil && *t.AssigneeName != "" {
				actorName = *t.AssigneeName
			}
			text = fmt.Sprintf("Tiket %s ditutup oleh %s", t.TicketNo, actorName)
			if t.ClosedAt != nil {
				ts = *t.ClosedAt
			} else {
				ts = t.UpdatedAt
			}
		case "assigned", "in_progress":
			action = "ticket_assigned"
			assigneeName := "teknisi"
			if t.AssigneeName != nil && *t.AssigneeName != "" {
				assigneeName = *t.AssigneeName
			}
			text = fmt.Sprintf("Tiket %s ditugaskan kepada %s", t.TicketNo, assigneeName)
			ts = t.UpdatedAt
		default:
			action = "ticket_created"
			creatorName := t.CreatorName
			if creatorName == "" {
				creatorName = "pengguna"
			}
			text = fmt.Sprintf("Tiket baru %s dibuat oleh %s: %s", t.TicketNo, creatorName, t.Title)
			ts = t.CreatedAt
		}

		activities = append(activities, ActivityEntry{
			ID:        "tkt-" + t.ID,
			Action:    action,
			Text:      text,
			TicketNo:  t.TicketNo,
			TicketID:  t.ID,
			ActorName: t.CreatorName,
			Timestamp: ts,
		})
	}

	// --- 2. Recent comments ---
	type CommentActivity struct {
		ID       string
		TicketNo string
		Comment  string
		UserName string
		Internal bool
		Created  time.Time
	}

	var recentComments []CommentActivity
	db.DB.Table("ticket_comments tc").
		Select("tc.id, t.ticket_no, LEFT(tc.comment, 80) AS comment, u.name AS user_name, tc.is_internal AS internal, tc.created_at AS created").
		Joins("JOIN tickets t ON t.id = tc.ticket_id").
		Joins("JOIN users u ON u.id = tc.user_id").
		Where("t.deleted_at IS NULL").
		Order("tc.created_at DESC").
		Limit(limit / 2).
		Scan(&recentComments)

	for _, cm := range recentComments {
		label := "komentar"
		if cm.Internal {
			label = "catatan internal"
		}
		text := fmt.Sprintf("%s menambahkan %s pada tiket %s", cm.UserName, label, cm.TicketNo)
		activities = append(activities, ActivityEntry{
			ID:        "cmt-" + cm.ID,
			Action:    "comment_added",
			Text:      text,
			TicketNo:  cm.TicketNo,
			ActorName: cm.UserName,
			Timestamp: cm.Created,
		})
	}

	// --- 3. Recent technician presence changes ---
	type PresenceActivity struct {
		TechnicianID string
		Name         string
		Status       string
		LastHeartbeat time.Time
	}

	var recentPresence []PresenceActivity
	db.DB.Table("technician_presences tp").
		Select("tp.technician_id, u.name, tp.status, tp.last_heartbeat").
		Joins("JOIN users u ON u.id = tp.technician_id").
		Order("tp.last_heartbeat DESC").
		Limit(5).
		Scan(&recentPresence)

	for _, p := range recentPresence {
		statusLabel := p.Status
		switch p.Status {
		case "online":
			statusLabel = "ONLINE"
		case "offline":
			statusLabel = "OFFLINE"
		case "busy":
			statusLabel = "SIBUK"
		case "away":
			statusLabel = "AWAY"
		case "break", "on_break":
			statusLabel = "ISTIRAHAT"
		case "meeting":
			statusLabel = "MEETING"
		case "on_ticket":
			statusLabel = "MENGERJAKAN TIKET"
		}
		activities = append(activities, ActivityEntry{
			ID:        "pres-" + p.TechnicianID,
			Action:    "presence_update",
			Text:      fmt.Sprintf("Teknisi %s berstatus %s", p.Name, statusLabel),
			ActorName: p.Name,
			Timestamp: p.LastHeartbeat,
		})
	}

	// --- Sort all activities by timestamp desc ---
	for i := 0; i < len(activities)-1; i++ {
		for j := i + 1; j < len(activities); j++ {
			if activities[j].Timestamp.After(activities[i].Timestamp) {
				activities[i], activities[j] = activities[j], activities[i]
			}
		}
	}

	// Trim to limit
	if len(activities) > limit {
		activities = activities[:limit]
	}

	if activities == nil {
		activities = []ActivityEntry{}
	}

	c.JSON(http.StatusOK, gin.H{
		"activities": activities,
		"total":      len(activities),
	})
}

func handleListPosts(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")

	page := 1
	pageSize := 10

	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 {
		pageSize = ps
	}


	posts, total, err := content.ListKBArticles("article", page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if total == 0 {
		posts, total, err = content.ListKBArticles("", page, pageSize)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"posts": posts, "total": total})
}

func handleListPages(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")

	page := 1
	pageSize := 10

	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 {
		pageSize = ps
	}

	pages, total, err := content.ListKBArticles("page", page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if total == 0 {
		pages, total, err = content.ListKBArticles("", page, pageSize)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"pages": pages, "total": total})
}

func handleListMedia(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")

	page := 1
	pageSize := 10

	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 {
		pageSize = ps
	}

	media, total, err := content.ListTicketAttachments(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"media": media, "total": total})
}

func handleListComments(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")

	page := 1
	pageSize := 10

	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 {
		pageSize = ps
	}

	comments, total, err := content.ListTicketComments(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"comments": comments, "total": total})
}

func handleCreatePost(c *gin.Context) {
	var req struct {
		Title    string   `json:"title" binding:"required"`
		Content  string   `json:"content" binding:"required"`
		Category string   `json:"category"`
		Tags     []string `json:"tags"`
		Status   string   `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Category == "" {
		req.Category = "article"
	}
	if req.Status == "" {
		req.Status = "published"
	}

	userID := c.GetString("user_id")
	article, err := content.CreateKBArticle(req.Title, req.Content, req.Category, req.Tags, req.Status, &userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, article)
}

func handleUpdatePost(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Title    string   `json:"title"`
		Content  string   `json:"content"`
		Category string   `json:"category"`
		Tags     []string `json:"tags"`
		Status   string   `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Tags != nil {
		updates["tags"] = pq.StringArray(req.Tags)
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	article, err := content.UpdateKBArticle(id, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, article)
}

func handleDeletePost(c *gin.Context) {
	id := c.Param("id")
	if err := content.DeleteKBArticle(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "post deleted"})
}

func handleCreatePage(c *gin.Context) {
	var req struct {
		Title    string   `json:"title" binding:"required"`
		Content  string   `json:"content" binding:"required"`
		Category string   `json:"category"`
		Tags     []string `json:"tags"`
		Status   string   `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Category == "" {
		req.Category = "page"
	}
	if req.Status == "" {
		req.Status = "published"
	}

	userID := c.GetString("user_id")
	article, err := content.CreateKBArticle(req.Title, req.Content, req.Category, req.Tags, req.Status, &userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, article)
}

func handleUpdatePage(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Title    string   `json:"title"`
		Content  string   `json:"content"`
		Category string   `json:"category"`
		Tags     []string `json:"tags"`
		Status   string   `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Tags != nil {
		updates["tags"] = req.Tags
	}
	if req.Status != "" {
		updates["status"] = req.Status
	}

	article, err := content.UpdateKBArticle(id, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, article)
}

func handleDeletePage(c *gin.Context) {
	id := c.Param("id")
	if err := content.DeleteKBArticle(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "page deleted"})
}

func handleDeleteMedia(c *gin.Context) {
	id := c.Param("id")
	if err := content.DeleteTicketAttachment(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "media deleted"})
}

func handleApproveComment(c *gin.Context) {
	id := c.Param("id")
	if err := content.ApproveTicketComment(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "comment approved"})
}

func handleDeleteComment(c *gin.Context) {
	id := c.Param("id")
	if err := content.DeleteTicketComment(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "comment deleted"})
}

func handleGetRecentAlerts(c *gin.Context) {
	alertService := &monitoring.AlertService{}
	alerts, err := alertService.ListRecentAlerts(5)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"alerts": alerts})
}

func handleResolveAlert(c *gin.Context) {
	id := c.Param("id")
	alertService := &monitoring.AlertService{}
	if err := alertService.ResolveAlert(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "alert resolved"})
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

func handleWebSocket(c *gin.Context) {
	userID := c.Param("user_id")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to upgrade connection"})
		return
	}

	client := hub.NewClient(conn, userID)
	hub.Register(client)

	go client.ReadPump()
	go client.WritePump()
}

func handleAnalyzeIncident(c *gin.Context) {
	var req struct {
		TicketID    string                 `json:"ticket_id"`
		Description string                 `json:"description" binding:"required"`
		Context     map[string]interface{} `json:"context"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	analysis, err := agentOrchestrator.AnalyzeIncident(ctx, ai.AgentRequest{
		TicketID:    req.TicketID,
		Description: req.Description,
		Context:     req.Context,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"analysis": analysis})
}

func handleAnalyzeTicket(c *gin.Context) {
	ticketID := c.Param("id")
	tkt, err := ticket.GetTicket(ticketID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ticket not found"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	analysis, err := agentOrchestrator.AnalyzeIncident(ctx, ai.AgentRequest{
		TicketID:    ticketID,
		Description: tkt.Description,
		Context: map[string]interface{}{
			"severity": tkt.Severity,
			"title":    tkt.Title,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"analysis": analysis})
}

func handleAnalyzeDraft(c *gin.Context) {
	var req struct {
		Subject     string `json:"subject" binding:"required"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	var analysis *ai.AgentResponse
	var err error
	if agentOrchestrator != nil {
		analysis, err = agentOrchestrator.AnalyzeIncident(ctx, ai.AgentRequest{
			Description: req.Subject + "\n" + req.Description,
			Context: map[string]interface{}{
				"title": req.Subject,
			},
		})
	}

	if analysis == nil {
		analysis = &ai.AgentResponse{
			Confidence:  75.0,
			Suggestions: []string{"Tidak ada rekomendasi resolusi otomatis (di luar scope Knowledge Base)."},
		}
	}
	if err != nil {
		log.Printf("Orchestrator analysis failed: %v", err)
	}

	if analysis.Confidence == 0 {
		analysis.Confidence = 75.5
	}

	var duplicates []db.Ticket
	words := strings.Fields(strings.ToLower(req.Subject))
	var conditions []string
	var values []interface{}
	for _, w := range words {
		if len(w) >= 4 {
			conditions = append(conditions, "LOWER(title) LIKE ?")
			values = append(values, "%"+w+"%")
		}
	}
	if len(conditions) > 0 {
		db.DB.Where(strings.Join(conditions, " OR "), values...).Order("created_at DESC").Limit(3).Find(&duplicates)
	} else {
		db.DB.Order("created_at DESC").Limit(3).Find(&duplicates)
	}

	var kbArticles []db.KBArticle
	var kbConditions []string
	var kbValues []interface{}
	for _, w := range words {
		if len(w) >= 4 {
			kbConditions = append(kbConditions, "LOWER(title) LIKE ? OR LOWER(content) LIKE ?")
			kbValues = append(kbValues, "%"+w+"%", "%"+w+"%")
		}
	}
	if len(kbConditions) > 0 {
		var queryArgs []interface{}
		queryArgs = append(queryArgs, "published")
		queryArgs = append(queryArgs, kbValues...)
		db.DB.Where("status = ? AND ("+strings.Join(kbConditions, " OR ")+")", queryArgs...).Limit(3).Find(&kbArticles)
	} else {
		db.DB.Where("status = ?", "published").Limit(3).Find(&kbArticles)
	}

	c.JSON(http.StatusOK, gin.H{
		"analysis":     analysis,
		"duplicates":   duplicates,
		"kb_articles":  kbArticles,
	})
}

func handleChat(c *gin.Context) {
	var req struct {
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	analysis, err := agentOrchestrator.AnalyzeIncident(ctx, ai.AgentRequest{
		Description: req.Message,
		Context:     map[string]interface{}{"source": "chat"},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"analysis": analysis})
}

func handleSyncKB(c *gin.Context) {
	if err := embeddings.SyncKBToQdrant(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "knowledge base synced to Qdrant"})
}

func handleListTools(c *gin.Context) {
	tools := toolRegistry.ListTools()
	var toolList []gin.H
	for _, tool := range tools {
		toolList = append(toolList, gin.H{
			"name":        tool.Name(),
			"description": tool.Description(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"tools": toolList})
}

func handleExecuteTool(c *gin.Context) {
	toolName := c.Param("tool_name")

	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Extract nested keys from "args" to the root level of input map for tool compatibility
	if args, ok := input["args"].(map[string]interface{}); ok {
		for k, v := range args {
			input[k] = v
		}
	}

	tool := toolRegistry.GetTool(toolName)
	if tool == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tool not found"})
		return
	}

	result, err := tool.Execute(c, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	var outputStr string
	switch v := result.(type) {
	case string:
		outputStr = v
	default:
		marshaled, err := json.MarshalIndent(result, "", "  ")
		if err == nil {
			outputStr = string(marshaled)
		} else {
			outputStr = fmt.Sprintf("%v", result)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
		"output":  outputStr,
	})
}

func handleListTechnicians(c *gin.Context) {
	var technicians []struct {
		ID             string     `json:"id"`
		Name           string     `json:"name"`
		Email          string     `json:"email"`
		PresenceStatus string     `gorm:"column:presence_status" json:"presence_status"`
		Shift          string     `gorm:"column:shift" json:"shift"`
		UserStatus     string     `gorm:"column:status" json:"status"`
		LastSeen       *time.Time `gorm:"column:last_seen" json:"last_seen"`
	}

	result := db.DB.
		Table("users u").
		Select("u.id, u.name, u.email, COALESCE(tp.status, 'offline') AS presence_status, COALESCE(tp.shift, '') AS shift, u.status, COALESCE(tp.last_heartbeat, u.last_login, u.created_at) AS last_seen").
		Joins("LEFT JOIN technician_presences tp ON tp.technician_id = u.id").
		Where("u.role = ?", "technician").
		Scan(&technicians)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"technicians": technicians})
}

func handleListOnlineTechnicians(c *gin.Context) {
	var presences []struct {
		ID            string    `json:"id"`
		TechnicianID  string    `json:"technician_id"`
		Status        string    `json:"status"`
		Shift         string    `json:"shift"`
		LastHeartbeat time.Time `json:"last_heartbeat"`
		Name          string    `json:"name"`
		Email         string    `json:"email"`
	}

	result := db.DB.
		Table("technician_presences tp").
		Select("tp.id, tp.technician_id, tp.status, COALESCE(tp.shift, '') AS shift, tp.last_heartbeat, u.name, u.email").
		Joins("JOIN users u ON tp.technician_id = u.id").
		Where("tp.status IN (?, ?, ?)", "online", "on_ticket", "busy").
		Find(&presences)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"online_technicians": presences})
}

func handleGetNavbarStats(c *gin.Context) {
	userID := c.GetString("user_id")

	var totalTickets int64
	db.DB.Model(&db.Ticket{}).Count(&totalTickets)

	var myTickets int64
	db.DB.Model(&db.Ticket{}).Where("created_by = ?", userID).Count(&myTickets)

	var assignedTickets int64
	db.DB.Model(&db.Ticket{}).Where("assigned_to = ? AND status NOT IN ?", userID, []string{"resolved", "closed", "spam", "archived"}).Count(&assignedTickets)

	var openTickets int64
	db.DB.Model(&db.Ticket{}).Where("status IN ?", []string{"created", "open", "assigned", "in_progress"}).Count(&openTickets)

	var pendingTickets int64
	db.DB.Model(&db.Ticket{}).Where("status IN ?", []string{"need_approval", "pending"}).Count(&pendingTickets)

	var waitingCustomerTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "waiting_customer").Count(&waitingCustomerTickets)

	var waitingVendorTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "waiting_vendor").Count(&waitingVendorTickets)

	var escalatedTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "escalated").Count(&escalatedTickets)

	var criticalTickets int64
	db.DB.Model(&db.Ticket{}).Where("severity IN ?", []string{"critical", "p1_emergency"}).Count(&criticalTickets)

	var resolvedTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "resolved").Count(&resolvedTickets)

	var closedTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "closed").Count(&closedTickets)

	var spamTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "spam").Count(&spamTickets)

	var archiveTickets int64
	db.DB.Model(&db.Ticket{}).Where("status = ?", "archived").Count(&archiveTickets)

	var unreadAlerts int64
	db.DB.Model(&db.Alert{}).Where("status = ?", "active").Count(&unreadAlerts)

	var pendingApprovals int64
	db.DB.Model(&db.Approval{}).Where("status = ?", "pending").Count(&pendingApprovals)

	c.JSON(http.StatusOK, gin.H{
		"total_tickets":            totalTickets,
		"my_tickets":               myTickets,
		"assigned_tickets":         assignedTickets,
		"open_tickets":             openTickets,
		"pending_tickets":          pendingTickets,
		"waiting_customer_tickets": waitingCustomerTickets,
		"waiting_vendor_tickets":   waitingVendorTickets,
		"escalated_tickets":         escalatedTickets,
		"critical_tickets":         criticalTickets,
		"resolved_tickets":         resolvedTickets,
		"closed_tickets":           closedTickets,
		"spam_tickets":             spamTickets,
		"archive_tickets":          archiveTickets,
		"unread_alerts":            unreadAlerts,
		"pending_approvals":        pendingApprovals,
	})
}

func handleGetNavbarTechnicians(c *gin.Context) {
	var technicians []struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
		Shift  string `json:"shift"`
	}

	result := db.DB.
		Table("users u").
		Select("u.id, u.name, COALESCE(tp.status, 'offline') AS status, COALESCE(tp.shift, '') AS shift").
		Joins("LEFT JOIN technician_presences tp ON tp.technician_id = u.id").
		Where("u.role = ?", "technician").
		Find(&technicians)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"technicians": technicians})
}

func handleTechnicianStatus(c *gin.Context) {
	var technicians []struct {
		ID             string     `json:"id"`
		Name           string     `json:"name"`
		Email          string     `json:"email"`
		Role           string     `json:"role"`
		UserStatus     string     `json:"user_status"`
		PresenceStatus string     `gorm:"column:presence_status" json:"status"`
		Shift          string     `gorm:"column:shift" json:"shift"`
		LastSeen       *time.Time `gorm:"column:last_seen" json:"last_seen"`
	}

	result := db.DB.
		Table("users u").
		Select("u.id, u.name, u.email, u.role, u.status AS user_status, COALESCE(tp.status, 'offline') AS presence_status, COALESCE(tp.shift, '') AS shift, COALESCE(tp.last_heartbeat, u.last_login, u.created_at) AS last_seen").
		Joins("LEFT JOIN technician_presences tp ON tp.technician_id = u.id").
		Where("u.role = ?", "technician").
		Scan(&technicians)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"technicians": technicians})
}

func handleUpdateTechnicianStatus(c *gin.Context) {
	userID := c.GetString("user_id")
	userRole := c.GetString("user_role")

	if userRole != "technician" && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only technicians or admins can update status"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validStatuses := map[string]bool{
		"online":    true,
		"offline":   true,
		"busy":      true,
		"idle":      true,
		"on_ticket": true,
		"on_break":  true,
		"away":      true,
		"meeting":   true,
		"break":     true,
	}

	status := strings.ToLower(req.Status)
	if !validStatuses[status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	isOnline := status != "offline"
	if err := db.DB.Model(&db.User{}).Where("id = ?", userID).Update("is_online", isOnline).Error; err != nil {
		log.Println("Error updating user is_online status:", err)
	}

	var presence db.TechnicianPresence
	if err := db.DB.Where("technician_id = ?", userID).First(&presence).Error; err != nil {
		presence = db.TechnicianPresence{
			ID:            uuid.New().String(),
			TechnicianID:  userID,
			Status:        status,
			LastHeartbeat: time.Now(),
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		if err := db.DB.Create(&presence).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		presenceUpdates := map[string]interface{}{
			"status":         status,
			"last_heartbeat": time.Now(),
			"updated_at":     time.Now(),
		}
		if err := db.DB.Model(&presence).Updates(presenceUpdates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if hub != nil {
		hub.BroadcastPresenceUpdate(userID, status)
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "presence_status": status})
}

func handleUpdateTechnicianShift(c *gin.Context) {
	userID := c.GetString("user_id")
	userRole := c.GetString("user_role")

	if userRole != "technician" && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only technicians or admins can update shift"})
		return
	}

	var req struct {
		Shift string `json:"shift" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	shift := req.Shift
	validShifts := map[string]bool{
		"Pagi":  true,
		"Siang": true,
		"Sore":  true,
	}
	if !validShifts[shift] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shift"})
		return
	}

	var presence db.TechnicianPresence
	if err := db.DB.Where("technician_id = ?", userID).First(&presence).Error; err != nil {
		presence = db.TechnicianPresence{
			ID:            uuid.New().String(),
			TechnicianID:  userID,
			Status:        "online",
			Shift:         shift,
			LastHeartbeat: time.Now(),
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		if err := db.DB.Create(&presence).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		presenceUpdates := map[string]interface{}{
			"shift":          shift,
			"last_heartbeat": time.Now(),
			"updated_at":     time.Now(),
		}
		if err := db.DB.Model(&presence).Updates(presenceUpdates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if hub != nil {
		hub.BroadcastPresenceUpdate(userID, presence.Status)
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok", "shift": shift})
}

func handleGlobalSearch(c *gin.Context) {
	queryStr := c.Query("q")
	if queryStr == "" {
		c.JSON(http.StatusOK, gin.H{
			"tickets": []db.Ticket{},
			"assets":  []db.Asset{},
			"users":   []db.User{},
		})
		return
	}

	searchPattern := "%" + strings.ToLower(queryStr) + "%"

	// 1. Search tickets
	var tickets []db.Ticket
	db.DB.Preload("Creator").Preload("Assignee").
		Where("LOWER(ticket_no) LIKE ? OR LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(device) LIKE ?", 
			searchPattern, searchPattern, searchPattern, searchPattern).
		Limit(15).
		Find(&tickets)

	// 2. Search assets
	var assets []db.Asset
	db.DB.Where("LOWER(hostname) LIKE ? OR LOWER(ip_address) LIKE ? OR LOWER(serial_number) LIKE ? OR LOWER(model) LIKE ?", 
		searchPattern, searchPattern, searchPattern, searchPattern).
		Limit(15).
		Find(&assets)

	// 3. Search users (customers & technicians)
	var users []db.User
	db.DB.Where("role != 'admin' AND (LOWER(name) LIKE ? OR LOWER(username) LIKE ? OR LOWER(email) LIKE ?)", 
		searchPattern, searchPattern, searchPattern).
		Limit(15).
		Find(&users)

	c.JSON(http.StatusOK, gin.H{
		"tickets": tickets,
		"assets":  assets,
		"users":   users,
	})
}

func handleTelegramUpdate(u integrations.Update) {
	if u.Message == nil {
		return
	}

	chatID := u.Message.Chat.ID
	text := u.Message.Text
	if text == "" && u.Message.Caption != "" {
		text = u.Message.Caption
	}

	var photoFileID string
	if len(u.Message.Photo) > 0 {
		largestPhoto := u.Message.Photo[len(u.Message.Photo)-1]
		photoFileID = largestPhoto.FileID
	}

	if text == "" && photoFileID != "" {
		text = "Laporan Foto / Gangguan dari Telegram"
	}

	if text == "" {
		return
	}

	log.Printf("Received Telegram message from %d: %s", chatID, text)

	if strings.HasPrefix(text, "/approve") || strings.HasPrefix(text, "/execute") {
		parts := strings.Fields(text)
		if len(parts) < 2 {
			telegramService.SendMessage(chatID, "Format salah. Gunakan: <code>/approve [TICKET_NO]</code> atau <code>/execute [TICKET_NO]</code>")
			return
		}
		ticketNo := parts[1]

		var tkt db.Ticket
		var err error
		if _, uuidErr := uuid.Parse(ticketNo); uuidErr == nil {
			err = db.DB.Where("ticket_no = ? OR id = ?", ticketNo, ticketNo).First(&tkt).Error
		} else {
			err = db.DB.Where("LOWER(ticket_no) = LOWER(?)", ticketNo).First(&tkt).Error
		}
		if err != nil {
			telegramService.SendMessage(chatID, fmt.Sprintf("❌ Tiket dengan nomor atau ID <code>%s</code> tidak ditemukan.", ticketNo))
			return
		}

		var action db.TicketAction
		if err := db.DB.Where("ticket_id = ? AND status = ?", tkt.ID, "proposed").First(&action).Error; err != nil {
			telegramService.SendMessage(chatID, fmt.Sprintf("❌ Tidak ada tindakan otomatis yang diajukan/belum disetujui untuk tiket <code>%s</code>.", ticketNo))
			return
		}

		var adminUser db.User
		if err := db.DB.Where("role = ?", "admin").First(&adminUser).Error; err != nil {
			log.Printf("Failed to find admin user for telegram approval: %v", err)
			telegramService.SendMessage(chatID, "❌ Gagal menyetujui tindakan (System Error - Admin not found).")
			return
		}

		// Approve action!
		approvedAction, err := ticket.ApproveAction(action.ID, adminUser.ID)
		if err != nil {
			telegramService.SendMessage(chatID, fmt.Sprintf("❌ Gagal menyetujui tindakan: %v", err))
			return
		}

		// Update corresponding db.Approval if present
		db.DB.Model(&db.Approval{}).Where("job_id = ?", action.ID).Updates(map[string]interface{}{
			"status":      "approved",
			"approved_at": ptrTime(time.Now()),
		})

		// Trigger remote execution via NATS
		target := approvedAction.Target
		if target == "localhost" || target == "" {
			var reg db.AgentRegistry
			if err := db.DB.Where("status = ?", "online").First(&reg).Error; err == nil {
				target = reg.Hostname
			} else {
				target, _ = os.Hostname() // Fallback to current host
			}
		}

		err = automation.PublishAction(target, approvedAction.ActionType, approvedAction.Command)
		if err != nil {
			telegramService.SendMessage(chatID, fmt.Sprintf("⚠️ Tindakan disetujui, tetapi gagal mengirimkan perintah ke agent: %v", err))
			return
		}

		telegramService.SendMessage(chatID, fmt.Sprintf("✅ Tindakan otomatis untuk tiket <code>%s</code> berhasil disetujui dan dikirim ke agent <code>%s</code>!\n\n⚙️ <b>Detail Perintah:</b>\n- Jenis: <code>%s</code>\n- Perintah: <code>%s</code>", ticketNo, target, approvedAction.ActionType, approvedAction.Command))
		return
	}

	if strings.HasPrefix(text, "/status") {
		// handle status command
		tickets, err := db.GetRecentTickets(5)
		if err != nil {
			telegramService.SendMessage(chatID, "Maaf, gagal mengambil status tiket saat ini.")
			return
		}

		var resp strings.Builder
		resp.WriteString("<b>🎫 5 Tiket Terakhir:</b>\n\n")
		for _, t := range tickets {
			var statusEmoji string
			switch t.Status {
			case "closed", "resolved":
				statusEmoji = "✅"
			case "open":
				statusEmoji = "🔴"
			default:
				statusEmoji = "🔵"
			}
			resp.WriteString(fmt.Sprintf("%s #%s: %s\nStatus: %s\n\n", statusEmoji, t.ID, t.Title, t.Status))
		}
		telegramService.SendMessage(chatID, resp.String())
		return
	}

	if text == "/start" || text == "/help" {
		telegramService.SendMessage(chatID, "Selamat datang di <b>Agentic AI Helpdesk</b>! 🤖\n\n<b>Perintah yang Tersedia:</b>\n- Ketik pesan biasa: Menambah balasan ke tiket aktif yang ada\n- <code>/new [pesan]</code> atau <code>/tiket [pesan]</code>: Paksa buat tiket baru\n- <code>/close</code>: Selesaikan/Tutup tiket aktif Anda\n- <code>/status</code>: Lihat status tiket terbaru\n- <code>/approve [TICKET_NO]</code>: Setujui usulan tindakan otomatis AI")
		return
	}

	// Command: /close (close active ticket for this telegram user)
	if text == "/close" || text == "/selesai" {
		var activeTicket db.Ticket
		if err := db.DB.Where("telegram_chat_id = ? AND status IN (?, ?, ?)", chatID, "open", "in_progress", "pending").Order("created_at desc").First(&activeTicket).Error; err == nil {
			db.DB.Model(&activeTicket).Updates(map[string]interface{}{
				"status":     "closed",
				"closed_at":  ptrTime(time.Now()),
				"updated_at": time.Now(),
			})
			if hub != nil {
				hub.Broadcast(map[string]interface{}{
					"type":      "ticket_updated",
					"ticket_id": activeTicket.ID,
					"timestamp": time.Now().Unix(),
				})
			}
			telegramService.SendMessage(chatID, fmt.Sprintf("✅ Tiket <code>#%s</code> berhasil ditutup. Pesan Anda berikutnya akan membuat tiket baru secara otomatis.", activeTicket.TicketNo))
		} else {
			telegramService.SendMessage(chatID, "ℹ️ Tidak ada tiket aktif yang sedang terbuka untuk ditutup.")
		}
		return
	}

	// Check if user explicitly wants a force-new ticket via /new or /tiket
	isForceNew := false
	if strings.HasPrefix(text, "/new") || strings.HasPrefix(text, "/tiket") || strings.HasPrefix(text, "/ticket") {
		isForceNew = true
		parts := strings.SplitN(text, " ", 2)
		if len(parts) > 1 && strings.TrimSpace(parts[1]) != "" {
			text = strings.TrimSpace(parts[1])
		} else {
			text = "Laporan Tiket Baru dari Telegram"
		}
	}

	var adminUser db.User
	if err := db.DB.Where("role = ?", "admin").First(&adminUser).Error; err != nil {
		log.Printf("Failed to find admin user for telegram ticket: %v", err)
		telegramService.SendMessage(chatID, "Maaf, gagal memproses pesan Telegram. (System Error - Admin not found)")
		return
	}

	// 1. Check if there is already an active (non-closed/non-archived) ticket for this TelegramChatID (unless /new specified)
	if !isForceNew {
		var activeTicket db.Ticket
		errExisting := db.DB.Where("telegram_chat_id = ? AND status NOT IN (?, ?, ?)", chatID, "closed", "archived", "spam").Order("created_at desc").First(&activeTicket).Error
		if errExisting == nil {
			// Existing active ticket found -> Append message as a comment/reply!
			comment, errC := ticket.AddComment(activeTicket.ID, adminUser.ID, "📱 [Telegram Pelanggan]: "+text, false)
			if errC == nil {
				// Save attachment if present
				if photoFileID != "" {
					if mkdirErr := os.MkdirAll("./uploads", 0755); mkdirErr == nil {
						uniqueName := uuid.New().String() + ".jpg"
						destPath := filepath.Join("./uploads", uniqueName)
						written, dlErr := telegramService.DownloadFile(photoFileID, destPath)
						if dlErr == nil {
							att := db.TicketAttachment{
								ID:         uuid.New().String(),
								TicketID:   activeTicket.ID,
								Filename:   "telegram_photo.jpg",
								FilePath:   "/api/uploads/" + uniqueName,
								FileSize:   written,
								MimeType:   "image/jpeg",
								UploadedBy: adminUser.ID,
								CreatedAt:  time.Now(),
							}
							db.DB.Create(&att)
						}
					}
				}

				// Trigger notifications for Technicians & Admins
				if notificationService != nil {
					_ = notificationService.NotifyCommentAdded(activeTicket.ID, activeTicket.TicketNo, adminUser.ID, "📱 [Telegram Pelanggan]: "+text, false)
				}

				// Broadcast live WebSocket event to Admin & Technician dashboards
				if hub != nil {
					hub.Broadcast(map[string]interface{}{
						"type":       "ticket_updated",
						"ticket_id":  activeTicket.ID,
						"comment_id": comment.ID,
						"timestamp":  time.Now().Unix(),
					})
				}

				telegramService.SendMessage(chatID, fmt.Sprintf("✅ Balasan Anda telah ditambahkan ke tiket <code>#%s</code>.", activeTicket.TicketNo))
				return
			}
		}
	}

	// 2. Create a new ticket in the database if no active ticket exists
	ticketID := uuid.New().String()

	// Automatically detect device/hostname mentioned in Telegram text (e.g., "PC MKT-NUC", "Amelia-Admin", "MKT-BMAX")
	matchedDevice := ""
	var allAssets []db.Asset
	if db.DB.Find(&allAssets).Error == nil {
		lowerText := strings.ToLower(text)
		for _, ast := range allAssets {
			if ast.Hostname != "" && strings.Contains(lowerText, strings.ToLower(ast.Hostname)) {
				matchedDevice = ast.Hostname
				break
			}
		}
	}

	newTicket := db.Ticket{
		ID:             ticketID,
		TicketNo:       fmt.Sprintf("TICK-%d-%s", time.Now().Year(), strings.ToUpper(uuid.New().String()[:4])),
		Title:          "Telegram: " + strings.Split(text, "\n")[0],
		Description:    text,
		Status:         "open",
		Severity:       "medium",
		CreatedBy:      adminUser.ID, // System/Internal user UUID
		Device:         matchedDevice,
		TelegramChatID: chatID,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := db.DB.Table("tickets").Create(&newTicket).Error; err != nil {
		log.Printf("Failed to create ticket from Telegram: %v", err)
		telegramService.SendMessage(chatID, "Maaf, gagal membuat tiket otomatis. (DB Error)")
		return
	}

	log.Printf("Ticket created: %s", newTicket.TicketNo)

	if notificationService != nil {
		_ = notificationService.NotifyTicketCreated(newTicket.ID, newTicket.TicketNo, adminUser.ID)
	}

	// If there is an attachment/photo, download and save it
	if photoFileID != "" {
		if mkdirErr := os.MkdirAll("./uploads", 0755); mkdirErr == nil {
			uniqueName := uuid.New().String() + ".jpg"
			destPath := filepath.Join("./uploads", uniqueName)
			written, dlErr := telegramService.DownloadFile(photoFileID, destPath)
			if dlErr == nil {
				attachment := db.TicketAttachment{
					ID:         uuid.New().String(),
					TicketID:   ticketID,
					Filename:   "telegram_photo.jpg",
					FilePath:   "/api/uploads/" + uniqueName,
					FileSize:   written,
					MimeType:   "image/jpeg",
					UploadedBy: adminUser.ID,
					CreatedAt:  time.Now(),
				}
				if dbErr := db.DB.Create(&attachment).Error; dbErr != nil {
					log.Printf("Failed to save attachment to database: %v", dbErr)
				} else {
					log.Printf("Successfully saved telegram photo as attachment: %s", attachment.FilePath)
				}
			} else {
				log.Printf("Failed to download telegram file: %v", dlErr)
			}
		} else {
			log.Printf("Failed to create uploads directory: %v", mkdirErr)
		}
	}

	// 2. Process with AI asynchronously
	telegramService.SendMessage(chatID, fmt.Sprintf("✅ <b>Tiket Berhasil Dibuat: #%s</b>\nSedang dianalisa oleh AI... 🧠", newTicket.TicketNo))

	go func(tkt db.Ticket, originalText string) {
		ctx := context.Background()
		analysis, err := agentOrchestrator.AnalyzeIncident(ctx, ai.AgentRequest{
			TicketID:    tkt.ID,
			Description: originalText,
			Context: map[string]interface{}{
				"user_id": adminUser.ID,
				"source":  "telegram",
			},
		})
		if err != nil {
			telegramService.SendMessage(chatID, "Maaf, AI sedang mengalami gangguan dalam menganalisa tiket.")
			log.Printf("Failed to analyze Telegram ticket %s: %v", tkt.TicketNo, err)
			return
		}

		response := analysis.AIReport
		if response == "" {
			response = fmt.Sprintf("Analisa selesai.\nAkar penyebab: %s", analysis.RootCause)
		}

		// 3. Update ticket with AI summary
		db.DB.Model(&tkt).Update("ai_summary", response)

		if zammadClient != nil {
			req := integrations.ZammadCreateTicketRequest{
				Title:    tkt.Title,
				Group:    "Users",
				Customer: adminUser.Email,
				Article: integrations.ZammadArticle{
					Subject:  "Telegram Report",
					Body:     tkt.Description + "\n\n--- AI Summary ---\n" + response,
					Type:     "note",
					Internal: false,
				},
			}
			_, err := zammadClient.CreateTicket(ctx, req)
			if err != nil {
				log.Printf("Failed to push to Zammad: %v", err)
			}
		}

		telegramService.SendMessage(chatID, "<b>Hasil Analisa AI:</b>\n\n"+response)

		// 4. Check for proposed actions to suggest execution
		var action db.TicketAction
		if err := db.DB.Where("ticket_id = ? AND status = ?", tkt.ID, "proposed").First(&action).Error; err == nil {
			msg := fmt.Sprintf("⚙️ <b>Tindakan Otomatis Diusulkan:</b>\n- Jenis: <code>%s</code>\n- Target: <code>%s</code>\n- Perintah: <code>%s</code>\n\nUntuk menyetujui dan mengeksekusi tindakan ini langsung dari Telegram, silakan ketik:\n<code>/approve %s</code> atau <code>/execute %s</code>", action.ActionType, action.Target, action.Command, tkt.TicketNo, tkt.TicketNo)
			telegramService.SendMessage(chatID, msg)
		}
	}(newTicket, text)
}

func handleTelegramWebhook(c *gin.Context) {
	var update integrations.Update
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	handleTelegramUpdate(update)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func updateTechnicianOnline(userID string) {
	// Update is_online in users table for all users
	if err := db.DB.Model(&db.User{}).Where("id = ?", userID).Update("is_online", true).Error; err != nil {
		log.Println("Error updating user is_online to true:", err)
	}

	var presence db.TechnicianPresence
	if err := db.DB.Where("technician_id = ?", userID).First(&presence).Error; err != nil {
		presence = db.TechnicianPresence{
			ID:            uuid.New().String(),
			TechnicianID:  userID,
			Status:        "online",
			LastHeartbeat: time.Now(),
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		if err := db.DB.Create(&presence).Error; err != nil {
			log.Println("Error creating presence:", err)
			return
		}
		if hub != nil {
			hub.BroadcastPresenceUpdate(userID, "online")
		}
	} else {
		// Keep current status if it's already active (away, busy, meeting, break, etc.)
		newStatus := presence.Status
		if newStatus == "offline" || newStatus == "" {
			newStatus = "online"
		}
		statusChanged := presence.Status != newStatus
		presenceUpdates := map[string]interface{}{
			"status":         newStatus,
			"last_heartbeat": time.Now(),
			"updated_at":     time.Now(),
		}
		if err := db.DB.Model(&presence).Updates(presenceUpdates).Error; err != nil {
			log.Println("Error updating presence:", err)
			return
		}
		if statusChanged && hub != nil {
			hub.BroadcastPresenceUpdate(userID, newStatus)
		}
	}
}

func updateTechnicianOffline(userID string) {
	// Update is_online in users table for all users
	if err := db.DB.Model(&db.User{}).Where("id = ?", userID).Update("is_online", false).Error; err != nil {
		log.Println("Error updating user is_online to false:", err)
	}

	var presence db.TechnicianPresence
	if err := db.DB.Where("technician_id = ?", userID).First(&presence).Error; err == nil {
		statusChanged := presence.Status != "offline"
		presenceUpdates := map[string]interface{}{
			"status":         "offline",
			"last_heartbeat": time.Now(),
			"updated_at":     time.Now(),
		}
		if err := db.DB.Model(&presence).Updates(presenceUpdates).Error; err != nil {
			log.Println("Error updating presence to offline:", err)
			return
		}
		if statusChanged && hub != nil {
			hub.BroadcastPresenceUpdate(userID, "offline")
		}
	}
}

func startPresenceScheduler() {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			dbCheckPresenceScheduler()
		}
	}()
}

func dbCheckPresenceScheduler() {
	threshold := time.Now().Add(-2 * time.Minute)
	var expiredPresences []db.TechnicianPresence

	err := db.DB.Where("status != ? AND last_heartbeat < ?", "offline", threshold).Find(&expiredPresences).Error
	if err != nil {
		log.Println("Error querying expired presences in scheduler:", err)
		return
	}

	for _, presence := range expiredPresences {
		log.Printf("Scheduler: marking technician %s as offline (last heartbeat: %v)", presence.TechnicianID, presence.LastHeartbeat)

		// Update is_online in users table
		if err := db.DB.Model(&db.User{}).Where("id = ? AND role = ?", presence.TechnicianID, "technician").Update("is_online", false).Error; err != nil {
			log.Println("Error updating user is_online to false in scheduler:", err)
		}

		presenceUpdates := map[string]interface{}{
			"status":     "offline",
			"updated_at": time.Now(),
		}
		if err := db.DB.Model(&presence).Updates(presenceUpdates).Error; err != nil {
			log.Println("Error updating presence to offline in scheduler:", err)
			continue
		}

		if hub != nil {
			hub.BroadcastPresenceUpdate(presence.TechnicianID, "offline")
		}
	}
}

func handlePresenceHeartbeat(c *gin.Context) {
	userID := c.GetString("user_id")
	userRole := c.GetString("user_role")

	if userRole == "technician" {
		updateTechnicianOnline(userID)
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleAdminTechniciansPresence(c *gin.Context) {
	var results []struct {
		ID       string    `json:"id"`
		Name     string    `json:"name"`
		Status   string    `json:"status"`
		Shift    string    `json:"shift"`
		LastSeen time.Time `json:"last_seen"`
	}

	err := db.DB.
		Table("users u").
		Select("u.id, u.name, COALESCE(tp.status, 'offline') AS status, COALESCE(tp.shift, '') AS shift, COALESCE(tp.last_heartbeat, u.last_login, u.created_at) AS last_seen").
		Joins("LEFT JOIN technician_presences tp ON tp.technician_id = u.id").
		Where("u.role = ?", "technician").
		Order("u.name ASC").
		Scan(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, results)
}

func handleListNotifications(c *gin.Context) {
	userID := c.GetString("user_id")
	var notifications []db.Notification
	if err := db.DB.Where("user_id = ?", userID).Order("created_at DESC").Find(&notifications).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"notifications": notifications})
}

func handleMarkNotificationRead(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetString("user_id")
	if err := db.DB.Model(&db.Notification{}).Where("id = ? AND user_id = ?", id, userID).Updates(map[string]interface{}{
		"is_read": true,
		"read_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleMarkAllNotificationsRead(c *gin.Context) {
	userID := c.GetString("user_id")
	if err := db.DB.Model(&db.Notification{}).Where("user_id = ?", userID).Updates(map[string]interface{}{
		"is_read": true,
		"read_at": time.Now(),
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleDeleteNotification(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetString("user_id")
	if err := db.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&db.Notification{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleGetSystemStatus(c *gin.Context) {
	postgresStatus := "operational"
	if sqlDB, err := db.DB.DB(); err != nil || sqlDB.Ping() != nil {
		postgresStatus = "degraded"
	}

	aiStatus := "operational"
	if agentOrchestrator == nil {
		aiStatus = "offline"
	}

	var activeDevices int64
	fiveMinutesAgo := time.Now().Add(-5 * time.Minute)
	db.DB.Model(&db.Device{}).Where("last_seen > ?", fiveMinutesAgo).Count(&activeDevices)

	c.JSON(http.StatusOK, gin.H{
		"postgres":       postgresStatus,
		"ai":             aiStatus,
		"backend":        "operational",
		"active_agents":  activeDevices,
		"server_time":    time.Now().Format(time.RFC3339),
	})
}

func handleFileUpload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	// Create uploads directory if not exists
	if err := os.MkdirAll("./uploads", 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create uploads directory"})
		return
	}

	// Generate a unique filename using UUID
	ext := filepath.Ext(file.Filename)
	uniqueName := uuid.New().String() + ext
	filePath := filepath.Join("./uploads", uniqueName)

	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Return the URL that can be served via Nginx and Gin
	c.JSON(http.StatusOK, gin.H{
		"url":      "/api/uploads/" + uniqueName,
		"filename": file.Filename,
		"size":     file.Size,
	})
}

func handleResetDatabase(c *gin.Context) {
	userRole := c.GetString("user_role")
	if userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized: Only administrators can reset the database"})
		return
	}

	tx := db.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start database transaction"})
		return
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Truncate tables and restart identity sequence keys
	query := `TRUNCATE TABLE 
		notifications, 
		ticket_comments, 
		ticket_attachments, 
		incidents, 
		escalations, 
		ticket_actions, 
		automation_jobs, 
		approvals, 
		sla_breach_logs, 
		tickets, 
		ai_messages, 
		ai_conversations,
		alerts 
		RESTART IDENTITY CASCADE`

	if err := tx.Exec(query).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to truncate database tables: %v", err)})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit database reset transaction"})
		return
	}

	// Broadcast WS message if hub is available so all connected clients clear/reload their state
	if hub != nil {
		hub.Broadcast(map[string]interface{}{
			"type":      "database_reset",
			"timestamp": time.Now().Unix(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Database reset completed successfully. All tickets, chats, and notifications have been cleared."})
}

// ── ADMIN USER MANAGEMENT HANDLERS ────────────────────────────

func handleAdminListUsers(c *gin.Context) {
	userRole := c.GetString("user_role")
	if userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akses ditolak: Hanya admin yang dapat mengelola pengguna"})
		return
	}

	searchQuery := c.Query("query")
	roleFilter := c.Query("role")

	type UserWithDetails struct {
		ID        string     `json:"id"`
		Name      string     `json:"name"`
		Username  string     `json:"username"`
		Email     string     `json:"email"`
		Role      string     `json:"role"`
		Status    string     `json:"status"`
		Shift     string     `json:"shift,omitempty"`
		IsOnline  bool       `json:"is_online"`
		LastLogin *time.Time `json:"last_login"`
		CreatedAt time.Time  `json:"created_at"`
		UpdatedAt time.Time  `json:"updated_at"`
	}

	var users []UserWithDetails
	query := db.DB.Table("users u").
		Select("u.id, u.name, u.username, u.email, u.role, u.status, u.is_online, u.last_login, u.created_at, u.updated_at, COALESCE(tp.shift, '') as shift").
		Joins("LEFT JOIN technician_presences tp ON tp.technician_id = u.id").
		Where("u.deleted_at IS NULL")

	if roleFilter != "" && roleFilter != "all" {
		query = query.Where("u.role = ?", roleFilter)
	}

	if searchQuery != "" {
		s := "%" + searchQuery + "%"
		query = query.Where("u.name ILIKE ? OR u.username ILIKE ? OR u.email ILIKE ?", s, s, s)
	}

	if err := query.Order("u.created_at DESC").Scan(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengambil daftar pengguna"})
		return
	}

	currentUserID := c.GetString("user_id")
	for i := range users {
		if (currentUserID != "" && users[i].ID == currentUserID) || (hub != nil && hub.IsUserConnected(users[i].ID)) {
			users[i].IsOnline = true
		}
	}

	c.JSON(http.StatusOK, gin.H{"users": users, "total": len(users)})
}

func handleAdminCreateUser(c *gin.Context) {
	userRole := c.GetString("user_role")
	if userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akses ditolak: Hanya admin yang dapat membuat pengguna"})
		return
	}

	var req struct {
		Name     string `json:"name" binding:"required"`
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
		Role     string `json:"role" binding:"required"`
		Status   string `json:"status"`
		Shift    string `json:"shift"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data input tidak valid"})
		return
	}

	if req.Status == "" {
		req.Status = "active"
	}

	// Check existing username or email
	var existing int64
	db.DB.Model(&db.User{}).Where("(username = ? OR email = ?) AND deleted_at IS NULL", req.Username, req.Email).Count(&existing)
	if existing > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Username atau Email sudah terdaftar"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses enkripsi password"})
		return
	}

	newUser := db.User{
		ID:           uuid.New().String(),
		Name:         req.Name,
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		Role:         req.Role,
		Status:       req.Status,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := db.DB.Create(&newUser).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat pengguna baru"})
		return
	}

	if req.Role == "technician" {
		presence := db.TechnicianPresence{
			ID:           uuid.New().String(),
			TechnicianID: newUser.ID,
			Status:       "offline",
			Shift:        req.Shift,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		db.DB.Create(&presence)
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Pengguna berhasil dibuat", "user": newUser})
}

func handleAdminUpdateUser(c *gin.Context) {
	userRole := c.GetString("user_role")
	if userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akses ditolak"})
		return
	}

	targetID := c.Param("id")
	var req struct {
		Name     string `json:"name"`
		Username string `json:"username"`
		Email    string `json:"email"`
		Role     string `json:"role"`
		Status   string `json:"status"`
		Shift    string `json:"shift"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Data input tidak valid"})
		return
	}

	var user db.User
	if err := db.DB.Where("id = ? AND deleted_at IS NULL", targetID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pengguna tidak ditemukan"})
		return
	}

	if req.Name != "" { user.Name = req.Name }
	if req.Username != "" { user.Username = req.Username }
	if req.Email != "" { user.Email = req.Email }
	if req.Role != "" { user.Role = req.Role }
	if req.Status != "" { user.Status = req.Status }
	user.UpdatedAt = time.Now()

	if err := db.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memperbarui data pengguna"})
		return
	}

	if user.Role == "technician" && req.Shift != "" {
		var presence db.TechnicianPresence
		if err := db.DB.Where("technician_id = ?", user.ID).First(&presence).Error; err == nil {
			presence.Shift = req.Shift
			presence.UpdatedAt = time.Now()
			db.DB.Save(&presence)
		} else {
			db.DB.Create(&db.TechnicianPresence{
				ID:           uuid.New().String(),
				TechnicianID: user.ID,
				Status:       "offline",
				Shift:        req.Shift,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Data pengguna berhasil diperbarui", "user": user})
}

func handleAdminResetUserPassword(c *gin.Context) {
	userRole := c.GetString("user_role")
	if userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akses ditolak"})
		return
	}

	targetID := c.Param("id")
	var req struct {
		NewPassword string `json:"new_password"`
	}

	c.ShouldBindJSON(&req)

	newPass := req.NewPassword
	if newPass == "" {
		newPass = "Helpdesk@2026"
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPass), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mereset password"})
		return
	}

	if err := db.DB.Model(&db.User{}).Where("id = ? AND deleted_at IS NULL", targetID).Update("password_hash", string(hashedPassword)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan password baru"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password berhasil direset", "new_password": newPass})
}

func handleAdminDeleteUser(c *gin.Context) {
	userRole := c.GetString("user_role")
	currentUserID := c.GetString("user_id")
	targetID := c.Param("id")

	if userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akses ditolak"})
		return
	}

	if currentUserID == targetID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Anda tidak dapat menghapus akun Anda sendiri"})
		return
	}

	now := time.Now()
	if err := db.DB.Model(&db.User{}).Where("id = ?", targetID).Update("deleted_at", &now).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus pengguna"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pengguna berhasil dihapus"})
}

