package db

import (
	"testing"
	"time"
)

func TestTechnicianPresenceTableName(t *testing.T) {
	presence := TechnicianPresence{}
	expectedTableName := "technician_presences"
	if presence.TableName() != expectedTableName {
		t.Errorf("Expected TableName() to return %q, got %q", expectedTableName, presence.TableName())
	}
}

func TestTechnicianPresenceFields(t *testing.T) {
	now := time.Now()
	presence := TechnicianPresence{
		ID:            "presence-123",
		TechnicianID:  "tech-123",
		Status:        "online",
		LastHeartbeat: now,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if presence.ID != "presence-123" {
		t.Errorf("Expected ID 'presence-123', got %s", presence.ID)
	}

	if presence.TechnicianID != "tech-123" {
		t.Errorf("Expected TechnicianID 'tech-123', got %s", presence.TechnicianID)
	}

	if presence.Status != "online" {
		t.Errorf("Expected Status 'online', got %s", presence.Status)
	}

	if !presence.LastHeartbeat.Equal(now) {
		t.Errorf("Expected LastHeartbeat %v, got %v", now, presence.LastHeartbeat)
	}

	if !presence.CreatedAt.Equal(now) {
		t.Errorf("Expected CreatedAt %v, got %v", now, presence.CreatedAt)
	}

	if !presence.UpdatedAt.Equal(now) {
		t.Errorf("Expected UpdatedAt %v, got %v", now, presence.UpdatedAt)
	}
}
