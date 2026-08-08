package ai

import (
	"testing"
)

func TestExtractRootCause(t *testing.T) {
	llmOutput := `Dugaan Penyebab: Printer POS mengalami kegagalan spooler lokal atau kabel USB terlepas.

Berikut adalah panduan penanganan untuk kendala ini:

💡 Langkah Penanganan (Remediation):
1. Pastikan kabel USB printer terhubung dengan baik ke PC.
2. Restart service Print Spooler.`

	expected := "Printer POS mengalami kegagalan spooler lokal atau kabel USB terlepas."
	result := extractRootCause(llmOutput)
	if result != expected {
		t.Errorf("Expected root cause %q, got %q", expected, result)
	}
}
