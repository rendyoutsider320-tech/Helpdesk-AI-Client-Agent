package middleware

import (
	"strconv"
	"github.com/gin-gonic/gin"
)

const (
	DefaultPage  = 1
	DefaultLimit = 50
	MaxLimit     = 500
)

// PaginationMiddleware injects standard pagination parameters into the request context
func PaginationMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", strconv.Itoa(DefaultPage)))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(DefaultLimit)))
		sortBy := c.DefaultQuery("sort_by", "created_at")
		sortOrder := c.DefaultQuery("sort_order", "desc")

		if page <= 0 {
			page = 1
		}
		if limit <= 0 {
			limit = DefaultLimit
		}
		if limit > MaxLimit {
			limit = MaxLimit
		}

		offset := (page - 1) * limit

		c.Set("pagination_page", page)
		c.Set("pagination_limit", limit)
		c.Set("pagination_offset", offset)
		c.Set("sort_by", sortBy)
		c.Set("sort_order", sortOrder)

		c.Next()
	}
}
