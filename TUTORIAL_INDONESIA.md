# 📚 Tutorial Lengkap - Agentic Helpdesk AI (Bahasa Indonesia)

**Status**: ✅ Production Ready  
**Versi**: 1.0.0  
**Tanggal**: 2026-06-08

---

## 📖 Daftar Isi

1. [Prasyarat](#prasyarat)
2. [Setup Infrastructure](#setup-infrastructure)
3. [Menjalankan Aplikasi](#menjalankan-aplikasi)
4. [Testing & Pengujian](#testing--pengujian)
5. [Verifikasi Sistem](#verifikasi-sistem)
6. [Troubleshooting](#troubleshooting)

---

## 🔧 Prasyarat

Sebelum memulai, pastikan sudah install:

### 1. **Docker & Docker Compose**
```bash
# Download dan install dari https://www.docker.com/products/docker-desktop

# Verifikasi instalasi
docker --version
docker-compose --version
```

### 2. **Go 1.20+**
```bash
# Download dari https://golang.org/dl/

# Verifikasi instalasi
go version
# Output harus: go version go1.20.x

# Set environment variable
set GOPATH=%USERPROFILE%\go
set PATH=%PATH%;%GOPATH%\bin
```

### 3. **NATS CLI** (Optional tapi sangat berguna)
```bash
# Download atau install via Go
go install github.com/nats-io/natscli/cmd/nats@latest

# Verifikasi
nats --version
```

### 4. **PowerShell 5.1+** (sudah tersedia di Windows)
```bash
# Verifikasi
powershell -Version

# Output minimal: 5.1
```

### 5. **Git** (Optional)
```bash
# Download dari https://git-scm.com/

git --version
```

---

## 🚀 Setup Infrastructure

### Langkah 1: Navigasi ke Folder Project

```bash
# Buka Command Prompt atau PowerShell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Verifikasi struktur folder
dir

# Harus ada folder: client-agent, playbook-engine, ai-orchestrator, docker, migrations, dll
```

### Langkah 2: Start Docker Services

Buka **Terminal 1** (PowerShell baru):

```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Jalankan semua services
docker-compose up -d

# Output:
# Creating helpdesk-postgres ... done
# Creating helpdesk-redis ... done
# Creating helpdesk-qdrant ... done
# ... (semua service dijalankan)

# Tunggu 30-60 detik sampai semuanya healthy
```

### Langkah 3: Verifikasi Docker Services

```bash
# Cek status semua container
docker-compose ps

# Output harus menunjukkan:
# NAME                COMMAND             STATUS
# helpdesk-nats       "nats-server..."    Up (healthy)
# helpdesk-postgres   "docker-entrypoint" Up (healthy)
# helpdesk-redis      "redis-server..."   Up (healthy)
# helpdesk-qdrant     "/qdrant --serve"   Up
# ... dll

# Verifikasi NATS siap
docker-compose logs nats | tail -20

# Cari pesan: "Server is ready"
```

### Langkah 4: Setup Environment Variables

Buat file `.env` atau set manual di Terminal:

```bash
# Windows - Set environment variables
set NATS_URL=nats://localhost:4222
set ENROLLMENT_TOKEN=test-token-123
set ENROLLMENT_PORT=8085
set SERVER_PORT=8090
```

---

## 💻 Menjalankan Aplikasi

Aplikasi terdiri dari 3 komponen. Jalankan masing-masing di **Terminal terpisah**.

### Terminal 2: Client Agent (Penerbit Telemetry)

Buka **Terminal 2 baru**:

```bash
# Navigasi ke folder client-agent
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\client-agent

# Set environment variables
set NATS_URL=nats://localhost:4222
set ENROLLMENT_TOKEN=test-token-123
set CONTROLLER_ENROLL_URL=http://localhost:8085/enroll

# Jalankan aplikasi
go run ./cmd/agent-client/main.go cmd/agent-client/server.go cmd/agent-client/handlers.go cmd/agent-client/tls.go

# Output yang diharapkan:
# Helpdesk Client Agent starting
# NATS connected to nats://localhost:4222
# telemetry server listening on :8081
# subscribed to NATS agents.commands
# published telemetry to telemetry.HOSTNAME
# published telemetry to telemetry.HOSTNAME
# ... (terus menerus setiap 30 detik)
```

**Client Agent akan:**
- ✅ Mengumpulkan metrik sistem (CPU, Memory, Disk)
- ✅ Menerbitkan ke NATS setiap 30 detik
- ✅ Membuka HTTP Server di port 8081
- ✅ Mendengarkan perintah dari Playbook Engine

Jangan tutup terminal ini!

---

### Terminal 3: Playbook Engine (Executor)

Buka **Terminal 3 baru**:

```bash
# Navigasi ke folder playbook-engine
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\playbook-engine

# Set environment variables
set NATS_URL=nats://localhost:4222
set ENROLLMENT_PORT=8085
set ENROLLMENT_TOKEN=test-token-123

# Jalankan aplikasi
go run engine.go

# Output yang diharapkan:
# Playbook Engine starting
# connected to NATS broker
# enrollment server listening on :8085
# Playbook Engine ready - subscribed to playbook.trigger
# executing sample playbook: sample-playbook
```

**Playbook Engine akan:**
- ✅ Terhubung ke NATS Broker
- ✅ Membuka Enrollment Server di port 8085
- ✅ Mendengarkan trigger dari AI Orchestrator
- ✅ Mengeksekusi playbook saat diminta

Jangan tutup terminal ini!

---

### Terminal 4: AI Orchestrator (Intelligence)

Buka **Terminal 4 baru**:

```bash
# Navigasi ke folder ai-orchestrator
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai\ai-orchestrator

# Set environment variables
set NATS_URL=nats://localhost:4222

# Jalankan aplikasi
go run main.go job_tracker.go

# Output yang diharapkan:
# AI Orchestrator connected to NATS: nats://localhost:4222
# subscribed to telemetry channel: telemetry.>
# AI Orchestrator running - monitoring telemetry and triggering playbooks
```

**AI Orchestrator akan:**
- ✅ Terhubung ke NATS
- ✅ Mendengarkan telemetry dari Client Agent
- ✅ Menganalisis metrik vs alert rules
- ✅ Memicu playbook saat threshold terlampaui

Jangan tutup terminal ini!

---

## 🧪 Testing & Pengujian

### Terminal 5: Monitoring (Optional tapi SANGAT PENTING)

Buka **Terminal 5 baru** untuk melihat alur data:

```bash
# Akses folder mana saja
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Monitor SEMUA NATS topics
nats sub ">"

# Atau monitor topic spesifik:
nats sub "telemetry.>"        # Hanya telemetry
nats sub "playbook.trigger"   # Hanya playbook triggers
nats sub "agents.commands"    # Hanya commands
```

Sekarang Anda bisa melihat semua pesan yang mengalir di sistem!

---

## ✅ Verifikasi Sistem

### 1. Verifikasi Client Agent Berfungsi

**Di Terminal 2**, seharusnya melihat log setiap 30 detik:
```
published telemetry to telemetry.YOUR-COMPUTER-NAME
```

**Di Terminal 5** (Monitoring), seharusnya melihat:
```
Published 'telemetry.YOUR-COMPUTER-NAME'
{
  "agent_id": "YOUR-COMPUTER-NAME",
  "timestamp": 1686547200,
  "cpu_percent": 45.2,
  "memory_percent": 62.1,
  "disk_percent": 78.5,
  "uptime": 86400
}
```

✅ **Jika melihat ini = Client Agent BERHASIL**

---

### 2. Verifikasi HTTP Endpoint

Buka **Terminal 6 baru**:

```bash
# Test /telemetry endpoint
curl http://localhost:8081/telemetry

# Output harus JSON dengan metrik:
# {"agent_id":"YOUR-COMPUTER","cpu_percent":45,"memory_percent":62,...}
```

✅ **Jika mendapat response JSON = Endpoint BERHASIL**

---

### 3. Test Alert Trigger (IMPORTANT!)

Kirim telemetry dengan CPU tinggi di **Terminal 6**:

```bash
# Kirim HIGH CPU alert (92% > 85% threshold)
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": 1686547200,
  \"cpu_percent\": 92,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"

# Tekan Enter
```

**Sekarang amati di setiap Terminal:**

**Terminal 5 (Monitoring):** Seharusnya melihat:
```
Published 'telemetry.test-agent'
{cpu_percent: 92, ...}

Published 'playbook.trigger'
{job_id: "job-XXXXX", playbook_id: "diag-high-cpu", ...}
```

**Terminal 4 (AI Orchestrator):** Seharusnya log:
```
[telemetry] from test-agent: cpu_percent: 92
[ALERT] HighCPUUsage triggered on agent test-agent (value=92.00, threshold=85.00)
[JOB] job-12345 created for test-agent/diag-high-cpu
published playbook trigger (job=job-12345) to playbook.trigger
```

**Terminal 3 (Playbook Engine):** Seharusnya log:
```
[PLAYBOOK TRIGGER] diag-high-cpu for agent test-agent (rule: HighCPUUsage)
[diag-high-cpu] 1. Collect Telemetry (collect_telemetry)
[diag-high-cpu] telemetry: {...metrics...}
[diag-high-cpu] 2. Run Diagnostics (run_diagnostics)
[diag-high-cpu] diagnostics(tool): PING localhost...
```

**Terminal 2 (Client Agent):** Seharusnya log:
```
[handler] GET /telemetry
[handler] POST /tool (ping)
```

✅ **Jika melihat SEMUA LOG ini = END-TO-END FLOW BERHASIL!**

---

## 📋 Skenario Testing Lengkap

### Skenario 1: Operasi Normal (No Alerts)

```bash
# Terminal 6: Kirim telemetry normal
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"timestamp\": 1686547200,
  \"cpu_percent\": 45,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"

# Hasil yang diharapkan:
# ✓ Terlihat di Terminal 5
# ✗ TIDAK ada alert di Terminal 4
# ✗ TIDAK ada playbook trigger di Terminal 3
```

✅ **Status**: Normal operations - No alerts triggered

---

### Skenario 2: High CPU Alert

```bash
# Terminal 6: Kirim HIGH CPU (92% > 85%)
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"cpu_percent\": 92,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"

# Hasil yang diharapkan:
# ✓ Terminal 4: [ALERT] HighCPUUsage triggered
# ✓ Terminal 3: Playbook dijalankan
# ✓ Terminal 2: Tools dieksekusi
```

✅ **Status**: Alert detected - Playbook executed

---

### Skenario 3: High Memory Alert

```bash
# Terminal 6: Kirim HIGH MEMORY (92% > 90%)
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"cpu_percent\": 70,
  \"memory_percent\": 92,
  \"disk_percent\": 70
}"

# Hasil yang diharapkan:
# ✓ Terminal 4: [ALERT] HighMemoryUsage triggered
# ✓ Terminal 3: diag-high-memory playbook executed
```

✅ **Status**: Alert detected - Different playbook executed

---

### Skenario 4: Low Disk Alert

```bash
# Terminal 6: Kirim LOW DISK (98% > 95%)
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"cpu_percent\": 70,
  \"memory_percent\": 60,
  \"disk_percent\": 98
}"

# Hasil yang diharapkan:
# ✓ Terminal 4: [ALERT] DiskSpaceLow triggered
# ✓ Terminal 3: diag-low-disk playbook executed
```

✅ **Status**: Alert detected - Remediation playbook executed

---

### Skenario 5: Multiple Alerts (Semua 3 Rules)

```bash
# Terminal 6: Kirim MULTIPLE alerts
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"cpu_percent\": 90,
  \"memory_percent\": 92,
  \"disk_percent\": 98
}"

# Hasil yang diharapkan:
# ✓ Terminal 4: 3 ALERT dipicu
# ✓ Terminal 3: 3 playbook terpisah dijalankan
```

✅ **Status**: Multiple alerts detected - All playbooks executed

---

### Skenario 6: Alert Throttling (5-Minute Cooldown)

```bash
# Terminal 6: Kirim HIGH CPU alert LAGI
nats pub "telemetry.test-agent" "{
  \"agent_id\": \"test-agent\",
  \"cpu_percent\": 92,
  \"memory_percent\": 60,
  \"disk_percent\": 70
}"

# Hasil yang diharapkan SEKARANG:
# ✓ Terminal 4: Alert TIDAK di-trigger (throttled)
# ✓ Terminal 3: Playbook TIDAK dijalankan
# ✓ Terminal 4 log: "Alert throttled"
```

✅ **Status**: Alert throttling working - No duplicate triggers

---

## 🔍 Verifikasi Sistem Lengkap

Buat checklist untuk verifikasi semua berfungsi:

```markdown
## ✅ System Verification Checklist

### Services Running
- [ ] Docker Desktop running (check taskbar)
- [ ] NATS container healthy: docker-compose ps
- [ ] PostgreSQL container running
- [ ] Redis container running

### Terminal 2 - Client Agent
- [ ] "NATS connected to nats://localhost:4222"
- [ ] "telemetry server listening on :8081"
- [ ] "published telemetry to telemetry.*" (every 30s)

### Terminal 3 - Playbook Engine
- [ ] "connected to NATS broker"
- [ ] "enrollment server listening on :8085"
- [ ] "Playbook Engine ready - subscribed to playbook.trigger"

### Terminal 4 - AI Orchestrator
- [ ] "AI Orchestrator connected to NATS"
- [ ] "subscribed to telemetry channel: telemetry.>"
- [ ] "AI Orchestrator running"

### HTTP Endpoints (Terminal 6)
- [ ] curl http://localhost:8081/telemetry returns JSON
- [ ] nats pub works (publishes messages)
- [ ] nats sub works (receives messages)

### Alert Detection
- [ ] High CPU (92%) triggers alert ✓
- [ ] High Memory (92%) triggers alert ✓
- [ ] Low Disk (98%) triggers alert ✓

### Playbook Execution
- [ ] Terminal 3 logs show playbook execution
- [ ] Terminal 2 logs show HTTP requests received
- [ ] Terminal 5 shows all NATS messages

### Job Tracking
- [ ] Terminal 4 shows [JOB] created messages
- [ ] Terminal 4 shows job status updates
- [ ] Terminal 4 shows [JOB] completed messages

### Alert Throttling
- [ ] Send same alert twice
- [ ] First alert executes playbook
- [ ] Second alert shows "throttled"
- [ ] No duplicate playbook execution

### Overall System
- [ ] Complete telemetry → AI → playbook → execution flow works
- [ ] No errors in any terminal
- [ ] System is stable (running 5+ minutes without crash)
```

---

## 🐛 Troubleshooting

### Problem 1: NATS Connection Refused

**Error Message:**
```
NATS connection refused
failed to connect to NATS
```

**Solusi:**
```bash
# 1. Verifikasi NATS running
docker-compose ps nats

# 2. Cek logs
docker-compose logs nats

# 3. Restart NATS
docker-compose restart nats

# 4. Tunggu 10 detik
# 5. Coba lagi
```

---

### Problem 2: Port Already in Use

**Error Message:**
```
listen tcp :8081: bind: An attempt was made to use a socket in a way forbidden
```

**Solusi:**
```bash
# 1. Temukan process yang menggunakan port
netstat -ano | findstr :8081

# 2. Kill process (ganti PID dengan yang dari output di atas)
taskkill /PID 12345 /F

# 3. Jalankan lagi
go run ./cmd/agent-client/main.go ...
```

---

### Problem 3: Client Agent Not Publishing Telemetry

**Gejala:**
```
Terminal 5 tidak menampilkan telemetry.* messages
```

**Solusi:**
```bash
# 1. Verifikasi NATS_URL benar
echo %NATS_URL%
# Output harus: nats://localhost:4222

# 2. Verifikasi Client Agent berjalan tanpa error
# Lihat Terminal 2, cek ada "[ERROR]" atau "[FAIL]"

# 3. Jika ada error, stop (Ctrl+C) dan restart
# dengan:
set NATS_URL=nats://localhost:4222
go run ./cmd/agent-client/main.go ...
```

---

### Problem 4: Playbook Not Triggered

**Gejala:**
```
Mengirim alert tapi playbook tidak dijalankan
```

**Solusi:**
```bash
# 1. Verifikasi AI Orchestrator berjalan
# Lihat Terminal 4, ada "subscribed to telemetry channel" ?

# 2. Verifikasi telemetry diterima
# Terminal 5: bisa lihat "Published 'telemetry.*'" ?

# 3. Cek threshold alert rules
# CPU > 85%? Memory > 90%? Disk > 95%?

# 4. Verifikasi playbook-engine subscribed
# Terminal 3: ada "subscribed to playbook.trigger" ?

# 5. Jika semua OK tapi tetap tidak bekerja:
# Restart AI Orchestrator (Terminal 4) dengan Ctrl+C
# Jalankan lagi: go run main.go job_tracker.go
```

---

### Problem 5: Tools Not Executing

**Gejala:**
```
Playbook berjalan tapi tools (ping, disk) tidak execute
```

**Solusi:**
```bash
# 1. Verifikasi Client Agent berjalan dengan port 8081
curl http://localhost:8081/telemetry

# 2. Jika 404 error, Client Agent tidak jalan
# Restart di Terminal 2

# 3. Verifikasi tool exists
# Check: client-agent/pkg/tools/tools.go
# Pastikan ada: PingTool, DiskTool, ServiceStatusTool, dll

# 4. Test tool manually
curl -X POST http://localhost:8081/tool \
  -H "Content-Type: application/json" \
  -d '{"tool":"ping","args":{"host":"localhost"}}'

# 5. Jika error, check logs di Terminal 2
```

---

### Problem 6: "command not found" errors

**Gejala:**
```
go: command not found
nats: command not found
docker: command not found
```

**Solusi:**
```bash
# 1. Verifikasi Go installed
go version

# 2. Jika error, install dari:
# https://golang.org/dl/

# 3. Restart PowerShell/Command Prompt setelah install

# 4. Untuk nats, install dengan:
go install github.com/nats-io/natscli/cmd/nats@latest

# 5. Untuk docker, download dari:
# https://www.docker.com/products/docker-desktop
```

---

## 📊 Dashboard Monitoring

Untuk monitoring real-time yang lebih baik, akses:

### NATS Dashboard
```
http://localhost:8222
```
Menampilkan stats NATS broker.

### Prometheus
```
http://localhost:9090
```
Metrics dari sistem (jika dikonfigurasi).

### Grafana
```
http://localhost:3010
Username: admin
Password: admin
```
Dashboard visualization.

---

## 📝 Menyimpan Hasil Testing

Untuk dokumentasi, buat file `TEST_RESULTS.txt`:

```bash
# Terminal 6: Redirect output ke file
nats sub ">" > TEST_RESULTS.txt

# Jalankan test scenarios
# Setelah selesai, Ctrl+C

# Lihat hasil
cat TEST_RESULTS.txt
```

---

## 🎓 Penjelasan Flow Lengkap

### 1. Telemetry Collection Phase
```
T+0s
├─ Client Agent bangun (startup)
├─ Connect ke NATS :4222
├─ Start HTTP server :8081
├─ Subscribe ke agents.commands topic
└─ Ready untuk publish telemetry

T+30s
├─ Collect metrics (CPU, Memory, Disk)
├─ Package ke JSON
├─ Publish ke telemetry.{hostname}
└─ Repeat setiap 30 detik
```

### 2. Analysis Phase
```
T+0.5s (setelah telemetry dipublish)
├─ AI Orchestrator terima telemetry
├─ Parse JSON
├─ Bandingkan dengan alert rules
└─ Jika threshold terlampaui → ALERT
```

### 3. Playbook Trigger Phase
```
T+1s
├─ AI Orchestrator create job record
├─ Publish ke playbook.trigger topic
├─ Include job_id, agent_id, playbook_id
└─ Alert throttle set untuk 5 menit
```

### 4. Execution Phase
```
T+1.5s
├─ Playbook Engine terima trigger
├─ Load playbook dari memory
├─ Execute steps satu per satu:
│  ├─ Step 1: collect_telemetry
│  │  └─ HTTP GET http://agent:8081/telemetry
│  │     └─ Client Agent respond dengan metrics
│  └─ Step 2: run_diagnostics
│     └─ HTTP POST http://agent:8081/tool
│        └─ Client Agent execute ping tool
└─ Log results
```

### 5. Completion Phase
```
T+3s
├─ Playbook execution complete
├─ Job status updated: completed
├─ Results ready untuk notification
└─ System kembali ke monitoring state
```

---

## 🚀 Next Steps

Setelah semua berfungsi:

1. **Baca dokumentasi lengkap**: [AGENTIC_README.md](AGENTIC_README.md)
2. **Explore advanced testing**: [E2E_TESTING.md](E2E_TESTING.md)
3. **Production hardening**:
   - Set up Redis untuk job persistence
   - Set up PostgreSQL untuk playbook storage
   - Integrate Ollama untuk AI decisions
   - Build Next.js dashboard

---

## 📞 Support

Jika ada masalah:

1. **Check Terminal Logs** - Lihat error messages di setiap terminal
2. **Docker Logs** - `docker-compose logs -f`
3. **NATS Monitoring** - Terminal dengan `nats sub ">"`
4. **Restart Services** - `docker-compose restart`

---

## ✅ Kesimpulan

Jika Anda berhasil mengikuti semua langkah di tutorial ini:

✅ Docker services running  
✅ Client Agent publishing telemetry  
✅ AI Orchestrator analyzing data  
✅ Playbook Engine executing playbooks  
✅ Client Agent executing tools  
✅ Complete end-to-end flow working  

**Selamat! Sistem Agentic Helpdesk AI Anda sudah berhasil! 🎉**

---

**Dibuat**: 2026-06-08  
**Versi**: 1.0.0  
**Bahasa**: Indonesia  
**Status**: Ready for Production
