# Docker Networking Configuration Guide

## Network Architecture

The application uses a **bridge network** named `helpdesk-network` for service-to-service communication.

```
┌─────────────────────────────────────────────────────────┐
│          Docker Bridge Network: helpdesk-network         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Frontend    │  │     API      │  │  PostgreSQL  │  │
│  │  :3002       │  │    :8080     │  │    :5432     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                          │                               │
│                    ┌─────┼─────┐                        │
│                    │     │     │                        │
│  ┌──────────────┐  │  ┌──────────────┐  ┌──────────┐  │
│  │     Redis    │  │  │   Qdrant     │  │  Ollama  │  │
│  │   :6379      │  │  │   :6333      │  │ :11434   │  │
│  └──────────────┘  │  └──────────────┘  └──────────┘  │
│                    │                                     │
│  ┌──────────────┐  │  ┌──────────────┐  ┌──────────┐  │
│  │  Prometheus  │  │  │   Grafana    │  │   Loki   │  │
│  │   :9090      │  │  │   :3000      │  │  :3100   │  │
│  └──────────────┘  │  └──────────────┘  └──────────┘  │
│                    │                                     │
│                    └─────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Nginx (Reverse Proxy) :80, :443                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
             Host Machine   External Services
             (localhost)    (Optional: OpenAI API)
```

## Local Development Setup

### When Running Locally (NOT in Docker)

**Host Machine:**
- Frontend: `http://localhost:3002`
- Backend: `http://localhost:8090`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Qdrant: `localhost:6333`

**Configuration (`.env`):**
```env
DB_HOST=localhost
DB_PORT=5432
REDIS_HOST=localhost
REDIS_PORT=6379
QDRANT_URL=http://localhost:6333
SERVER_PORT=8090
```

**Frontend Configuration (`frontend/.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:8090/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8090
```

## Docker Deployment Setup

### When Running in Docker

**Inside Docker Network:**
- Frontend: `http://frontend:3002`
- API: `http://api:8080`
- PostgreSQL: `postgres:5432`
- Redis: `redis:6379`
- Qdrant: `http://qdrant:6333`

**From Host Machine:**
- Frontend: `http://localhost:3002`
- API: `http://localhost:8080` (via port mapping)
- Nginx: `http://localhost` (reverse proxy)

**Service-to-Service Communication:**
```
Frontend (in Docker) → http://api:8080/api/v1
API (in Docker) → postgres:5432 (PostgreSQL)
API (in Docker) → redis:6379 (Redis)
API (in Docker) → http://qdrant:6333 (Qdrant)
```

**Docker Compose Environment Variables:**
```yaml
environment:
  DB_HOST: postgres          # Service name
  DB_PORT: 5432
  REDIS_HOST: redis          # Service name
  REDIS_PORT: 6379
  QDRANT_URL: http://qdrant:6333  # Service name
  MINIO_HOST: minio          # Service name
  SERVER_PORT: 8080
```

## DNS Resolution in Docker

### Service Discovery
Docker's embedded DNS server resolves service names to their containers:

```bash
# Inside a container, you can ping services by name:
ping postgres      # Resolves to PostgreSQL container
ping redis        # Resolves to Redis container
ping api          # Resolves to API container
ping frontend     # Resolves to Frontend container
```

### Port Mapping
- Container internal port: 5432 (inside container)
- Docker host port: 5432 (on your machine)
- Access from host: `localhost:5432`
- Access from container: `postgres:5432` (service name)

## Nginx Reverse Proxy Configuration

The Nginx service acts as a reverse proxy:

```nginx
# Nginx routes incoming requests:
http://localhost → http://frontend:3002 (Frontend)
http://localhost/api/* → http://api:8080/api/* (API)
http://localhost/admin → http://localhost:3000 (Grafana)
```

## Connection Strings by Context

### From Host Machine (Local Development)
```
Database: postgresql://helpdesk:helpdesk@123@localhost:5432/helpdesk_ai
Redis: redis://localhost:6379
API: http://localhost:8090/api/v1
```

### From Container (Docker)
```
Database: postgresql://helpdesk:helpdesk@123@postgres:5432/helpdesk_ai
Redis: redis://redis:6379
API: http://api:8080/api/v1
```

## Health Checks

### PostgreSQL Health Check
```bash
# From host
psql -h localhost -U helpdesk -d helpdesk_ai -c "SELECT 1;"

# From container
docker exec helpdesk-postgres pg_isready -U helpdesk
```

### Redis Health Check
```bash
# From host
redis-cli -h localhost ping

# From container
docker exec helpdesk-redis redis-cli ping
```

### API Health Check
```bash
# From host
curl http://localhost:8090/health

# From container
curl http://api:8080/health
```

## Network Troubleshooting

### Check Network Status
```bash
# List all networks
docker network ls

# Inspect network
docker network inspect helpdesk-network

# Check container IP
docker inspect helpdesk-api | grep IPAddress
```

### Test Container Connectivity
```bash
# Test from one container to another
docker exec helpdesk-api ping redis
docker exec helpdesk-api curl http://postgres:5432

# Check DNS resolution
docker exec helpdesk-api nslookup postgres
```

### Debugging Connection Issues
```bash
# View container logs
docker logs helpdesk-api

# Enter container for debugging
docker exec -it helpdesk-api sh

# Test network connectivity inside container
# (inside container):
ping postgres
telnet postgres 5432
curl http://qdrant:6333/health
```

## Switching Between Configurations

### For Local Development (Recommended for Testing)
1. Start only Docker services: `docker-compose up -d postgres redis qdrant`
2. Run backend locally: `go run ./cmd/api/main.go`
3. Run frontend locally: `cd frontend && npm run dev`
4. Use `.env` with `DB_HOST=localhost`, `REDIS_HOST=localhost`
5. Frontend connects to `http://localhost:8090/api/v1`

### For Docker Deployment
1. Run all services: `docker-compose up -d`
2. Services communicate via service names
3. Access frontend at `http://localhost:3002`
4. Nginx routes requests to appropriate services

## Environment-Specific Configurations

### Development (`.env`)
```env
SERVER_ENV=development
DB_HOST=localhost
REDIS_HOST=localhost
JWT_SECRET=dev-secret-key
```

### Production (Docker)
```env
SERVER_ENV=production
DB_HOST=postgres
REDIS_HOST=redis
JWT_SECRET=$(secure-random-key)
```

## Port Reference

| Service | Internal | Host | Docker |
|---------|----------|------|--------|
| Frontend | 3002 | 3002 | frontend:3002 |
| Backend API | 8080/8090 | 8090 | api:8080 |
| PostgreSQL | 5432 | 5432 | postgres:5432 |
| Redis | 6379 | 6379 | redis:6379 |
| Qdrant | 6333 | 6333 | qdrant:6333 |
| Ollama | 11434 | 11434 | ollama:11434 |
| MinIO | 9000/9001 | 9000/9001 | minio:9000 |
| Prometheus | 9090 | 9090 | prometheus:9090 |
| Grafana | 3000 | 3000 | (via nginx) |
| Loki | 3100 | 3100 | loki:3100 |
| Nginx | 80/443 | 80/443 | nginx:80 |

---

**Note**: For local development, using `localhost` is recommended. For Docker deployment, use service names (e.g., `postgres`, `redis`).
