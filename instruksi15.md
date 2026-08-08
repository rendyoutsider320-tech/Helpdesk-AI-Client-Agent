# MASTER PROMPT - ENTERPRISE HELPDESK AI TICKET CENTER

## ROLE

Bertindak sebagai tim yang terdiri dari:

* Principal Software Architect
* Senior Backend Engineer (Go + Fiber)
* Senior Frontend Engineer (React + TypeScript)
* Senior Database Engineer (PostgreSQL)
* Senior DevOps Engineer (Docker + NATS + Portainer)
* Senior AI Engineer
* Senior Security Engineer
* Senior UX/UI Engineer

Jangan menjadi AI pembuat prototype.

Jangan membuat demo.

Jangan membuat mock.

Jangan membuat placeholder.

Jangan membuat hardcode.

Jangan membuat fake data.

Semua fitur WAJIB menggunakan backend yang sudah ada.

Jika endpoint belum tersedia maka buat endpoint baru menggunakan pola arsitektur backend yang sudah ada.

Semua fitur harus production-ready.

---

# KONDISI SISTEM

Project ini sudah berjalan.

Backend menggunakan:

* Golang
* Fiber
* PostgreSQL
* GORM
* Docker
* NATS
* JWT
* Websocket
* REST API

Frontend sudah menggunakan React.

Sudah terdapat:

* Login
* Dashboard
* Ticket
* Monitoring
* AI
* Agent
* Live Monitor
* CMDB
* NATS
* Remote Command
* Alert

JANGAN mengganti arsitektur.

JANGAN membuat project baru.

JANGAN membuat duplicate module.

Lanjutkan sistem yang sudah ada.

---

# AUDIT SISTEM

Gunakan hasil audit berikut sebagai acuan.

Masalah berikut telah selesai dan jangan dibuat ulang:

✔ Database Migration dns_servers

✔ Linux Shell Execution

✔ Dynamic JSON Parsing PowerShell

✔ RSA Signature Verification

✔ NATS Command Validation

✔ CMDB Inventory

✔ Live Monitoring

✔ Remote Command

Semua implementasi baru harus kompatibel terhadap hasil audit tersebut.

---

# TUJUAN

Refactor halaman Ticket menjadi Enterprise Ticket Center.

Ticket Center adalah pusat operasional seluruh Helpdesk AI.

Seluruh menu wajib berfungsi.

Tidak boleh ada tombol mati.

Tidak boleh ada menu kosong.

Tidak boleh ada halaman placeholder.

Tidak boleh ada data mock.

Semua data harus berasal dari database PostgreSQL.

Semua update realtime menggunakan websocket atau NATS.

---

# MENU SIDEBAR

Dashboard

Ticket Center

* All Tickets
* My Tickets
* Assigned To Me
* Open
* Pending
* Waiting Customer
* Waiting Vendor
* Escalated
* Critical
* Resolved
* Closed
* Spam
* Archive

Customer

Organization

Assets

Knowledge Base

Monitoring

Automation

Reports

Administration

---

# HALAMAN TICKET CENTER

Halaman ini harus menyerupai kombinasi:

Zammad

Freshdesk

Jira Service Management

ServiceNow

Tetapi tetap menggunakan identitas Helpdesk AI.

---

# BAGIAN ATAS

Tampilkan Dashboard KPI realtime.

Open Ticket

Pending

Resolved Today

Closed Today

Critical

SLA Breached

Average Response

Average Resolution

Technician Online

AI Queue

Customer Waiting

Semua dihitung langsung dari database.

---

# TOOLBAR

Toolbar wajib memiliki:

New Ticket

Import

Export

Bulk Action

Refresh

Saved Filter

Search

Advanced Filter

Semua tombol harus bekerja.

---

# SEARCH

Cari berdasarkan:

Ticket Number

Customer

Organization

Email

Subject

Hostname

Asset

IP Address

Department

Technician

AI Category

Tag

Semua menggunakan backend search.

---

# FILTER

Status

Priority

Department

Category

Technician

Date

Organization

Asset

Tag

SLA

AI Confidence

Semua filter harus dapat dikombinasikan.

---

# DATA TABLE

Gunakan server-side pagination.

Server-side sorting.

Server-side filtering.

Infinite scrolling.

Virtual rendering.

Kolom:

Ticket Number

Subject

Customer

Organization

Category

Department

Assigned

Status

Priority

SLA

AI Confidence

Created

Updated

Action

---

# ACTION

Semua action wajib bekerja.

Open

Reply

Assign

Transfer

Merge

Split

Duplicate

Escalate

Resolve

Close

Reopen

Delete

Print

Export PDF

Export Excel

Generate KB

AI Summary

---

# DETAIL TICKET

Klik ticket membuka Drawer kanan.

Tidak pindah halaman.

Drawer terdiri dari:

Conversation

Activity

Internal Notes

History

AI Analysis

Attachment

Audit Log

---

# CONVERSATION

Realtime.

Menggunakan websocket.

Support:

Markdown

Emoji

Upload

PDF

ZIP

Image

Video

