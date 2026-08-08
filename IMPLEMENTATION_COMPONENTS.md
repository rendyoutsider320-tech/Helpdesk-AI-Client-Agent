# Implementation Components - Event Stream Handler, Action Executor, Zammad Integration

## Overview
Dokumentasi lengkap untuk tiga komponen terakhir yang diperlukan untuk menyelesaikan aplikasi AI Helpdesk:
1. **Event Stream Handler** - Processor untuk async events dari monitoring external
2. **Action Executor** - Service untuk execute remediation actions
3. **Zammad Integration** - Sync tickets dari external ticketing system

---

## 1. Event Stream Handler

### Lokasi
`internal/events/handler.go`

### Deskripsi
Event Stream Handler adalah worker pool yang memproses events asynchronous dari external monitoring systems. Setiap event dianalisis oleh AI agent untuk mengidentifikasi root cause dan memberikan rekomendasi.

### Komponen Utama

#### EventType
```go
type EventType string
- EventTypeAlert      // Alert umum
- EventTypeIncident   // Incident/problem
- EventTypeMetric     // Metric data
- EventTypeThreshold  // Threshold breach
```

#### ExternalEvent
```go
type ExternalEvent struct {
    ID          string                 // Unique event ID
    Source      string                 // External monitoring source
    Type        EventType              // Jenis event
    Severity    string                 // critical, high, medium, low
    Title       string                 // Event title
    Description string                 // Event description
    Timestamp   time.Time              // When event occurred
    Metadata    map[string]interface{} // Additional metadata
}
```

#### EventHandler
Orchestrator utama yang manage event processing:
```go
type EventHandler struct {
    eventQueue    chan ExternalEvent
    orchestrator  *ai.Orchestrator
    toolRegistry  *tools.Registry
    maxQueueSize  int
    workers       int
    workerWg      sync.WaitGroup
    stopChan      chan struct{}
}
```

### Fungsi Utama

#### NewEventHandler
```go
func NewEventHandler(orchestrator *ai.Orchestrator, toolRegistry *tools.Registry, 
                     maxQueueSize, workers int) *EventHandler
```
Membuat instance baru event handler dengan konfigurasi worker pool.

#### Start & Stop
```go
func (eh *EventHandler) Start(ctx context.Context)
func (eh *EventHandler) Stop()
```
Menjalankan dan menghentikan event processor dengan graceful shutdown.

#### PublishEvent
```go
func (eh *EventHandler) PublishEvent(event ExternalEvent) error
```
Menambahkan event ke queue untuk processing.

### Flow Proses
1. Event diterima via HTTP endpoint `/api/v1/events/publish`
2. Event disimpan di EventStore untuk audit trail
3. Event dikirim ke queue (1000 capacity)
4. 4 worker goroutines memproses event secara paralel
5. Untuk setiap event:
   - Buat ticket di database
   - Panggil AI agent untuk analisis
   - Simpan analysis result (root cause, recommendations)
6. Event selesai diproses

### EventStore
Penyimpanan in-memory untuk audit trail:
```go
type EventStore struct {
    mu     sync.RWMutex
    events map[string]ExternalEvent
}
```
- `Store(event)` - Simpan event
- `Get(eventID)` - Ambil event tertentu
- `List()` - List semua events

### Konfigurasi
Di `cmd/api/main.go`:
```go
eventStore = events.NewEventStore()
eventHandler = events.NewEventHandler(agentOrchestrator, toolRegistry, 1000, 4)
eventHandler.Start(context.Background())
```
- Max queue: 1000 events
- Workers: 4 goroutines untuk parallel processing

---

## 2. Action Executor

### Lokasi
`internal/actions/executor.go`

### Deskripsi
Action Executor adalah service yang mengeksekusi remediation actions di target systems. Mendukung reboot, restart services, clear logs, kill processes, dan custom scripts dengan audit logging lengkap.

### ActionType
```go
type ActionType string
- ActionTypeReboot         // Restart system
- ActionTypeClearLogs      // Clear log files
- ActionTypeRestartService // Restart service
- ActionTypeRunScript      // Execute custom script
- ActionTypeKillProcess    // Kill process
```

### ActionStatus
```go
type ActionStatus string
- ActionStatusPending    // Menunggu execution
- ActionStatusRunning    // Sedang berjalan
- ActionStatusCompleted  // Selesai sukses
- ActionStatusFailed     // Gagal execution
```

