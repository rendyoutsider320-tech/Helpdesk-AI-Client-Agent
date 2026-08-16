package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/ai"
	"github.com/helpdesk-ai/core/internal/auth"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/embeddings"
)

// =============================================
// AI STREAMING CHAT HANDLER
// =============================================

func handleChatStream(c *gin.Context) {
	var req struct {
		Message        string `json:"message" binding:"required"`
		ConversationID string `json:"conversation_id"`
		AttachmentURL  string `json:"attachment_url"`
		AttachmentType string `json:"attachment_type"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	ollamaURL := ai.GetActiveOllamaURL()
	model := ai.GetActiveLLMModel()
	if ollamaURL == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	// Build context from previous messages if conversationID provided
	var contextMessages []map[string]string
	contextMessages = append(contextMessages, map[string]string{
		"role":    "system",
		"content": "Kamu adalah AI Copilot helpdesk IT profesional. Jawab dalam Bahasa Indonesia. Berikan solusi teknis yang akurat, langkah demi langkah jika perlu. Gunakan markdown untuk formatting. Jika masalah tidak dapat diselesaikan sendiri, sarankan untuk membuat tiket dukungan.",
	})

	if req.ConversationID != "" {
		var msgs []db.AIMessage
		db.DB.Where("conversation_id = ?", req.ConversationID).Order("created_at ASC").Limit(20).Find(&msgs)
		for _, m := range msgs {
			contextMessages = append(contextMessages, map[string]string{
				"role":    m.Role,
				"content": m.Content,
			})
		}
	}

	contextMessages = append(contextMessages, map[string]string{
		"role":    "user",
		"content": req.Message,
	})

	// Store user message
	var conversationID string
	if req.ConversationID != "" {
		conversationID = req.ConversationID
	} else {
		// Create new conversation
		conv := db.AIConversation{
			ID:        uuid.New().String(),
			UserID:    fmt.Sprintf("%v", userID),
			Title:     truncateString(req.Message, 60),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if err := db.DB.Create(&conv).Error; err != nil {
			log.Printf("Failed to create conversation: %v", err)
		}
		conversationID = conv.ID
	}

	userMsg := db.AIMessage{
		ID:             uuid.New().String(),
		ConversationID: conversationID,
		Role:           "user",
		Content:        req.Message,
		AttachmentURL:  req.AttachmentURL,
		AttachmentType: req.AttachmentType,
		CreatedAt:      time.Now(),
	}
	db.DB.Create(&userMsg)

	// Set up SSE streaming headers immediately to keep connection alive
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Conversation-ID", conversationID)
	c.Writer.Flush()

	// Call Ollama with streaming
	reqBody := map[string]interface{}{
		"model":    model,
		"messages": contextMessages,
		"stream":   true,
		"options": map[string]interface{}{
			"temperature": 0.3,
			"num_predict": 2048, // Allow full detailed explanations now that SSE keeps connection alive
		},
	}
	payload, _ := json.Marshal(reqBody)
	ollamaReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost,
		fmt.Sprintf("%s/api/chat", strings.TrimRight(ollamaURL, "/")), bytes.NewReader(payload))
	if err != nil {
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonMustMarshal(map[string]string{
			"content": fmt.Sprintf("⚠️ Failed to create request: %v", err),
		}))
		c.Writer.Flush()
		return
	}
	ollamaReq.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{Timeout: 10 * time.Minute}
	resp, err := httpClient.Do(ollamaReq)
	if err != nil {
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonMustMarshal(map[string]string{
			"content": fmt.Sprintf("⚠️ AI service error: %v. Pastikan Ollama berjalan.", err),
		}))
		c.Writer.Flush()
		return
	}
	defer resp.Body.Close()

	var fullResponse strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(line), &chunk); err != nil {
			continue
		}
		if msg, ok := chunk["message"].(map[string]interface{}); ok {
			if content, ok := msg["content"].(string); ok {
				fullResponse.WriteString(content)
				// Send SSE event
				fmt.Fprintf(c.Writer, "data: %s\n\n", jsonMustMarshal(map[string]string{
					"content":         content,
					"conversation_id": conversationID,
				}))
				c.Writer.Flush()
			}
		}
		if done, _ := chunk["done"].(bool); done {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("Scanner error during chat stream: %v", err)
	}

	// Store assistant response
	if fullResponse.Len() > 0 {
		assistantMsg := db.AIMessage{
			ID:             uuid.New().String(),
			ConversationID: conversationID,
			Role:           "assistant",
			Content:        fullResponse.String(),
			CreatedAt:      time.Now(),
		}
		db.DB.Create(&assistantMsg)

		// Update conversation title if it was a new one
		if req.ConversationID == "" {
			db.DB.Model(&db.AIConversation{}).Where("id = ?", conversationID).
				Update("updated_at", time.Now())
		}
	}

	// Signal end of stream
	fmt.Fprintf(c.Writer, "data: %s\n\n", jsonMustMarshal(map[string]interface{}{
		"done":            true,
		"conversation_id": conversationID,
	}))
	c.Writer.Flush()
}

func jsonMustMarshal(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func truncateString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// =============================================
// AI CONVERSATION HISTORY HANDLERS
// =============================================

func handleListConversations(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var convs []db.AIConversation
	if err := db.DB.Where("user_id = ?", fmt.Sprintf("%v", userID)).
		Order("updated_at DESC").
		Limit(50).
		Omit("Messages").
		Find(&convs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"conversations": convs})
}

func handleCreateConversation(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var req struct {
		Title string `json:"title"`
	}
	c.ShouldBindJSON(&req)
	if req.Title == "" {
		req.Title = "Percakapan Baru"
	}
	conv := db.AIConversation{
		ID:        uuid.New().String(),
		UserID:    fmt.Sprintf("%v", userID),
		Title:     req.Title,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := db.DB.Create(&conv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"conversation": conv})
}

func handleGetConversation(c *gin.Context) {
	userID, _ := c.Get("user_id")
	convID := c.Param("id")
	var conv db.AIConversation
	if err := db.DB.Preload("Messages", func(db_ interface{}) interface{} {
		return db_.(*db.AIConversation)
	}).Where("id = ? AND user_id = ?", convID, fmt.Sprintf("%v", userID)).First(&conv).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"conversation": conv})
}

func handleDeleteConversation(c *gin.Context) {
	userID, _ := c.Get("user_id")
	convID := c.Param("id")
	result := db.DB.Where("id = ? AND user_id = ?", convID, fmt.Sprintf("%v", userID)).Delete(&db.AIConversation{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
		return
	}
	// Delete messages too
	db.DB.Where("conversation_id = ?", convID).Delete(&db.AIMessage{})
	c.JSON(http.StatusOK, gin.H{"message": "conversation deleted"})
}

func handleAddMessage(c *gin.Context) {
	userID, _ := c.Get("user_id")
	convID := c.Param("id")

	// Verify conversation belongs to user
	var conv db.AIConversation
	if err := db.DB.Where("id = ? AND user_id = ?", convID, fmt.Sprintf("%v", userID)).First(&conv).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
		return
	}

	var req struct {
		Role           string `json:"role" binding:"required"`
		Content        string `json:"content" binding:"required"`
		AttachmentURL  string `json:"attachment_url"`
		AttachmentType string `json:"attachment_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msg := db.AIMessage{
		ID:             uuid.New().String(),
		ConversationID: convID,
		Role:           req.Role,
		Content:        req.Content,
		AttachmentURL:  req.AttachmentURL,
		AttachmentType: req.AttachmentType,
		CreatedAt:      time.Now(),
	}
	if err := db.DB.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	db.DB.Model(&conv).Update("updated_at", time.Now())
	c.JSON(http.StatusCreated, gin.H{"message": msg})
}

