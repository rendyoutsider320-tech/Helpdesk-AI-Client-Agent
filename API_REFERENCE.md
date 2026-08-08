# API Endpoints Quick Reference

## Overview
Lengkap reference untuk semua HTTP endpoints di aplikasi Agentic AI Helpdesk, termasuk 3 komponen baru yang sudah diimplementasikan.

---

## Base URL
```
http://localhost:8080
```

---

## 1. Authentication Endpoints

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@helpdesk.local",
  "password": "admin123"
}

Response:
{
  "token": "eyJ...",
  "refresh_token": "eyJ...",
  "user_id": "user-uuid",
  "email": "admin@helpdesk.local",
  "role": "admin"
}
```

### Register
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@helpdesk.local",
  "password": "password123",
  "name": "John Doe"
}

Response:
{
  "user_id": "user-uuid",
  "email": "user@helpdesk.local",
  "token": "eyJ..."
}
```

### Refresh Token
```http
POST /api/v1/auth/refresh-token
Content-Type: application/json
Authorization: Bearer <refresh_token>

{}

Response:
{
  "token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <token>

{}

Response:
{
  "message": "logged out successfully"
}
```

---

## 2. Ticket Management Endpoints

### Create Ticket
```http
POST /api/v1/tickets
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Database Connection Issue",
  "description": "Cannot connect to primary database",
  "severity": "high",
  "device_id": "device-uuid"
}

Response:
{
  "id": "ticket-uuid",
  "title": "Database Connection Issue",
  "status": "open",
  "created_at": "2026-05-28T10:00:00Z"
}
```

### List Tickets
```http
GET /api/v1/tickets?status=open&severity=high
Authorization: Bearer <token>

Response:
{
  "total": 15,
  "tickets": [
    {
      "id": "ticket-uuid",
      "title": "Database Connection Issue",
      "status": "open",
      "severity": "high",
      "created_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

### Get Ticket Details
```http
GET /api/v1/tickets/:id
Authorization: Bearer <token>

Response:
{
  "id": "ticket-uuid",
  "title": "Database Connection Issue",
  "description": "Cannot connect to primary database",
  "status": "open",
  "severity": "high",
  "ai_summary": "...",
  "root_cause": "Connection pool exhausted",
  "created_at": "2026-05-28T10:00:00Z"
}
```

### Update Ticket
```http
PUT /api/v1/tickets/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Database Connection Issue - Updated",
  "description": "Updated description",
  "severity": "critical"
}

Response:
{
  "id": "ticket-uuid",
  "updated_at": "2026-05-28T10:15:00Z"
}
```

### Add Comment
```http
POST /api/v1/tickets/:id/comments
Content-Type: application/json
Authorization: Bearer <token>

{
  "content": "Applied fix by increasing connection pool",
  "comment_type": "update"
}

Response:
{
  "comment_id": "comment-uuid",
  "created_at": "2026-05-28T10:20:00Z"
}
```

### Assign Ticket
```http
POST /api/v1/tickets/:id/assign
Content-Type: application/json
Authorization: Bearer <token>

{
  "assigned_to": "user-uuid"
}

Response:
{
  "id": "ticket-uuid",
  "assigned_to": "user-uuid",
  "updated_at": "2026-05-28T10:25:00Z"
}
```

### Resolve Ticket
```http
POST /api/v1/tickets/:id/resolve
Content-Type: application/json
Authorization: Bearer <token>

{
  "resolution": "Increased connection pool from 100 to 200"
}

Response:
{
  "id": "ticket-uuid",
  "status": "resolved",
  "resolved_at": "2026-05-28T10:30:00Z"
}
```

### Close Ticket
```http
POST /api/v1/tickets/:id/close
Authorization: Bearer <token>

Response:
{
  "id": "ticket-uuid",
  "status": "closed",
  "closed_at": "2026-05-28T10:35:00Z"
}
```

---

## 3. Event Stream Handler Endpoints ✨ NEW

### Publish External Event
```http
POST /api/v1/events/publish
Content-Type: application/json

