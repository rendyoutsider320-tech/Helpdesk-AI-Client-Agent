# ⚡ Quick Reference - Agentic Helpdesk AI (Bahasa Indonesia)

**Panduan Cepat untuk Developer Indonesia**

---

## 🚀 Start Cepat (Dari Terminal)

### Siapkan Environment (First Time Only)

```bash
# 1. Install prerequisites
# - Docker Desktop: https://www.docker.com/products/docker-desktop
# - Go 1.20+: https://golang.org/dl/
# - NATS CLI: go install github.com/nats-io/natscli/cmd/nats@latest

# 2. Navigasi ke project
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# 3. Start Docker
docker-compose up -d

# 4. Tunggu 30 detik
```

---

## 🖥️ Jalankan 4 Terminal (Main Workflow)

### Terminal 1️⃣: Client Agent
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\client-agent
set NATS_URL=nats://localhost:4222
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go

# Indikator sukses: "published telemetry to telemetry.*" setiap 30 detik
```

### Terminal 2️⃣: Playbook Engine
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\playbook-engine
set NATS_URL=nats://localhost:4222
go run engine.go

# Indikator sukses: "Playbook Engine ready - subscribed to playbook.trigger"
```

### Terminal 3️⃣: AI Orchestrator
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\ai-orchestrator
set NATS_URL=nats://localhost:4222
go run main.go job_tracker.go

# Indikator sukses: "AI Orchestrator running - monitoring telemetry"
```

### Terminal 4️⃣: Monitor (NATS)
```bash
# Di folder mana saja
nats sub ">"

# Akan menampilkan SEMUA pesan yang mengalir
```

---

## 🧪 Quick Testing

### Test 1: Verifikasi Telemetry Flow

```bash
# Di Terminal 4, seharusnya terlihat setiap 30 detik:
Published 'telemetry.NAMA-KOMPUTER'
{
  "agent_id": "NAMA-KOMPUTER",
  "cpu_percent": XX.X,
  "memory_percent": XX.X,
  "disk_percent": XX.X,
  "timestamp": 1234567890
}
```

✅ **Jika melihat ini = Telemetry OK**

---

### Test 2: Trigger High CPU Alert

Buka **Terminal 5 baru**:

```bash
# Kirim alert dengan CPU tinggi
nats pub "telemetry.test-agent" "{\"agent_id\":\"test-agent\",\"cpu_percent\":92,\"memory_percent\":60,\"disk_percent\":70}"

# Tekan Enter
```

**Sekarang amati semua terminal:**

| Terminal | Indikator Sukses |
|----------|-----------------|
| 1 (Agent) | `[handler] GET /telemetry` |
| 2 (Engine) | `[PLAYBOOK TRIGGER] diag-high-cpu` |
| 3 (Orch) | `[ALERT] HighCPUUsage triggered` |
| 4 (Monitor) | Lihat `playbook.trigger` message |

✅ **Jika SEMUA terminal menunjukkan = E2E Flow OK**

---

### Test 3: Test HTTP Endpoint

```bash
# Di Terminal 5
curl http://localhost:8081/telemetry

# Output harus:
# {"agent_id":"NAMA-KOMPUTER","cpu_percent":XX,"memory_percent":XX,...}
```

✅ **Jika mendapat JSON = HTTP Endpoint OK**

---

## 📊 Alert Rules (Current)

| Rule | Metric | Threshold | Playbook |
|------|--------|-----------|----------|
| HighCPUUsage | cpu_percent | > 85% | diag-high-cpu |
| HighMemoryUsage | memory_percent | > 90% | diag-high-memory |
| DiskSpaceLow | disk_percent | > 95% | diag-low-disk |

---

## 🔧 Common Commands

### Docker Management

```bash
# Lihat status container
docker-compose ps

# Lihat logs
docker-compose logs -f nats

# Restart specific service
docker-compose restart nats

# Stop semua
docker-compose down

# Stop dan hapus volume
docker-compose down -v
```

---

### Go Compilation

```bash
# Build client-agent
cd helpdesk-ai/client-agent
go build ./...

# Build playbook-engine
cd ../playbook-engine
go build ./...

