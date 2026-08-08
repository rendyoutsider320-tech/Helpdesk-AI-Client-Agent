# Panduan Pengujian Sistem

**Proyek**: Helpdesk AI Full Stack
**Disiapkan**: 2026-05-24

## Mulai Cepat Pengujian

### Langkah 1: Nyalakan Full Stack

```bash
cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai
docker-compose up --build
```

**Output yang Diharapkan**:
```
helpdesk-postgres  | database system is ready to accept connections
helpdesk-redis     | Ready to accept connections
helpdesk-qdrant    | ... Started application server
helpdesk-prometheus | Server is ready to serve metrics
helpdesk-grafana    | ... Grafana started
helpdesk-api       | ... API running on :8080
```

**Waktu Tunggu**: ~30 detik untuk inisialisasi penuh

### Langkah 2: Verifikasi Layanan Berjalan

```bash
docker-compose ps
```

Output yang diharapkan menunjukkan semua layanan "Up":
```
NAME                    STATUS
helpdesk-postgres      Up
helpdesk-redis         Up
helpdesk-qdrant        Up
helpdesk-prometheus    Up
helpdesk-grafana       Up
helpdesk-loki          Up
helpdesk-promtail      Up
helpdesk-minio         Up
helpdesk-api           Up
```

### Langkah 3: Pemeriksaan Kesehatan

```bash
curl http://localhost:8080/health
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "status": "ok"
}
```

## Pengujian Fungsional

### Tes 1: Login dengan Akun Admin

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "ChangeMe@123"
  }'
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@helpdesk.local",
    "role": "admin"
  }
}
```

**Simpan access_token untuk tes berikutnya**:
```bash
export TOKEN="<access_token_from_response>"
```

### Tes 2: Akses Rute Terlindungi (/me)

**Request**:
```bash
curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "user_id": "uuid",
  "username": "admin",
  "role": "admin"
}
```

### Tes 3: Akses Tanpa Token (harus ditolak)

**Request**:
```bash
curl http://localhost:8080/api/v1/auth/me
```

**Respons yang Diharapkan** (HTTP 401):
```json
{
  "error": "missing authorization header"
}
```

### Tes 4: Login dengan Akun Teknisi

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "rendy.m",
    "password": "ChangeMe@123"
  }'
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "uuid",
    "username": "rendy.m",
    "email": "rendy@helpdesk.local",
    "role": "technician"
  }
}
```

### Tes 5: Daftar Pengguna Baru

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "username": "john.doe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
```

**Respons yang Diharapkan** (HTTP 201):
```json
{
  "message": "user registered successfully",
  "user_id": "new-uuid"
}
```

### Tes 6: Buat Ticket

**Request**:
```bash
curl -X POST http://localhost:8080/api/v1/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Network down in Branch 1",
    "description": "Internet is not working",
    "severity": "critical"
  }'
```

**Respons yang Diharapkan** (HTTP 201):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "title": "Network down in Branch 1",
  "description": "Internet is not working",
  "severity": "critical",
  "status": "created",
  "created_by": "admin-uuid",
  "created_at": "2026-05-24T12:00:00Z"
}
```

### Tes 7: Daftar Ticket dengan Pagination

**Request**:
```bash
curl "http://localhost:8080/api/v1/tickets?page=1&page_size=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "tickets": [
    {
      "id": "ticket-uuid",
      "ticket_no": "TKT-001",
      "title": "Network down in Branch 1",
      "severity": "critical",
      "status": "created"
      ...
    }
  ],
  "total": 1
}
```

### Tes 8: Ambil Ticket Tunggal

**Request**:
```bash
curl "http://localhost:8080/api/v1/tickets/ticket-uuid" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "title": "Network down in Branch 1",
  "description": "Internet is not working",
  "severity": "critical",
  "status": "created",
  "created_by": "admin-uuid",
  "created_at": "2026-05-24T12:00:00Z"
}
```

### Tes 9: Tugaskan Ticket ke Teknisi

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tickets/ticket-uuid/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "technician_id": "rendy-uuid"
  }'
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "status": "assigned",
  "assigned_to": "rendy-uuid"
  ...
}
```

### Tes 10: Tambah Komentar ke Ticket

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tickets/ticket-uuid/comments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "comment": "We are investigating the issue",
    "is_internal": false
  }'
```

