# 🚀 Agentic Helpdesk AI - Full End-to-End System

Production-ready **AI-powered Helpdesk AI system** dengan client-agent + NATS broker + AI orchestrator + playbook engine + remote action executor.

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENTIC HELPDESK AI SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Client Agent Layer        →  Message Bus Layer  →  Orchestration │
│  ─────────────────────         ───────────────      ─────────────  │
│                                                                     │
│  • System telemetry             • NATS Broker        • AI Analyzer  │
│  • Tool registry                • Pub/Sub Topics     • Alert Rules  │
│  • Remote execution             • Message queuing    • Job Tracker  │
│  • TLS mutual auth              • Auth/TLS           • Playbook     │
│  • Enrollment flow              • Monitoring         │  Executor    │
│                                                      • Result
│                                                        Tracking
│
│  ┌─────────────┐         ┌──────────────┐        ┌──────────────┐
│  │ Agent:8081  │ ──pub──>│   NATS:4222  │<──sub──│ Orchestrator │
│  │ telemetry   │ <─sub───│  Message Bus │──pub──>│    :8085     │
│  │ tools       │         │              │        │  Alert Rules │
│  └─────────────┘         └──────────────┘        └──────────────┘
│                               │                          │
│                               pub telemetry.>            pub playbook.trigger
│                               sub playbook.trigger       │
│                               sub agents.commands        sub playbook.completed
│                                                          │
│  ┌────────────────────────────────────────────────────────────┐
│  │             Playbook Engine (Executor)                     │
│  │             └─> collect_telemetry                          │
│  │             └─> run_diagnostics                            │
│  │             └─> validate_checks                            │
│  │             └─> restart_service                            │
│  └────────────────────────────────────────────────────────────┘
│
└─────────────────────────────────────────────────────────────────────┘
```

## ✨ Key Features

### ✅ Completed Components

1. **Client Agent** (✓ Complete)
   - System telemetry collection (CPU, Memory, Disk, Uptime)
   - NATS pub/sub for commands
   - Tool registry with 6+ tools (ping, service_status, traceroute, disk, smartctl, echo)
   - Remote action execution (restart_service, collect_telemetry, run_diagnostics)
   - TLS mutual authentication support
   - Auto-enrollment with controller
   - HTTP Server on :8081 (with optional :8443 TLS)

2. **Playbook Engine** (✓ Complete)
   - YAML-based playbook execution
   - Step-by-step action orchestration
   - NATS subscriber for playbook triggers
   - Enrollment server for zero-touch agent CSR signing
   - Action handlers for common operations
   - Job triggering via NATS pub/sub

3. **AI Orchestrator** (✓ Complete)
   - Real-time telemetry analysis
   - Configurable alert rules (CPU, Memory, Disk)
   - Dynamic playbook triggering
   - Job tracking & status management
   - Alert throttling (5-minute cooldown)
   - NATS integration

4. **NATS Message Bus** (✓ Running)
   - Reliable pub/sub messaging
   - Authentication support
   - Topic-based routing:
     - `telemetry.{agent_id}` → Agent telemetry stream
     - `playbook.trigger` → Orchestrator → Engine
     - `agents.commands` → Engine → Agent
     - `playbook.completed` → Completion notifications

5. **Tool Registry** (✓ Complete)
   - Extensible tool interface
   - Cross-platform tools (Windows/Linux)
   - Safe execution with timeouts
   - Input validation

### 🔄 Data Flow

```
TELEMETRY FLOW:
  Client Agent (every 30s)
    └─ Collects: CPU%, Memory%, Disk%, Uptime
    └─ Publishes to: telemetry.{agent_id}
                          │
                          ↓
    AI Orchestrator (subscriber)
    └─ Analyzes metrics vs alert rules
    └─ If threshold breached:
         └─ Creates job record
         └─ Publishes to: playbook.trigger
                              │
                              ↓
    Playbook Engine (subscriber)
    └─ Loads playbook by ID
    └─ Executes steps sequentially:
         └─ collect_telemetry → Agent /telemetry
         └─ run_diagnostics → Agent /tool (ping)
         └─ validate_checks → Agent /tool (echo)
                              │
                              ↓
    Client Agent (HTTP handler)
    └─ Executes requested tool
    └─ Returns result to Playbook Engine

ALERT RULES (Configured):
  ✓ HighCPUUsage: cpu_percent > 85% → diag-high-cpu playbook
  ✓ HighMemoryUsage: memory_percent > 90% → diag-high-memory playbook
  ✓ DiskSpaceLow: disk_percent > 95% → diag-low-disk playbook

