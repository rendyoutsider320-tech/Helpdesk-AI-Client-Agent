package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm/clause"
)

// Claims represents JWT claims
type Claims struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

var jwtSecret []byte

func getJWTSecret() []byte {
	if len(jwtSecret) == 0 {
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			log.Fatal("CRITICAL: JWT_SECRET environment variable is not set. A secure secret is required for production.")
		}
		jwtSecret = []byte(secret)
	}
	return jwtSecret
}

// GenerateToken generates a JWT token
func GenerateToken(id, username, email, role string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		ID:       id,
		Username: username,
		Email:    email,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(getJWTSecret())
	if err != nil {
		log.Println("Error signing token:", err)
		return "", err
	}

	return tokenString, nil
}

// ValidateToken validates a JWT token
func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return getJWTSecret(), nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

// ValidateTokenExpired parses a token and returns claims if signature is valid, even if expired.
func ValidateTokenExpired(tokenString string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return getJWTSecret(), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return claims, nil
		}
		return nil, err
	}

	return claims, nil
}

// HashPassword hashes a password using bcrypt
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

// CheckPassword checks a password against a hash
func CheckPassword(hash, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// GenerateRefreshToken generates a refresh token (longer expiration)
func GenerateRefreshToken(id, username, email, role string) (string, error) {
	expirationTime := time.Now().Add(7 * 24 * time.Hour)
	claims := &Claims{
		ID:       id,
		Username: username,
		Email:    email,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(getJWTSecret())
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func hashToken(tokenStr string) string {
	h := sha256.New()
	h.Write([]byte(tokenStr))
	return hex.EncodeToString(h.Sum(nil))
}

func RegisterRefreshToken(userID, tokenStr string) error {
	hash := hashToken(tokenStr)
	claims, err := ValidateToken(tokenStr)
	if err != nil {
		return err
	}
	rt := db.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    userID,
		TokenHash: hash,
		IsRevoked: false,
		ExpiresAt: claims.ExpiresAt.Time,
		CreatedAt: time.Now(),
	}
	return db.DB.Create(&rt).Error
}

func RevokeRefreshToken(tokenStr string, replacedByID string) error {
	hash := hashToken(tokenStr)
	return db.DB.Model(&db.RefreshToken{}).Where("token_hash = ?", hash).Updates(map[string]interface{}{
		"is_revoked":  true,
		"replaced_by": replacedByID,
	}).Error
}

func IsRefreshTokenValid(tokenStr string) (bool, string) {
	hash := hashToken(tokenStr)
	var rt db.RefreshToken
	if err := db.DB.First(&rt, "token_hash = ?", hash).Error; err != nil {
		return false, ""
	}
	if rt.IsRevoked || time.Now().After(rt.ExpiresAt) {
		if rt.IsRevoked {
			log.Printf("WARNING: Replay attack detected for refresh token hash %s! Revoking all tokens for user %s.", hash, rt.UserID)
			db.DB.Model(&db.RefreshToken{}).Where("user_id = ?", rt.UserID).Update("is_revoked", true)
		}
		return false, rt.UserID
	}
	return true, rt.UserID
}

func BlacklistAccessToken(tokenStr string) error {
	hash := hashToken(tokenStr)
	claims, err := ValidateTokenExpired(tokenStr)
	if err != nil {
		return err
	}
	bt := db.BlacklistedToken{
		TokenHash: hash,
		ExpiresAt: claims.ExpiresAt.Time,
	}
	return db.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&bt).Error
}

func IsAccessTokenBlacklisted(tokenStr string) bool {
	hash := hashToken(tokenStr)
	var bt db.BlacklistedToken
	db.DB.Limit(1).Find(&bt, "token_hash = ?", hash)
	return bt.TokenHash != ""
}
