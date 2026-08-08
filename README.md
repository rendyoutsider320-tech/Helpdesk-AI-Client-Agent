# Enterprise Helpdesk AI + Ticketing + Monitoring System

A comprehensive production-ready enterprise helpdesk platform with AI-powered troubleshooting, real-time monitoring, and automated ticketing.

## 🎯 Features

### Core Features
- **Helpdesk Ticketing**: Create, assign, and resolve support tickets
- **Real-time Monitoring**: Monitor devices, services, and infrastructure metrics
- **AI Troubleshooting Agent**: Intelligent root cause analysis and problem resolution
- **Knowledge Base**: AI-powered knowledge articles with RAG (Retrieval-Augmented Generation)
- **Role-Based Access Control**: Admin, Technician, and User roles
- **Real-time Presence**: WebSocket-based technician online/offline status
- **Alert Management**: Automated alert detection and escalation
- **Dashboard Analytics**: Admin, technician, and user dashboards

### Technical Features
- **Clean Architecture**: Modular, maintainable codebase
- **Microservices Ready**: gRPC and REST APIs
- **Auto-scaling**: Kubernetes-ready deployment
- **High Availability**: Redis caching, connection pooling
- **Security**: JWT authentication, RBAC, audit logging, MFA support
- **Monitoring & Logging**: Prometheus, Grafana, Loki integration
- **CI/CD Ready**: Docker containerization

## 🛠 Tech Stack

### Backend
- **GoLang 1.21**: Gin/Fiber framework
- **Database**: PostgreSQL with GORM
- **Cache**: Redis
- **Vector DB**: Qdrant (for AI embeddings)
- **Monitoring**: Prometheus + Grafana
- **Logging**: Loki + Promtail
- **Object Storage**: MinIO

### Frontend
- **Next.js 14**: React framework
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Styling
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Real-time**: WebSocket support

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes-ready
- **Reverse Proxy**: Nginx
- **API Documentation**: Swagger/OpenAPI

## 📋 Requirements

- Docker >= 20.10
- Docker Compose >= 2.0
- Go >= 1.21 (for local development)
- Node.js >= 18 (for frontend development)

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

1. **Clone and Navigate**
   ```bash
   cd helpdesk-ai
   ```

2. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env if needed
   ```

3. **Start Services**
   ```bash
   docker-compose up -d
   ```

4. **Access Services**
   - API (Docker): http://localhost:8088
   - Frontend: http://localhost (via Nginx)
   - Grafana: http://localhost:3010
   - Prometheus: http://localhost:9090

> Note: Docker Compose maps the API service host port `8088` to container port `8090`.
> This means you can run the backend locally with `go run ./cmd/api/main.go` on port `8090` without port conflicts.

### Option 2: Local Development

**Backend:**
```bash
# Install dependencies
go mod download

# Run database migrations
# (PostgreSQL should be running)

# Start API server locally on port 8090
# Use this when Docker Compose is running the API on host port 8088
export SERVER_PORT=8090
go run ./cmd/api/main.go
```

**PowerShell shortcut:**
```powershell
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
$env:SERVER_PORT = '8090'
go run .\cmd\api\main.go
```

> Note: If Docker Compose is running, the API container listens on container port `8090` and maps it to host port `8088`.
> Running `go run ./cmd/api/main.go` locally on port `8090` prevents a port conflict.

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## �️ Database migration helper
The project includes a reusable database migration helper and wrapper scripts in `scripts/`.

- `scripts/reset_db.go` — Go-based migration runner that loads `.env` and executes SQL files in `migrations/`
- `scripts/reset_db.sh` — Bash wrapper for Linux/macOS/WSL
- `scripts/reset_db.ps1` — PowerShell wrapper for Windows
- `Makefile` — convenient targets: `db-reset`, `db-recreate`, `db-drop`, `db-up`, `db-down`
- `helpdesk-ai/frontend/package.json` — npm scripts to invoke the migration helper from the frontend folder

Example:
```bash
cd helpdesk-ai
make db-reset
```

Windows PowerShell example:
```powershell
cd helpdesk-ai
.\scripts\reset_db.ps1 -Action reset
```

## �📚 API Documentation

### Authentication
```bash
# Login
POST /api/v1/auth/login
{
  "username": "admin",
  "password": "ChangeMe@123"
}

# Response
{
  "access_token": "...",
  "refresh_token": "...",
  "user": { "id": "...", "role": "admin" }
}
```

### Tickets
```bash
# List tickets
GET /api/v1/tickets?page=1&page_size=10

# Create ticket
POST /api/v1/tickets
{
  "title": "Cannot connect to server",
  "description": "...",
  "severity": "high"
}

# Assign ticket
POST /api/v1/tickets/{id}/assign
{
  "technician_id": "..."
}

# Resolve ticket
POST /api/v1/tickets/{id}/resolve
{
  "resolution": "..."
}
```

### Alerts
```bash
# List active alerts
GET /api/v1/alerts

# Resolve alert
POST /api/v1/alerts/{id}/resolve
```

### Tools (AI Agent)
```bash
# List available tools
GET /api/v1/tools

