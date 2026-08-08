# ULTIMATE ENTERPRISE HELPDESK AI + ASSET INVENTORY + TELEMETRY PLATFORM IMPLEMENTATION PROMPT

Anda adalah Principal Enterprise Architect, Distinguished Software Engineer, Senior Staff Backend Engineer, Senior Staff Frontend Engineer, Senior DevOps Engineer, CMDB Architect, ITSM Consultant, AIOps Architect, Database Architect, Security Engineer, QA Lead, dan Enterprise Code Reviewer.

Tugas Anda adalah melakukan audit menyeluruh, redesign jika diperlukan, implementasi penuh, refactoring, debugging, optimasi, serta aktivasi 100% seluruh fitur aplikasi Helpdesk AI yang terintegrasi dengan Asset Inventory, Telemetry Monitoring, Incident Management, CMDB, Knowledge Base, Approval Workflow, NATS Message Broker, dan Human-In-The-Loop AI Diagnosis Engine.

====================================================
BUSINESS OBJECTIVE
==================

Bangun platform Enterprise IT Operations Center yang menjadi:

1. IT Helpdesk Platform
2. IT Asset Inventory Platform
3. Enterprise CMDB Platform
4. Telemetry Monitoring Platform
5. Incident Management Platform
6. Approval Management Platform
7. Evidence Collection Platform
8. Human-In-The-Loop AI Diagnosis Platform

Sistem harus menjadi Single Source of Truth (SSOT) untuk seluruh endpoint perusahaan.

Target kapasitas:

* 10.000+ Endpoint
* Multi Branch
* Multi Department
* Multi Tenant Ready
* Audit Ready
* Enterprise Security Ready
* High Availability Ready
* AI Ready

====================================================
MANDATORY RULES
===============

DILARANG:

* Menu mati
* Route mati
* Tombol mati
* Placeholder page
* Dummy page
* Mock data
* Hardcoded dashboard data
* Hardcoded table data
* Unused component
* Broken navigation
* Orphan route
* API kosong
* API dummy
* Error 404
* Error 500
* Silent error
* Unhandled exception

Semua data WAJIB berasal dari database atau realtime telemetry.

====================================================
FULL SYSTEM AUDIT
=================

Lakukan scanning seluruh source code.

Audit:

Frontend
Backend
Database
NATS Integration
Websocket
RBAC
Telemetry Agent

Cari:

* onClick
* href
* Link
* router.push
* navigate
* Button
* Action
* Menu
* Dropdown
* Quick Action
* Floating Action

Pastikan seluruh action memiliki implementasi backend dan frontend.

====================================================
MODULE 1
ENTERPRISE DASHBOARD
====================

Dashboard harus realtime.

KPI wajib:

Ticket Metrics

* Total Ticket
* Open Ticket
* Pending Ticket
* Resolved Ticket
* Closed Ticket
* Escalated Ticket

Asset Metrics

* Total Assets
* Online Assets
* Offline Assets
* Critical Assets
* Warranty Expiring

Monitoring Metrics

* Active Alerts
* Critical Alerts
* Device Online
* Device Offline
* Telemetry Rate
* NATS Consumer Health

AI Metrics

* AI Diagnosis Count
* AI Resolution Rate
* Human Handover Rate
* Average Confidence Score

Approval Metrics

* Pending Approval
* Approved Today
* Rejected Today

Seluruh card wajib clickable.

====================================================
MODULE 2
TICKET MANAGEMENT
=================

Implement:

* All Tickets
* Create Ticket
* My Tickets
* Ticket Detail
* Ticket Timeline
* Ticket Evidence
* Ticket Activity Log
* Ticket Comments
* Ticket Assignment
* Ticket Escalation

Support:

* Search
* Filter
* Pagination
* Export Excel
* Export CSV
* Attachment Upload

====================================================
MODULE 3
APPROVAL CENTER
===============

Implement:

