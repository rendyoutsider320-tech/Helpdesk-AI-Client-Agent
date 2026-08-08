# PHASE 1
# ENTERPRISE HELPDESK AI
# TECHNICIAN DASHBOARD REFACTOR
# ZAMMAD ENTERPRISE INSPIRED

ROLE

Anda adalah tim yang terdiri dari:

- Principal Software Architect
- Senior UI/UX Engineer
- Senior React Engineer
- Senior TypeScript Engineer
- Senior Go Engineer
- Senior Fiber Engineer
- Senior PostgreSQL Engineer
- Senior DevOps Engineer

====================================================

OBJECTIVE

Lakukan refactoring total Dashboard Teknisi agar memiliki pengalaman penggunaan setara Zammad Enterprise namun tetap mempertahankan identitas Helpdesk AI.

Dashboard harus dibuat untuk penggunaan operasional harian teknisi selama 8-12 jam sehingga seluruh informasi penting tersedia pada satu halaman tanpa sering berpindah menu.

Dashboard harus terlihat modern, premium, enterprise, clean, cepat, dan sepenuhnya realtime.

====================================================

PENTING

JANGAN membuat project baru.

JANGAN membuat halaman baru apabila dashboard sudah ada.

Gunakan dashboard yang ada saat ini.

Lakukan refactoring secara bertahap.

JANGAN merusak API yang sudah berjalan.

JANGAN merusak authentication.

JANGAN mengubah business process existing.

Semua fitur baru harus terintegrasi dengan backend yang sudah ada.

====================================================

DATA SOURCE

DILARANG:

- mock data
- dummy data
- fake data
- hardcode angka
- static json

SEMUA DATA HARUS BERASAL DARI:

Backend API Existing

Database Existing

Websocket Existing

Notification Existing

Authentication Existing

====================================================

DESIGN TARGET

Mengikuti kualitas UI:

- Zammad
- Linear
- Atlassian
- Jira Service Management


====================================================

LAYOUT

Gunakan layout enterprise berikut

----------------------------------------------------

HEADER

----------------------------------------------------

Dashboard Teknisi

Selamat Datang,
{{Nama Teknisi}}

Tanggal

Jam realtime

Shift

Status Online

====================================================

HEADER ACTION

Tambahkan:

Quick Search

Refresh Dashboard

Notification

Quick Action

Profile Menu


====================================================

SEARCH

Search global realtime

Bisa mencari:

Ticket

Customer

Hostname

IP

Asset

Email

Nomor Ticket

Autocomplete

====================================================

KPI CARDS

Tambahkan cards berikut

Open Ticket

Assigned To Me

Pending

Waiting Customer

Waiting Vendor

Escalated

Critical

High Priority

SLA Warning

SLA Breached

Closed Today

Average Resolution Time

Customer Satisfaction

Semua realtime.

====================================================

QUEUE TICKET

Widget terbesar.

Menampilkan:

Nomor Ticket

Subject

Priority

State

Customer

Assignee

SLA Countdown

Last Update

Tag

Action Button:

Open

Reply

Assign

Take

Escalate

Merge

Close

Priority

State

Tidak perlu membuka halaman detail untuk action sederhana.

====================================================

FILTER

Tambahkan filter

All

Open

Assigned

Pending

Waiting Customer

Waiting Vendor

Escalated

Critical

Overdue

High Priority

My Tickets

====================================================

RECENT ACTIVITY

Panel kanan.

Menampilkan realtime.

Contoh:

Customer membalas ticket

Ticket dibuat

AI memberikan rekomendasi

Teknisi mengambil ticket

Ticket selesai

Escalation

SLA Warning

====================================================

NOTIFICATION CENTER

Notification Bell

Unread Counter

Kategori:

Assignment

Customer Reply

Mention

Escalation

Approval

AI Recommendation

Klik membuka ticket.

====================================================

SLA WIDGET

Healthy

Warning

Critical

Average Response

Gauge

Realtime

====================================================

TECHNICIAN WORKLOAD

Tampilkan seluruh teknisi.

Data:

Foto

Nama

Online

Offline

Away

Busy

Meeting

Break

Jumlah Ticket

Progress Bar

Workload %

====================================================

PERFORMANCE

Hari ini

Ticket Closed

Average Response

Average Resolution

Reopened

Escalated

SLA %

====================================================

CUSTOMER WAITING

Urut berdasarkan lama menunggu.

Menampilkan:

Customer

Ticket

Menunggu

Priority

====================================================

PRIORITY MATRIX

Critical

High

Normal

Low

Grafik realtime.

====================================================

QUICK ACTION

Button:

Take Next Ticket

Create Ticket

Search Customer

Knowledge Base

Create Note

Refresh

====================================================

AI SUPERVISOR

Panel kanan.

Menampilkan:

Ticket kemungkinan melewati SLA

Duplicate Ticket

Sentiment Customer

Recommended Reply

Root Cause

Priority Suggestion

====================================================

KNOWLEDGE BASE

Popular Article

Recent Article

Suggested Article

====================================================

MONITORING

Jika ticket berasal dari Agent Monitoring.

Tampilkan:

CPU

RAM

Disk

Hostname

IP

OS

Status Agent

Last Seen

====================================================

REALTIME

Seluruh widget harus realtime.

Gunakan websocket existing.

JANGAN polling setiap detik.

====================================================

RESPONSIVE

Desktop

Laptop

Tablet

====================================================

UI

Gunakan:

Rounded Card

Glass Effect ringan

Smooth Animation

Loading Skeleton

Empty State

Error State

Success State

Hover Animation

====================================================

PERFORMANCE

Lazy Load

Virtual Table

Code Splitting

Memoization

Optimized Render

====================================================

ACCESSIBILITY

Keyboard Navigation

ARIA

Focus Ring

High Contrast

====================================================

BACKEND

Jika endpoint belum tersedia:

Tambahkan endpoint baru.

Tetapi:

JANGAN mengubah endpoint existing.

JANGAN mengubah response existing.

Tambahkan endpoint baru yang compatible.

====================================================

DATABASE

Gunakan tabel existing.

Jika membutuhkan kolom baru:

Buat migration.

Tidak boleh menghapus kolom lama.

====================================================

LOGGING

Semua activity harus tercatat.

Audit Log

Login

Assignment

Reply

Close

Escalation

====================================================

OUTPUT

Setelah selesai tampilkan laporan:

✔ File yang diubah

✔ API baru

✔ Migration

✔ Component baru

✔ Hook baru

✔ Store baru

✔ Route baru

✔ Potensi bug

✔ Technical debt

✔ Improvement berikutnya

====================================================

RULE

Jangan berhenti di tengah.

Selesaikan seluruh refactoring dashboard hingga semua widget berfungsi.

Apabila menemukan bug existing,
perbaiki langsung.

Apabila menemukan UI yang tidak konsisten,
rapikan seluruh halaman.

Apabila menemukan component yang bisa digunakan ulang,
refactor menjadi reusable component.

Pastikan seluruh fitur benar-benar menggunakan data production dari backend existing.

HASIL AKHIR YANG DIHARAPKAN

Dashboard Teknisi setara kualitas enterprise seperti Zammad, Jira Service Management, dan Freshservice, namun memiliki keunggulan tambahan berupa integrasi AI Supervisor, Monitoring Agent, Asset Management, dan notifikasi realtime tanpa mengubah arsitektur sistem yang sudah berjalan.