{
  "id": "event-001",
  "source": "prometheus",
  "type": "alert",
  "severity": "high",
  "title": "High CPU Usage Detected",
  "description": "CPU usage exceeded 80% threshold",
  "timestamp": "2026-05-28T10:00:00Z",
  "metadata": {
    "host": "server-01",
    "cpu_usage": "85%",
    "threshold": "80%"
  }
}

Response:
{
  "message": "event published to queue",
  "event_id": "event-001"
}
```

### List Events
```http
GET /api/v1/events/list

Response:
{
  "total": 42,
  "events": [
    {
      "id": "event-001",
      "source": "prometheus",
      "type": "alert",
      "severity": "high",
      "title": "High CPU Usage Detected",
      "timestamp": "2026-05-28T10:00:00Z",
      "metadata": {...}
    }
  ]
}
```

---

## 4. Action Executor Endpoints ✨ NEW

### Submit Action Request
```http
POST /api/v1/actions/submit
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "clear_logs",
  "target": "application",
  "ticket_id": "ticket-uuid",
  "parameters": {
    "log_type": "error"
  }
}

Response:
{
  "message": "action submitted for execution",
  "request_id": "action-uuid"
}
```

### Get Action Execution Result
```http
GET /api/v1/actions/:id/result
Authorization: Bearer <token>

Response:
{
  "id": "result-uuid",
  "request_id": "action-uuid",
  "status": "completed",
  "output": "Cleared log: application",
  "error": "",
  "start_time": "2026-05-28T10:00:00Z",
  "end_time": "2026-05-28T10:00:01Z",
  "duration": 1000
}
```

### Supported Action Types
```
- clear_logs      (Supported)
- restart_service (Supported)
- kill_process    (Disabled by default - security)
- run_script      (Disabled by default - security)
- reboot          (Disabled by default - safety)
```

---

## 5. Zammad Integration Endpoints ✨ NEW

### Receive Webhook
```http
POST /api/v1/zammad/webhook
Content-Type: application/json

{
  "event_type": "created",
  "ticket": {
    "id": 12345,
    "number": "Ticket#12345",
    "title": "Network Interface Down",
    "description": "Interface eth0 is down",
    "state": "open",
    "priority": "3 high",
    "group": "Infrastructure",
    "owner": "admin@company.com",
    "customer_id": 1,
    "created_at": "2026-05-28T10:00:00Z",
    "updated_at": "2026-05-28T10:00:00Z"
  }
}

Response:
{
  "message": "webhook processed",
  "ticket_id": 12345
}
```

### Manual Sync
```http
POST /api/v1/zammad/sync

Response:
{
  "message": "sync completed",
  "tickets_synced": 25
}
```

### Check Status
```http
GET /api/v1/zammad/status

Response (if enabled):
{
  "status": "enabled",
  "message": "zammad integration active",
  "sync_interval": "5 minutes"
}

Response (if disabled):
{
  "status": "disabled",
  "message": "zammad integration not configured"
}
```

---

## 6. Device Management Endpoints

### List Devices
```http
GET /api/v1/devices
Authorization: Bearer <token>

Response:
{
  "total": 10,
  "devices": [
    {
      "id": "device-uuid",
      "hostname": "server-01",
      "ip_address": "192.168.1.10",
      "type": "server",
      "status": "active"
    }
  ]
}
```

### Get Device Metrics
```http
GET /api/v1/devices/:id/metrics
Authorization: Bearer <token>

Response:
{
  "cpu_usage": 45.2,
  "memory_usage": 72.5,
  "disk_usage": 58.3,
  "network_in": "2.5 Mbps",
  "network_out": "1.8 Mbps"
}
```

---

## 7. Alert Management Endpoints

### List Alerts
```http
GET /api/v1/alerts?severity=high
Authorization: Bearer <token>