**Respons yang Diharapkan** (HTTP 201):
```json
{
  "id": "comment-uuid",
  "ticket_id": "ticket-uuid",
  "user_id": "admin-uuid",
  "comment": "We are investigating the issue",
  "is_internal": false,
  "created_at": "2026-05-24T12:00:00Z"
}
```

### Tes 11: Selesaikan Ticket

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tickets/ticket-uuid/resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "resolution": "Restarted the router and connection restored"
  }'
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "id": "ticket-uuid",
  "ticket_no": "TKT-001",
  "status": "resolved",
  "resolution": "Restarted the router and connection restored",
  "resolved_at": "2026-05-24T12:00:00Z"
  ...
}
```

### Tes 12: Daftar Perangkat

**Request**:
```bash
curl "http://localhost:8080/api/v1/devices" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "devices": [
    {
      "id": "device-uuid",
      "device_name": "RTR-HO-01",
      "device_type": "router",
      "ip_address": "192.168.1.1",
      "location": "Head Office",
      "status": "active"
    },
    ...
  ]
}
```

### Tes 13: Ambil Metrik Perangkat

**Request**:
```bash
curl "http://localhost:8080/api/v1/devices/device-uuid/metrics" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "metrics": [
    {
      "id": "metric-uuid",
      "device_id": "device-uuid",
      "metric_type": "cpu_usage",
      "metric_value": 45.2,
      "timestamp": "2026-05-24T12:00:00Z"
    }
  ]
}
```

### Tes 14: Daftar Alert Aktif

**Request**:
```bash
curl "http://localhost:8080/api/v1/alerts" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "alerts": [
    {
      "id": "alert-uuid",
      "device_id": "device-uuid",
      "severity": "critical",
      "metric": "packet_loss",
      "value": "85%",
      "message": "High packet loss detected on RTR-HO-01",
      "status": "active",
      "created_at": "2026-05-24T12:00:00Z"
    }
  ]
}
```

### Tes 15: Selesaikan Alert

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/alerts/alert-uuid/resolve" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "message": "alert resolved"
}
```

### Tes 16: Daftar Alat yang Tersedia

**Request**:
```bash
curl "http://localhost:8080/api/v1/tools" \
  -H "Authorization: Bearer $TOKEN"
```

**Respons yang Diharapkan** (HTTP 200):
```json
[
  {
    "name": "port_scanner",
    "description": "Check if a port is open on a host"
  },
  ...
]
```

### Tes 17: Eksekusi Alat

**Request**:
```bash
curl -X POST "http://localhost:8080/api/v1/tools/port_scanner/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "host": "example.com",
    "port": "443"
  }'
```

**Respons yang Diharapkan** (HTTP 200):
```json
{
  "result": "port open"
}
```

### Tes 18: Koneksi WebSocket

**Menggunakan klien WebSocket (misalnya wscat)**:
```bash
npm install -g wscat
wscat -c ws://localhost:8080/ws/user-uuid
```

**Kirim pesan tes**:
```
{"message": "test"}
```

**Diharapkan**: Koneksi berhasil dan pesan diterima

### Tes 19: RBAC - Admin Dapat Mengakses Rute Admin

**Request**:
```bash
curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Respons yang Diharapkan** (HTTP 200): Informasi pengguna dikembalikan

### Tes 20: RBAC - Teknisi Tidak Bisa Mengakses Rute Khusus Admin

Jika ada rute khusus admin (periksa implementasi):
```bash
curl http://localhost:8080/api/v1/admin/users \
  -H "Authorization: Bearer $TECHNICIAN_TOKEN"
```

**Respons yang Diharapkan** (HTTP 403 - jika endpoint ada):
```json
{
  "error": "access denied"
}
```

## Pengujian Basis Data

### Tes 21: Verifikasi Koneksi Basis Data

```bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT COUNT(*) FROM users;"
```

**Output yang Diharapkan**:
```
 count
-------
     6
```

### Tes 22: Verifikasi Seed Data

```bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT username, role FROM users ORDER BY username;"
```

**Output yang Diharapkan**:
```
   username   |    role
---------------+----------
 admin         | admin
 alif.f        | technician
 febryano.b    | technician
 m.ramadhan    | technician
 rendy.m       | technician
 user.local    | user