Approval List
Approval Detail
Approve
Reject
Approval History
Approval Audit Trail

Support:

* Multi Level Approval
* Approval Notes
* Approval SLA

====================================================
MODULE 4
ENTERPRISE ASSET INVENTORY
==========================

Buat halaman Asset Detail sebagai Single Source of Truth.

TAB 1
Asset Profile

* Asset ID
* Asset Tag
* Hostname
* Device Name
* FQDN
* Domain
* Workgroup
* Manufacturer
* Model
* Serial Number
* Assigned User
* Employee ID
* Department
* Division
* Branch
* Location
* Floor
* Room
* Lifecycle Status
* Purchase Date
* Warranty Start
* Warranty End
* Vendor
* Supplier
* End Of Life

TAB 2
Hardware Inventory

CPU

* Processor Name
* Manufacturer
* Architecture
* Core Count
* Thread Count
* Base Clock
* Current Clock
* Max Clock
* Usage
* Temperature

Memory

* Total RAM
* Used RAM
* Free RAM
* RAM Type
* RAM Speed
* DIMM Information

Storage

* Disk Model
* Serial Number
* Firmware
* SMART Health
* Temperature
* Power On Hours
* Read Error
* Write Error
* Failure Prediction

GPU

* Model
* Vendor
* Driver Version
* Temperature
* Utilization
* VRAM

Motherboard

* Manufacturer
* Model
* BIOS Version
* BIOS Date

====================================================
MODULE 5
OPERATING SYSTEM INVENTORY
==========================

Collect:

* OS Name
* Edition
* Build Number
* Activation Status
* License Type
* Install Date
* Last Boot
* Last Shutdown
* Uptime
* Update Status
* Update History

====================================================
MODULE 6
NETWORK INVENTORY
=================

Collect:

* IP Address
* Gateway
* DNS
* MAC Address
* Link Speed
* Ethernet
* WiFi
* VPN

Network Health:

* Latency
* Packet Loss
* Jitter
* Bandwidth

Monitor:

* cos.sams.id
* sales.sams.id
* absensi.sams.id
* karyawan.sams.id

Collect:

* Availability
* DNS Status
* HTTP Status
* SSL Expiry
* Response Time

====================================================
MODULE 7
SOFTWARE INVENTORY
==================

Collect seluruh software.

Field:

* Name
* Version
* Publisher
* Install Date
* Install Path
* License Status

Detect:

* Unauthorized Software
* Blacklisted Software
* End Of Life Software

Generate:

Software Risk Score

====================================================
MODULE 8
SERVICE MONITORING
==================

Collect seluruh Windows Service.

Monitor khusus:

* Print Spooler
* Windows Update
* NATS Agent
* Outlook
* Defender
* WMI
* RPC

Alert jika:

* Service Down
* Crash Loop
* Unexpected Stop

====================================================
MODULE 9
PRINTER INVENTORY
=================

HP Ink Tank

* Ink Level
* Paper Status
* Offline Status
* Error Status

Epson Thermal

* Driver Version
* Queue
* Connection Status
* Error History

====================================================
MODULE 10
USB INVENTORY
=============

Track seluruh USB Device.

Store:

* VID
* PID
* Serial Number
* Device Type
* First Seen
* Last Seen
* Connection Count

Generate USB Security Audit.

====================================================
MODULE 11
BROWSER MONITORING
==================

Chrome
Microsoft Edge

Collect:

* Version
* Profile
* Crash Count

Monitor:

* cos.sams.id
* sales.sams.id
* absensi.sams.id
* karyawan.sams.id

====================================================
MODULE 12
OUTLOOK MONITORING
==================

Collect:

* Outlook Version
* Mailbox Size
* OST Size
* Exchange Status
* Authentication Status
* Last Sync
* Send Receive Health

====================================================
MODULE 13
EVENT LOG ANALYSIS
==================

Collect:

* Application Log
* System Log
* Security Log

Detect:

