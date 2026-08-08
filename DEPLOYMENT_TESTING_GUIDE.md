# Complete Deployment & Testing Guide

## Quick Start - Local Development

### 1. Prerequisites
- Go 1.23+
- PostgreSQL 14+
- Node.js 18+
- Git

### 2. Environment Setup

```bash
# Clone and navigate
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Update .env with your configuration
cp .env.example .env  # if exists, or edit existing .env
```

### 3. Key Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=helpdesk
DB_PASSWORD=helpdesk@123
DB_NAME=helpdesk_ai

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# AI Services
OPENAI_API_KEY=sk-your-key-here  # Required for embeddings
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_EMBEDDINGS_MODEL=text-embedding-3-small

# Qdrant (optional)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-key
QDRANT_COLLECTION=helpdesk-ai

# Ollama (optional, for local LLM)
OLLAMA_URL=http://localhost:11434

# Zammad (optional)
ZAMMAD_URL=http://localhost:3000
ZAMMAD_TOKEN=your-api-token

# Server
SERVER_PORT=8080
SERVER_ENV=development
```

### 4. Database Setup

```bash
# Create database
createdb helpdesk_ai -U postgres

# Run migrations
cd migrations
psql -U helpdesk -d helpdesk_ai -f 001_initial_schema.up.sql
psql -U helpdesk -d helpdesk_ai -f 002_seed_data.up.sql
```

### 5. Backend Setup & Run

```bash
# Install dependencies
go mod download

# Build
go build -o helpdesk-api.exe ./cmd/api

# Run
./helpdesk-api.exe
```

Server akan start di `http://localhost:8080`

### 6. Frontend Setup & Run

```bash
cd frontend

# Install dependencies
npm install

# Development mode
npm run dev

# Build for production
npm run build
npm start
```

Frontend akan start di `http://localhost:3000`

---

## Docker Deployment

### 1. Complete Stack Setup

```bash
# Navigate to project root
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Build all services
docker-compose build

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### 2. Services Running

```
- API Server:     http://localhost:8080
- Frontend:       http://localhost:3000
- PostgreSQL:     localhost:5432
- Qdrant:         http://localhost:6333
- Prometheus:     http://localhost:9090
- Grafana:        http://localhost:3001
```

### 3. Docker Compose Services

```yaml
services:
  postgres        # Database
  postgres-adminer # DB Management UI
  redis          # Caching
  qdrant         # Vector DB
  prometheus     # Metrics
  promtail       # Log shipper
  loki           # Log storage
  grafana        # Visualization
  api            # Go API Server
  frontend       # Next.js Frontend
```

---

## Testing the 3 New Components

### 1. Event Stream Handler Testing

#### A. Create Test Event
```bash
curl -X POST http://localhost:8080/api/v1/events/publish \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-event-001",
    "source": "prometheus",
    "type": "alert",
    "severity": "high",
    "title": "Database Connection Pool Exhausted",
    "description": "Database connection pool has reached maximum capacity",
    "timestamp": "2026-05-28T10:00:00Z",
    "metadata": {
      "host": "db-server-01",
      "connections": 500,
      "max_connections": 500,
      "application": "api"
    }
  }'
```

Expected Response:
```json
{
  "message": "event published to queue",
  "event_id": "test-event-001"
}
```

#### B. List Events
```bash
curl http://localhost:8080/api/v1/events/list
```

Expected Response:
```json
{
  "total": 1,
  "events": [
    {
      "id": "test-event-001",
      "source": "prometheus",
      "type": "alert",
      "severity": "high",
      "title": "Database Connection Pool Exhausted",
      ...
    }
  ]
}
```

#### C. Check Ticket Created
```bash
# Login first to get token
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@helpdesk.local", "password": "admin123"}'

# List tickets (use token from login response)
curl -X GET http://localhost:8080/api/v1/tickets \
  -H "Authorization: Bearer {token}"
```

#### D. Monitor Event Processing
```bash
# Check logs
docker-compose logs -f api | grep "Processing external event"
```

### 2. Action Executor Testing

#### A. Get Auth Token
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@helpdesk.local", "password": "admin123"}'
```

Save the token from response.

