package content

import (
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/lib/pq"
)

// ListKBArticles returns knowledge base articles with optional category filtering.
func ListKBArticles(category string, page, pageSize int) ([]db.KBArticle, int64, error) {
	var articles []db.KBArticle
	var total int64

	query := db.DB.Preload("Author").Model(&db.KBArticle{})
	if category != "" {
		query = query.Where("category = ?", category)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := 0
	if page > 1 {
		offset = (page - 1) * pageSize
	}

	if err := query.Order("updated_at DESC").Offset(offset).Limit(pageSize).Find(&articles).Error; err != nil {
		return nil, 0, err
	}

	return articles, total, nil
}

// ListTicketComments returns paginated ticket comments.
func ListTicketComments(page, pageSize int) ([]db.TicketComment, int64, error) {
	var comments []db.TicketComment
	var total int64

	query := db.DB.Preload("User").Model(&db.TicketComment{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := 0
	if page > 1 {
		offset = (page - 1) * pageSize
	}

	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&comments).Error; err != nil {
		return nil, 0, err
	}

	return comments, total, nil
}

// ListTicketAttachments returns paginated file attachments for tickets.
func ListTicketAttachments(page, pageSize int) ([]db.TicketAttachment, int64, error) {
	var attachments []db.TicketAttachment
	var total int64

	query := db.DB.Preload("Uploader").Model(&db.TicketAttachment{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := 0
	if page > 1 {
		offset = (page - 1) * pageSize
	}

	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&attachments).Error; err != nil {
		return nil, 0, err
	}

	return attachments, total, nil
}

func GetKBArticleByID(id string) (*db.KBArticle, error) {
	var article db.KBArticle
	result := db.DB.Preload("Author").First(&article, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &article, nil
}

func CreateKBArticle(title, content, category string, tags []string, status string, authorID *string) (*db.KBArticle, error) {
	article := &db.KBArticle{
		ID:        uuid.New().String(),
		Title:     title,
		Content:   content,
		Category:  category,
		Tags:      tags,
		AuthorID:  authorID,
		Status:    status,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	result := db.DB.Create(article)
	if result.Error != nil {
		return nil, result.Error
	}

	return article, nil
}

func UpdateKBArticle(id string, updates map[string]interface{}) (*db.KBArticle, error) {
	if tags, ok := updates["tags"]; ok {
		if tagSlice, isSlice := tags.([]string); isSlice {
			updates["tags"] = pq.StringArray(tagSlice)
		}
	}
	updates["updated_at"] = time.Now()
	result := db.DB.Model(&db.KBArticle{}).Where("id = ?", id).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	return GetKBArticleByID(id)
}

func DeleteKBArticle(id string) error {
	result := db.DB.Delete(&db.KBArticle{}, "id = ?", id)
	return result.Error
}

func DeleteTicketAttachment(id string) error {
	result := db.DB.Delete(&db.TicketAttachment{}, "id = ?", id)
	return result.Error
}

func ApproveTicketComment(id string) error {
	result := db.DB.Model(&db.TicketComment{}).Where("id = ?", id).Updates(map[string]interface{}{"is_internal": false, "updated_at": time.Now()})
	return result.Error
}

func DeleteTicketComment(id string) error {
	result := db.DB.Delete(&db.TicketComment{}, "id = ?", id)
	return result.Error
}
