# Quick Reference Guide

## Getting Started

### Prerequisites
```bash
docker --version          # >= 20.10
docker-compose --version  # >= 2.0
go version               # >= 1.21 (optional, for local dev)
node --version           # >= 18 (optional, for frontend dev)
```

### Start Full Stack
```bash
cd helpdesk-ai
docker-compose up -d
```

### View Services
```bash
docker-compose ps
docker-compose logs -f api
docker-compose logs -f postgres
```

## API Quick Reference

### Authentication
```bash
# Login
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe@123"}'

# Returns
{"access_token":"...", "refresh_token":"...", "user":{...}}
```

### Create Ticket
```bash
curl -X POST http://localhost:8080/api/v1/tickets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Cannot connect to server",
    "description": "User cannot access database server",
    "severity": "high"
  }'
```

### Assign Ticket
```bash
curl -X POST http://localhost:8080/api/v1/tickets/TICKET_ID/assign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"technician_id":"TECHNICIAN_ID"}'
```

### List Devices
```bash
curl http://localhost:8080/api/v1/devices \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Active Alerts
```bash
curl http://localhost:8080/api/v1/alerts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Execute AI Tool
```bash
curl -X POST http://localhost:8080/api/v1/tools/ping/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"host":"192.168.1.1"}'
```

## Database Access

### Connect to PostgreSQL
```bash
docker exec -it helpdesk-postgres psql -U helpdesk -d helpdesk_ai
```

### Common Queries
```sql
-- List users
SELECT id, username, email, role FROM users;

-- List tickets
SELECT ticket_no, title, status, severity FROM tickets;

-- List active alerts
SELECT * FROM alerts WHERE status = 'active';

-- Check technician presence
SELECT technician_id, status, last_heartbeat FROM technician_presence;
```

### Reset Database
```bash
docker-compose down -v
docker-compose up -d postgres
# Wait for database to be ready
docker-compose up -d
```

## Frontend Development

### Start Frontend Dev Server
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

### Build for Production
```bash
npm run build
npm start
```

## Testing

### Run All Tests
```bash
go test -v -cover ./...
```

### Run Specific Tests
```bash
go test -v ./internal/auth
go test -v ./internal/ticket
```

### Test Frontend
```bash
cd frontend
npm test
```

## Monitoring

### Grafana Dashboards
- URL: http://localhost/grafana (or http://localhost:3000)
- Default: admin/admin
- Metrics from: Prometheus
- Logs from: Loki

### Prometheus
- URL: http://localhost:9090
- Query metrics
- View targets

### Loki Logs
- Access via Grafana
- Query by time range
- Filter by service, level

## Debugging

### View API Logs
```bash
docker-compose logs -f api
```

### View Database Logs
```bash
docker-compose logs -f postgres
```

### Check WebSocket Connection
```bash
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8080/ws/user-123
```

### Database Connection Test
```bash
docker exec helpdesk-postgres pg_isready -U helpdesk
```

### Redis Connection Test
```bash
docker exec helpdesk-redis redis-cli ping
```

## Common Tasks

### Create Admin User Locally
```go
// Add to cmd/api/main.go seed section
user := &db.User{
    ID:           uuid.New().String(),
    Name:         "Admin",
    Username:     "admin",
    Email:        "admin@test.local",
    PasswordHash: hash, // bcrypt hash
    Role:         "admin",
    Status:       "active",
}
db.DB.Create(user)
```

### Reset Admin Password
```bash
docker exec helpdesk-postgres psql -U helpdesk -d helpdesk_ai -c \
  "UPDATE users SET password_hash = '\$2a\$12\$...' WHERE username = 'admin';"
```

### View Active Tickets
```bash
docker exec helpdesk-postgres psql -U helpdesk -d helpdesk_ai -c \
  "SELECT ticket_no, title, status FROM tickets WHERE status != 'closed';"
```

### Check Technician Status
```bash
docker exec helpdesk-postgres psql -U helpdesk -d helpdesk_ai -c \
  "SELECT u.username, tp.status FROM technician_presence tp \
   JOIN users u ON tp.technician_id = u.id;"
```

