# Database Setup Guide - Technician & Users Seeding

## 📋 Overview

Database schema sudah siap dengan:
- ✅ Users table (admin, technician, user roles)
- ✅ Technician presence table (real-time status tracking)
- ✅ Seed data untuk 4 technician + 1 admin + 1 local user

---

## 👥 Technician Accounts (Seeded)

| Nama | Username | Email | Role | Password | Initial Status |
|------|----------|-------|------|----------|-----------------|
| Rendy Martiano | `rendy.m` | rendy@helpdesk.local | technician | `ChangeMe@123` | **online** |
| Alif Fadillah | `alif.f` | alif@helpdesk.local | technician | `ChangeMe@123` | **offline** |
| Muhammad Ramadhan | `m.ramadhan` | ramadhan@helpdesk.local | technician | `ChangeMe@123` | **on_ticket** |
| Febryano Allandy Berta | `febryano.b` | febryano@helpdesk.local | technician | `ChangeMe@123` | **on_break** |

**Additional Seed Users:**
- Admin: `admin` / `admin@helpdesk.local` (password: `ChangeMe@123`)
- Local User: `user.local` / `user@helpdesk.local` (password: `ChangeMe@123`)

---

## 🔐 Password Hash

All accounts use bcrypt hash: `$2a$10$vbcGFq9FcX.Ii1STNqzDW.iDlG591O3Iks54Vh8ZM/T.chUFbD2HC`

**Plain password**: `ChangeMe@123`

---

## 🚀 Setup & Run

### Option 1: Docker Compose (Recommended)

```powershell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai

# Start all services (automatic migrations run)
docker-compose up -d

# Verify containers running
docker-compose ps

# Check database logs
docker-compose logs postgres
```

**What happens automatically:**
1. PostgreSQL starts
2. All migrations in `migrations/` folder execute in order
3. Schema created
4. Seed data inserted (users + technician presence)

---

### Option 2: Manual Migration (Native PostgreSQL)

**Requirements:**
- PostgreSQL 15+ installed
- `psql` CLI available

```powershell
# Step 1: Connect to PostgreSQL
$env:PGPASSWORD = "helpdesk@123"
psql -h localhost -p 5436 -U helpdesk -d helpdesk_ai

# Step 2: Run migrations manually
\i migrations/001_initial_schema.up.sql
\i migrations/002_seed_data.up.sql

# Step 3: Verify
SELECT username, email, role FROM users;
SELECT u.username, tp.status FROM users u 
  INNER JOIN technician_presence tp ON u.id = tp.technician_id;
```

---

### Option 3: Go Migration Tool (If Available)

```powershell
# Using sql-migrate or similar
migrate -path ./migrations -database "postgres://helpdesk:helpdesk@123@localhost:5436/helpdesk_ai?sslmode=disable" up
```

---

## 📊 Verify Seed Data

### Check Users

```sql
SELECT id, name, username, email, role, status FROM users;
```

**Expected Output:**
```
id                                   | name                  | username    | email                      | role       | status
-------------------------------------|------------------------|------------|----------------------------|------------|--------
550e8400-e29b-41d4-a716-446655440000 | System Admin           | admin      | admin@helpdesk.local       | admin      | active
550e8400-e29b-41d4-a716-446655440001 | Rendy Martiano         | rendy.m    | rendy@helpdesk.local       | technician | active
550e8400-e29b-41d4-a716-446655440002 | Alif Fadillah          | alif.f     | alif@helpdesk.local        | technician | active
550e8400-e29b-41d4-a716-446655440003 | Muhammad Ramadhan      | m.ramadhan | ramadhan@helpdesk.local    | technician | active
550e8400-e29b-41d4-a716-446655440004 | Febryano Allandy Berta | febryano.b | febryano@helpdesk.local    | technician | active
550e8400-e29b-41d4-a716-446655440005 | Local User             | user.local | user@helpdesk.local        | user       | active
```

### Check Technician Presence

```sql
SELECT u.name, u.username, tp.status, tp.last_heartbeat 
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id;
```

