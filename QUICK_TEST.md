# Quick Test Guide - Technician Database & Status

## 🚀 Start Database in 2 Commands

```powershell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Start all services + run migrations automatically
docker-compose up -d

# Wait ~30 seconds then verify
docker-compose ps
```

---

## ✅ Quick Verification

### 1. Check if containers running
```powershell
docker-compose ps

# Expected: helpdesk-postgres, helpdesk-redis, helpdesk-api should show "Up"
```

### 2. Quick test database
```powershell
# Test PostgreSQL
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT COUNT(*) FROM users;"

# Expected output: 6
```

### 3. List all technicians
```powershell
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c \
"SELECT username, name, status FROM users u 
 INNER JOIN technician_presence tp ON u.id = tp.technician_id 
 WHERE u.role = 'technician' ORDER BY u.name;"
```

**Expected:**
```
 username    |      name              | status
-------------|------------------------|----------
 alif.f      | Alif Fadillah          | offline
 febryano.b  | Febryano Allandy Berta | on_break
 m.ramadhan  | Muhammad Ramadhan      | on_ticket
 rendy.m     | Rendy Martiano         | online
```

---

## 👥 Seed Data Included

| Username | Name | Initial Status | Password |
|----------|------|---|---|
| `rendy.m` | Rendy Martiano | **online** | ChangeMe@123 |
| `alif.f` | Alif Fadillah | **offline** | ChangeMe@123 |
| `m.ramadhan` | Muhammad Ramadhan | **on_ticket** | ChangeMe@123 |
| `febryano.b` | Febryano Allandy Berta | **on_break** | ChangeMe@123 |
| `admin` | System Admin | (admin) | ChangeMe@123 |
| `user.local` | Local User | (user) | ChangeMe@123 |

---

## 🧪 Test API Endpoints

### Start Backend (Terminal 1)
```powershell
go run ./cmd/api/main.go

# Expected: [*] Starting server on port 8090
```

### Test Health Check
```powershell
curl http://localhost:8090/health
# Expected: {"status":"ok"}
```

### Test Login
```powershell
$body = @{
    username = "rendy.m"
    password = "ChangeMe@123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8090/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

---

## 🌐 Test Frontend (Terminal 2)

```powershell
cd frontend
npm install  # First time only
npm run dev

# Expected: ready - started server on 0.0.0.0:3002
```

**Access:** http://localhost:3002

**Login with:**
- Username: `rendy.m`
- Password: `ChangeMe@123`

---

## 📊 Real-Time Status via WebSocket

After logging in as `rendy.m`, WebSocket connection sends:
```json
{
  "type": "presence_update",
  "user_id": "...",
  "status": "online",
  "last_heartbeat": "2026-06-04T10:30:45Z"
}
```

---

## 🔄 Change Technician Status (Manual)

```powershell
# Connect to database
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai

# Update status
UPDATE technician_presence 
SET status = 'idle', last_heartbeat = NOW()
WHERE technician_id = (SELECT id FROM users WHERE username = 'rendy.m');

# Verify
SELECT u.username, tp.status FROM users u 
INNER JOIN technician_presence tp ON u.id = tp.technician_id 
WHERE u.username = 'rendy.m';
```

**Available statuses:**
- `online` - Available for tickets
- `offline` - Not connected
- `busy` - Cannot take tickets
- `idle` - Waiting for assignment
- `on_ticket` - Working on a ticket
- `on_break` - On break

---

## 🐳 Docker Useful Commands

```powershell
# View logs
docker-compose logs -f postgres    # Database logs
docker-compose logs -f helpdesk-api # Backend logs

# Stop all
docker-compose down

# Stop and remove data
docker-compose down -v

# Restart fresh
docker-compose down -v && docker-compose up -d

# SSH into container
docker-compose exec postgres bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai

# View container stats
docker stats
```

---

## 🧹 Reset Everything

```powershell
# Full reset (lose all data)
docker-compose down -v

# Start fresh
docker-compose up -d

# Wait for migrations to run
Start-Sleep -Seconds 30

# Verify
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT COUNT(*) FROM users;"
```

---

## 📁 File Locations

- **Database Config:** `docker-compose.yml`
- **Migrations:** `migrations/`
  - `001_initial_schema.up.sql` - Schema creation
  - `002_seed_data.up.sql` - Seed data (technicians)
- **Backend:** `cmd/api/main.go`
- **Frontend:** `frontend/src/app/page.tsx`
- **Docs:** `DATABASE_SETUP.md`, `TESTING_GUIDE.md`

---

## ⚠️ Troubleshooting

### Containers won't start
```powershell
# Check Docker daemon
docker ps

# View logs
docker-compose logs

# Restart Docker Desktop if needed
```

### Password hash error
```powershell
# Generate new hash for any password
go run ./scripts/generate_password_hash.go YourPassword
```

### Port already in use
```powershell
# Find what's using port 5436
netstat -ano | findstr :5436

# Kill process
Stop-Process -Id <PID> -Force

# Or change port in docker-compose.yml
```

### Migration already executed error
This happens on re-run. Solution:
```powershell
# Option 1: Clean restart
docker-compose down -v && docker-compose up -d

# Option 2: Just connect and use the data
docker-compose up -d
```

---

## 📋 Success Checklist

- [ ] `docker-compose ps` shows all containers "Up"
- [ ] Can connect to PostgreSQL
- [ ] `users` table has 6 rows
- [ ] `technician_presence` table has 4 rows
- [ ] Technician statuses are: online, offline, on_ticket, on_break
- [ ] Can login with `rendy.m / ChangeMe@123`
- [ ] Backend API responds to health check
- [ ] Frontend loads at http://localhost:3002

---

**Ready to test!** 🎉