# Build ai-orchestrator
cd ../ai-orchestrator
go build ./...
```

---

### NATS CLI

```bash
# Subscribe ke semua topics
nats sub ">"

# Subscribe ke telemetry saja
nats sub "telemetry.>"

# Publish message
nats pub "telemetry.test" "{\"data\":\"value\"}"

# Server info
nats server info
```

---

## 🐛 Quick Troubleshooting

### NATS Connection Error

```bash
# Cek NATS running
docker-compose ps nats

# Verifikasi bisa connect
nats server info

# Jika error, restart
docker-compose restart nats
```

---

### Port Already in Use

```bash
# Cari process di port
netstat -ano | findstr :8081

# Kill process (ganti 12345 dengan PID)
taskkill /PID 12345 /F
```

---

### No Telemetry Messages

```bash
# Verifikasi env variable
echo %NATS_URL%

# Harus output: nats://localhost:4222

# Jika tidak, set ulang
set NATS_URL=nats://localhost:4222
```

---

### Playbook Not Executing

```bash
# 1. Verifikasi threshold
# CPU perlu > 85%, Memory > 90%, Disk > 95%

# 2. Send test alert dengan nilai tinggi
nats pub "telemetry.test" "{\"cpu_percent\":92,\"memory_percent\":60,\"disk_percent\":70}"

# 3. Amati Terminal 3 (Orchestrator)
# Harus ada: [ALERT] HighCPUUsage triggered
```

---

## 📁 Struktur Project

```
helpdesk-ai/
├── client-agent/              # Terminal 1 - Telemetry Publisher
│   ├── cmd/agent-client/
│   │   ├── main.go           # Entry point
│   │   ├── server.go         # HTTP endpoints
│   │   ├── handlers.go       # Request handlers
│   │   └── tls.go            # TLS support
│   └── pkg/
│       ├── messaging/nats.go # NATS integration
│       ├── tools/tools.go    # Tool registry
│       └── collector/        # Metrics collection
│
├── playbook-engine/           # Terminal 2 - Executor
│   └── engine.go             # Main service
│
├── ai-orchestrator/           # Terminal 3 - Intelligence
│   ├── main.go               # Analyzer
│   └── job_tracker.go        # Job management
│
├── docker/                    # Infrastructure
│   ├── nats/nats.conf
│   ├── prometheus.yml
│   └── Dockerfile.api
│
├── docker-compose.yml        # Docker services
├── TUTORIAL_INDONESIA.md     # Full tutorial (Bahasa Indonesia)
├── QUICK_START.md            # English quick start
├── E2E_TESTING.md            # Detailed test guide
└── ...
```

---

## 🎯 Workflow Sehari-hari

### Setiap Kali Mulai Fresh

```bash
# 1. Buka 4 Terminal (atau reuse existing)
# 2. Di Terminal 1 (Docker):
docker-compose up -d

# 3. Di Terminal 1 (Client Agent):
cd client-agent
set NATS_URL=nats://localhost:4222
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go

# 4. Di Terminal 2 (Playbook Engine):
cd playbook-engine
set NATS_URL=nats://localhost:4222
go run engine.go

# 5. Di Terminal 3 (Orchestrator):
cd ai-orchestrator
set NATS_URL=nats://localhost:4222
go run main.go job_tracker.go

# 6. Di Terminal 4 (Monitor):
nats sub ">"

# 7. Sekarang bisa test!
```

---

## 📝 Testing Checklist

```
☐ Semua 4 terminal running tanpa error
☐ Terminal 1: "published telemetry" setiap 30 detik
☐ Terminal 2: "Playbook Engine ready"
☐ Terminal 3: "AI Orchestrator running"
☐ Terminal 4: Bisa lihat telemetry messages
☐ curl http://localhost:8081/telemetry berhasil
☐ Send high CPU alert → Terminal 2 trigger playbook
☐ Alert throttling working (alert kedua tidak di-trigger)
☐ Complete flow: telemetry → analysis → trigger → execution
☐ Semua terminal berjalan stabil 5+ menit
```

---

## 🔗 Alert Rules Details

### Rule: HighCPUUsage
```
TRIGGER:  cpu_percent > 85%
PLAYBOOK: diag-high-cpu
STEPS:
  1. collect_telemetry  → GET /telemetry
  2. run_diagnostics    → POST /tool (ping)