#### ExecutionRequest
```go
type ExecutionRequest struct {
    ID        string                 // Request ID
    Type      ActionType             // Jenis action
    Target    string                 // Target (service name, process name, dll)
    Parameters map[string]interface{} // Additional parameters
    ApprovedBy string                 // User yang approve
    ApprovedAt time.Time              // Waktu approval
    TicketID  string                 // Related ticket
}
```

#### ExecutionResult
```go
type ExecutionResult struct {
    ID         string       // Result ID
    RequestID  string       // Request ID
    Status     ActionStatus // Execution status
    Output     string       // Command output
    Error      string       // Error message if failed
    StartTime  time.Time    // Execution start
    EndTime    time.Time    // Execution end
    Duration   int64        // Duration in milliseconds
}
```

### Executor
Main service:
```go
type Executor struct {
    mu              sync.Mutex
    results         map[string]ExecutionResult
    allowedActions  map[ActionType]bool
    requestQueue    chan ExecutionRequest
    maxQueueSize    int
    workers         int
    workerWg        sync.WaitGroup
    stopChan        chan struct{}
}
```

### Security Features
1. **Allowed Actions Whitelist** - Default hanya clear logs dan restart service
   ```go
   ActionTypeReboot       -> disabled (safety)
   ActionTypeClearLogs    -> enabled
   ActionTypeRestartService -> enabled
   ActionTypeRunScript    -> disabled (security)
   ActionTypeKillProcess  -> disabled (security)
   ```

2. **Audit Logging** - Semua executions dicatat di AuditLog table
3. **User Approval Required** - Hanya authenticated user yang bisa submit actions
4. **Command Execution Validation** - Safe execution dengan context timeout

### Cross-Platform Support
- **Windows**: PowerShell untuk service management, taskkill untuk process killing
- **Linux**: systemctl untuk services, pkill untuk processes

### Fungsi Utama

#### SubmitRequest
```go
func (ex *Executor) SubmitRequest(req ExecutionRequest) (string, error)
```
Submit action untuk execution (returns request ID).

#### GetResult
```go
func (ex *Executor) GetResult(resultID string) (ExecutionResult, bool)
```
Ambil execution result.

### Implementasi Actions
- **ClearLogs** - Kosongkan log files (Windows: Clear-EventLog, Linux: truncate log)
- **RestartService** - Stop dan start service (Windows: Stop-Service/Start-Service, Linux: systemctl)
- **KillProcess** - Terminate process (Windows: taskkill, Linux: pkill)
- **RunScript** - Execute custom shell/powershell script

### Konfigurasi
Di `cmd/api/main.go`:
```go
actionExecutor = actions.NewExecutor(500, 2)
actionExecutor.Start(context.Background())
```
- Max queue: 500 requests
- Workers: 2 goroutines

---

## 3. Zammad Integration

### Lokasi
`internal/integrations/zammad.go`

### Deskripsi
Zammad Integration melakukan sync tickets dari Zammad ticketing system ke aplikasi helpdesk. Mendukung pull-based sync (scheduled) dan push-based via webhooks.

### ZammadTicket
```go
type ZammadTicket struct {
    ID         int
    Number     string  // Ticket number
    Title      string
    Description string
    State      string  // Ticket state (open, closed, dll)
    Priority   string  // 1 low, 2 normal, 3 high, 4 very high
    Group      string  // Group/department
    Owner      string  // Assigned user
    CustomerID int
    CreatedAt  string
    UpdatedAt  string
}
```

### ZammadClient
Main client untuk API communication:
```go
type ZammadClient struct {
    cfg        *ZammadConfig
    httpClient *http.Client
    mu         sync.RWMutex
    lastSync   time.Time
}
```

### Fungsi Utama

#### NewZammadClient
```go
func NewZammadClient() (*ZammadClient, error)
```
Membuat client dengan validasi ZAMMAD_URL dan ZAMMAD_TOKEN dari environment.

#### GetTickets
```go
func (zc *ZammadClient) GetTickets(ctx context.Context, limit int) ([]ZammadTicket, error)
```
Fetch tickets dari Zammad API (sorted by updated_at desc).

#### GetTicketByID
```go
func (zc *ZammadClient) GetTicketByID(ctx context.Context, ticketID int) (*ZammadTicket, error)
```
Fetch ticket spesifik berdasarkan ID.