#### B. Submit Clear Logs Action
```bash
TOKEN="your-token-here"

curl -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "clear_logs",
    "target": "application",
    "ticket_id": "test-event-001",
    "parameters": {}
  }'
```

Expected Response:
```json
{
  "message": "action submitted for execution",
  "request_id": "action-uuid-here"
}
```

#### C. Get Action Result
```bash
REQUEST_ID="action-uuid-here"

curl -X GET http://localhost:8080/api/v1/actions/$REQUEST_ID/result \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response:
```json
{
  "id": "result-uuid",
  "request_id": "action-uuid",
  "status": "completed",
  "output": "Cleared log: application",
  "error": "",
  "start_time": "2026-05-28T10:05:00Z",
  "end_time": "2026-05-28T10:05:01Z",
  "duration": 1000
}
```

#### D. Test Restart Service (Linux)
```bash
curl -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "restart_service",
    "target": "nginx",
    "ticket_id": "test-event-002",
    "parameters": {}
  }'
```

#### E. Monitor Audit Log
```bash
# Check database
psql -U helpdesk -d helpdesk_ai -c "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;"
```

### 3. Zammad Integration Testing

#### A. Check Zammad Status
```bash
curl http://localhost:8080/api/v1/zammad/status
```

Expected Response (if not configured):
```json
{
  "status": "disabled",
  "message": "zammad integration not configured"
}
```

Or (if configured):
```json
{
  "status": "enabled",
  "message": "zammad integration active",
  "sync_interval": "5 minutes"
}
```

#### B. Manual Sync (if Zammad is available)
```bash
curl -X POST http://localhost:8080/api/v1/zammad/sync
```

Expected Response:
```json
{
  "message": "sync completed",
  "tickets_synced": 5
}
```

#### C. Simulate Zammad Webhook
```bash
curl -X POST http://localhost:8080/api/v1/zammad/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "created",
    "ticket": {
      "id": 12345,
      "number": "Ticket#12345",
      "title": "Network Interface Down",
      "description": "Interface eth0 is down on server-02",
      "state": "open",
      "priority": "3 high",
      "group": "Infrastructure",
      "owner": "devops@company.com",
      "customer_id": 1,
      "created_at": "2026-05-28T10:30:00Z",
      "updated_at": "2026-05-28T10:30:00Z"
    }
  }'
```

Expected Response:
```json
{
  "message": "webhook processed",
  "ticket_id": 12345
}
```

#### D. Verify Ticket Imported
```bash
# Check if ticket was created in local DB
psql -U helpdesk -d helpdesk_ai -c "SELECT * FROM tickets WHERE id LIKE 'zammad%';"
```

---

## End-to-End Integration Test

### Scenario: Alert → Analysis → Action → Ticket

```bash
# Step 1: Create alert event
curl -X POST http://localhost:8080/api/v1/events/publish \
  -H "Content-Type: application/json" \
  -d '{
    "id": "e2e-test-001",
    "source": "prometheus",
    "type": "alert",
    "severity": "critical",
    "title": "Memory Usage Critical",
    "description": "Memory usage exceeded 95%",
    "metadata": {
      "memory_used": "95.5GB",
      "memory_total": "100GB",
      "host": "app-server-01"
    }
  }'

# Step 2: Wait for AI analysis
sleep 3

# Step 3: Check ticket created
curl -X GET http://localhost:8080/api/v1/tickets \
  -H "Authorization: Bearer $TOKEN"

# Step 4: View AI analysis
curl -X GET http://localhost:8080/api/v1/tickets/e2e-test-001 \
  -H "Authorization: Bearer $TOKEN"

# Step 5: Execute remediation action
curl -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "type": "clear_logs",
    "target": "application",
    "ticket_id": "e2e-test-001",
    "parameters": {}
  }'

# Step 6: Monitor action execution
curl -X GET http://localhost:8080/api/v1/actions/{action_id}/result \
  -H "Authorization: Bearer $TOKEN"

# Step 7: Close ticket
curl -X POST http://localhost:8080/api/v1/tickets/e2e-test-001/close \
  -H "Authorization: Bearer $TOKEN"