```

### Tes 23: Periksa Seed Data Perangkat

```bash
docker-compose exec postgres psql -U helpdesk -d helpdesk_ai -c "SELECT device_name, device_type, status FROM devices;"
```

**Output yang Diharapkan**:
```
 device_name | device_type | status
-------------+-------------+--------
 RTR-HO-01   | router      | active
 SWH-HO-01   | switch      | active
 POS-BR-01   | pos_terminal| active
 FW-HO-01    | firewall    | active
 PRN-HO-01   | printer     | inactive
```

## Pengujian Integrasi

### Tes 24: Alur Lengkap

1. **Login**: Admin login ✓
2. **Buat**: Admin membuat ticket ✓
3. **Tugaskan**: Admin menugaskan ke teknisi ✓
4. **Komentar**: Teknisi menambahkan komentar ✓
5. **Selesai**: Teknisi menyelesaikan ticket ✓
6. **Verifikasi**: Status ticket menjadi resolved ✓

### Tes 25: Alur Kerja Teknisi

1. **Login**: Teknisi login ✓
2. **Lihat**: Teknisi melihat ticket yang ditugaskan ✓
3. **Perbarui**: Teknisi memperbarui status ticket ✓
4. **Komentar**: Teknisi menambahkan komentar internal ✓

## Pemeriksaan Kesehatan Layanan

### PostgreSQL
```bash
curl http://localhost:5432 2>&1 | head -1
```

### Redis
```bash
docker-compose exec redis redis-cli ping
```
**Diharapkan**: `PONG`

### Qdrant
```bash
curl http://localhost:6333/health
```
**Diharapkan**: HTTP 200 dengan status kesehatan

### Prometheus
```bash
curl http://localhost:9090/api/v1/query?query=up
```
**Diharapkan**: HTTP 200 dengan metrik

### Grafana
```bash
curl -u admin:admin http://localhost:3000/api/health
```
**Diharapkan**: HTTP 200

### MinIO
```bash
curl http://localhost:9000/minio/health/live
```
**Diharapkan**: HTTP 200

## Pengujian Performa

### Tes 26: Load Test (Opsional)

```bash
# Buat 100 ticket
defor i in {1..100}; do
  curl -X POST http://localhost:8080/api/v1/tickets \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"title\": \"Ticket $i\", \"description\": \"Test\", \"severity\": \"low\"}"
done
```

### Tes 27: Tes Pagination

```bash
curl "http://localhost:8080/api/v1/tickets?page=1&page_size=25" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8080/api/v1/tickets?page=2&page_size=25" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8080/api/v1/tickets?page=5&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Pembersihan

### Hentikan Layanan
```bash
docker-compose down
```

### Hapus Volume (untuk mereset database)
```bash
docker-compose down -v
```

### Build Bersih
```bash
docker-compose down
docker system prune -a
docker-compose up --build
```

## Kriteria Keberhasilan

✅ Semua tes lulus ketika:

1. Pemeriksaan kesehatan mengembalikan 200 OK
2. Semua 6 pengguna default dapat login
3. Token JWT valid dan bekerja pada rute terlindungi
4. Operasi create/read/update bekerja untuk ticket
5. RBAC mencegah akses tidak sah
6. Pagination mengembalikan nomor halaman yang benar
7. WebSocket berhasil terkoneksi
8. Semua data seed ada di basis data
9. Semua layanan menunjukkan status sehat
10. Tidak ada log error di output docker-compose

## Pemecahan Masalah

### Kontainer API Tidak Dapat Dimulai

```bash
docker-compose logs api
```

Periksa:
- Kesalahan koneksi basis data
- Port sudah digunakan
- Migrasi hilang

### Koneksi Basis Data Gagal

```bash
docker-compose logs postgres
```

Periksa:
- Izin volume
- Konflik port
- Masalah memori

### Migrasi Tidak Diterapkan

```bash
docker-compose exec api /app/api migrate
```

Atau periksa apakah migrasi ada dalam volume docker-compose.

### Masalah Koneksi WebSocket

- Pastikan `user_id` adalah UUID yang valid
- Periksa konsol browser untuk pesan kesalahan
- Verifikasi log server: `docker-compose logs api`

---

**Tanggal Pengujian**: 2026-05-24
**Status**: Siap dieksekusi
**Estimasi Durasi**: 30-45 menit untuk paket pengujian lengkap
