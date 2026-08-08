package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// A simple token bucket rate limiter per IP.
// In a full production environment, this should be backed by Redis.
type rateLimiter struct {
	ips map[string]int
	mu  sync.Mutex
	limit int
}

var globalLimiter = &rateLimiter{
	ips:   make(map[string]int),
	limit: 1000, // 1000 requests per minute
}

func init() {
	// Reset the counter every minute
	go func() {
		for {
			time.Sleep(time.Minute)
			globalLimiter.mu.Lock()
			globalLimiter.ips = make(map[string]int)
			globalLimiter.mu.Unlock()
		}
	}()
}

// RateLimiterMiddleware blocks IP addresses that exceed the configured request threshold
func RateLimiterMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Exempt OPTIONS preflight requests
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		ip := c.ClientIP()

		globalLimiter.mu.Lock()
		count := globalLimiter.ips[ip]
		if count >= globalLimiter.limit {
			globalLimiter.mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			return
		}
		globalLimiter.ips[ip] = count + 1
		globalLimiter.mu.Unlock()

		c.Next()
	}
}
