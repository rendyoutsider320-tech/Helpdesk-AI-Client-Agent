# Panduan Proyek Helpdesk AI

**Proyek**: Helpdesk AI Full Stack

## Fitur Utama

- **Ticketing Helpdesk**: buat, tugaskan, dan selesaikan tiket dukungan.
- **Monitoring Real-time**: pantau perangkat, layanan, dan metrik infrastruktur.
- **AI Troubleshooting**: agen AI membantu analisis akar masalah dan pemecahan.
- **Knowledge Base**: artikel pengetahuan dengan RAG (Retrieval-Augmented Generation).
- **Kontrol Akses Berbasis Peran**: admin, teknisi, dan pengguna.
- **Presence Real-time**: status online/offline teknisi melalui WebSocket.
- **Manajemen Alert**: deteksi dan eskalasi alert otomatis.
- **Dashboard Analitik**: tampilan admin, teknisi, dan pengguna.

## Teknologi

### Backend
- Go 1.21
- PostgreSQL + GORM
- Redis
- Qdrant
- Prometheus + Grafana
- Loki + Promtail
- MinIO

### Frontend
- Next.js 14
- TypeScript
- Tailwind CSS
- Zustand
- TanStack Query
- WebSocket

### Infrastruktur
- Docker dan Docker Compose
- Siap Kubernetes
- Nginx sebagai reverse proxy
- Swagger/OpenAPI untuk dokumentasi API

## Persyaratan

- Docker >= 20.10
- Docker Compose >= 2.0
- Go >= 1.21 (untuk pengembangan lokal)
- Node.js >= 18 (untuk frontend)

## Mulai Cepat

1. Buka terminal di folder `helpdesk-ai`
```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
```

2. Salin file environment jika diperlukan
```bash
cp .env.example .env
```

3. Jalankan layanan
```bash
docker-compose up -d --build
```

4. Akses layanan
- API: http://localhost:8080
- Frontend: http://localhost
- Grafana: http://localhost/grafana
- Prometheus: http://localhost/prometheus

## Akun Default

### Admin
- Username: `admin`
- Password: `ChangeMe@123`
- Role: `admin`

### Teknisi
- `rendy.m` / `ChangeMe@123`
- `alif.f` / `ChangeMe@123`
- `m.ramadhan` / `ChangeMe@123`
- `febryano.b` / `ChangeMe@123`

> Pastikan mengganti password default pada lingkungan produksi.

## Struktur Proyek

```
helpdesk-ai/
├── cmd/              # Nuance server: api, agent, worker
├── internal/         # Logika aplikasi dan layanan internal
├── migrations/       # Migrasi basis data
├── frontend/         # Aplikasi Next.js
├── docker/           # Konfigurasi Docker tambahan
├── deployments/      # Manifests Kubernetes
└── scripts/          # Skrip setup dan reset
```

## Dokumentasi API Singkat

### Autentikasi
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/me`

### Tiket
- `GET /api/v1/tickets`
- `POST /api/v1/tickets`
- `GET /api/v1/tickets/{id}`
- `POST /api/v1/tickets/{id}/assign`
- `POST /api/v1/tickets/{id}/resolve`

### Alert
- `GET /api/v1/alerts`
- `POST /api/v1/alerts/{id}/resolve`

### Alat AI
- `GET /api/v1/tools`
- `POST /api/v1/tools/{tool_name}/execute`

## Jalankan Pengujian

### Backend
```bash
go test -v -cover ./...
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Migrasi Basis Data

Skrip berikut tersedia di `scripts/`:
- `reset_db.go`
- `reset_db.sh`
- `reset_db.ps1`

Contoh menjalankan reset database:
```bash
cd helpdesk-ai
make db-reset
```

## Kontak & Catatan

- Gunakan `docker-compose logs` untuk melihat log container.
- Pastikan semua service (`postgres`, `redis`, `qdrant`, `prometheus`, `grafana`, `minio`) berjalan.
- Perbarui konfigurasi jika diperlukan di file `.env`.
