package ticket

import (
	"strings"
	"testing"
)

func TestGenerateTicketNumber(t *testing.T) {
	ticketNo := generateTicketNumber()

	if !strings.HasPrefix(ticketNo, "TKT-") {
		t.Errorf("Expected ticket number to start with 'TKT-', got %s", ticketNo)
	}

	// Should be unique
	ticketNo2 := generateTicketNumber()
	if ticketNo == ticketNo2 {
		t.Error("Generated ticket numbers should be unique")
	}
}

func TestCalculateSLA(t *testing.T) {
	tests := []struct {
		severity string
		hours    int
	}{
		{"low", 72},
		{"medium", 48},
		{"high", 24},
		{"critical", 8},
		{"p1_emergency", 1},
	}

	for _, tt := range tests {
		t.Run(tt.severity, func(t *testing.T) {
			sla := CalculateSLA(tt.severity)
			if sla.IsZero() {
				t.Error("SLA time should not be zero")
			}
		})
	}
}