**Expected Output:**
```
name                   | username    | status      | last_heartbeat
-----------------------|-------------|-------------|----------------------------------
Rendy Martiano         | rendy.m     | online      | 2026-06-04 10:30:45
Alif Fadillah          | alif.f      | offline     | 2026-06-04 10:30:45
Muhammad Ramadhan      | m.ramadhan  | on_ticket   | 2026-06-04 10:30:45
Febryano Allandy Berta | febryano.b  | on_break    | 2026-06-04 10:30:45
```

---

## 🔄 Real-Time Status Updates (WebSocket)

Technician status updates via WebSocket:

```javascript
// Frontend WebSocket connection
const ws = new WebSocket('ws://localhost:8090/ws/rendy.m');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // { status: "online", last_heartbeat: "2026-06-04T10:30:45Z" }
  console.log('Status:', data.status);
};
```

**Status Values:**
- `online` - Available for tickets
- `offline` - Not connected
- `busy` - On a ticket but can't take more
- `idle` - Waiting for assignment
- `on_ticket` - Currently working on a ticket
- `on_break` - On break, unavailable

---

## 📝 Modify Seed Data

### Edit Technician Status

File: `migrations/002_seed_data.up.sql`

Change status values in these lines:
```sql
INSERT INTO technician_presence (technician_id, status) 
SELECT id, 'online' FROM users WHERE username = 'rendy.m';  -- Change 'online' to other status
```

Available statuses:
- `online`
- `offline`
- `busy`
- `idle`
- `on_ticket`
- `on_break`

### Reset Database (Rollback)

```powershell
# If using Docker
docker-compose down -v  # -v removes volumes (database data)
docker-compose up -d    # Recreate with fresh seed data

# If native PostgreSQL
psql -h localhost -p 5436 -U helpdesk -d helpdesk_ai -f migrations/002_seed_data.down.sql
psql -h localhost -p 5436 -U helpdesk -d helpdesk_ai -f migrations/002_seed_data.up.sql
```

---

## 🔑 Create New User (API)

After database is running and API started:

```bash
curl -X POST http://localhost:8090/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "name": "New Technician",
    "username": "new.tech",
    "email": "new@helpdesk.local",
    "password": "SecurePass@123",
    "role": "technician"
  }'
```

---

## 🐳 Docker Compose Configuration

```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: helpdesk
      POSTGRES_PASSWORD: helpdesk@123
      POSTGRES_DB: helpdesk_ai
    ports:
      - "5436:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d  # Auto-runs .sql files
```

---

## 🆘 Troubleshooting

### Migration Error: "column already exists"
This means migrations already ran. Rollback and retry:
```powershell
docker-compose down -v
docker-compose up
```

### Password hash not matching
If you changed password, generate new hash:
```powershell
# Use Go to generate bcrypt hash
go run ./scripts/generate_password_hash.go "YourNewPassword"
```

### Can't connect to PostgreSQL
```powershell
# Check container logs
docker-compose logs postgres

# Verify port 5436 is accessible
Test-NetConnection -ComputerName localhost -Port 5436
```

### WebSocket status not updating
Check if technician presence table has records:
```sql
SELECT COUNT(*) FROM technician_presence;  -- Should be 4
```

---

## ✅ Verification Checklist

- [ ] Docker containers running (`docker-compose ps`)
- [ ] PostgreSQL responding (`docker-compose exec postgres psql -U helpdesk`)
- [ ] Users table has 6 records (4 tech + 1 admin + 1 user)
- [ ] Technician_presence table has 4 records
- [ ] Backend API starts (`go run ./cmd/api/main.go`)
- [ ] Frontend loads (`npm run dev` from frontend folder)
- [ ] Can login with `rendy.m / ChangeMe@123`
- [ ] WebSocket connects for technician status

---

**Database Setup Complete!** 🎉

Next: Start the backend API and frontend dashboard.

```powershell
# Terminal 1: Backend
go run ./cmd/api/main.go

# Terminal 2: Frontend
cd frontend && npm run dev
```
