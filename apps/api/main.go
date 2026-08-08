package main

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"

	"github.com/helpdesk-ai/core/internal/auth"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/monitoring"
	"github.com/helpdesk-ai/core/internal/ticket"
	"github.com/helpdesk-ai/core/internal/tools"
	wsocket "github.com/helpdesk-ai/core/internal/websocket"
)

var hub *wsocket.Hub
var monitoringEngine *monitoring.MonitoringEngine
var toolRegistry *tools.Registry

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
	// Initialize database
	if err := db.InitDB(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer func() {
		if err := db.CloseDB(); err != nil {
			log.Printf("CloseDB error: %v", err)
		}
	}()

	// Initialize WebSocket hub
	hub = wsocket.NewHub()
	go hub.Run()

	// Initialize monitoring engine
	monitoringEngine = monitoring.NewMonitoringEngine()
	monitoringEngine.Start()

	// Initialize tool registry
	toolRegistry = tools.InitializeToolRegistry()

	// Create Gin router
	router := gin.Default()

	// Middleware
	router.Use(CORSMiddleware())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Auth routes
	authGroup := router.Group("/api/v1/auth")
	{
		authGroup.POST("/login", handleLogin)
		authGroup.POST("/register", handleRegister)
		authGroup.POST("/refresh-token", handleRefreshToken)
		authGroup.POST("/logout", handleLogout)
	}

	// Ticket routes
	ticketGroup := router.Group("/api/v1/tickets")
	ticketGroup.Use(AuthMiddleware())
	{
		ticketGroup.POST("", handleCreateTicket)
		ticketGroup.GET("", handleListTickets)
		ticketGroup.GET("/:id", handleGetTicket)
		ticketGroup.PUT("/:id", handleUpdateTicket)
		ticketGroup.POST("/:id/comments", handleAddComment)
		ticketGroup.POST("/:id/assign", handleAssignTicket)
		ticketGroup.POST("/:id/resolve", handleResolveTicket)
		ticketGroup.POST("/:id/close", handleCloseTicket)
	}

	// Device routes
	deviceGroup := router.Group("/api/v1/devices")
	deviceGroup.Use(AuthMiddleware())
	{
		deviceGroup.GET("", handleListDevices)
		deviceGroup.GET("/:id/metrics", handleGetDeviceMetrics)
	}

	// Alert routes
	alertGroup := router.Group("/api/v1/alerts")
	alertGroup.Use(AuthMiddleware())
	{
		alertGroup.GET("", handleListAlerts)
		alertGroup.POST("/:id/resolve", handleResolveAlert)
	}

	// Tools routes
	toolsGroup := router.Group("/api/v1/tools")
	toolsGroup.Use(AuthMiddleware())
	{
		toolsGroup.GET("", handleListTools)
		toolsGroup.POST("/:tool_name/execute", handleExecuteTool)
	}

	// WebSocket route
	router.GET("/ws/:user_id", handleWebSocket)

	// Start server
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 Server running on port %s\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

// ========== MIDDLEWARE ==========

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		// Remove "Bearer " prefix
		if len(token) > 7 && token[:7] == "Bearer " {
			token = token[7:]
		}

		// Validate token
		claims, err := auth.ValidateToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims.ID)
		c.Set("user_role", claims.Role)
		c.Next()
	}
}

// ========== AUTH HANDLERS ==========

func handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	var user db.User
	if err := db.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	accessToken, err := auth.GenerateToken(user.ID, user.Username, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"role":     user.Role,
		},
	})
}

func handleRegister(c *gin.Context) {
	var req struct {
		Name     string `json:"name"`
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
		Role     string `json:"role"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
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

	// Check if user exists
	var existing db.User
	if err := db.DB.Where("username = ? OR email = ?", req.Username, req.Email).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
		return
	}

	// Hash password
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	name := req.Name
	if name == "" {
		name = req.Username
	}

	// Create user
	user := db.User{
		ID:           uuid.New().String(),
		Name:         name,
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         role,
		Status:       "active",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := db.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "user created successfully"})
}

func handleRefreshToken(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	claims, err := auth.ValidateToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	newToken, err := auth.GenerateToken(claims.ID, claims.Username, claims.Email, claims.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"access_token": newToken})
}

func handleLogout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

// ========== TICKET HANDLERS ==========

func handleCreateTicket(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Title       string `json:"title" binding:"required"`
		Description string `json:"description" binding:"required"`
		Severity    string `json:"severity" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	tkt, err := ticket.CreateTicket(req.Title, req.Description, req.Severity, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create ticket"})
		return
	}

	c.JSON(http.StatusCreated, tkt)
}

func handleListTickets(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")

	page := 1
	pageSize := 10

	// Parse page number
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}

	// Parse page size
	if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
		pageSize = ps
	}

	// Build filters
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

	tickets, total, err := ticket.ListTickets(page, pageSize, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list tickets"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tickets": tickets, "total": total})
}

func handleGetTicket(c *gin.Context) {
	ticketID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"ticket_id": ticketID})
}

func handleUpdateTicket(c *gin.Context) {
	ticketID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"ticket_id": ticketID, "message": "updated"})
}

func handleAddComment(c *gin.Context) {
	ticketID := c.Param("id")
	userID := c.GetString("user_id")

	var req struct {
		Comment string `json:"comment" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"ticket_id": ticketID,
		"user_id":   userID,
		"comment":   req.Comment,
	})
}

func handleAssignTicket(c *gin.Context) {
	ticketID := c.Param("id")

	var req struct {
		TechnicianID string `json:"technician_id" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ticket_id":     ticketID,
		"technician_id": req.TechnicianID,
		"message":       "ticket assigned",
	})
}

func handleResolveTicket(c *gin.Context) {
	ticketID := c.Param("id")

	var req struct {
		Resolution string `json:"resolution" binding:"required"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ticket_id":  ticketID,
		"resolution": req.Resolution,
		"message":    "ticket resolved",
	})
}

func handleCloseTicket(c *gin.Context) {
	ticketID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"ticket_id": ticketID, "message": "ticket closed"})
}

// ========== DEVICE HANDLERS ==========

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
		}
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

func handleGetDeviceMetrics(c *gin.Context) {
	deviceID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"device_id": deviceID, "metrics": []interface{}{}})
}

// ========== ALERT HANDLERS ==========

func handleListAlerts(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"alerts": []interface{}{}})
}

func handleResolveAlert(c *gin.Context) {
	alertID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"alert_id": alertID, "message": "alert resolved"})
}

// ========== TOOLS HANDLERS ==========

func handleListTools(c *gin.Context) {
	tools := toolRegistry.ListTools()
	c.JSON(http.StatusOK, gin.H{"tools": tools})
}

func handleExecuteTool(c *gin.Context) {
	toolName := c.Param("tool_name")

	var req struct {
		Input map[string]interface{} `json:"input"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	tool := toolRegistry.GetTool(toolName)
	if tool == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tool not found"})
		return
	}

	result, err := tool.Execute(c, req.Input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tool": toolName, "result": result})
}

// ========== WEBSOCKET HANDLER ==========

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleWebSocket(c *gin.Context) {
	userID := c.Param("user_id")

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to upgrade connection"})
		return
	}

	client := hub.NewClient(ws, userID)
	hub.Register(client)

	// Start read/write pumps
	go client.WritePump()
	go client.ReadPump()
}
