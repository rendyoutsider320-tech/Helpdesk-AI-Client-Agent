# Test Checklist: Grafana, Prometheus, Backend Health, dan Qdrant

## 1. Persiapan
- [ ] Pastikan bekerja di folder `helpdesk-ai`
- [ ] Pastikan file `.env` sudah dikonfigurasi dengan benar
- [ ] Pastikan port yang digunakan:
  - API backend: `8090`
  - Prometheus: `9090`
  - Grafana: `3010`
  - Qdrant: `6333`
  - MinIO API: `9000`, Console: `9001`

## 2. Jalankan Full Stack
- [ ] `cd c:\Agentic_Ai\Agentic_AI_Helpdesk\helpdesk-ai`
- [ ] `docker compose up -d`

## 3. Verifikasi container hidup
- [ ] `docker compose ps`
- [ ] Pastikan semua service berikut berada di status `Up`:
  - `helpdesk-postgres`
  - `helpdesk-redis`
  - `helpdesk-qdrant`
  - `helpdesk-prometheus`
  - `helpdesk-grafana`
  - `helpdesk-minio`
  - `helpdesk-api`
  - `helpdesk-loki`
  - `helpdesk-promtail`

## 4. Health check backend
- [ ] `curl http://localhost:8090/health`
- [ ] Pastikan respons HTTP `200`
- [ ] Pastikan output berisi status berhasil, misalnya:
  ```json
  { "status": "ok" }
  ```

## 5. Cek Postgres dan Qdrant
- [ ] `docker compose exec postgres pg_isready`
- [ ] Pastikan Postgres siap menerima koneksi
- [ ] Pastikan Qdrant merespons:
  - `curl -I http://localhost:6333/`
- [ ] Pastikan Qdrant API key yang digunakan adalah: `helpdesk-qdrant-key`

## 6. Verifikasi Prometheus
- [ ] Buka `http://localhost:9090`
- [ ] Cek target di `http://localhost:9090/targets`
- [ ] Pastikan target backend `helpdesk-api` muncul sebagai `UP`
- [ ] Cek query sederhana:
  - `up`
  - `process_cpu_seconds_total`
- [ ] Pastikan Prometheus sudah meng-scrape `helpdesk-api`

## 7. Verifikasi Grafana
- [ ] Buka `http://localhost:3010`
- [ ] Login default: `admin` / `admin`
- [ ] Cek datasource Prometheus:
  - Pastikan datasource mengarah ke `http://prometheus:9090` atau `http://localhost:9090`
- [ ] Pastikan dashboard monitoring tersedia
- [ ] Pastikan metric API menampilkan:
  - latency
  - throughput
  - error rate
  - CPU / memory service

## 8. Verifikasi Qdrant integration pada aplikasi
- [ ] Pastikan environment variable `QDRANT_URL=http://qdrant:6333`
- [ ] Pastikan backend dapat mengakses Qdrant
- [ ] Uji endpoint sync KB:
  - `POST http://localhost:8090/api/v1/qdrant/sync-kb`
- [ ] Pastikan respons sukses: `KB sync to Qdrant completed`

## 9. Verifikasi Prometheus metrics backend
- [ ] Akses endpoint metrics backend jika tersedia:
  - `http://localhost:8090/metrics`
- [ ] Pastikan metric backend muncul di Prometheus
- [ ] Pastikan metric berikut tersedia:
  - `go_gc_duration_seconds`
  - `go_threads`
  - `process_resident_memory_bytes`
  - `http_requests_total`

## 10. Verifikasi MinIO (opsional)
- [ ] Buka `http://localhost:9001`
- [ ] Login: `minioadmin` / `minioadmin`
- [ ] Pastikan bucket yang diperlukan oleh aplikasi tersedia atau bisa dibuat
- [ ] Pastikan backend dapat mengakses MinIO sesuai konfigurasi

## 11. Skenario pengujian tambahan
- [ ] Restart satu service, lalu cek Prometheus dan Grafana masih mendeteksi perubahan status
- [ ] Matikan backend sementara, lalu cek metric `up` di Prometheus berubah menjadi `0`
- [ ] Periksa log jika dashboard/tampilan metric tidak muncul
- [ ] `docker compose logs api prometheus grafana qdrant`

## 12. Hasil validasi
- [ ] Backend `health` OK
- [ ] Qdrant responsive
- [ ] Prometheus target `UP`
- [ ] Grafana datasource Prometheus jalan
- [ ] Dashboard Grafana menampilkan metric
- [ ] Semua container utama `Up`
