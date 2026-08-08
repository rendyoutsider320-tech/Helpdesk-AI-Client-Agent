# Frontend-Backend-Database Connectivity Guide

## ✅ Setup Status

### Configuration Files ✓
- ✅ Backend `.env` - Configured with database credentials
- ✅ Frontend `.env.local` - Created with API endpoints
- ✅ Docker-compose - Ready with PostgreSQL, Redis, Qdrant services
- ✅ Next.js config - API rewriting configured

### Backend Fixes ✓
- ✅ Removed duplicate server start code
- ✅ CORS middleware allows all origins
- ✅ Rate limiter properly configured (120 req/min)
- ✅ All API endpoints registered
- ✅ Health check endpoint available at `/health`

### Database Schema ✓
- ✅ PostgreSQL migrations prepared
- ✅ All tables defined (Users, Tickets, Devices, Alerts, KB Articles, etc.)
- ✅ GORM models properly mapped
- ✅ Foreign key relationships configured

---

## 🚀 Quick Start Guide

### Step 1: Prerequisites
- **Docker Desktop** (includes Docker & Docker Compose)
- **Node.js** (v18+)
- **Go** (v1.21+, for backend compilation)
- **Git** (to clone/manage the repository)

### Step 2: Clone/Navigate to Project
```powershell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
```

### Step 3: Start Infrastructure (Docker)
```powershell
# Start all services (PostgreSQL, Redis, Qdrant, Prometheus, Grafana, Loki)
docker-compose up -d

# Verify containers are running
docker-compose ps
```

### Step 4: Start Backend API
```powershell
# Terminal 1: Backend
go run ./cmd/api/main.go

# Expected output:
# [*] Starting server on port 8090
# [*] Database initialized successfully
```

### Step 5: Start Frontend
```powershell
# Terminal 2: Frontend
cd frontend
npm install  # Only needed first time
npm run dev

# Expected output:
# > ready - started server on 0.0.0.0:3002, url: http://localhost:3002
```

### Step 6: Access the Application
- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:8090/api/v1
- **Backend Health**: http://localhost:8090/health
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090

---

## 🔌 Connection Architecture

### Frontend → Backend Connection Flow
```
User Browser (http://localhost:3002)
        ↓
  Next.js Rewrites
    (see next.config.js)
        ↓
  /api/* → http://localhost:8090/api/v1/*
        ↓
  Gin Router (Backend)
        ↓
  PostgreSQL Database
```

### Configuration Details

#### Frontend API Configuration (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8090/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8090
NEXT_PUBLIC_ENV=development
```

#### Backend Database Configuration (`.env`)
```env
DB_HOST=localhost          # or 'postgres' in Docker network
DB_PORT=5432
DB_USER=helpdesk
DB_PASSWORD=helpdesk@123
DB_NAME=helpdesk_ai
REDIS_HOST=localhost      # or 'redis' in Docker network
REDIS_PORT=6379
SERVER_PORT=8090
```

#### Docker Networking
- Services communicate via Docker network `helpdesk-network`
- On host machine: use `localhost` or `127.0.0.1`
- From container to container: use service name (e.g., `postgres`, `redis`)

---

## 🔍 Connectivity Testing

### Test Health Endpoint
```powershell
# Check if backend is running
curl http://localhost:8090/health
# Expected: {"status":"ok"}
```

### Test Database Connection
```powershell
# The backend will log database connection status on startup
# Look for: "Database initialized successfully"
```

### Test API Endpoint (requires login first)
```powershell
# Login to get token
$loginResponse = curl -X POST http://localhost:8090/api/v1/auth/login `
  -ContentType application/json `
  -Body '{"username":"admin","password":"admin"}'

# Extract token from response and use it
$token = $loginResponse.access_token

# Test protected endpoint
curl -H "Authorization: Bearer $token" `
  http://localhost:8090/api/v1/tickets
```

---

## 🚨 Troubleshooting

### Issue: Frontend can't connect to backend
**Solution:**
1. Verify backend is running: `curl http://localhost:8090/health`
2. Check `frontend/.env.local` has correct API URL
3. Check browser console for CORS errors (should be allowed)
4. Check firewall isn't blocking port 8090

### Issue: Database connection failed
**Solution:**
1. Verify PostgreSQL container is running: `docker ps | grep postgres`
2. Check credentials in `.env` match docker-compose.yml
3. Wait 5-10 seconds after container start
4. Check Docker logs: `docker logs helpdesk-postgres`

### Issue: Frontend dependencies issues
**Solution:**
```powershell
cd frontend
rm -r node_modules
rm package-lock.json
npm cache clean --force
npm install
```

### Issue: Docker containers won't start
**Solution:**
```powershell
# Check Docker is running
docker ps

# Clean up and restart
docker-compose down -v
docker-compose up -d
```