#### SyncTickets
```go
func (zc *ZammadClient) SyncTickets(ctx context.Context, limit int) (int, error)
```
Sync tickets dari Zammad ke local database. Returns jumlah tickets yang berhasil disync.

### Sync Logic
1. Fetch tickets dari Zammad API
2. Untuk setiap ticket:
   - Map priority Zammad ke severity aplikasi
   - Map state Zammad ke status aplikasi
   - Cek apakah ticket sudah exist di local DB
   - Update jika exist, create jika baru
3. Track last sync time

### Priority & State Mapping
**Priority:**
- "1 low" → "low"
- "2 normal" → "medium"
- "3 high" → "high"
- "4 very high" → "critical"

**State:**
- "closed" → "closed"
- "pending reminder" → "pending"
- "pending close" → "pending"
- "merged" → "closed"
- lainnya → "open"

### SyncScheduler
Automatic sync scheduler:
```go
type SyncScheduler struct {
    client       *ZammadClient
    ticker       *time.Ticker
    interval     time.Duration
    limit        int
    stopChan     chan struct{}
}
```

#### Start & Stop
```go
func (ss *SyncScheduler) Start(ctx context.Context)
func (ss *SyncScheduler) Stop()
```
Jalankan scheduler dengan interval tertentu.

#### ManualSync
```go
func (ss *SyncScheduler) ManualSync(ctx context.Context) (int, error)
```
Trigger manual sync tanpa menunggu interval.

### Webhook Support
```go
type ZammadWebhookPayload struct {
    EventType string                 // created, updated, dll
    Ticket    ZammadTicket
    Data      map[string]interface{}
}

func ProcessZammadWebhook(payload ZammadWebhookPayload) error
```
Process webhook payload dari Zammad untuk real-time sync.

### Konfigurasi
Environment variables:
```bash
ZAMMAD_URL=http://zammad:3000      # Zammad server URL
ZAMMAD_TOKEN=your-api-token        # API token untuk authentication
```

Di `cmd/api/main.go`:
```go
if zammadClient, err := integrations.NewZammadClient(); err == nil {
    zammadSyncScheduler = integrations.NewSyncScheduler(zammadClient, 5*time.Minute, 100)
    zammadSyncScheduler.Start(context.Background())
}
```
- Sync interval: 5 menit
- Limit: 100 tickets per sync

---

## API Routes

### Event Handler Routes
```
POST   /api/v1/events/publish       - Publish external event ke queue
GET    /api/v1/events/list          - List semua events
```

### Action Executor Routes
```
POST   /api/v1/actions/submit       - Submit action untuk execution (requires auth)
GET    /api/v1/actions/:id/result   - Get action execution result (requires auth)
```

### Zammad Integration Routes
```
POST   /api/v1/zammad/webhook       - Receive webhook dari Zammad
POST   /api/v1/zammad/sync          - Manual trigger sync
GET    /api/v1/zammad/status        - Check integration status
```

---

## Integration Flow

### Event Processing Flow
```
External Monitoring System
         ↓
   HTTP POST Event
         ↓
/api/v1/events/publish
         ↓
EventStore (audit trail)
         ↓
Event Queue (capacity: 1000)
         ↓
4 Worker Goroutines (parallel)
         ↓
Create Ticket in DB
         ↓
AI Agent Analysis
    (AnalyzeIncident)
         ↓
Store Root Cause & Recommendations
         ↓
Trigger Action Executor (if needed)
         ↓
Execution Queue → Action Handlers
         ↓
Audit Log Record
```

### Zammad Sync Flow
```
Scheduled Trigger (5 min interval)
         ↓
Zammad API (GET /api/v1/tickets)
         ↓
Parse & Map Tickets
         ↓
Check DB (exist/new)
         ↓
Create or Update Tickets
         ↓
Store in Local DB
```

### Webhook Flow
```
Zammad Server
   Webhook Trigger
         ↓
POST /api/v1/zammad/webhook
         ↓
ProcessZammadWebhook()
         ↓
Create/Update Ticket
         ↓
Real-time Update
```

---

## Environment Configuration

### New Variables
```bash
# Zammad Integration
ZAMMAD_URL=http://zammad:3000
ZAMMAD_TOKEN=your-zammad-api-token

# Event Handler (configured in code)
# Max queue: 1000, Workers: 4

# Action Executor (configured in code)
# Max queue: 500, Workers: 2
```