THROTTLE: 5 menit
```

### Rule: HighMemoryUsage
```
TRIGGER:  memory_percent > 90%
PLAYBOOK: diag-high-memory
STEPS:
  1. collect_telemetry  → GET /telemetry
  2. validate_checks    → POST /tool (echo)
THROTTLE: 5 menit
```

### Rule: DiskSpaceLow
```
TRIGGER:  disk_percent > 95%
PLAYBOOK: diag-low-disk
STEPS:
  1. collect_telemetry  → GET /telemetry
  2. run_diagnostics    → POST /tool (ping)
THROTTLE: 5 menit
```

---

## 🛠️ Available Tools

| Tool | Fungsi | Platform |
|------|--------|----------|
| ping | Test connectivity | Windows/Linux |
| service_status | Check service health | Windows/Linux |
| traceroute | Network path analysis | Windows/Linux |
| disk | Disk space info | Windows/Linux |
| smartctl | Disk SMART data | Windows/Linux |
| echo | Simple echo test | Windows/Linux |

---

## 📊 Ports Reference

| Port | Service | Fungsi |
|------|---------|--------|
| 4222 | NATS | Message Bus |
| 8081 | Client Agent | HTTP Telemetry/Tools |
| 8085 | Playbook Engine | Enrollment Server |
| 8090 | API | Main API |
| 5432 | PostgreSQL | Database |
| 6379 | Redis | Cache |
| 9090 | Prometheus | Metrics |
| 3010 | Grafana | Dashboard |
| 3100 | Loki | Logs |

---

## 💡 Tips & Tricks

### Monitor Real-time Flow
```bash
# Buka beberapa terminal nats sub untuk monitor berbeda
nats sub "telemetry.>"    # Terminal beda
nats sub "playbook.*"     # Terminal beda
nats sub "agents.*"       # Terminal beda
```

### Debug Message Format
```bash
# Lihat format message
nats sub "playbook.trigger" --json

# Output dengan format yang lebih readable
```

### Stress Testing
```bash
# Send multiple alerts rapid
for /L %i in (1,1,10) do (
  nats pub "telemetry.test-%i" "{\"cpu_percent\":92}"
)

# Lihat bagaimana system handle
```

---

## 📖 Documentation Links

| File | Konten |
|------|--------|
| **TUTORIAL_INDONESIA.md** | Tutorial lengkap step-by-step |
| **QUICK_START.md** | Quick start guide (English) |
| **E2E_TESTING.md** | Detailed testing procedures |
| **AGENTIC_README.md** | Complete system documentation |
| **IMPLEMENTATION_SUMMARY.md** | Architecture & implementation |

---

## ⚙️ Environment Variables

```bash
# Required
NATS_URL=nats://localhost:4222

# Optional
ENROLLMENT_TOKEN=test-token-123
ENROLLMENT_PORT=8085
CONTROLLER_ENROLL_URL=http://localhost:8085/enroll
SERVER_PORT=8090

# Optional (TLS)
CLIENT_CERT=../client-agent/configs/client.pem
CLIENT_KEY=../client-agent/configs/client-key.pem
CA_CERT=../client-agent/configs/ca.pem
```

---

## 🚀 Next Level

Setelah familiar dengan basic flow:

1. **Modify Alert Rules** - Edit `ai-orchestrator/main.go`
2. **Add New Tools** - Add ke `client-agent/pkg/tools/tools.go`
3. **Create New Playbooks** - Extend `playbook-engine/engine.go`
4. **Integrate Ollama** - Add LLM decision making
5. **Build Dashboard** - Create Next.js frontend

---

## 📞 Quick Help

| Problem | Solusi |
|---------|--------|
| Port already in use | `netstat -ano \| findstr :PORT` → `taskkill /PID XXX /F` |
| NATS not responding | `docker-compose restart nats` |
| Go not found | Install dari https://golang.org/dl/ |
| Docker not running | Buka Docker Desktop |
| Telemetry not publishing | Cek `echo %NATS_URL%` |

---

**Version**: 1.0.0  
**Updated**: 2026-06-08  
**Language**: Bahasa Indonesia  
**Status**: Production Ready
