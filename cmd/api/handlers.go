package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/helpdesk-ai/core/internal/actions"
	"github.com/helpdesk-ai/core/internal/events"
	"github.com/helpdesk-ai/core/internal/integrations"
)

// ============= Event Handler Routes =============

func handlePublishEvent(c *gin.Context) {
	var event events.ExternalEvent
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if event.ID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event id is required"})
		return
	}

	event.Timestamp = time.Now()
	eventStore.Store(event)

	if err := eventHandler.PublishEvent(event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message":  "event published to queue",
		"event_id": event.ID,
	})
}

func handleListEvents(c *gin.Context) {
	events := eventStore.List()
	c.JSON(http.StatusOK, gin.H{
		"total":  len(events),
		"events": events,
	})
}

// ============= Action Executor Routes =============

func handleSubmitAction(c *gin.Context) {
	var req actions.ExecutionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	req.ApprovedBy = userID.(string)
	req.ApprovedAt = time.Now()

	requestID, err := actionExecutor.SubmitRequest(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message":    "action submitted for execution",
		"request_id": requestID,
	})
}

func handleGetActionResult(c *gin.Context) {
	resultID := c.Param("id")
	result, exists := actionExecutor.GetResult(resultID)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "action result not found"})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ============= Zammad Integration Routes =============

func handleZammadWebhook(c *gin.Context) {
	if zammadClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "zammad integration not configured"})
		return
	}

	var payload integrations.ZammadWebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := integrations.ProcessZammadWebhook(payload); err != nil {
		log.Printf("Webhook processing error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "webhook processed",
		"ticket_id": payload.Ticket.ID,
	})
}

func handleZammadManualSync(c *gin.Context) {
	if zammadSyncScheduler == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "zammad integration not configured"})
		return
	}

	count, err := zammadSyncScheduler.ManualSync(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "sync completed",
		"tickets_synced": count,
	})
}

func handleZammadStatus(c *gin.Context) {
	if zammadClient == nil {
		c.JSON(http.StatusOK, gin.H{
			"status":  "disabled",
			"message": "zammad integration not configured",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":        "enabled",
		"message":       "zammad integration active",
		"sync_interval": "5 minutes",
	})
}
