package integrations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
)

var zammadUUIDNamespace = uuid.MustParse("8ba5585d-a919-4bce-11e0-d7a38bce11e0")

func getZammadTicketUUID(zammadID int) string {
	return uuid.NewSHA1(zammadUUIDNamespace, []byte(fmt.Sprintf("%d", zammadID))).String()
}

type ZammadConfig struct {
	URL   string
	Token string
}

type ZammadTicket struct {
	ID          int    `json:"id"`
	Number      string `json:"number"`
	Title       string `json:"title"`
	Description string `json:"description"`
	State       string `json:"state"`
	Priority    string `json:"priority"`
	Group       string `json:"group"`
	Owner       string `json:"owner"`
	CustomerID  int    `json:"customer_id"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type ZammadResponse struct {
	Tickets []ZammadTicket `json:"tickets"`
	Error   string         `json:"error,omitempty"`
}

type ZammadClient struct {
	cfg        *ZammadConfig
	httpClient *http.Client
	mu         sync.RWMutex
	lastSync   time.Time
}

func NewZammadClient() (*ZammadClient, error) {
	url := strings.TrimSpace(os.Getenv("ZAMMAD_URL"))
	if url == "" {
		return nil, fmt.Errorf("ZAMMAD_URL is not configured")
	}

	token := strings.TrimSpace(os.Getenv("ZAMMAD_TOKEN"))
	if token == "" {
		return nil, fmt.Errorf("ZAMMAD_TOKEN is not configured")
	}

	return &ZammadClient{
		cfg: &ZammadConfig{
			URL:   strings.TrimRight(url, "/"),
			Token: token,
		},
		httpClient: &http.Client{Timeout: 30 * time.Second},
		lastSync:   time.Time{},
	}, nil
}

func (zc *ZammadClient) GetTickets(ctx context.Context, limit int) ([]ZammadTicket, error) {
	url := fmt.Sprintf("%s/api/v1/tickets?limit=%d&sort=updated_at&order=desc", zc.cfg.URL, limit)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	zc.setAuthHeader(req)

	resp, err := zc.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("zammad API error: %s", string(body))
	}

	var tickets []ZammadTicket
	if err := json.NewDecoder(resp.Body).Decode(&tickets); err != nil {
		return nil, err
	}

	return tickets, nil
}

func (zc *ZammadClient) GetTicketByID(ctx context.Context, ticketID int) (*ZammadTicket, error) {
	url := fmt.Sprintf("%s/api/v1/tickets/%d", zc.cfg.URL, ticketID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	zc.setAuthHeader(req)

	resp, err := zc.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("zammad API error: %s", string(body))
	}

	var ticket ZammadTicket
	if err := json.NewDecoder(resp.Body).Decode(&ticket); err != nil {
		return nil, err
	}

	return &ticket, nil
}

func (zc *ZammadClient) SyncTickets(ctx context.Context, limit int) (int, error) {
	zc.mu.Lock()
	defer zc.mu.Unlock()

	tickets, err := zc.GetTickets(ctx, limit)
	if err != nil {
		return 0, err
	}

	synced := 0
	for _, zt := range tickets {
		if err := zc.syncTicket(zt); err != nil {
			log.Printf("Failed to sync Zammad ticket %d: %v", zt.ID, err)
			continue
		}
		synced++
	}

	zc.lastSync = time.Now()
	log.Printf("Synced %d tickets from Zammad", synced)
	return synced, nil
}

func (zc *ZammadClient) syncTicket(zt ZammadTicket) error {
	severity := mapZammadPriorityToSeverity(zt.Priority)
	status := mapZammadStateToStatus(zt.State)

	ticketID := getZammadTicketUUID(zt.ID)

	var adminUser db.User
	if err := db.DB.Where("role = ?", "admin").First(&adminUser).Error; err != nil {
		return fmt.Errorf("failed to find system admin user for ticket creation: %w", err)
	}

	ticket := &db.Ticket{
		ID:          ticketID,
		TicketNo:    fmt.Sprintf("ZAM-%s", zt.Number),
		Title:       zt.Title,
		Description: fmt.Sprintf("%s\n\nZammad Ticket #%s (Synced)", zt.Description, zt.Number),
		Severity:    severity,
		Status:      status,
		CreatedBy:   adminUser.ID,
		CreatedAt:   parseZammadTime(zt.CreatedAt),
		UpdatedAt:   parseZammadTime(zt.UpdatedAt),
	}

	var existing db.Ticket
	if err := db.DB.First(&existing, "id = ?", ticket.ID).Error; err == nil {
		return db.DB.Model(&existing).Updates(ticket).Error
	}

	return db.DB.Create(ticket).Error
}

func (zc *ZammadClient) setAuthHeader(req *http.Request) {
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", zc.cfg.Token))
	req.Header.Set("Content-Type", "application/json")
}

func mapZammadPriorityToSeverity(priority string) string {
	switch strings.ToLower(priority) {
	case "1 low":
		return "low"
	case "2 normal":
		return "medium"
	case "3 high":
		return "high"
	case "4 very high":
		return "critical"
	default:
		return "medium"
	}
}

func mapZammadStateToStatus(state string) string {
	switch strings.ToLower(state) {
	case "closed":
		return "closed"
	case "pending reminder":
		return "pending"
	case "pending close":
		return "pending"
	case "merged":
		return "closed"
	default:
		return "open"
	}
}

func parseZammadTime(timeStr string) time.Time {
	if timeStr == "" {
		return time.Now()
	}

	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z",
		"2006-01-02 15:04:05 MST",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, timeStr); err == nil {
			return t
		}
	}

	return time.Now()
}

type SyncScheduler struct {
	client   *ZammadClient
	ticker   *time.Ticker
	interval time.Duration
	limit    int
	stopChan chan struct{}
}

func NewSyncScheduler(client *ZammadClient, interval time.Duration, limit int) *SyncScheduler {
	return &SyncScheduler{
		client:   client,
		interval: interval,
		limit:    limit,
		stopChan: make(chan struct{}),
	}
}

func (ss *SyncScheduler) Start(ctx context.Context) {
	ss.ticker = time.NewTicker(ss.interval)
	go func() {
		for {
			select {
			case <-ss.stopChan:
				ss.ticker.Stop()
				log.Println("Zammad sync scheduler stopped")
				return
			case <-ss.ticker.C:
				if _, err := ss.client.SyncTickets(ctx, ss.limit); err != nil {
					log.Printf("Scheduled Zammad sync error: %v", err)
				}
			}
		}
	}()
	log.Printf("Zammad sync scheduler started (interval: %v)", ss.interval)
}

func (ss *SyncScheduler) Stop() {
	close(ss.stopChan)
}

func (ss *SyncScheduler) ManualSync(ctx context.Context) (int, error) {
	return ss.client.SyncTickets(ctx, ss.limit)
}

type ZammadWebhookPayload struct {
	EventType string                 `json:"event_type"`
	Ticket    ZammadTicket           `json:"ticket"`
	Data      map[string]interface{} `json:"data"`
}

func ProcessZammadWebhook(payload ZammadWebhookPayload) error {
	ticketID := getZammadTicketUUID(payload.Ticket.ID)

	var adminUser db.User
	if err := db.DB.Where("role = ?", "admin").First(&adminUser).Error; err != nil {
		return fmt.Errorf("failed to find system admin user for ticket creation: %w", err)
	}

	ticket := &db.Ticket{
		ID:          ticketID,
		TicketNo:    fmt.Sprintf("ZAM-%s", payload.Ticket.Number),
		Title:       payload.Ticket.Title,
		Description: fmt.Sprintf("%s\n\nZammad Ticket #%s (Webhook)", payload.Ticket.Description, payload.Ticket.Number),
		Severity:    mapZammadPriorityToSeverity(payload.Ticket.Priority),
		Status:      mapZammadStateToStatus(payload.Ticket.State),
		CreatedBy:   adminUser.ID,
		CreatedAt:   parseZammadTime(payload.Ticket.CreatedAt),
		UpdatedAt:   parseZammadTime(payload.Ticket.UpdatedAt),
	}

	var existing db.Ticket
	if err := db.DB.First(&existing, "id = ?", ticket.ID).Error; err == nil {
		return db.DB.Model(&existing).Updates(ticket).Error
	}

	return db.DB.Create(ticket).Error
}

type ZammadCreateTicketRequest struct {
	Title    string        `json:"title"`
	Group    string        `json:"group"`
	Customer string        `json:"customer"`
	Article  ZammadArticle `json:"article"`
}

type ZammadArticle struct {
	Subject  string `json:"subject"`
	Body     string `json:"body"`
	Type     string `json:"type"`
	Internal bool   `json:"internal"`
}

func (zc *ZammadClient) CreateTicket(ctx context.Context, req ZammadCreateTicketRequest) (*ZammadTicket, error) {
	url := fmt.Sprintf("%s/api/v1/tickets", zc.cfg.URL)

	payloadBytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, err
	}

	zc.setAuthHeader(httpReq)

	resp, err := zc.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		bodyStr := string(body)
		if resp.StatusCode == http.StatusUnprocessableEntity && strings.Contains(bodyStr, "No lookup value found for") && strings.Contains(bodyStr, "customer") {
			log.Printf("Zammad user not found for %s. Creating user in Zammad first...", req.Customer)
			if err := zc.CreateUser(ctx, req.Customer); err == nil {
				log.Printf("Zammad user %s created successfully. Retrying ticket creation...", req.Customer)
				return zc.CreateTicket(ctx, req)
			} else {
				log.Printf("Failed to create Zammad user: %v", err)
			}
		}
		return nil, fmt.Errorf("zammad API error on create: %s", bodyStr)
	}

	var ticket ZammadTicket
	if err := json.NewDecoder(resp.Body).Decode(&ticket); err != nil {
		return nil, err
	}

	return &ticket, nil
}

func (zc *ZammadClient) CreateUser(ctx context.Context, email string) error {
	url := fmt.Sprintf("%s/api/v1/users", zc.cfg.URL)

	parts := strings.Split(email, "@")
	firstname := "Helpdesk"
	lastname := "User"
	if len(parts) > 0 {
		namePart := parts[0]
		nameParts := strings.Split(namePart, ".")
		if len(nameParts) > 0 {
			firstname = capitalize(nameParts[0])
		}
		if len(nameParts) > 1 {
			lastname = capitalize(nameParts[1])
		} else {
			lastname = "Local"
		}
	}

	payload := map[string]interface{}{
		"firstname": firstname,
		"lastname":  lastname,
		"email":     email,
		"login":     email,
		"roles":     []string{"Customer"},
		"active":    true,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return err
	}

	zc.setAuthHeader(httpReq)

	resp, err := zc.httpClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to create user in Zammad: %s", string(body))
	}

	return nil
}

func capitalize(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