Mention

Quote

Reply

Code Block

Drag Drop

Paste Screenshot

Typing Indicator

Read Receipt

---

# AI ANALYSIS

Gunakan AI Engine yang sudah ada.

Bukan mock.

Tampilkan:

Problem Summary

Classification

Root Cause

Suggested Solution

Knowledge Match

Similar Ticket

Estimated Resolution

Confidence

Recommended Technician

Risk

Sentiment

---

# SLA

Implementasi penuh.

First Response

Resolution

Escalation

Remaining Time

Realtime Countdown

Violation Warning

Auto Escalation

---

# INTERNAL NOTE

Hanya teknisi.

Markdown.

Checklist.

Mention.

Attachment.

History.

---

# CUSTOMER PANEL

Klik customer.

Munculkan:

Profile

Organization

Assets

Open Ticket

History

Recent Activity

AI Risk

Location

---

# ASSET PANEL

Klik Asset.

Munculkan:

Hostname

Operating System

CPU

Memory

Storage

IP LAN

IP WIFI

MAC

Serial Number

Port USB

Version Windows

Installed Software

Running Service

Windows Update

Antivirus

DNS

Gateway

Monitoring Status

Remote Session

Command

Semua data berasal dari CMDB yang sudah ada.

---

# MONITORING

Integrasi langsung dengan:

Live Monitor

Alert

Agent

NATS

Remote Command

Website Monitor

Server Monitor

---

# REMOTE ACTION

Button:

Ping

Traceroute

Restart Agent

Restart Service

Shutdown

Reboot

Run Command

Upload File

Download File

Wake On LAN

Semua menggunakan mekanisme RSA Signature Verification yang sudah ada.

Jangan mengubah mekanisme keamanan.

---

# ACTIVITY TIMELINE

Semua perubahan ticket harus dicatat.

Create

Assign

Reply

Status

Priority

Escalation

Merge

Split

Close

Reopen

Delete

AI

Automation

Remote Command

Audit Log

Timestamp harus realtime.

---

# AUTOMATION

Gunakan engine yang ada.

Auto Assign

Auto Priority

Auto Category

Auto Tag

Auto Escalation

Auto SLA

Auto Close

Duplicate Detection

---

# REPORT

Dashboard:

Technician Performance

Department

Response Time

Resolution

SLA

Customer Satisfaction

AI Accuracy

Asset Trend

Monitoring Trend

Alert Trend

Semua query berasal dari database.

---

# NOTIFICATION

Realtime.

Browser

Toast

Telegram

Email

Desktop Notification

Semua event harus realtime.

---

# SECURITY

Pertahankan seluruh implementasi keamanan yang telah diaudit.

RSA Signature Verification

JWT

Role Permission

Audit Log

Activity Log

NATS Validation

Command Validation

Tidak boleh ada endpoint tanpa authorization.

Semua endpoint wajib memiliki middleware permission.

---

# DATABASE

Gunakan migration.

Tidak boleh edit tabel secara manual.

Jika perlu tabel baru:

buat migration baru

buat model

buat repository

buat service

buat handler

buat route

buat validation

buat test

---

# API

Seluruh endpoint harus mengikuti pola:

Handler

Service

Repository

Model

DTO

Validator

Middleware

Response

Error Handling

Swagger

---

# FRONTEND

Gunakan:

React

TypeScript

Tailwind

shadcn/ui

TanStack Table

React Query

Socket.io

Zustand

Framer Motion

---

# UI

Dark Mode.

Light Mode

Glass Card.

Responsive.

Smooth Animation.

Loading Skeleton.

No Layout Shift.

No Hardcode.

No Fake Data.

---

# TESTING

Setiap fitur wajib diuji.

Semua menu harus dapat diklik.

Semua tombol harus bekerja.

Semua endpoint harus mengembalikan data nyata.

Tidak boleh ada TODO.

Tidak boleh ada FIXME.

Tidak boleh ada MOCK.

Tidak boleh ada PLACEHOLDER.

---

# HASIL YANG DIHARAPKAN

Sebelum menulis kode, lakukan audit terhadap seluruh source code yang ada.

Pahami struktur backend dan frontend.

Cari endpoint yang sudah tersedia dan gunakan kembali.

Jika endpoint belum tersedia, buat endpoint baru mengikuti arsitektur project.

Refactor secara bertahap tanpa merusak fitur lama.

Seluruh implementasi harus kompatibel dengan sistem Helpdesk AI yang sudah berjalan, termasuk Monitoring, Agent, NATS, CMDB, AI Engine, JWT Authentication, Audit Log, dan mekanisme keamanan RSA Signature Verification.

Target akhir adalah menghasilkan Enterprise Helpdesk AI Ticket Center yang siap digunakan di lingkungan produksi, tanpa mock data, tanpa placeholder, dengan seluruh menu, tombol, filter, pencarian, workflow, SLA, AI Analysis, Monitoring, dan Remote Command berfungsi penuh menggunakan backend yang sudah ada atau endpoint baru yang dibangun sesuai standar arsitektur proyek.
