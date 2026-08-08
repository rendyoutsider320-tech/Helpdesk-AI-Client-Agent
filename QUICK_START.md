# 🚀 Quick Start - Agentic Helpdesk AI (Full End-to-End)

## ✅ What's Implemented (All Complete!)

```
✓ Phase 1: Telemetry Pipeline
  ✓ Client Agent publishes metrics to NATS every 30s
  ✓ NATS global connection + Publish function
  ✓ Auto-enrollment with controller
  ✓ Tool registry with 6+ tools

✓ Phase 2: AI Orchestrator
  ✓ Real-time telemetry analysis
  ✓ Alert rule engine (CPU/Memory/Disk)
  ✓ Playbook triggering
  ✓ Dynamic job creation

✓ Phase 3: Playbook Engine
  ✓ YAML playbook execution
  ✓ NATS subscriber for triggers
  ✓ Enrollment server
  ✓ Action handlers

✓ Phase 4: Job Tracking
  ✓ Job status management
  ✓ Execution logging
  ✓ Alert throttling

✓ Phase 5: Full E2E Testing
  ✓ Complete testing guide
  ✓ PowerShell test script
  ✓ Multiple scenarios
  ✓ Troubleshooting docs
```

## 🎯 System Architecture (Complete Flow)

```
┌──────────────┐
│  Client Agent│  Collects telemetry every 30s
│  :8081       │  Registers tools
└──────┬───────┘
       │ publishes every 30s
       ↓
    NATS:4222  ← Message hub for all communication
       ↑   ↓
       │   │
   ┌───┘   └─────────────────────┐
   │                             │
   │ pub: telemetry.{agent_id}   │ sub: playbook.trigger
   │ sub: agents.commands        │ sub: playbook.completed
   │                             │
   ↓                             ↓
┌─────────────────┐    ┌─────────────────────┐
│ AI Orchestrator │    │  Playbook Engine    │
│                 │    │                     │
│ • Analyze       │    │ • Load playbook     │
│ • Apply rules   │    │ • Execute steps     │
│ • Create jobs   │    │ • Call agent        │
│ • Track status  │    │ • Report completion │
└─────────────────┘    └─────────────────────┘
                               │
                               │ HTTP /telemetry, /tool
                               ↓
                        ┌──────────────┐
                        │ Client Agent │
                        │ Executes:    │
                        │ • ping       │
                        │ • disk       │
                        │ • service    │
                        │ • traceroute │
                        │ • smartctl   │
                        │ • echo       │
                        └──────────────┘
```

## 🔄 Complete Data Flow Example

### Scenario: High CPU Detection & Auto-Remediation

```
T+0s:   Client Agent collects metrics: CPU 92%, Memory 60%, Disk 70%
        └─ Publishes to: telemetry.agent-001

T+0.5s: AI Orchestrator receives telemetry
        └─ Parses: cpu_percent = 92%
        └─ Checks rule: HighCPUUsage (threshold 85%)
        └─ ALERT: Threshold breached!
        └─ Creates Job: job-12345-agent-001-diag-high-cpu
        └─ Publishes to: playbook.trigger

T+1s:   Playbook Engine receives trigger
        └─ Loads playbook: diag-high-cpu
        └─ Begins execution:
           Step 1: collect_telemetry → GET /telemetry
           Step 2: run_diagnostics → POST /tool (ping localhost)

T+2s:   Client Agent receives requests
        └─ /telemetry: Returns current metrics
        └─ /tool: Executes ping, returns results

T+3s:   Playbook Engine completes
        └─ Logs results
        └─ Updates job status: pending → running → completed

T+4s:   AI Orchestrator logs: Job completed successfully
        └─ Begins throttling (5-min cooldown on this alert)
```

## 🖥️ Starting the System (4 Terminals)

### Terminal 1: Docker Infrastructure
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
docker-compose up -d

# Wait for all services healthy (30-60 seconds)
docker-compose ps