func handleListMessages(c *gin.Context) {
	userID, _ := c.Get("user_id")
	convID := c.Param("id")

	// Verify conversation belongs to user
	var conv db.AIConversation
	if err := db.DB.Where("id = ? AND user_id = ?", convID, fmt.Sprintf("%v", userID)).First(&conv).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "conversation not found"})
		return
	}

	var messages []db.AIMessage
	if err := db.DB.Where("conversation_id = ?", convID).Order("created_at ASC").Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// =============================================
// PROFILE HANDLERS
// =============================================

func handleGetMyProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var user db.User
	if err := db.DB.Where("id = ?", fmt.Sprintf("%v", userID)).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	// Never send password hash
	user.PasswordHash = ""
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func handleUpdateMyProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
		Dept  string `json:"department"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Email != "" {
		updates["email"] = req.Email
	}
	updates["updated_at"] = time.Now()

	if err := db.DB.Model(&db.User{}).Where("id = ?", fmt.Sprintf("%v", userID)).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "profile updated"})
}

func handleUpdateMyPassword(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user db.User
	if err := db.DB.Where("id = ?", fmt.Sprintf("%v", userID)).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if !auth.CheckPassword(user.PasswordHash, req.OldPassword) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "password lama tidak sesuai"})
		return
	}

	hashed, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	if err := db.DB.Model(&db.User{}).Where("id = ?", fmt.Sprintf("%v", userID)).
		Updates(map[string]interface{}{"password_hash": hashed, "updated_at": time.Now()}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

// =============================================
// KNOWLEDGE BASE HANDLERS
// =============================================

func handleListKBArticles(c *gin.Context) {
	category := c.Query("category")
	page := 1
	pageSize := 20

	query := db.DB.Model(&db.KBArticle{}).Where("status = ?", "published")
	if category != "" {
		query = query.Where("category = ?", category)
	}

	var total int64
	query.Count(&total)

	var articles []db.KBArticle
	if err := query.Order("views_count DESC, created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&articles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"articles": articles,
		"total":    total,
		"page":     page,
	})
}

func handleGetKBArticle(c *gin.Context) {
	id := c.Param("id")
	var article db.KBArticle
	if err := db.DB.Preload("Author").Where("id = ? AND status = ?", id, "published").First(&article).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
		return
	}
	// Increment view count
	db.DB.Model(&article).UpdateColumn("views_count", article.ViewsCount+1)
	c.JSON(http.StatusOK, gin.H{"article": article})
}

func handleMarkKBHelpful(c *gin.Context) {
	id := c.Param("id")
	if err := db.DB.Model(&db.KBArticle{}).Where("id = ?", id).
		UpdateColumn("helpful_count", db.DB.Raw("helpful_count + 1")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "marked as helpful"})
}

func handleSearchKB(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing query parameter q"})
		return
	}

	semantic := c.Query("semantic") == "true"
	var articles []db.KBArticle

	if semantic {
		results, err := embeddings.SearchQdrant(c.Request.Context(), q, 10)
		if err == nil && len(results) > 0 {
			var ids []string
			for _, item := range results {
				if idStr, ok := item["id"].(string); ok {
					ids = append(ids, idStr)
				}
			}

			if len(ids) > 0 {
				var dbArticles []db.KBArticle
				if err := db.DB.Where("id IN ? AND status = ?", ids, "published").Find(&dbArticles).Error; err == nil {
					// Map by ID to maintain score sorting order
					sortMap := make(map[string]db.KBArticle)
					for _, art := range dbArticles {
						sortMap[art.ID] = art
					}
					for _, id := range ids {
						if art, exists := sortMap[id]; exists {
							articles = append(articles, art)
						}
					}
				}
			}
		}
	}

	// Fallback to standard search if not semantic or semantic query returned no results/failed
	if len(articles) == 0 {
		searchTerm := "%" + strings.ToLower(q) + "%"
		if err := db.DB.Where("status = ? AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(category) LIKE ?)",
			"published", searchTerm, searchTerm, searchTerm).
			Order("views_count DESC").
			Limit(15).
			Find(&articles).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"articles": articles, "query": q})
}


