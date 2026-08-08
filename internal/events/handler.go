package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/helpdesk-ai/core/internal/ai"
	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/tools"
)

type EventType string

const (
	EventTypeAlert     EventType = "alert"
	EventTypeIncident  EventType = "incident"
	EventTypeMetric    EventType = "metric"
	EventTypeThreshold EventType = "threshold"
)

type ExternalEvent struct {
	ID          string                 `json:"id"`
	Source      string                 `json:"source"` // external monitoring source
	Type        EventType              `json:"type"`
	Severity    string                 `json:"severity"` // critical, high, medium, low
	Title       string                 `json:"title"`
	Description string                 `json:"description"`
	Timestamp   time.Time              `json:"timestamp"`
	Metadata    map[string]interface{} `json:"metadata"`
}

type EventHandler struct {
	eventQueue   chan ExternalEvent
	orchestrator *ai.Orchestrator
	toolRegistry *tools.Registry
	maxQueueSize int
	workers      int
	workerWg     sync.WaitGroup
	stopChan     chan struct{}
}

func NewEventHandler(orchestrator *ai.Orchestrator, toolRegistry *tools.Registry, maxQueueSize, workers int) *EventHandler {
	return &EventHandler{
		eventQueue:   make(chan ExternalEvent, maxQueueSize),
		orchestrator: orchestrator,
		toolRegistry: toolRegistry,
		maxQueueSize: maxQueueSize,
		workers:      workers,
		stopChan:     make(chan struct{}),
	}
}

func (eh *EventHandler) Start(ctx context.Context) {
	for i := 0; i < eh.workers; i++ {
		eh.workerWg.Add(1)
		go eh.processEvents(ctx, i)
	}
	log.Printf("Event handler started with %d workers", eh.workers)
}

func (eh *EventHandler) Stop() {
	close(eh.stopChan)
	eh.workerWg.Wait()
	close(eh.eventQueue)
	log.Println("Event handler stopped")
}

func (eh *EventHandler) PublishEvent(event ExternalEvent) error {
	select {
	case eh.eventQueue <- event:
		return nil
	case <-eh.stopChan:
		return fmt.Errorf("event handler is stopped")
	default:
		return fmt.Errorf("event queue is full")
	}
}

func (eh *EventHandler) processEvents(ctx context.Context, workerID int) {
	defer eh.workerWg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Worker %d recovered from panic: %v", workerID, r)
		}
	}()

	for {
		select {
		case <-eh.stopChan:
			log.Printf("Worker %d shutting down", workerID)
			return
		case event, ok := <-eh.eventQueue:
			if !ok {
				return
			}
			if err := eh.handleEvent(ctx, event); err != nil {
				log.Printf("Worker %d error processing event %s: %v", workerID, event.ID, err)
			}
		}
	}
}

func (eh *EventHandler) handleEvent(ctx context.Context, event ExternalEvent) error {
	log.Printf("Processing external event: %s (source=%s, severity=%s)", event.Title, event.Source, event.Severity)

	ticket := &db.Ticket{
		ID:          event.ID,
		Title:       event.Title,
		Description: fmt.Sprintf("%s\n\nSource: %s\nMetadata: %v", event.Description, event.Source, event.Metadata),
		Severity:    event.Severity,
		Status:      "open",
		CreatedAt:   event.Timestamp,
		UpdatedAt:   event.Timestamp,
	}

	if err := db.DB.Create(ticket).Error; err != nil {
		return fmt.Errorf("failed to create ticket from event: %w", err)
	}

	agentRequest := ai.AgentRequest{
		TicketID:    event.ID,
		Description: event.Description,
		Context: map[string]interface{}{
			"severity": event.Severity,
			"source":   event.Source,
			"type":     event.Type,
			"metadata": event.Metadata,
		},
	}

	analyzeCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	
	analysis, err := eh.orchestrator.AnalyzeIncident(analyzeCtx, agentRequest)
	if err != nil {
		log.Printf("Agent analysis error: %v", err)
		return err
	}

	aiSummary, _ := json.Marshal(analysis)
	if err := db.DB.Model(ticket).Updates(map[string]interface{}{
		"ai_summary": string(aiSummary),
		"root_cause": analysis.RootCause,
	}).Error; err != nil {
		return err
	}

	log.Printf("Event %s processed successfully. Root cause: %s", event.ID, analysis.RootCause)
	return nil
}

type EventStore struct {
	mu     sync.RWMutex
	events map[string]ExternalEvent
}

func NewEventStore() *EventStore {
	return &EventStore{
		events: make(map[string]ExternalEvent),
	}
}

func (es *EventStore) Store(event ExternalEvent) {
	es.mu.Lock()
	defer es.mu.Unlock()
	es.events[event.ID] = event
}

func (es *EventStore) Get(eventID string) (ExternalEvent, bool) {
	es.mu.RLock()
	defer es.mu.RUnlock()
	event, exists := es.events[eventID]
	return event, exists
}

func (es *EventStore) List() []ExternalEvent {
	es.mu.RLock()
	defer es.mu.RUnlock()
	events := make([]ExternalEvent, 0, len(es.events))
	for _, event := range es.events {
		events = append(events, event)
	}
	return events
}