# Verify NATS is ready
docker-compose logs nats | grep "Server is ready"
```

### Terminal 2: Client Agent (Telemetry Publisher)
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\client-agent

# Windows
set NATS_URL=nats://localhost:4222
set ENROLLMENT_TOKEN=test-token-123
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go

# Linux/Mac
export NATS_URL=nats://localhost:4222
export ENROLLMENT_TOKEN=test-token-123
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go

# Expected output:
# Helpdesk Client Agent starting
# NATS connected to nats://localhost:4222
# telemetry server listening on :8081
# subscribed to NATS agents.commands
# published telemetry to telemetry.{hostname}
```

### Terminal 3: Playbook Engine (Execution Engine)
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\playbook-engine

# Windows
set NATS_URL=nats://localhost:4222
set ENROLLMENT_PORT=8085
set ENROLLMENT_TOKEN=test-token-123
go run engine.go

# Linux/Mac
export NATS_URL=nats://localhost:4222
export ENROLLMENT_PORT=8085
export ENROLLMENT_TOKEN=test-token-123
go run engine.go

# Expected output:
# Playbook Engine starting
# connected to NATS broker
# enrollment server listening on :8085
# Playbook Engine ready - subscribed to playbook.trigger
```

### Terminal 4: AI Orchestrator (Intelligence Layer)
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\ai-orchestrator

# Windows
set NATS_URL=nats://localhost:4222
go run main.go job_tracker.go

# Linux/Mac
export NATS_URL=nats://localhost:4222
go run main.go job_tracker.go

# Expected output:
# AI Orchestrator connected to NATS: nats://localhost:4222
# subscribed to telemetry channel: telemetry.>
# AI Orchestrator running - monitoring telemetry and triggering playbooks
```

## 🧪 Testing (Terminal 5 - NATS CLI)

### Test 1: Normal Operations (No Alerts)
```bash
nats pub "telemetry.test-agent-001" '{
  "agent_id": "test-agent-001",
  "timestamp": 1686547200,
  "cpu_percent": 45,
  "memory_percent": 60,
  "disk_percent": 70
}'

# Expected:
# ✓ AI Orchestrator processes
# ✗ No alerts (metrics below thresholds)
# ✗ No playbooks triggered
```

### Test 2: High CPU Alert (TRIGGERS PLAYBOOK!)
```bash
nats pub "telemetry.test-agent-001" '{
  "agent_id": "test-agent-001",
  "timestamp": 1686547200,
  "cpu_percent": 92,
  "memory_percent": 60,
  "disk_percent": 70
}'

# Expected flow in logs:
# Terminal 4 (AI Orchestrator):
#   [telemetry] from test-agent-001: cpu_percent: 92
#   [ALERT] HighCPUUsage triggered
#   [JOB] job-XXXXX created
#   published playbook trigger

# Terminal 3 (Playbook Engine):
#   [PLAYBOOK TRIGGER] diag-high-cpu for agent test-agent-001
#   [diag-high-cpu] 1. Collect Telemetry
#   [diag-high-cpu] 2. Run Diagnostics

# Terminal 2 (Client Agent):
#   [handler] GET /telemetry
#   [handler] POST /tool (ping)
```

### Test 3: Multiple Alerts (All 3 Rules Triggered)
```bash
nats pub "telemetry.test-agent-001" '{
  "agent_id": "test-agent-001",
  "timestamp": 1686547200,
  "cpu_percent": 90,
  "memory_percent": 92,
  "disk_percent": 98
}'

# Expected: 3 separate playbook triggers
# Terminal 4 logs:
#   [ALERT] HighCPUUsage triggered
#   [ALERT] HighMemoryUsage triggered
#   [ALERT] DiskSpaceLow triggered
```

### Test 4: Alert Throttling (Send Alert Again)
```bash
# Send high CPU again immediately
nats pub "telemetry.test-agent-001" '{
  "agent_id": "test-agent-001",
  "cpu_percent": 92
}'

# Expected:
# Terminal 4 logs:
#   Alert throttled (will retry in 5 minutes)
#   No duplicate playbook triggered
```

### Monitor All NATS Traffic
```bash
nats sub ">"
# Shows all messages on all topics in real-time
```

## 📊 Monitoring the Flow

