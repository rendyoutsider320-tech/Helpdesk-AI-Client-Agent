package main

import (
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateBucket struct {
	mu        sync.Mutex
	remaining int
	reset     time.Time
}

type RateLimiter struct {
	visitors    sync.Map
	maxRequests int
	window      time.Duration
}

func NewRateLimiter(maxRequests int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		maxRequests: maxRequests,
		window:      window,
	}
}

func isPrivateIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	privateIPBlocks := []*net.IPNet{
		{IP: net.IPv4(10, 0, 0, 0), Mask: net.CIDRMask(8, 32)},
		{IP: net.IPv4(172, 16, 0, 0), Mask: net.CIDRMask(12, 32)},
		{IP: net.IPv4(192, 168, 0, 0), Mask: net.CIDRMask(16, 32)},
	}
	for _, block := range privateIPBlocks {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

func (rl *RateLimiter) getBucket(key string) *rateBucket {
	value, exists := rl.visitors.Load(key)
	if exists {
		bucket := value.(*rateBucket)
		return bucket
	}

	bucket := &rateBucket{
		remaining: rl.maxRequests,
		reset:     time.Now().Add(rl.window),
	}
	rl.visitors.Store(key, bucket)
	return bucket
}

func (rl *RateLimiter) Limit(c *gin.Context) {
	key := c.ClientIP()
	
	// Bypass rate limiting for private/local IP addresses
	if isPrivateIP(key) {
		c.Next()
		return
	}

	if userID, exists := c.Get("user_id"); exists {
		key = fmt.Sprintf("user:%v", userID)
	}
	bucket := rl.getBucket(key)

	bucket.mu.Lock()
	defer bucket.mu.Unlock()

	if time.Now().After(bucket.reset) {
		bucket.remaining = rl.maxRequests
		bucket.reset = time.Now().Add(rl.window)
	}

	if bucket.remaining <= 0 {
		c.Header("Retry-After", fmt.Sprintf("%d", int(time.Until(bucket.reset).Seconds())))
		c.AbortWithStatusJSON(429, gin.H{"error": "rate limit exceeded"})
		return
	}

	bucket.remaining--
	c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rl.maxRequests))
	c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", bucket.remaining))
	c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", int(time.Until(bucket.reset).Seconds())))

	c.Next()
}

func RateLimitMiddleware() gin.HandlerFunc {
	return NewRateLimiter(5000, time.Minute).Limit
}
