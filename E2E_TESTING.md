# End-to-End Testing Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│          AGENTIC HELPDESK AI E2E TEST FLOW              │
└─────────────────────────────────────────────────────────┘

Step 1: Telemetry Collection (Client Agent)
  ✓ Client Agent collects CPU, Memory, Disk metrics
  ✓ Publishes to: telemetry.{agent_id}
  └─ Payload: { agent_id, timestamp, cpu_percent, memory_percent, disk_percent }

Step 2: Telemetry Analysis (AI Orchestrator)
  ✓ Subscribes to: telemetry.>
  ✓ Applies alert rules:
     - HighCPUUsage: cpu_percent > 85%  → diag-high-cpu
     - HighMemoryUsage: memory_percent > 90% → diag-high-memory
     - DiskSpaceLow: disk_percent > 95% → diag-low-disk
  ✓ Creates job record in JobTracker

Step 3: Playbook Triggering (AI Orchestrator → Playbook Engine)
  ✓ Publishes to: playbook.trigger
  └─ Payload: { job_id, agent_id, playbook_id, rule_name }

Step 4: Playbook Execution (Playbook Engine)
  ✓ Subscribes to: playbook.trigger
  ✓ Loads playbook by ID
  ✓ Executes steps sequentially:
     └─ collect_telemetry → GET /telemetry
     └─ run_diagnostics → POST /tool (ping)
     └─ validate_checks → POST /tool (echo)

Step 5: Remote Action Execution (Client Agent)
  ✓ Receives HTTP requests from Playbook Engine
  ✓ Executes tools via Tool Registry:
     └─ ping, service_status, traceroute, disk, smartctl, echo
  ✓ Returns execution results

Step 6: Job Status Tracking (AI Orchestrator)
  ✓ Updates job status: pending → running → completed/failed
  ✓ Stores in JobTracker (in-memory for now, Redis in production)

Step 7: Results & Notification
  ✓ Playbook completion published to: playbook.completed
  ✓ Results available for Dashboard/Frontend
```

## Test Execution Steps

### Prerequisites
- Docker Compose running with all services
- Go 1.20+ installed
- NATS CLI (optional, for manual testing)

### Phase 1: Service Startup (DO THIS FIRST)

#### Terminal 1: Start Infrastructure
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
docker-compose up -d postgres redis qdrant prometheus grafana loki promtail nats minio ollama
docker-compose logs -f nats
```

Wait for NATS to be ready (listen on 4222)

#### Terminal 2: Start Client Agent
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\client-agent
set NATS_URL=nats://localhost:4222
set ENROLLMENT_TOKEN=test-token-123
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go
```

Expected output:
```
Helpdesk Client Agent starting
NATS connected to nats://localhost:4222
telemetry server listening on :8081
subscribed to NATS agents.commands
published telemetry to telemetry.{hostname}
```

#### Terminal 3: Start Playbook Engine
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\playbook-engine
set NATS_URL=nats://localhost:4222
set ENROLLMENT_PORT=8085
set ENROLLMENT_TOKEN=test-token-123
go run engine.go
```

Expected output:
```
Playbook Engine starting
connected to NATS broker
enrollment server listening on :8085
Playbook Engine ready - subscribed to playbook.trigger
```

#### Terminal 4: Start AI Orchestrator
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\ai-orchestrator
set NATS_URL=nats://localhost:4222
go run main.go job_tracker.go
```

Expected output:
```
AI Orchestrator connected to NATS: nats://localhost:4222
subscribed to telemetry channel: telemetry.>
AI Orchestrator running - monitoring telemetry
```

### Phase 2: Monitor NATS Topics (Optional Terminal)

```bash
# In separate terminal, watch all topics
nats sub ">"

# Or watch specific topics:
nats sub "telemetry.>"
nats sub "playbook.trigger"
nats sub "agents.commands"
```

### Phase 3: Trigger Synthetic Telemetry (Manual Testing)

#### Scenario 1: Normal Operations (No Alerts)
```bash
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": $(date +%s),
  \"cpu_percent\": 45,
  \"memory_percent\": 60,
  \"disk_percent\": 70,
  \"uptime\": 3600
}"
```

Expected:
- ✓ AI Orchestrator processes telemetry
- ✗ No alerts triggered
- ✗ No playbooks executed

#### Scenario 2: High CPU Alert
```bash
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": $(date +%s),
  \"cpu_percent\": 92,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"
