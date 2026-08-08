# FULL SYSTEM ACTIVATION MODE

Anda adalah Senior Software Architect, Senior Full Stack Engineer, Senior DevOps Engineer, Senior QA Engineer, dan Senior Code Reviewer.

TUJUAN:

Aktifkan 100% seluruh menu, submenu, card dashboard, widget, icon, button, tabel, filter, dan halaman pada aplikasi Helpdesk AI sehingga setiap item yang dapat diklik benar-benar berfungsi.

## TARGET WAJIB

Tidak boleh ada:

* Menu mati
* Tombol mati
* Halaman kosong
* Dummy page
* Placeholder page
* Route kosong
* API belum dibuat
* Error 404
* Error 500
* Data statis hardcode

---

## 1. AUDIT SELURUH NAVIGASI

Scan seluruh:

* Sidebar
* Topbar
* Header
* Dashboard Cards
* Widget
* Dropdown
* Context Menu
* Quick Action
* Floating Button

Cari seluruh:

onClick
Link
router.push
href
navigate
Button Action

Pastikan semuanya mengarah ke halaman yang valid.

---

## 2. AKTIFKAN SELURUH MENU

Pastikan menu berikut dapat dibuka:

Dashboard

Semua Tiket

Buat Tiket

Tiket Saya

Live Monitor

Alert Log

Approval Center

Asset Inventory

Profile

Settings

Logout

Dark Mode

Light Mode

Notification

Semua submenu lainnya

Jika route belum ada:

WAJIB BUAT route baru.

Jika page belum ada:

WAJIB BUAT page baru.

---

## 3. AKTIFKAN HALAMAN DASHBOARD

Dashboard harus menampilkan data nyata dari database:

* Total Ticket
* Open Ticket
* Closed Ticket
* AI Resolution Rate
* Human Handover Rate
* Alert Aktif
* Device Online
* Device Offline
* Approval Pending

Semua card harus dapat diklik dan membuka halaman terkait.

---

## 4. AKTIFKAN APPROVAL CENTER

Klik Approval Center harus membuka:

* List Approval
* Detail Approval
* Approve
* Reject
* History

Jika API belum ada:

WAJIB BUAT.

---

## 5. AKTIFKAN ASSET INVENTORY

Klik Asset Inventory harus membuka:

* Daftar Asset
* Detail Asset
* Hardware
* Software
* Installed Applications
* Last Seen
* Monitoring
* Incident History
* Event Log
* Printer
* USB Device
* Browser
* Evidence

Tombol Detail wajib berfungsi.

---

## 6. AKTIFKAN ALERT LOG

Klik Alert Log harus menampilkan:

* Alert Active
* Alert Resolved
* Severity
* Device
* Timestamp
* Source

Filter wajib berfungsi.

---

## 7. AKTIFKAN LIVE MONITOR

Klik Live Monitor harus menampilkan:

* Agent Online
* CPU Usage
* RAM Usage
* Disk Usage
* Service Status
* Last Heartbeat

Realtime dari NATS/Websocket.

---

## 8. AKTIFKAN TICKET SYSTEM

Semua Tiket:

* List Ticket
* Search
* Filter
* Pagination

Buat Tiket:

* Form Ticket
* Submit
* Attachment

Tiket Saya:

* Assigned Ticket
* Status Ticket
* Detail Ticket

---

## 9. AKTIFKAN SELURUH BUTTON

Cari seluruh button.

Pastikan:

* Detail
* Edit
* Delete
* Approve
* Reject
* Save
* Submit
* Refresh
* Export
* Search

memiliki handler yang valid.

Tidak boleh ada button tanpa fungsi.

---

## 10. AKTIFKAN SELURUH API

Scan seluruh frontend.

Cari endpoint yang dipanggil.

Pastikan endpoint tersedia di backend.

Jika tidak ada:

WAJIB buat endpoint.

---

## 11. AKTIFKAN DATABASE BINDING

Semua tabel harus mengambil data dari database.

Dilarang menggunakan:

mockData
dummyData
hardcodeData
sampleData

---

## 12. VALIDASI AKHIR

Lakukan:

* npm run build
* npm run lint
* npm run type-check

Backend:

* go build ./...
* go test ./...

Perbaiki seluruh error sampai build sukses.

---

## OUTPUT WAJIB

Buat laporan:

### MENU AKTIF

Daftar menu yang berhasil diaktifkan.

### ROUTE DIBUAT

Daftar route baru.

### API DIBUAT

Daftar endpoint baru.

### HALAMAN DIBUAT

Daftar page baru.

### BUTTON DIPERBAIKI

Daftar button yang sebelumnya mati.

### ERROR DIPERBAIKI

Daftar bug yang ditemukan.

### STATUS AKHIR

Dashboard: OK/NOT OK

Approval Center: OK/NOT OK

Asset Inventory: OK/NOT OK

Alert Log: OK/NOT OK

Live Monitor: OK/NOT OK

Ticket System: OK/NOT OK

Seluruh Navigasi: OK/NOT OK

Persentase Sistem Berfungsi: XX%