```

---

## Performance Testing

### Load Test Event Handler
```bash
#!/bin/bash
# Create 100 events rapidly
for i in {1..100}; do
  curl -X POST http://localhost:8080/api/v1/events/publish \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"load-test-$i\",
      \"source\": \"test\",
      \"type\": \"alert\",
      \"severity\": \"high\",
      \"title\": \"Load Test Alert $i\",
      \"description\": \"This is test event $i\",
      \"metadata\": {}
    }" &
done
wait

# Check queue status
curl http://localhost:8080/api/v1/events/list
```

### Monitor Processing Performance
```bash
# Watch logs in real-time
docker-compose logs -f api | grep -E "Processing external event|Worker.*shutting"

# Database query - count processed tickets
psql -U helpdesk -d helpdesk_ai -c "SELECT COUNT(*) FROM tickets WHERE created_at > NOW() - INTERVAL '5 minutes';"
```

---

## Production Deployment

### 1. Security Considerations

```bash
# Update .env for production
SERVER_ENV=production
JWT_SECRET=generate-very-long-random-string-here
OPENAI_API_KEY=your-production-key

# Zammad integration security
ZAMMAD_TOKEN=rotate-tokens-regularly
ZAMMAD_URL=use-https-in-production
```

### 2. Scale Event Handler
```go
// In cmd/api/main.go
eventHandler = events.NewEventHandler(agentOrchestrator, toolRegistry, 5000, 16)
// Increase queue from 1000 to 5000
// Increase workers from 4 to 16
```

### 3. Scale Action Executor
```go
actionExecutor = actions.NewExecutor(2000, 8)
// Increase queue from 500 to 2000
// Increase workers from 2 to 8
```

### 4. Enable Advanced Logging
```bash
# Use Loki for centralized logging
docker-compose logs -f api | grep -E "ERROR|WARN"

# Prometheus metrics monitoring
http://localhost:9090
```

### 5. Database Optimization
```bash
# Add indexes for performance
psql -U helpdesk -d helpdesk_ai <<EOF
CREATE INDEX idx_tickets_source ON tickets(source);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
EOF
```

---

## Monitoring & Observability

### Prometheus Metrics
Available at `http://localhost:9090`

Key metrics to monitor:
- Event queue size
- Event processing latency
- Action execution success rate
- Zammad sync status

### Grafana Dashboards
Available at `http://localhost:3001`

Default credentials:
- Username: admin
- Password: admin

### Log Aggregation (Loki)
View logs at Grafana with Loki datasource.

```bash
# Query recent events
{job="api"} | grep "Processing external event"
```

---

## Troubleshooting

### Event Handler Not Processing
```bash
# Check API logs
docker-compose logs api | grep -i "event\|error"

# Verify event queue not full
curl http://localhost:8080/api/v1/events/list

# Check worker status
docker-compose logs api | grep "Worker"
```

### Action Executor Permission Denied
```bash
# Check container user
docker exec helpdesk-api whoami

# Grant permissions (Linux only)
docker exec helpdesk-api sudo chmod +x /usr/local/bin/*
```

### Zammad Connection Failed
```bash
# Verify Zammad is running
curl -I http://localhost:3000

# Check API token validity
curl -H "Authorization: Bearer $ZAMMAD_TOKEN" \
  http://localhost:3000/api/v1/tickets?limit=1

# Check network connectivity
docker-compose exec api curl http://zammad:3000
```

---

## Cleanup & Shutdown

### Stop Services
```bash
# Stop and remove containers
docker-compose down

# Remove volumes (warning: deletes data)
docker-compose down -v
```

### Clean Logs
```bash
# Remove generated files
rm helpdesk-api.exe
rm -rf frontend/.next
```

---

## Support & Debugging

### Enable Debug Logging
```bash
# Set environment variable
SERVER_ENV=debug

# Restart services
docker-compose restart api
```

### Database Inspection
```bash
# Connect to database
psql -U helpdesk -d helpdesk_ai

# Useful queries
\d                                    # List tables
SELECT * FROM tickets LIMIT 10;
SELECT * FROM events LIMIT 10;
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;
```

### API Health Check
```bash
# Health endpoint
curl http://localhost:8080/health

# Expected response
{"status": "ok"}
```