## Environment Variables

### Essential Variables
```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=helpdesk
DB_PASSWORD=helpdesk@123
DB_NAME=helpdesk_ai

JWT_SECRET=your-secret-key

QDRANT_URL=http://qdrant:6333
OLLAMA_URL=http://ollama:11434
REDIS_HOST=redis
REDIS_PORT=6379
```

### Optional Variables
```env
SERVER_ENV=development
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
LOG_LEVEL=info
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
```

## Troubleshooting

### Services Won't Start
```bash
docker-compose down -v
docker-compose up -d
docker-compose logs
```

### Port Already in Use
```bash
# Find and kill process
lsof -i :8080
kill -9 PID

# Or use different port
docker-compose.yml: change port mapping
```

### Database Connection Failed
```bash
# Check database is running
docker exec helpdesk-postgres pg_isready

# Check credentials
echo $DB_PASSWORD
```

### Out of Disk Space
```bash
docker system prune -a
docker volume prune
```

### Memory Issues
```bash
docker stats
# Increase docker memory limit
# or scale down services
```

## Performance Tips

### Optimize Queries
```sql
-- Add indexes
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_alerts_device_id ON alerts(device_id);

-- Use EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM tickets WHERE status = 'open';
```

### Cache Optimization
```bash
# Increase Redis memory
redis-cli CONFIG SET maxmemory 512mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Database Connection Pool
```env
DB_MAX_CONNECTIONS=100
DB_IDLE_CONNECTIONS=10
```

## Deployment

### Deploy to Production
```bash
# 1. Update .env with production values
# 2. Build images
docker-compose build

# 3. Deploy
docker-compose -f docker-compose.yml up -d

# 4. Verify
docker-compose ps
curl http://localhost:8080/health
```

### Update Services
```bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose up -d
```

### Backup
```bash
docker exec helpdesk-postgres pg_dump -U helpdesk helpdesk_ai > backup.sql
gzip backup.sql
```

### Restore
```bash
gunzip backup.sql.gz
docker exec -i helpdesk-postgres psql -U helpdesk helpdesk_ai < backup.sql
```

## File Locations

| Item | Location |
|------|----------|
| API Code | `cmd/api/main.go` |
| Models | `internal/db/models.go` |
| Auth | `internal/auth/jwt.go` |
| Tickets | `internal/ticket/service.go` |
| Monitoring | `internal/monitoring/service.go` |
| AI Agent | `internal/ai/agent.go` |
| Frontend | `frontend/src/` |
| Database Schema | `migrations/` |
| Docker Config | `docker-compose.yml` |
| Environment | `.env` |

## Useful Commands

```bash
# View all endpoints
grep -r "POST\|GET\|PUT\|DELETE" cmd/api/main.go

# Count lines of code
find . -name "*.go" -not -path "./vendor/*" | xargs wc -l

# Format code
go fmt ./...

# Lint code
go vet ./...

# Build binary
go build -o bin/api ./cmd/api

# Run frontend tests
cd frontend && npm test

# Check dependencies
go mod why -m <package>
```

## Support & Resources

- **Documentation**: See README.md, DEPLOYMENT.md, ARCHITECTURE.md
- **Database**: migrations/ folder
- **API Spec**: Generated from REST endpoints
- **Logs**: docker-compose logs
- **Monitoring**: Grafana dashboards

## Quick Help

```bash
# I forgot my password
# Reset via database or use /auth/register for new account

# Services not communicating
# Check docker-compose networking: docker network ls

# Need to scale API server
# docker-compose up -d --scale api=3

# Want to inspect database
# docker exec -it helpdesk-postgres psql -U helpdesk -d helpdesk_ai

# Check if Redis is working
# docker exec helpdesk-redis redis-cli ping

# Need API documentation
# See README.md - API Documentation section
```

---

**Last Updated**: May 2026
**For more info**: See README.md, DEPLOYMENT.md, ARCHITECTURE.md