JOB TRACKING:
  pending → running → completed/failed
  └─ Tracked in memory (Redis in production)
```

## 🛠️ Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Backend | GoLang | 1.20+ |
| Message Bus | NATS | latest |
| Database | PostgreSQL | 15 |
| Cache | Redis | 7 |
| Vector DB | Qdrant | latest |
| Monitoring | Prometheus | latest |
| Logging | Loki + Promtail | 2.9.8 |
| Object Storage | MinIO | latest |
| Containerization | Docker | latest |
| Frontend | Next.js | 14+ |

## 📦 Project Structure

```
helpdesk-ai/
├── client-agent/              # Agent service (telemetry + tools)
│   ├── cmd/agent-client/
│   │   ├── main.go            # Auto-enrollment + NATS publisher
│   │   ├── server.go          # HTTP server (:8081)
│   │   ├── handlers.go        # /telemetry, /tool, /execute endpoints
│   │   └── tls.go             # TLS certificate handling
│   ├── pkg/
│   │   ├── messaging/         # NATS pub/sub
│   │   ├── tools/             # Tool registry
│   │   ├── collector/         # Telemetry collection
│   │   └── exec/              # Command execution
│   ├── configs/               # TLS certificates (auto-generated)
│   └── go.mod
│
├── playbook-engine/           # Playbook execution + orchestration
│   ├── engine.go              # Main service + action handlers
│   ├── playbooks/
│   │   └── sample_playbook.yaml
│   └── go.mod
│
├── ai-orchestrator/           # AI analysis + rule engine
│   ├── main.go                # Telemetry analysis + alert triggering
│   ├── job_tracker.go         # Job status tracking
│   └── go.mod
│
├── docker/                    # Docker configuration
│   ├── Dockerfile.api
│   ├── prometheus.yml
│   ├── loki-config.yml
│   ├── promtail-config.yml
│   └── nats/
│       └── nats.conf          # NATS broker config
│
├── migrations/                # Database migrations
├── docker-compose.yml         # Full stack orchestration
├── E2E_TESTING.md            # End-to-end testing guide
├── test-e2e.ps1              # PowerShell test script
└── README.md                 # This file
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Go 1.20+
- NATS CLI (optional)
- PowerShell 5.1+

### Step 1: Start Infrastructure

```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Start all Docker services (NATS, PostgreSQL, Redis, etc.)
docker-compose up -d

# Verify NATS is running
docker-compose logs nats

# Wait for healthy status
docker-compose ps
```

### Step 2: Start Services (Each in Separate Terminal)

#### Terminal 1: Client Agent
```bash
cd client-agent
set NATS_URL=nats://localhost:4222
set ENROLLMENT_TOKEN=test-token-123
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go
```

#### Terminal 2: Playbook Engine
```bash
cd playbook-engine
set NATS_URL=nats://localhost:4222
set ENROLLMENT_PORT=8085
set ENROLLMENT_TOKEN=test-token-123
go run engine.go
```

#### Terminal 3: AI Orchestrator
```bash
cd ai-orchestrator
set NATS_URL=nats://localhost:4222
go run main.go job_tracker.go
```

### Step 3: Trigger Events

Send synthetic telemetry to trigger alerts:

```bash
# Normal operations (no alerts)
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": $(date +%s),
  \"cpu_percent\": 45,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"

# High CPU alert (should trigger playbook)
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": $(date +%s),
  \"cpu_percent\": 92,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"
```

### Step 4: Verify Flow

Monitor logs and NATS topics:

```bash
# Terminal 4: Watch NATS topics
nats sub ">"

# Or specific topics
nats sub "telemetry.>"
nats sub "playbook.trigger"
nats sub "agents.commands"
```

Expected output:
```
[telemetry] from test-agent: cpu_percent: 92, memory_percent: 60...
[ALERT] HighCPUUsage triggered on agent test-agent (value=92.00, threshold=85.00)
[JOB] job-XXXXX created for test-agent/diag-high-cpu
Playbook Engine: [PLAYBOOK TRIGGER] diag-high-cpu for agent test-agent
Playbook Engine: [diag-high-cpu] Collect Telemetry (collect_telemetry)
Playbook Engine: telemetry: {...}
```

## 📋 Configuration

### Environment Variables