# Execute tool
POST /api/v1/tools/{tool_name}/execute
{
  "host": "192.168.1.1",
  ...
}
```

## 👥 Default User Accounts

### Admin
- **Username**: admin
- **Password**: ChangeMe@123
- **Role**: admin

### Technicians
| Name | Username | Email | Password |
|------|----------|-------|----------|
| Rendy Martiano | rendy.m | rendy@helpdesk.local | ChangeMe@123 |
| Alif Fadillah | alif.f | alif@helpdesk.local | ChangeMe@123 |
| Muhammad Ramadhan | m.ramadhan | ramadhan@helpdesk.local | ChangeMe@123 |
| Febryano Allandy Berta | febryano.b | febryano@helpdesk.local | ChangeMe@123 |

⚠ **IMPORTANT**: Change these default passwords in production!

## 🏗 Project Structure

```
helpdesk-ai/
├── cmd/
│   ├── api/                 # Main API server
│   ├── agent/               # AI agent service
│   └── worker/              # Background workers
├── internal/
│   ├── auth/                # Authentication & JWT
│   ├── ticket/              # Ticket management
│   ├── monitoring/          # Alert & device monitoring
│   ├── ai/                  # AI orchestration
│   ├── tools/               # AI tools registry
│   ├── websocket/           # Real-time communication
│   ├── notification/        # Notification service
│   ├── rbac/                # Role-based access control
│   └── db/                  # Database models
├── migrations/              # Database migrations
├── frontend/                # Next.js frontend
├── docker/                  # Docker configurations
├── deployments/             # Kubernetes manifests
└── scripts/                 # Setup & deployment scripts
```

## 🔐 Security Features

- **JWT Authentication**: Stateless token-based auth
- **RBAC**: Fine-grained role-based permissions
- **Password Hashing**: Bcrypt with salt
- **Audit Logging**: Track all user actions
- **MFA Support**: Optional multi-factor authentication
- **CORS Protection**: Configured CORS headers
- **SQL Injection Prevention**: Parameterized queries via ORM
- **Rate Limiting**: Configurable request throttling
- **Session Management**: Token expiration & refresh

## 📊 Monitoring & Observability

### Metrics
- **Prometheus**: Collects application and infrastructure metrics
- **Grafana**: Visualizes metrics with dashboards
- **Custom Metrics**: Request latency, error rates, ticket metrics

### Logging
- **Loki**: Log aggregation system
- **Promtail**: Log collection agent
- **Structured Logging**: JSON-formatted logs

### Alerts
- **Alert Manager**: Alert routing and grouping
- **Custom Rules**: Device alerts, SLA breaches, errors

## 🚀 Panduan Deployment (Deployment Guide)

### 1. Cara Menjalankan dengan Docker Compose
Pastikan Docker dan Docker Compose telah terinstal pada sistem Anda.
1. Salin file konfigurasi env:
   ```bash
   cp .env.example .env
   ```
2. Sesuaikan nilai-nilai di dalam file `.env` jika diperlukan.
3. Bangun dan jalankan seluruh service:
   ```bash
   docker compose build
   docker compose up -d
   ```
4. Verifikasi status container:
   ```bash
   docker compose ps
   ```

### 2. Cara Deploy menggunakan Portainer
Stack ini sepenuhnya kompatibel dengan Portainer (tidak membutuhkan bind mount manual atau file tambahan pada host). Anda dapat men-deploy-nya menggunakan salah satu metode berikut:

#### Metode A: Git Repository (Direkomendasikan)
1. Buka Portainer > **Stacks** > **Add stack**.
2. Pilih **Repository** sebagai build method.
3. Masukkan URL Repository Git ini pada kolom **Repository URL**.
4. Tentukan **Compose path** (default: `docker-compose.yml` atau jika berada di subfolder `helpdesk-ai/docker-compose.yml`).
5. Pada bagian **Environment variables**, klik **Add environment variable** atau aktifkan **Advanced mode** untuk menyalin isi dari `.env.example`. Portainer akan otomatis mendeteksi variabel yang dibutuhkan dari compose file.
6. Klik **Deploy the stack**.

#### Metode B: Web Editor / Upload Compose File
1. Buka Portainer > **Stacks** > **Add stack**.
2. Pilih **Web editor** atau **Upload** sebagai build method.
3. Salin/unggah isi dari `docker-compose.yml` ke Portainer.
4. Portainer secara otomatis akan mendeteksi variabel lingkungan yang digunakan dalam file compose (`${DB_USER}`, `${DB_PASSWORD}`, dll.) dan menampilkan input form untuk mengisinya secara otomatis (Portainer akan membuat file `stack.env` secara otomatis).
5. Isi nilai untuk masing-masing environment variable berdasarkan `.env.example`.
6. Klik **Deploy the stack**.

### 3. Daftar Environment Variable Utama
Berikut adalah variabel lingkungan yang dikonfigurasi dalam stack ini (lihat `.env.example` untuk daftar lengkap):
* **Database (PostgreSQL)**:
  * `DB_HOST`: Host database (default: `postgres` di dalam network Docker).
  * `DB_PORT`: Port database (default: `5432`).
  * `DB_USER`: Username database (default: `helpdesk`).
  * `DB_PASSWORD`: Password database (default: `helpdesk@123`).
  * `DB_NAME`: Nama database (default: `helpdesk_ai`).
* **Cache (Redis)**:
  * `REDIS_HOST`: Host Redis (default: `redis`).
  * `REDIS_PORT`: Port Redis (default: `6379`).
  * `REDIS_PASSWORD`: Password Redis (opsional).
* **NATS Message Broker**:
  * `NATS_USER`: Username NATS (default: `pb-controller`).
  * `NATS_PASSWORD`: Password NATS (default: `controller-pass`).
  * `NATS_URL`: URL NATS untuk agent client (contoh: `nats://agent-client:agent-pass@IP_SERVER:4222`).