### Check Client Agent Health
```bash
curl http://localhost:8081/telemetry | jq
# Returns: {"agent_id": "...", "cpu_percent": 45, ...}
```

### Check Docker Services
```bash
docker-compose ps
# All services should be: Up (healthy)
```

### Check NATS Topics
```bash
# Subscribe to telemetry
nats sub "telemetry.>"

# Subscribe to playbook triggers
nats sub "playbook.trigger"

# Subscribe to all
nats sub ">"
```

### Check Logs
```bash
# Client Agent
docker-compose logs client-agent -f

# NATS
docker-compose logs nats -f

# Playbook Engine (running in terminal 3)
# AI Orchestrator (running in terminal 4)
```

## ✅ Verification Checklist

After starting all 4 services, you should see:

- [ ] Terminal 2 (Agent): "published telemetry to telemetry.{hostname}" (every 30s)
- [ ] Terminal 3 (Engine): "subscribed to playbook.trigger"
- [ ] Terminal 4 (Orch): "subscribed to telemetry channel: telemetry.>"
- [ ] `nats sub ">"` shows telemetry messages flowing every 30s

When you publish high CPU telemetry:
- [ ] Terminal 4: "[ALERT] HighCPUUsage triggered"
- [ ] Terminal 3: "[PLAYBOOK TRIGGER] diag-high-cpu"
- [ ] Terminal 2: "GET /telemetry" and "POST /tool" received

If you see all of these, **the entire system is working end-to-end!** ✅

## 🔧 Key Commands

```bash
# Build all modules
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\client-agent
go build ./...
cd ../playbook-engine
go build ./...
cd ../ai-orchestrator
go build ./...

# Start infrastructure
docker-compose up -d

# View logs
docker-compose logs -f
docker-compose logs nats -f
docker-compose logs agent -f

# Stop everything
docker-compose down

# Clean up
docker-compose down -v  # Remove volumes too
```

## 📚 Full Documentation

- **[AGENTIC_README.md](AGENTIC_README.md)** - Complete system documentation
- **[E2E_TESTING.md](E2E_TESTING.md)** - Detailed testing guide
- **[test-e2e.ps1](test-e2e.ps1)** - Automated test script

## 🎓 Understanding the Flow

1. **Telemetry Collection**: Agent measures system metrics every 30 seconds
2. **Publishing**: Metrics published to `telemetry.{agent_id}` NATS topic
3. **Analysis**: AI Orchestrator subscribes to all telemetry
4. **Alert Detection**: Metrics compared against rules (CPU>85%, Memory>90%, Disk>95%)
5. **Playbook Trigger**: Alert published to `playbook.trigger` NATS topic
6. **Execution**: Playbook Engine executes steps (collect telemetry, run diagnostics)
7. **Remote Execution**: Client Agent receives HTTP requests and executes tools
8. **Job Tracking**: Status tracked from pending → running → completed

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "NATS connection refused" | Run `docker-compose up -d` first |
| "No playbook triggered" | Verify telemetry values exceed thresholds |
| "telemetry.> not showing" | Run `nats sub ">"` in separate terminal |
| "Agent not publishing" | Check `NATS_URL` environment variable |
| "Port already in use" | Kill existing process or change port |

See [E2E_TESTING.md](E2E_TESTING.md#troubleshooting) for more troubleshooting.

## 🎯 Next Steps

1. ✅ Start all 4 services (as shown above)
2. ✅ Run test scenarios (Test 1-4)
3. ✅ Monitor logs in real-time
4. ✅ Verify complete flow end-to-end
5. 📋 Read [E2E_TESTING.md](E2E_TESTING.md) for advanced testing
6. 🚀 Ready for production hardening:
   - [ ] Add Ollama LLM integration
   - [ ] Persist jobs to Redis
   - [ ] Store playbooks in PostgreSQL
   - [ ] Build Next.js dashboard
   - [ ] Add Grafana monitoring

---

**Status**: ✅ **READY FOR TESTING**  
**All 3 Modules Compiled**: ✅ client-agent, playbook-engine, ai-orchestrator  
**Version**: 1.0.0 (Phase 1-4 Complete)
