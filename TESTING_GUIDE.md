# System Testing Guide

**Project**: Helpdesk AI Full Stack  
**Prepared**: 2026-05-24

## Quick Start Testing

### Step 1: Start the Full Stack

```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
docker-compose up --build
```

**Expected Output**:
```
helpdesk-postgres  | database system is ready to accept connections
helpdesk-redis     | Ready to accept connections
helpdesk-qdrant    | ... Started application server
helpdesk-prometheus | Server is ready to serve metrics
helpdesk-grafana    | ... Grafana started
helpdesk-api       | ... API running on :8080
```

**Wait Time**: ~30 seconds for full initialization

### Step 2: Verify Services Are Running

```bash
docker-compose ps
```

Expected output should show all services as "Up":
```
NAME                    STATUS
helpdesk-postgres      Up
helpdesk-redis         Up
helpdesk-qdrant        Up
helpdesk-prometheus    Up
helpdesk-grafana       Up
helpdesk-loki          Up
helpdesk-promtail      Up
helpdesk-minio         Up
helpdesk-api           Up
```

### Step 3: Health Check

```bash
curl http://localhost:8080/health
```

**Expected Response** (HTTP 200):
```json
{
  "status": "ok"
}
```

## Functional Testing

### Test 1: Login with Admin Account

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "ChangeMe@123"
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@helpdesk.local",
    "role": "admin"
  }
}
```

**Save the access_token for next tests**:
```bash
export TOKEN="<access_token_from_response>"
```

### Test 2: Access Protected Route (/me)

**Request**:
```bash
curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "user_id": "uuid",
  "username": "admin",
  "role": "admin"
}
```

### Test 3: Attempt Access Without Token (should be denied)

**Request**:
```bash
curl http://localhost:8080/api/v1/auth/me
```

**Expected Response** (HTTP 401):
```json
{
  "error": "missing authorization header"
}
```

### Test 4: Login with Technician Account

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "rendy.m",
    "password": "ChangeMe@123"
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "username": "rendy.m",
    "email": "rendy@helpdesk.local",
    "role": "technician"
  }
}
```

### Test 5: Register New User

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "username": "john.doe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

**Expected Response** (HTTP 201):
```json
{
  "message": "user registered successfully",
  "user_id": "new-uuid"
}
```

### Test 6: Create a Ticket

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Network down in Branch 1",
    "description": "Internet is not working",
    "severity": "critical"
  }'
```

**Expected Response** (HTTP 201):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "title": "Network down in Branch 1",
  "description": "Internet is not working",
  "severity": "critical",
  "status": "created",
  "created_by": "admin-uuid",
  "created_at": "2026-05-24T12:00:00Z"
}
```

### Test 7: List Tickets with Pagination

**Request**:
```bash
curl "http://localhost:8080/api/v1/tickets?page=1&page_size=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "tickets": [
    {
      "id": "ticket-uuid",
      "ticket_no": "TKT-001",
      "title": "Network down in Branch 1",
      "severity": "critical",
      "status": "created"
      ...
    }
  ],
  "total": 1
}
```

### Test 8: Get Single Ticket

**Request**:
```bash
curl "http://localhost:8080/api/v1/tickets/ticket-uuid" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "title": "Network down in Branch 1",
  "description": "Internet is not working",
  "severity": "critical",
  "status": "created",
  "created_by": "admin-uuid",
  "created_at": "2026-05-24T12:00:00Z"
}
```

### Test 9: Assign Ticket to Technician

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tickets/ticket-uuid/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "technician_id": "rendy-uuid"
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "status": "assigned",
  "assigned_to": "rendy-uuid"
  ...
}
```

### Test 10: Add Comment to Ticket

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tickets/ticket-uuid/comments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "comment": "We are investigating the issue",
    "is_internal": false
  }'
```

**Expected Response** (HTTP 201):
```json
{
  "id": "comment-uuid",
  "ticket_id": "ticket-uuid",
  "user_id": "admin-uuid",
  "comment": "We are investigating the issue",
  "is_internal": false,
  "created_at": "2026-05-24T12:00:00Z"
}
```

### Test 11: Resolve Ticket

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tickets/ticket-uuid/resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "resolution": "Restarted the router and connection restored"
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "status": "resolved",
  "resolution": "Restarted the router and connection restored",
  "resolved_at": "2026-05-24T12:00:00Z"
  ...
}
```

### Test 12: List Devices

**Request**:
```bash
curl "http://localhost:8080/api/v1/devices" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "devices": [
    {
      "id": "device-uuid",
      "device_name": "RTR-HO-01",
      "device_type": "router",
      "ip_address": "192.168.1.1",
      "location": "Head Office",
      "status": "active"
    },
    ...
  ]
}
```

### Test 13: Get Device Metrics

**Request**:
```bash
curl "http://localhost:8080/api/v1/devices/device-uuid/metrics" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "metrics": [
    {
      "id": "metric-uuid",
      "device_id": "device-uuid",
      "metric_type": "cpu_usage",
      "metric_value": 45.2,
      "timestamp": "2026-05-24T12:00:00Z"
    }
  ]
}
```

### Test 14: List Active Alerts

**Request**:
```bash
curl "http://localhost:8080/api/v1/alerts" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "alerts": [
    {
      "id": "alert-uuid",
      "device_id": "device-uuid",
      "severity": "critical",
      "metric": "packet_loss",
      "value": "85%",
      "message": "High packet loss detected on RTR-HO-01",
      "status": "active",
      "created_at": "2026-05-24T12:00:00Z"
    }
  ]
}
```

### Test 15: Resolve Alert

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/alerts/alert-uuid/resolve" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
{
  "message": "alert resolved"
}
```