---

## Monitoring & Logging

### Event Handler
- Logs event processing: `Processing external event: {title}`
- Logs worker status: `Event handler started with {N} workers`
- Logs errors: `Worker {ID} error processing event {ID}: {error}`

### Action Executor
- Logs submission: `Action submitted for execution`
- Logs execution: `Action {type} on {target}`
- Audit log: AuditLog entry untuk setiap execution
- Logs errors: `Worker {ID} error executing action: {error}`

### Zammad Integration
- Logs sync status: `Synced {N} tickets from Zammad`
- Logs webhook: `Webhook processed: ticket {ID}`
- Logs errors: `Scheduled Zammad sync error: {error}`
- Status endpoint: `/api/v1/zammad/status`

---

## Testing & Verification

### 1. Test Event Handler
```bash
curl -X POST http://localhost:8080/api/v1/events/publish \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alert-001",
    "source": "prometheus",
    "type": "alert",
    "severity": "high",
    "title": "High CPU Usage",
    "description": "CPU usage exceeded 90%",
    "metadata": {"cpu": "92.5%", "host": "server-01"}
  }'

curl -X GET http://localhost:8080/api/v1/events/list
```

### 2. Test Action Executor
```bash
curl -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "type": "clear_logs",
    "target": "application",
    "ticket_id": "ticket-001"
  }'

curl -X GET http://localhost:8080/api/v1/actions/{id}/result \
  -H "Authorization: Bearer {token}"
```

### 3. Test Zammad Integration
```bash
# Manual sync
curl -X POST http://localhost:8080/api/v1/zammad/sync

# Check status
curl -X GET http://localhost:8080/api/v1/zammad/status

# Webhook test (from Zammad)
curl -X POST http://localhost:8080/api/v1/zammad/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "created",
    "ticket": {
      "id": 123,
      "number": "Ticket#123",
      "title": "New Ticket",
      "description": "Ticket description",
      "state": "open",
      "priority": "2 normal",
      "group": "IT",
      "owner": "admin",
      "customer_id": 1,
      "created_at": "2026-05-28T10:00:00Z",
      "updated_at": "2026-05-28T10:00:00Z"
    }
  }'
```

---

## Architecture Alignment

Ketiga komponen ini melengkapi architecture diagram:

```
External Monitoring Systems
(Prometheus, Zammad, Custom Monitoring)
         ↓
Event Stream Handler ✅
(Queue-based async processor)
         ↓
AI Agent Analysis
(Root Cause Analysis)
         ↓
Action Executor ✅
(Remediation Actions)
         ↓
System Updates
(Reboot, Restart, etc)

+ Zammad Integration ✅
(External Ticketing Sync)
```

Semua komponen sudah terimplementasi dan siap untuk production deployment.

---

## Next Steps (Optional Enhancements)

1. **Database Persistence untuk Event Store** - Gunakan PostgreSQL instead of in-memory map
2. **Webhook Verification** - Add signature verification untuk Zammad webhooks
3. **Rate Limiting per Action Type** - Prevent action spam (e.g., max 1 reboot per hour)
4. **Action Approval Workflow** - Multi-level approval untuk sensitive actions
5. **Metrics & Observability** - Prometheus metrics untuk event processing, action execution
6. **Event Replay** - Capability untuk replay events dari audit trail
7. **Custom Action Scripts** - Kuberenetes job trigger untuk advanced remediation
8. **Advanced Mapping** - Custom field mapping untuk Zammad integration

---

## Troubleshooting

### Event Handler Issues
- **Queue Full**: Increase maxQueueSize if events are dropped
- **Processing Slow**: Increase workers if events are backing up
- **Memory Leak**: Check EventStore cleanup (consider TTL-based cleanup)

### Action Executor Issues
- **Permission Denied**: Check execution permissions untuk PowerShell/systemctl
- **Process Not Found**: Verify process/service names sebelum execution
- **Timeout**: Increase context timeout jika commands memakan waktu lama

### Zammad Integration Issues
- **Auth Failed**: Verify ZAMMAD_URL dan ZAMMAD_TOKEN
- **Sync Missing Tickets**: Check API rate limits, increase limit jika needed
- **Webhook Not Received**: Verify firewall rules, webhook URL configuration di Zammad

