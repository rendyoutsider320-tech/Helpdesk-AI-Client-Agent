# ROLE

Bertindak sebagai tim yang terdiri dari:

- Principal Software Architect
- Senior UX Engineer
- Senior React Engineer
- Senior Golang Engineer
- Senior Fiber Engineer
- Senior PostgreSQL Engineer
- Senior AI Integration Engineer
- Senior DevOps Engineer
- Senior QA Engineer

Anda sedang melakukan REFACTOR BESAR terhadap Customer Portal agar setara dengan Zammad Enterprise, namun lebih modern karena memiliki AI Assistant.

====================================================================

RULES

JANGAN membuat project baru.

JANGAN mengganti arsitektur backend.

JANGAN membuat mock data.

JANGAN membuat dummy API.

JANGAN hardcode.

Gunakan seluruh Backend API yang sudah ada.

Jika API belum tersedia,
buat endpoint baru dengan mengikuti arsitektur yang sudah ada.

Seluruh data HARUS realtime.

Seluruh data HARUS berasal dari database.

Seluruh permission tetap mengikuti sistem login.

JANGAN merusak Dashboard Teknisi.

JANGAN merusak Dashboard Admin.

JANGAN merusak AI Engine.

JANGAN merusak Agent Desktop.

JANGAN merusak Notification Service.

JANGAN menghapus fitur lama.

Lakukan refactor bertahap.

====================================================================

TARGET

Membuat Customer Portal setara:

- Zammad
- FreshService
- Jira Service Management Customer Portal

ditambah AI Assistant.

====================================================================

DESIGN

Gunakan design modern.

Minimalis.

Enterprise.

Dark Mode.

Light Mode.

Responsive.

Desktop.

Tablet.

Mobile.

Gunakan design language yang konsisten.

Border Radius konsisten.

Typography konsisten.

Spacing konsisten.

Shadow halus.

Animation ringan.

Loading Skeleton.

Smooth Transition.

====================================================================

SIDEBAR

Dashboard

AI Assistant

Create Ticket

My Tickets

Knowledge Base

My Assets

Downloads

Notifications

Announcements

Profile

Settings

Logout

====================================================================

TOP NAVBAR

Search Global

Notification Bell

Announcement

Theme Switcher

Language

User Avatar

====================================================================

DASHBOARD

Dashboard harus memiliki:

Welcome Card

Ticket Summary

Open Ticket

Waiting Ticket

Solved Ticket

Closed Ticket

Device Summary

Online Device

Offline Device

Critical Alert

Announcement

Recent Activity

AI Recommendation

Knowledge Recommendation

Favorite Articles

Recent Ticket

Recent Notification

System Status

Backend Status

AI Status

Realtime Connection

Desktop Agent Status

====================================================================

AI ASSISTANT

Bukan chatbot biasa.

Harus seperti AI Copilot.

Fitur:

Conversation History

Semantic Search

Knowledge Search

Suggested Question

Voice Input

Image Upload

Screenshot Upload

Log Upload

Copy Response

Export Conversation

Escalate to Ticket

Create Ticket

Continue Conversation

Context Memory

Streaming Response

Markdown Support

Syntax Highlight

Typing Indicator

Runtime:

Ollama

Model:

Qwen3 8B Q4_K_M

Embedding:

BGE Small Multilingual

Vector Database:

Qdrant


====================================================================

CREATE TICKET

Halaman lengkap.

Field:

Subject

Category

Sub Category

Priority

Device

Department

Attachment

Description

AI Suggestion

Duplicate Detection

Knowledge Recommendation

Preview Ticket

Submit

Setelah user mengetik masalah:

AI harus:

mencari ticket serupa

mencari knowledge

memberi solusi

menampilkan confidence score

Jika user memilih

Masalah belum selesai

↓

otomatis menjadi Ticket.

====================================================================

MY TICKETS

Harus seperti Zammad.

Table modern.

Pagination.

Realtime.

Filter.

Search.

Sorting.

Column:

Ticket Number

Subject

Status

Priority

Category

Technician

Created

Updated

SLA

Action

====================================================================

DETAIL TICKET

Halaman lengkap.

Header

Status

Priority

Category

Technician

SLA

Timeline

Conversation

Internal Event

Attachment

Activity

History

Resolution

Rating

Feedback

Close Ticket

Reopen Ticket

Print

Export PDF

====================================================================

CONVERSATION

Support:

Markdown

Attachment

Emoji

Code Block

Image Preview

Reply

Quote

Mention

Realtime

Read Status

Typing Indicator

====================================================================

KNOWLEDGE BASE

Kategori

Search

Popular Article

Recent Article

AI Search

Related Article

Bookmark

Rating

Comment

Attachment

Print

Export PDF

====================================================================

MY ASSETS

Semua device user.

Table:

Hostname

IP

OS

CPU

RAM

Disk

Status

Agent Version

Last Seen

Health

Detail

====================================================================

DETAIL DEVICE

Overview

Realtime Status

CPU

RAM

Disk

Network

Windows Version

Installed Software

Patch

Antivirus

Last Reboot

Services

Processes

====================================================================

DOWNLOADS

Desktop Agent

Remote Support

VPN

Manual

PDF

Tools

Version

Release Note

====================================================================

NOTIFICATION CENTER

Realtime.

Unread Count.

Filter.

Search.

Mark Read.

Delete.

Priority.

Grouping.

====================================================================

ANNOUNCEMENT

Maintenance

News

Security

Update

Pinned

Search

====================================================================

PROFILE

Avatar

Personal Info

Company

Department

Phone

Email

Password

2FA

API Token

Language

Timezone

====================================================================

SETTINGS

Theme

Dark

Light

Auto

Notification

Email

Desktop

Telegram

Whatsapp

Sound

Accessibility

====================================================================

SEARCH

Global Search.

Cari:

Ticket

Knowledge

Announcement

Assets

Downloads

Conversation

====================================================================

REALTIME

Gunakan websocket yang sudah ada.

Update otomatis.

Tidak boleh polling.

====================================================================

BACKEND

Jika endpoint belum ada:

buat endpoint baru.

Gunakan:

Fiber

PostgreSQL

JWT

Role Permission

Audit Log

Repository Pattern

Service Pattern

Controller Pattern

====================================================================

DATABASE

Tidak boleh mengubah data existing.

Migration aman.

Backward Compatible.

====================================================================

UI

Gunakan:

Card

Drawer

Modal

Toast

Tooltip

Dropdown

Command Palette

Context Menu

Loading Skeleton

Empty State

Error State

Infinite Scroll

Breadcrumb

====================================================================

PERFORMANCE

Lazy Loading

Memoization

Virtual Table

Debounce Search

Code Splitting

Caching

====================================================================

SECURITY

JWT

CSRF

XSS

Sanitize

Upload Validation

Permission Validation

Audit Log

====================================================================

TESTING

Semua fitur harus berjalan.

Tidak boleh ada:

Button mati

Menu kosong

Halaman kosong

Dummy Data

Mock API

Broken Route

====================================================================

OUTPUT

Kerjakan secara bertahap.

Sebelum coding:

Audit seluruh frontend.

Audit seluruh backend.

Audit seluruh API.

Audit seluruh Database.

Audit seluruh websocket.

Audit seluruh AI Engine.

Audit seluruh Agent Desktop.

Setelah audit,

buat execution plan.

Lalu implementasikan.

Jangan berhenti sebelum seluruh Customer Portal benar-benar menjadi Enterprise Customer Portal setara Zammad dengan AI Copilot.