### Test 16: List Available Tools

**Request**:
```bash
curl "http://localhost:8080/api/v1/tools" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response** (HTTP 200):
```json
[
  {
    "name": "port_scanner",
    "description": "Check if a port is open on a host"
  },
  ...
]
```

### Test 17: Execute Tool

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tools/port_scanner/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "host": "example.com",
    "port": "443"
  }'
```

**Expected Response** (HTTP 200):
```json
{
  "result": "port open"
}
```

### Test 18: WebSocket Connection

**Using WebSocket client (e.g., wscat)**:
```bash
npm install -g wscat
wscat -c ws://localhost:8080/ws/user-uuid
```

**Send test message**:
```
{"message": "test"}
```

**Expected**: Connection established and message received

### Test 19: RBAC Test - Admin Can Access Admin Routes

**Request**:
```bash
curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected Response** (HTTP 200): User info returned

### Test 20: RBAC Test - Technician Cannot Access Admin-Only Routes

If there were admin-only routes (check implementation):
```bash
curl http://localhost:8080/api/v1/admin/users \
  -H "Authorization: Bearer $TECHNICIAN_TOKEN"
```

**Expected Response** (HTTP 403 - if endpoint exists):
```json
{
  "error": "access denied"
}
```

## Database Testing

### Test 21: Verify Database Connection

```bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT COUNT(*) FROM users;"
```

**Expected Output**:
```
 count
-------
     6
```

### Test 22: Verify Seed Data

```bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT username, role FROM users ORDER BY username;"
```

**Expected Output**:
```
   username   |    role
---------------+----------
 admin         | admin
 alif.f        | technician
 febryano.b    | technician
 m.ramadhan    | technician
 rendy.m       | technician
 user.local    | user
```

### Test 23: Check Device Seed Data

```bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT device_name, device_type, status FROM devices;"
```

**Expected Output**:
```
 device_name | device_type | status
-------------+-------------+--------
 RTR-HO-01   | router      | active
 SWH-HO-01   | switch      | active
 POS-BR-01   | pos_terminal| active
 FW-HO-01    | firewall    | active
 PRN-HO-01   | printer     | inactive
```

## Integration Testing

### Test 24: Complete Workflow

1. **Login**: Admin logs in ✓
2. **Create**: Admin creates a ticket ✓
3. **Assign**: Admin assigns to technician ✓
4. **Comment**: Technician adds comment ✓
5. **Resolve**: Technician resolves ticket ✓
6. **Verify**: Check ticket status is resolved ✓

### Test 25: Technician Workflow

1. **Login**: Technician logs in ✓
2. **View**: Technician views assigned tickets ✓
3. **Update**: Technician updates ticket status ✓
4. **Comment**: Technician adds internal comment ✓

## Services Health Check

### PostgreSQL
```bash
curl http://localhost:5432 2>&1 | head -1
```

### Redis
```bash
docker-compose exec redis redis-cli ping
```
**Expected**: `PONG`

### Qdrant
```bash
curl http://localhost:6333/health
```
**Expected**: HTTP 200 with health status

### Prometheus
```bash
curl http://localhost:9090/api/v1/query?query=up
```
**Expected**: HTTP 200 with metrics

### Grafana
```bash
curl -u admin:admin http://localhost:3000/api/health
```
**Expected**: HTTP 200

### MinIO
```bash
curl http://localhost:9000/minio/health/live
```
**Expected**: HTTP 200

## Performance Testing

### Test 26: Load Test (Optional)

```bash
# Create 100 tickets
for i in {1..100}; do
  curl -X POST http://localhost:8080/api/v1/tickets \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"title\": \"Ticket $i\", \"description\": \"Test\", \"severity\": \"low\"}"
done
```

### Test 27: Pagination Test

```bash
# Test different page sizes
curl "http://localhost:8080/api/v1/tickets?page=1&page_size=25" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8080/api/v1/tickets?page=2&page_size=25" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8080/api/v1/tickets?page=5&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Cleanup

### Stop Services
```bash
docker-compose down
```

### Remove Volumes (to reset database)
```bash
docker-compose down -v
```

### Clean Build
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

## Success Criteria

✅ All tests pass when:

1. Health check returns 200 OK
2. All 6 default users can login
3. JWT tokens are valid and work with protected routes
4. Create/read/update operations work for tickets
5. RBAC prevents unauthorized access
6. Pagination returns correct page numbers
7. WebSocket connects successfully
8. All databases contain seed data
9. All services show healthy status
10. No error logs in docker-compose output

## Troubleshooting

### API Container Won't Start

```bash
docker-compose logs api
```

Check for:
- Database connection errors
- Port already in use
- Missing migrations

### Database Connection Failed

```bash
docker-compose logs postgres
```

Check for:
- Volume permissions
- Port conflicts
- Memory issues

### Migrations Not Applied

```bash
docker-compose exec api /app/api migrate
```

Or check if migrations are in docker-compose volume.

### WebSocket Connection Issues

- Ensure user_id is valid UUID
- Check browser console for connection errors
- Verify server logs: `docker-compose logs api`

---

**Testing Date**: 2026-05-24
**Status**: Ready for execution
**Estimated Duration**: 30-45 minutes for complete test suite