* BSOD
* Disk Error
* Driver Error
* Printer Error
* Network Failure
* Authentication Failure

Support Evidence Export.

====================================================
MODULE 14
HEALTH ENGINE
=============

Generate:

Health Score (0-100)

Weight:

CPU 20%
RAM 20%
Disk 25%
Event Log 15%
Network 10%
Printer 10%

Generate:

* Health Score
* Risk Score
* Risk Level
* Recommended Action

====================================================
MODULE 15
INCIDENT HISTORY
================

Integrasi dengan Helpdesk.

Tampilkan:

* Open Ticket
* Resolved Ticket
* Escalated Ticket
* Resolution Time
* Resolution Summary
* Technician

====================================================
MODULE 16
AI DIAGNOSIS CENTER
===================

HUMAN IN THE LOOP ONLY.

AI TIDAK BOLEH:

* Menjalankan script
* Menjalankan command
* Mengubah konfigurasi
* Menghapus file
* Melakukan remediation otomatis

AI HANYA BOLEH:

* Analisa telemetry
* Analisa event log
* Analisa printer
* Analisa jaringan
* Analisa performa

Output:

* Findings
* Root Cause Analysis
* Confidence Score
* Recommended Action

Approval teknisi wajib.

====================================================
MODULE 17
EVIDENCE CENTER
===============

Store:

* Screenshot
* Event Export
* Ping Result
* Traceroute
* Printer Dump
* Diagnostic Log

Link ke:

* Asset
* Ticket
* Incident
* Diagnosis

====================================================
NATS ARCHITECTURE
=================

Agent → NATS → Backend → WebSocket → Frontend

Subjects:

telemetry.asset
telemetry.hardware
telemetry.memory
telemetry.storage
telemetry.network
telemetry.services
telemetry.printer
telemetry.browser
telemetry.outlook
telemetry.eventlog
telemetry.health
telemetry.alert

Implement:

* Pub/Sub
* Queue Consumer
* Request Reply
* Retry Queue
* Dead Letter Queue

====================================================
DATABASE DESIGN
===============

PostgreSQL

Tabel wajib:

assets
asset_users
asset_hardware
asset_memory
asset_storage
asset_gpu
asset_network
asset_software
asset_services
asset_printers
asset_usb
asset_browser
asset_outlook
asset_event_logs
asset_health
asset_incidents
asset_evidence
tickets
approvals
alerts
audit_logs

Implement:

* Foreign Key
* Composite Index
* Telemetry Partitioning
* Retention Policy
* Audit Logging

====================================================
SECURITY
========

Implement:

* JWT
* Refresh Token
* RBAC
* Audit Trail
* Rate Limit
* CSRF Protection
* XSS Protection
* SQL Injection Protection

====================================================
VALIDATION
==========

Frontend:

npm run lint
npm run type-check
npm run build

Backend:

go fmt ./...
go vet ./...
go test ./...
go build ./...

Perbaiki seluruh error hingga build sukses.

====================================================
FINAL REPORT
============

Output:

MENU AKTIF
ROUTE DIBUAT
HALAMAN DIBUAT
API DIBUAT
DATABASE DIBUAT
BUTTON DIPERBAIKI
BUG DIPERBAIKI
SECURITY IMPROVEMENT
PERFORMANCE IMPROVEMENT
NATS STATUS
TELEMETRY STATUS
DASHBOARD STATUS
APPROVAL STATUS
ASSET INVENTORY STATUS
LIVE MONITOR STATUS
ALERT STATUS
TICKET STATUS
AI DIAGNOSIS STATUS
CMDB STATUS
AUDIT TRAIL STATUS

Hitung:

PERSENTASE SISTEM BERFUNGSI

Target akhir:

100% Functional Enterprise Helpdesk AI + Asset Inventory + Telemetry + CMDB + Human-In-The-Loop AI Diagnosis Platform siap produksi dan mampu menangani 10.000+ endpoint.
