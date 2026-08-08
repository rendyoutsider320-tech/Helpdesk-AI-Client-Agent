package db

import "time"

// AIConversation represents a user's AI chat session
type AIConversation struct {
	ID        string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID    string    `gorm:"index;not null" json:"user_id"`
	User      *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	Messages []AIMessage `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

func (AIConversation) TableName() string { return "ai_conversations" }

// AIMessage represents a single message in an AI conversation
type AIMessage struct {
	ID             string    `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	ConversationID string    `gorm:"index;not null" json:"conversation_id"`
	Role           string    `json:"role"` // user, assistant
	Content        string    `json:"content"`
	AttachmentURL  string    `json:"attachment_url,omitempty"`
	AttachmentType string    `json:"attachment_type,omitempty"` // image, log, screenshot
	CreatedAt      time.Time `json:"created_at"`
}

func (AIMessage) TableName() string { return "ai_messages" }
