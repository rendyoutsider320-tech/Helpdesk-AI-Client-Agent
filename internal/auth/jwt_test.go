package auth

import (
	"testing"
	"time"
)

func TestHashPassword(t *testing.T) {
	password := "TestPassword123!"
	hash, err := HashPassword(password)

	if err != nil {
		t.Fatalf("Failed to hash password: %v", err)
	}

	if hash == "" {
		t.Error("Hash should not be empty")
	}

	if hash == password {
		t.Error("Hash should not equal plain password")
	}
}

func TestCheckPassword(t *testing.T) {
	password := "TestPassword123!"
	hash, _ := HashPassword(password)

	if !CheckPassword(hash, password) {
		t.Error("Password check failed for correct password")
	}

	if CheckPassword(hash, "WrongPassword") {
		t.Error("Password check succeeded for incorrect password")
	}
}

func TestGenerateToken(t *testing.T) {
	token, err := GenerateToken("user-123", "testuser", "test@example.com", "user")

	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	if token == "" {
		t.Error("Token should not be empty")
	}

	// Token should be valid
	claims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("Failed to validate token: %v", err)
	}

	if claims.ID != "user-123" {
		t.Errorf("Expected user ID 'user-123', got %s", claims.ID)
	}

	if claims.Username != "testuser" {
		t.Errorf("Expected username 'testuser', got %s", claims.Username)
	}
}

func TestRefreshToken(t *testing.T) {
	refreshToken, err := GenerateRefreshToken("user-123", "testuser", "test@example.com", "user")

	if err != nil {
		t.Fatalf("Failed to generate refresh token: %v", err)
	}

	claims, err := ValidateToken(refreshToken)
	if err != nil {
		t.Fatalf("Failed to validate refresh token: %v", err)
	}

	// Refresh token should be valid
	if claims.ID != "user-123" {
		t.Error("Refresh token validation failed")
	}
}

func TestTokenExpiration(t *testing.T) {
	// This test would need to manipulate time or use a different approach
	// For now, just ensure tokens are generated with expiration times
	token, _ := GenerateToken("user-123", "testuser", "test@example.com", "user")
	claims, _ := ValidateToken(token)

	if claims.ExpiresAt == nil {
		t.Error("Token should have expiration time")
	}

	// Token should expire 24 hours from now (approximately)
	expiresIn := time.Until(claims.ExpiresAt.Time)
	if expiresIn < 23*time.Hour || expiresIn > 25*time.Hour {
		t.Errorf("Token expiration should be ~24 hours, got %v", expiresIn)
	}
}
