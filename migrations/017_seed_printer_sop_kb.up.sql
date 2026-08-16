-- 017_seed_printer_sop_kb.up.sql
-- Seed complete detailed SOP for printer troubleshooting

INSERT INTO kb_articles (id, title, category, content, status, tags, created_at, updated_at)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Prosedur Penanganan Kendala Printer Cetak Struk Kasir',
  'Printer',
  'Prosedur Penanganan Kendala Printer Cetak Struk Kasir:
1. Restart Service Print Spooler: Buka PowerShell Admin di PC Kasir, jalankan perintah: Restart-Service -Name Spooler.
2. Bersihkan Antrean Cetak Macet: Hapus file dokumen yang tersangkut di folder C:\Windows\System32\spool\PRINTERS. Jika antrean tidak terlock/macet parah, Anda bisa menghapusnya dari tampilan grafik: Tekan tombol Windows + I untuk membuka Settings. Pilih Bluetooth & devices -> Printers & scanners (atau Devices -> Printers & scanners di Windows 10). Klik nama printer yang digunakan, lalu pilih Open print queue. Klik kanan pada dokumen yang macet, lalu pilih Cancel. (Jika ingin menghapus semua sekaligus, klik menu Printer di pojok kiri atas jendela antrean, lalu pilih Cancel All Documents).
3. Cek Koneksi Fisik Printer: Pastikan kabel USB/LAN printer terhubung kencang dan kertas thermal terpasang dengan posisi benar (tidak terbalik).
4. Matikan & Nyalakan Printer: Tekan tombol Power Printer Off selama 5 detik, lalu nyalakan kembali.
5. Cetak Halaman Pengujian: Lakukan Print Test Page dari Control Panel Devices & Printers.',
  'published',
  ARRAY['printer', 'spooler', 'kasir', 'struk', 'sop'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  updated_at = NOW();