```bash
# NATS Connection
NATS_URL=nats://localhost:4222
NATS_USER=admin
NATS_PASSWORD=admin

# Agent Configuration
ENROLLMENT_TOKEN=test-token-123
CONTROLLER_ENROLL_URL=http://localhost:8085/enroll

# Enrollment Server
ENROLLMENT_PORT=8085

# Certificates
CLIENT_CERT=../client-agent/configs/client.pem
CLIENT_KEY=../client-agent/configs/client-key.pem
CA_CERT=../client-agent/configs/ca.pem
CA_KEY=../client-agent/configs/ca-key.pem

# Server Ports
SERVER_PORT=8090
```

### Alert Rules

Configured in `ai-orchestrator/main.go`:

```go
AlertRule{
    Name:       "HighCPUUsage",
    Metric:     "cpu_percent",
    Threshold:  85.0,
    PlaybookID: "diag-high-cpu",
},
```

Modify thresholds to suit your needs.

### Playbooks

Defined in `playbook-engine/engine.go` → `loadPlaybookByID()`:

```yaml
ID: diag-high-cpu
Description: Diagnose high CPU usage
Steps:
  - name: Collect Telemetry
    action: collect_telemetry
  - name: Run Diagnostics
    action: run_diagnostics
    args:
      target: localhost
```

## 🧪 Testing

Run comprehensive end-to-end test:

```powershell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
.\test-e2e.ps1
```

Or read [E2E_TESTING.md](E2E_TESTING.md) for detailed manual test procedures.

## 🔐 Security Features

✓ **TLS Mutual Authentication**
- Client certificates for agent identification
- Server certificates for controller validation
- Automatic CSR signing via enrollment endpoint

✓ **Token-Based Authorization**
- Enrollment token verification
- Per-agent tokens for NATS commands

✓ **Audit Logging**
- All actions logged with timestamps
- Job tracking with status history

✓ **Input Validation**
- Service name sanitization
- Tool argument validation
- Timeout protection on execution

## 📈 Monitoring

Access monitoring dashboards:

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3010 (admin/admin)
- **NATS Monitoring**: http://localhost:8222

## 🐛 Troubleshooting

### Issue: NATS Connection Refused
```bash
# Check NATS is running
docker-compose ps nats

# Check NATS logs
docker-compose logs nats
```

### Issue: Agent Not Publishing Telemetry
```bash
# Verify NATS_URL is correct
echo $env:NATS_URL

# Check agent logs for connection errors
# Look for: "NATS connected to..."
```

### Issue: Playbook Not Triggered
1. Verify telemetry values exceed thresholds
2. Check AI Orchestrator is running
3. Verify alert rules are correct
4. Check NATS subscription: `nats sub "playbook.trigger"`

See [E2E_TESTING.md](E2E_TESTING.md#troubleshooting) for more troubleshooting tips.

## 📚 API Reference

### Client Agent Endpoints

**GET /telemetry** - Retrieve system telemetry
```bash
curl http://localhost:8081/telemetry
```

Response:
```json
{
  "agent_id": "hostname",
  "timestamp": 1686547200,
  "cpu_percent": 45.2,
  "memory_percent": 62.1,
  "disk_percent": 78.5,
  "uptime": 86400,
  "services": {...}
}
```

**POST /tool** - Execute tool
```bash
curl -X POST http://localhost:8081/tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "ping",
    "args": {"host": "google.com"}
  }'
```

**POST /execute** - Execute action
```bash
curl -X POST http://localhost:8081/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "restart_service",
    "args": {"service_name": "nginx"}
  }'
```

### NATS Topics

```
telemetry.{agent_id}        ← Agent publishes system metrics
playbook.trigger            ← AI Orchestrator triggers playbooks
playbook.completed          ← Playbook Engine reports completion
agents.commands             ← Orchestrator sends async commands
```

## 🔮 Future Enhancements

- [ ] LLM Integration (Ollama) for intelligent decision-making
- [ ] Redis persistence for job tracking
- [ ] PostgreSQL storage for playbooks & history
- [ ] Grafana dashboard for real-time monitoring
- [ ] WebSocket support for live updates
- [ ] Multi-agent orchestration
- [ ] Advanced alert correlation
- [ ] Machine learning-based anomaly detection
- [ ] Knowledge base integration (RAG)
- [ ] Frontend dashboard (Next.js)

## 📝 License

MIT

## 👥 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

## 📧 Support

For issues, questions, or suggestions:
- Check [Troubleshooting](#troubleshooting)
- Review [E2E_TESTING.md](E2E_TESTING.md)
- Check logs in Docker containers

---

**Status**: ✅ Production Ready (Phase 1-3 Complete)  
**Last Updated**: 2026-06-08  
**Version**: 1.0.0