Response:
{
  "total": 5,
  "alerts": [
    {
      "id": "alert-uuid",
      "title": "High Memory Usage",
      "severity": "high",
      "status": "active",
      "created_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

### Resolve Alert
```http
POST /api/v1/alerts/:id/resolve
Authorization: Bearer <token>

Response:
{
  "id": "alert-uuid",
  "status": "resolved",
  "resolved_at": "2026-05-28T10:30:00Z"
}
```

---

## 8. Dashboard Endpoints

### Get Admin Dashboard Stats
```http
GET /api/v1/dashboard/stats
Authorization: Bearer <token>

Response:
{
  "open_tickets": 12,
  "sla_breaches": 3,
  "critical_alerts": 2,
  "online_technicians": 4,
  "total_technicians": 7
}
```

### Get Dashboard Summary
```http
GET /api/v1/dashboard/summary
Authorization: Bearer <token>

Response:
{
  "ticket_age": {
    "total_open": 12,
    "average_open_hours": 18.5,
    "overdue_count": 4,
    "stale_open_count": 2
  },
  "device_health": {
    "total_devices": 20,
    "active_devices": 18,
    "offline_devices": 2,
    "stale_devices": 3
  },
  "technician_workload": [
    {
      "technician_id": "tech-uuid",
      "technician_name": "Budi",
      "status": "online",
      "assigned_tickets": 5
    }
  ]
}
```

### Get Recent Tickets
```http
GET /api/v1/dashboard/recent-tickets
Authorization: Bearer <token>

Response:
{
  "tickets": [
    {
      "id": "ticket-uuid",
      "title": "Database Connection Issue",
      "severity": "high",
      "status": "open",
      "created_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

### Get Recent Alerts
```http
GET /api/v1/dashboard/recent-alerts
Authorization: Bearer <token>

Response:
{
  "alerts": [
    {
      "id": "alert-uuid",
      "message": "CPU usage exceeded threshold",
      "severity": "critical",
      "metric": "cpu",
      "status": "active",
      "created_at": "2026-05-28T10:00:00Z"
    }
  ]
}
```

---

## 9. WebSocket Connection

### Connect WebSocket
```
WS ws://localhost:8080/ws/:user_id

Messages:
- User connects: Real-time notifications
- Ticket updates
- Action results
- Event alerts
```

---

## 9. Tools Endpoints

### List Available Tools
```http
GET /api/v1/tools
Authorization: Bearer <token>

Response:
{
  "total": 10,
  "tools": [
    {
      "name": "ping",
      "description": "Check connectivity"
    },
    {
      "name": "dns_lookup",
      "description": "DNS resolution"
    },
    {
      "name": "port_scanner",
      "description": "Check if a port is open on a host"
    },
    {
      "name": "printer_diagnostics",
      "description": "Diagnose common printer issues based on symptoms"
    },
    {
      "name": "pos_diagnostics",
      "description": "Diagnose POS terminal and transaction issues"
    },
    {
      "name": "frontend_diagnostics",
      "description": "Analyze frontend/UI error symptoms and debugging steps"
    },
    {
      "name": "backend_diagnostics",
      "description": "Analyze backend/server error symptoms and service-side debugging steps"
    }
  ]
}
```

### Execute Tool
```http
POST /api/v1/tools/:tool_name/execute
Content-Type: application/json
Authorization: Bearer <token>

{
  "issue": "API returns 503 after deployment",
  "service_name": "api-service"
}

Response:
{
  "result": {
    "issue": "API returns 503 after deployment",
    "service_name": "api-service",
    "diagnosis": "Masalah kinerja backend atau dependency",
    "recommendations": [
      "Periksa metrik latency dan batas waktu servis",
      "Pastikan service upstream dan dependency responsif"
    ]
  }
}
```

### Diagnostic Tool Examples
Use the same endpoint with the tool name to execute specialized diagnostics.

#### Printer Diagnostics
```http
POST /api/v1/tools/printer_diagnostics/execute
Content-Type: application/json
Authorization: Bearer <token>

{
  "issue": "Printer offline and not printing",
  "printer_model": "HP-LaserJet-4200"
}
```

#### POS Diagnostics
```http
POST /api/v1/tools/pos_diagnostics/execute
Content-Type: application/json
Authorization: Bearer <token>

{
  "issue": "Payment transaction gagal di terminal",
  "terminal_id": "pos-01"
}
```

#### Frontend Diagnostics
```http
POST /api/v1/tools/frontend_diagnostics/execute
Content-Type: application/json
Authorization: Bearer <token>

{
  "issue": "React app menampilkan error pada console",
  "browser": "Chrome"
}
```

#### Backend Diagnostics
```http
POST /api/v1/tools/backend_diagnostics/execute
Content-Type: application/json
Authorization: Bearer <token>

{
  "issue": "Database timeout pada API backend",
  "service_name": "payment-service"
}
```

---

## 10. AI Analysis Endpoints

### Analyze Incident
```http
POST /api/v1/ai/analyze
Content-Type: application/json
Authorization: Bearer <token>

{
  "ticket_id": "ticket-uuid",
  "description": "Service crashed with memory error"
}

Response:
{
  "root_cause": "Memory leak in database connection pool",
  "severity": "critical",
  "recommendations": [
    "Restart the service",
    "Increase memory allocation",
    "Review connection pool settings"
  ]
}
```

### Chat with AI Agent
```http
POST /api/v1/ai/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": "How do I fix high CPU usage?",
  "context": "server-01"
}

Response:
{
  "response": "Here are steps to diagnose and fix high CPU usage...",
  "sources": ["kb-article-1", "kb-article-2"]
}
```

### Analyze Ticket
```http
POST /api/v1/ai/tickets/:id/analyze
Authorization: Bearer <token>

Response:
{
  "analysis": {...},
  "root_cause": "...",
  "actions_recommended": [...]
}
```

---

## 11. Qdrant Integration Endpoints

### Sync KB to Qdrant
```http
POST /api/v1/qdrant/sync-kb
Authorization: Bearer <token>

Response:
{
  "message": "KB sync to Qdrant completed",
  "articles_synced": 150
}
```

---

## 12. Health Check

### Health Status
```http
GET /health

Response:
{
  "status": "ok"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2026-05-28T10:00:00Z"
}
```

### Common Error Codes
- `UNAUTHORIZED` - Missing or invalid token
- `FORBIDDEN` - User doesn't have permission
- `NOT_FOUND` - Resource not found
- `BAD_REQUEST` - Invalid request body
- `INTERNAL_ERROR` - Server error
- `SERVICE_UNAVAILABLE` - Service not configured/available

---

## Authentication

### Header Format
```
Authorization: Bearer <token>
```

### Token Types
- Access Token: Valid for 1 hour
- Refresh Token: Valid for 7 days

### Rate Limiting
- Default: 120 requests per minute per user
- Per-endpoint specific limits may apply

---

## Pagination

### Query Parameters
```
?page=1&limit=20&sort=created_at&order=desc
```

### Response Format
```json
{
  "total": 100,
  "page": 1,
  "limit": 20,
  "items": [...]
}
```

---

## Filtering

### Common Filters
```
?status=open
?severity=high
?source=prometheus
?type=alert
?date_from=2026-05-01&date_to=2026-05-31
```

---

## Timestamps

All timestamps are in ISO 8601 format:
```
2026-05-28T10:00:00Z
```

---

## Version History

### v1.0.0 (May 28, 2026)
- ✅ Event Stream Handler
- ✅ Action Executor
- ✅ Zammad Integration
- ✅ Full AI Helpdesk Platform

---

## Examples Using cURL

### Example 1: Complete Event Processing Flow
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@helpdesk.local","password":"admin123"}' | jq -r '.token')

# Publish event
curl -X POST http://localhost:8080/api/v1/events/publish \
  -H "Content-Type: application/json" \
  -d '{"id":"e1","source":"prom","type":"alert","severity":"high","title":"CPU High","description":"CPU exceeded 80%"}'

# Wait for processing
sleep 2

# List events
curl http://localhost:8080/api/v1/events/list | jq

# Execute action
ACTION=$(curl -s -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"clear_logs","target":"app"}' | jq -r '.request_id')

# Get result
curl -X GET http://localhost:8080/api/v1/actions/$ACTION/result \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

