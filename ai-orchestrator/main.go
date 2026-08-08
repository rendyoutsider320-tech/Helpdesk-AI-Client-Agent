package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/nats-io/nats.go"
)

// TelemetrySnapshot represents agent telemetry data
type TelemetrySnapshot struct {
	AgentID   string                 `json:"agent_id"`
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data,inline"`
}

// AlertRule defines when to trigger an action
type AlertRule struct {
	Name       string
	Metric     string
	Threshold  float64
	Action     string
	PlaybookID string
}

// AIOrchestrator handles telemetry analysis and playbook orchestration
type AIOrchestrator struct {
	natsConn   *nats.Conn
	rules      []AlertRule
	alertCache map[string]time.Time // track recent alerts to avoid spam
	jobTracker *JobTracker
	mu         sync.Mutex
}

func NewAIOrchestrator() *AIOrchestrator {
	return &AIOrchestrator{
		alertCache: make(map[string]time.Time),
		jobTracker: NewJobTracker(),
		rules: []AlertRule{
			{
				Name:       "HighCPUUsage",
				Metric:     "cpu_percent",
				Threshold:  85.0,
				Action:     "collect_telemetry",
				PlaybookID: "diag-high-cpu",
			},
			{
				Name:       "HighMemoryUsage",
				Metric:     "memory_percent",
				Threshold:  90.0,
				Action:     "run_diagnostics",
				PlaybookID: "diag-high-memory",
			},
			{
				Name:       "DiskSpaceLow",
				Metric:     "disk_percent",
				Threshold:  95.0,
				Action:     "run_diagnostics",
				PlaybookID: "diag-low-disk",
			},
		},
	}
}

// Connect to NATS broker
func (o *AIOrchestrator) Connect(natsURL string) error {
	nc, err := nats.Connect(natsURL)
	if err != nil {
		return err
	}
	o.natsConn = nc
	log.Printf("AI Orchestrator connected to NATS: %s", natsURL)
	return nil
}

// StartSubscriber subscribes to all telemetry channels
func (o *AIOrchestrator) StartSubscriber() error {
	// Subscribe to all telemetry topics with wildcard
	subj := "telemetry.>"
	_, err := o.natsConn.Subscribe(subj, func(m *nats.Msg) {
		o.handleTelemetry(m)
	})
	if err != nil {
		return err
	}
	log.Printf("subscribed to telemetry channel: %s", subj)
	return nil
}

// handleTelemetry processes incoming telemetry and applies rules
func (o *AIOrchestrator) handleTelemetry(msg *nats.Msg) {
	var tel TelemetrySnapshot
	if err := json.Unmarshal(msg.Data, &tel); err != nil {
		log.Printf("decode telemetry error: %v", err)
		return
	}

	log.Printf("[telemetry] from %s: %+v", tel.AgentID, tel.Data)

	// Apply alert rules
	for _, rule := range o.rules {
		metricValue, ok := tel.Data[rule.Metric]
		if !ok {
			continue
		}

		// Convert to float64
		var val float64
		switch v := metricValue.(type) {
		case float64:
			val = v
		case int:
			val = float64(v)
		default:
			continue
		}

		// Check threshold
		if val > rule.Threshold {
			alertKey := fmt.Sprintf("%s:%s:%s", tel.AgentID, rule.Name, rule.PlaybookID)
			o.mu.Lock()
			lastTime, exists := o.alertCache[alertKey]
			now := time.Now()
			o.mu.Unlock()

			// Throttle alerts to 5-minute intervals
			if !exists || now.Sub(lastTime) > 5*time.Minute {
				log.Printf("[ALERT] %s triggered on agent %s (value=%.2f, threshold=%.2f)", rule.Name, tel.AgentID, val, rule.Threshold)
				o.triggerPlaybook(tel.AgentID, rule)

				o.mu.Lock()
				o.alertCache[alertKey] = now
				o.mu.Unlock()
			}
		}
	}
}

// triggerPlaybook publishes a command to execute playbook
func (o *AIOrchestrator) triggerPlaybook(agentID string, rule AlertRule) {
	if o.natsConn == nil {
		log.Printf("NATS not connected, cannot trigger playbook")
		return
	}

	// Generate unique job ID
	jobID := fmt.Sprintf("job-%d-%s-%s", time.Now().Unix(), agentID, rule.PlaybookID)

	// Track job start
	_ = o.jobTracker.StartJob(context.Background(), jobID, agentID, rule.PlaybookID)

	// Publish command to playbook-engine topic
	cmd := map[string]interface{}{
		"job_id":       jobID,
		"agent_id":     agentID,
		"playbook_id":  rule.PlaybookID,
		"action":       rule.Action,
		"timestamp":    time.Now().Unix(),
		"rule_name":    rule.Name,
	}
	payload, _ := json.Marshal(cmd)

	subj := "playbook.trigger"
	if err := o.natsConn.Publish(subj, payload); err != nil {
		log.Printf("publish playbook trigger error: %v", err)
		_ = o.jobTracker.UpdateJobStatus(context.Background(), jobID, "failed", "", err.Error())
	} else {
		log.Printf("published playbook trigger (job=%s) to %s", jobID, subj)
		_ = o.jobTracker.UpdateJobStatus(context.Background(), jobID, "running", "", "")
	}
}

func main() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = nats.DefaultURL
	}

	orch := NewAIOrchestrator()
	if err := orch.Connect(natsURL); err != nil {
		log.Fatalf("failed to connect to NATS: %v", err)
	}

	if err := orch.StartSubscriber(); err != nil {
		log.Fatalf("failed to start subscriber: %v", err)
	}

	log.Println("AI Orchestrator running - monitoring telemetry and triggering playbooks")

	// Keep running
	select {}
}
