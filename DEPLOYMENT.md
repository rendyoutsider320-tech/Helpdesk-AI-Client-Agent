# Helpdesk AI - Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- PostgreSQL 15+ (or use Docker container)
- Redis (or use Docker container)
- Go 1.21+ (for backend development)
- Node.js 18+ (for frontend development)

## Environment Configuration

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=helpdesk
DB_PASSWORD=your_secure_password
DB_NAME=helpdesk_ai

# JWT
JWT_SECRET=your-long-random-secret-key

# AI Services
OLLAMA_URL=http://ollama:11434
QDRANT_URL=http://qdrant:6333

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## Docker Compose Deployment

### Start All Services

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- Redis cache
- Qdrant vector database
- Prometheus monitoring
- Grafana dashboards
- Loki logging
- MinIO object storage
- Ollama AI service
- Go API server
- Nginx reverse proxy

### Check Service Status

```bash
docker-compose ps
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f postgres
```

### Stop Services

```bash
docker-compose down
```

### Remove All Data

```bash
docker-compose down -v
```

## Local Development Setup

### Backend

1. **Install dependencies:**
   ```bash
   go mod download
   ```

2. **Setup database:**
   ```bash
   # Ensure PostgreSQL is running
   psql -U postgres -c "CREATE DATABASE helpdesk_ai;"
   psql -U helpdesk helpdesk_ai < migrations/001_initial_schema.up.sql
   ```

3. **Run API server:**
   ```bash
   go run ./cmd/api/main.go
   ```

   Server will be available at http://localhost:8080

### Frontend

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Create `.env.local`:**
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

   Frontend will be available at http://localhost:3000

## Database Migrations

### Run Migrations (Automatic via Docker)

Migrations run automatically when Docker container starts.

### Manual Migration (Local)

```bash
# Using golang-migrate
migrate -path migrations -database "postgres://user:password@localhost:5432/helpdesk_ai?sslmode=disable" up
```

### Rollback

```bash
migrate -path migrations -database "postgresql://user:password@localhost:5432/helpdesk_ai?sslmode=disable" down
```

## Backup & Restore

### Backup Database

```bash
# Using docker
docker exec helpdesk-postgres pg_dump -U helpdesk helpdesk_ai > backup.sql

# Using local psql
pg_dump -U helpdesk -h localhost helpdesk_ai > backup.sql
```

### Restore Database

```bash
# Using docker
docker exec -i helpdesk-postgres psql -U helpdesk helpdesk_ai < backup.sql

# Using local psql
psql -U helpdesk -h localhost helpdesk_ai < backup.sql
```

## Monitoring & Observability

### Grafana Dashboards

1. Access Grafana: http://localhost:3000/grafana
2. Default credentials: admin/admin
3. Dashboards will show:
   - API metrics (latency, throughput, errors)
   - Database performance
   - System resources (CPU, memory, disk)
   - Custom business metrics

### Prometheus

- Metrics endpoint: http://localhost:9090
- Query API performance and custom metrics

### Loki

- Log aggregation at http://localhost:3000
- Query logs by time, service, user

## Scaling & Load Balancing

### Horizontal Scaling with Docker Compose

```bash
# Scale API service
docker-compose up -d --scale api=3
```

### Kubernetes Deployment

1. **Install Kubernetes manifests:**
   ```bash
   kubectl apply -f deployments/k8s/
   ```

2. **Verify deployment:**
   ```bash
   kubectl get pods
   kubectl get services
   ```

3. **Scale replicas:**
   ```bash
   kubectl scale deployment api --replicas=3
   ```

## Security Checklist

- [ ] Change all default passwords
- [ ] Update JWT_SECRET to a strong random value
- [ ] Enable HTTPS/TLS in production
- [ ] Configure firewall rules
- [ ] Enable database encryption
- [ ] Set up automated backups
- [ ] Enable audit logging
- [ ] Configure rate limiting
- [ ] Setup API authentication tokens
- [ ] Enable MFA for admin users

## Performance Tuning

### Database Connection Pool
```env
DB_MAX_CONNECTIONS=100
DB_IDLE_CONNECTIONS=10
DB_CONN_MAX_LIFETIME=3600
```

### Caching
```env
REDIS_MAX_RETRIES=3
REDIS_POOL_SIZE=10
```

### API Rate Limiting
```env
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
```

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker exec helpdesk-postgres pg_isready

# Check logs
docker logs helpdesk-postgres
```

### API Server Won't Start

```bash
# Check logs
docker logs helpdesk-api

# Verify environment variables
docker inspect helpdesk-api
```

### WebSocket Connection Issues

```bash
# Check if WebSocket endpoint is accessible
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8080/ws/user-id
```

### Memory Issues

```bash
# Check Docker memory usage
docker stats

# Increase limits in docker-compose.yml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 2G
```

## Maintenance

### Regular Backups

```bash
# Daily backup script
0 2 * * * docker exec helpdesk-postgres pg_dump -U helpdesk helpdesk_ai | gzip > /backups/helpdesk-$(date +\%Y\%m\%d).sql.gz
```

### Log Rotation

Loki handles log retention automatically. Configure in `docker/loki-config.yml`:

```yaml
table_manager:
  retention_period: 30d  # Keep 30 days of logs
```

### Health Checks

```bash
# API health
curl http://localhost:8080/health

# Database health
docker exec helpdesk-postgres pg_isready

# Redis health
docker exec helpdesk-redis redis-cli ping
```

## Update & Upgrade

### Update Docker Images

```bash
docker-compose pull
docker-compose up -d
```

### Backend Update

```bash
cd /app
git pull
docker-compose build api
docker-compose up -d api
```

### Database Migration on Update

```bash
docker-compose run api ./cmd/api/main migrate
```

## Production Checklist

- [ ] Use strong, unique passwords
- [ ] Enable SSL/TLS certificates
- [ ] Configure DNS and domain names
- [ ] Set up email service for notifications
- [ ] Configure backup retention policy
- [ ] Enable monitoring and alerting
- [ ] Configure log retention
- [ ] Set up automated scaling policies
- [ ] Document runbooks for on-calls
- [ ] Configure disaster recovery plan

---

For more information, see [README.md](./README.md)
