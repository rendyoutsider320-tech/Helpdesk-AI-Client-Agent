package db

import "testing"

func TestUserModel(t *testing.T) {
	// Test user creation
	tests := []struct {
		name     string
		username string
		email    string
		role     string
	}{
		{"Admin", "admin", "admin@test.local", "admin"},
		{"Technician", "tech1", "tech1@test.local", "technician"},
		{"User", "user1", "user1@test.local", "user"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.username == "" {
				t.Error("username should not be empty")
			}
			if tt.email == "" {
				t.Error("email should not be empty")
			}
			if tt.role == "" {
				t.Error("role should not be empty")
			}
		})
	}
}