```

Expected flow:
1. AI Orchestrator detects CPU > 85% threshold
2. Creates job record
3. Publishes to playbook.trigger with playbook_id="diag-high-cpu"
4. Playbook Engine receives trigger
5. Executes diag-high-cpu playbook:
   - collect_telemetry → Client Agent /telemetry
   - run_diagnostics → Client Agent /tool (ping localhost)
6. Results logged

#### Scenario 3: Multiple Alerts (High CPU + High Memory + Low Disk)
```bash
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": $(date +%s),
  \"cpu_percent\": 90,
  \"memory_percent\": 92,
  \"disk_percent\": 98
}"
```

Expected:
- 3 alert rules triggered
- 3 separate playbooks triggered
- Alert throttling (5-minute cooldown between alerts)

### Phase 4: Verify Results

#### Check Client Agent Logs
```
[✓] telemetry server responding on :8081
[✓] NATS subscriber listening
[✓] tool execution: ping localhost
[✓] tool execution: service_status svcname
```

#### Check Playbook Engine Logs
```
[PLAYBOOK TRIGGER] diag-high-cpu for agent test-agent (rule: HighCPUUsage)
[diag-high-cpu] 1. Collect Telemetry (collect_telemetry)
[diag-high-cpu] telemetry: {...metrics...}
[diag-high-cpu] 2. Run Diagnostics (run_diagnostics)
[diag-high-cpu] diagnostics(tool): PING localhost...
```

#### Check AI Orchestrator Logs
```
[telemetry] from test-agent: cpu_percent: 92, memory_percent: 60...
[ALERT] HighCPUUsage triggered on agent test-agent (value=92.00, threshold=85.00)
[JOB] job-XXXXX created for test-agent/diag-high-cpu
[JOB] job-XXXXX updated: status=running
published playbook trigger (job=job-XXXXX) to playbook.trigger
```

### Phase 5: Test Job Throttling

1. Send high CPU telemetry twice in quick succession
2. Verify only ONE playbook triggers in first 5 minutes
3. Second alert throttled in logs: `Alert throttled`

### Phase 6: Test Error Scenarios

#### Scenario A: Playbook Not Found
Send trigger for non-existent playbook:
```bash
# Manually publish invalid playbook trigger
nats pub "playbook.trigger" "{
  \"agent_id\": \"test-agent\",
  \"playbook_id\": \"non-existent-playbook\"
}"
```

Expected: Playbook Engine logs "playbook not found"

#### Scenario B: Agent Unavailable
1. Stop client-agent
2. Send telemetry that triggers playbook
3. Verify Playbook Engine logs connection error

### Phase 7: Verify End-to-End Flow via Logs

Run PowerShell test script:
```powershell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
.\test-e2e.ps1
```

This will:
- Check service health
- Simulate various telemetry scenarios
- Display expected flow
- Suggest verification steps

## Success Criteria

✓ **All Phase 1-7 Complete:**
- [ ] Client Agent publishes telemetry every 30 seconds
- [ ] AI Orchestrator detects alerts above thresholds
- [ ] Playbook Engine subscribes and executes playbooks
- [ ] Tool execution completes successfully
- [ ] Job tracking updates status
- [ ] Multiple scenarios tested without errors

✓ **Performance Metrics:**
- [ ] Telemetry latency < 500ms
- [ ] Alert detection < 1s
- [ ] Playbook execution < 5s
- [ ] Tool execution < 3s

✓ **Error Handling:**
- [ ] Connection failures logged and retried
- [ ] Invalid playbooks handled gracefully
- [ ] Alerts throttled to prevent spam
- [ ] Jobs tracked even on failures

## Next Steps (Production Hardening)

1. **Redis Integration**: Replace in-memory JobTracker with Redis
2. **Database Persistence**: Store playbook definitions in PostgreSQL
3. **LLM Integration**: Add Ollama for intelligent decision-making
4. **Dashboard**: Display job status and metrics
5. **Alerting**: Integrate with notification service
6. **Scaling**: Deploy multiple orchestrators + agents

## Troubleshooting

### Issue: NATS Connection Fails
```bash
# Check NATS is running
docker-compose ps nats

# Verify network connectivity
docker-compose exec nats nats-server -v
```

### Issue: No Telemetry Published
```bash
# Check NATS_URL environment variable
echo $env:NATS_URL

# Check client-agent logs for connection errors
# Look for: "NATS connected to..."
```

### Issue: Playbook Not Triggered
1. Verify telemetry values exceed thresholds
2. Check AI Orchestrator alert rule configuration
3. Verify NATS subscription active: `nats sub "playbook.trigger"`
4. Check playbook-engine subscription logs

### Issue: Tools Not Executing
1. Verify tool is registered in Tool Registry
2. Check tool name in playbook matches registry
3. Verify tool parameters are valid
4. Check agent logs for tool execution errors