* **Monitoring & Observability**:
  * `GF_SECURITY_ADMIN_PASSWORD`: Password admin Grafana (default: `admin@123`).
  * `PROMETHEUS_URL`: URL Prometheus (default: `http://prometheus:9090`).
* **Object Storage (MinIO)**:
  * `MINIO_HOST`: Host MinIO (default: `minio`).
  * `MINIO_PORT`: Port API MinIO (default: `9000`).
  * `MINIO_ACCESS_KEY`: Access key/root user MinIO (default: `minioadmin`).
  * `MINIO_SECRET_KEY`: Secret key/root password MinIO (default: `minioadmin`).
  * `MINIO_BUCKET`: Nama bucket MinIO (default: `helpdesk`).
* **API Server**:
  * `SERVER_PORT`: Port internal server API (default: `8090`).
  * `SERVER_ENV`: Environment server (default: `development` / `production`).
  * `JWT_SECRET`: Secret key JWT untuk otentikasi.
  * `SERVER_URL`: URL publik API server (digunakan untuk webhook Telegram, dll.).

### 4. Cara Update Aplikasi
Untuk memperbarui container ke versi terbaru jika menggunakan source code terbaru:
1. Jika menggunakan Docker Compose langsung:
   ```bash
   git pull origin main
   docker compose build
   docker compose up -d
   ```
2. Jika menggunakan Portainer (Git Repository):
   * Buka stack di Portainer.
   * Klik tombol **Pull and Redeploy** untuk menarik update kode terbaru dari repository dan membangun ulang container secara otomatis.

### 5. Cara Backup dan Restore Volume
Seluruh data penting disimpan di dalam Docker named volumes.
* **Melihat Daftar Volume**:
  ```bash
  docker volume ls
  ```
  Volume utama meliputi:
  * `postgres_data` (Data database SQL)
  * `redis_data` (Data cache)
  * `qdrant_data` (Data vector database AI)
  * `minio_data` (Penyimpanan file/objek)
  * `grafana_data` & `prometheus_data` (Monitoring data)

* **Melakukan Backup Volume (Contoh: Database PostgreSQL)**:
  Anda dapat mem-backup database langsung menggunakan `pg_dump`:
  ```bash
  docker exec helpdesk-postgres pg_dump -U helpdesk helpdesk_ai > db_backup.sql
  ```
  Atau mem-backup direktori volume fisik menggunakan container utilitas tar:
  ```bash
  docker run --rm -v helpdesk-ai_postgres_data:/volume -v $(pwd):/backup alpine tar -czf /backup/postgres_data_backup.tar.gz -C /volume .
  ```

* **Melakukan Restore Volume (Contoh: Database PostgreSQL)**:
  Untuk me-restore dari backup tar:
  ```bash
  docker run --rm -v helpdesk-ai_postgres_data:/volume -v $(pwd):/backup alpine sh -c "rm -rf /volume/* && tar -xzf /backup/postgres_data_backup.tar.gz -C /volume"
  ```

## 🧪 Testing

### Backend Unit Tests
```bash
go test ./...
```

### Backend Integration Tests
```bash
go test -tags=integration ./...
```

### Frontend Tests
```bash
cd frontend
npm install
npm run test:e2e:install
npm run test:e2e
```

If you want to keep a browser window visible while debugging, run:
```bash
npm run test:e2e:headed
```

## 📈 Performance Considerations

- **Connection Pooling**: 10-100 DB connections
- **Redis Caching**: Reduce DB queries
- **Pagination**: Handle large datasets
- **Indexing**: Optimized queries
- **Async Processing**: Background workers
- **Load Balancing**: Horizontal scaling with Kubernetes

## 🔧 Maintenance

### Database Backups
```bash
docker exec helpdesk-postgres pg_dump -U helpdesk helpdesk_ai > backup.sql
```

### View Logs
```bash
docker-compose logs -f api
docker-compose logs -f postgres
```

### Update Services
```bash
docker-compose pull
docker-compose up -d
```

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please follow the code style and add tests for new features.

## 📞 Support

For issues and questions:
1. Check the documentation
2. Review the code comments
3. Check existing GitHub issues
4. Create a new issue with detailed information

## 🙏 Acknowledgments

Built with production-ready Go, React, and modern DevOps practices.

---

**Last Updated**: May 2026
**Version**: 1.0.0
**Status**: Production Ready