### Issue: Port already in use
**Solution:**
```powershell
# Find process using port 8090
netstat -ano | findstr :8090

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change backend port in .env: SERVER_PORT=8091
```

---

## 📊 API Endpoints Available

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/refresh-token` - Refresh JWT token
- `POST /api/v1/auth/logout` - User logout

### Tickets
- `GET /api/v1/tickets` - List tickets
- `POST /api/v1/tickets` - Create ticket
- `GET /api/v1/tickets/:id` - Get ticket details
- `PUT /api/v1/tickets/:id` - Update ticket
- `POST /api/v1/tickets/:id/comments` - Add comment
- `POST /api/v1/tickets/:id/assign` - Assign ticket
- `POST /api/v1/tickets/:id/resolve` - Resolve ticket
- `POST /api/v1/tickets/:id/close` - Close ticket

### Dashboard
- `GET /api/v1/dashboard/stats` - Get dashboard statistics
- `GET /api/v1/dashboard/summary` - Get dashboard summary
- `GET /api/v1/dashboard/recent-tickets` - Get recent tickets
- `GET /api/v1/dashboard/recent-alerts` - Get recent alerts

### Devices & Monitoring
- `GET /api/v1/devices` - List devices
- `GET /api/v1/devices/:id/metrics` - Get device metrics
- `GET /api/v1/alerts` - List alerts
- `POST /api/v1/alerts/:id/resolve` - Resolve alert

### AI & Tools
- `POST /api/v1/ai/chat` - AI chat endpoint
- `POST /api/v1/ai/analyze` - Analyze incident
- `GET /api/v1/tools` - List available tools
- `POST /api/v1/tools/:tool_name/execute` - Execute tool

### WebSocket
- `GET /ws/:user_id` - WebSocket for real-time updates

---

## 🐳 Docker Services

### PostgreSQL
- **Port**: 5432
- **User**: helpdesk
- **Password**: helpdesk@123
- **Database**: helpdesk_ai
- **Health Check**: Every 10s

### Redis
- **Port**: 6379
- **No authentication** (development only)
- **Data Volume**: `redis_data`

### Qdrant (Vector DB for AI)
- **Port**: 6333 (HTTP), 6334 (gRPC)
- **API Key**: helpdesk-qdrant-key
- **Data Volume**: `qdrant_data`

### Prometheus (Monitoring)
- **Port**: 9090
- **Config**: `docker/prometheus.yml`

### Grafana (Dashboards)
- **Port**: 3000
- **Default User**: admin
- **Default Password**: admin
- **Data Volume**: `grafana_data`

### Loki (Logs)
- **Port**: 3100
- **Config**: `docker/loki-config.yml`

---

## 📝 Environment Variables Reference

### Database
| Variable | Default | Description |
|----------|---------|-------------|
| DB_HOST | localhost | PostgreSQL host |
| DB_PORT | 5432 | PostgreSQL port |
| DB_USER | helpdesk | PostgreSQL user |
| DB_PASSWORD | helpdesk@123 | PostgreSQL password |
| DB_NAME | helpdesk_ai | Database name |

### Server
| Variable | Default | Description |
|----------|---------|-------------|
| SERVER_PORT | 8090 | API server port |
| SERVER_ENV | development | Environment (development/production) |
| JWT_SECRET | (set in .env) | JWT secret key |

### Cache & Vector DB
| Variable | Default | Description |
| REDIS_HOST | redis | Redis host |
| REDIS_PORT | 6379 | Redis port |
| QDRANT_URL | http://localhost:6333 | Qdrant URL |
| QDRANT_API_KEY | helpdesk-qdrant-key | Qdrant API key |

### AI Services
| Variable | Default | Description |
| OLLAMA_URL | http://localhost:11434 | Ollama LLM server |
| OPENAI_API_KEY | (empty) | OpenAI API key (optional) |
| QDRANT_COLLECTION | helpdesk-ai | Vector collection name |

---

## 🔧 Advanced Setup

### For Docker Network (Container-to-Container)
If running backend in Docker container:
```dockerfile
# In Dockerfile, use service names:
DB_HOST=postgres
REDIS_HOST=redis
QDRANT_URL=http://qdrant:6333
```

### For Production
1. Update `.env` with production credentials
2. Change `SERVER_ENV=production`
3. Use strong JWT secret
4. Configure SSL/TLS certificates
5. Set up proper firewall rules
6. Use environment-specific database migrations

### For Development with Hot Reload
```powershell
# Use air for backend hot reload
go install github.com/cosmtrek/air@latest
air

# Frontend hot reload is built-in with next dev
```

---

## 📞 Support

If you encounter issues:

1. Check logs: `docker logs <service_name>`
2. Verify all services are running: `docker-compose ps`
3. Review `.env` and `frontend/.env.local` configuration
4. Check port availability: `netstat -ano`
5. Restart services: `docker-compose restart`

---

**Last Updated**: May 31, 2026
**Version**: 1.0
