'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore, useLayoutStore } from '@/store'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import { aiApi, qdrantApi, ticketApi, dashboardApi, systemApi } from '@/lib/api'
import ParticleNetwork from '@/components/ParticleNetwork'

const parseDescription = (desc: string) => {
  if (!desc) return { text: '', attachmentUrl: null };
  const regex = /\[Lampiran File:\s*(.*?)\]/g;
  const matches = [...desc.matchAll(regex)];
  let cleanedText = desc.replace(regex, '').trim();
  let attachmentUrl = null;
  if (matches.length > 0) {
    attachmentUrl = matches[0][1];
  }
  return { text: cleanedText, attachmentUrl };
};

const isImage = (url: string) => {
  const ext = url.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '');
};

export default function AdminDashboard() {
  const router = useRouter()
  const [isChecked, setIsChecked] = useState(false)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const sidebarCollapsed = useLayoutStore((state) => state.sidebarCollapsed)
  const [isDarkMode, setIsDarkMode] = useState(false)

  // Sync theme
  useEffect(() => {
    const syncTheme = () => {
      const savedTheme = localStorage.getItem('theme')
      const isDark =
        savedTheme === 'dark' ||
        (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
      setIsDarkMode(isDark)
    }

    syncTheme()
    window.addEventListener('themechange', syncTheme)
    return () => window.removeEventListener('themechange', syncTheme)
  }, [])
  
  // Return null while store is hydrating to prevent SSR mismatch
  if (!isHydrated) {
    return null
  }
  
  // Auth guard - redirect if not authenticated or not admin
  // Check localStorage first to avoid race condition
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('access_token')
      const userStr = localStorage.getItem('user')
      
      if (!token || !userStr) {
        console.log('No auth token/user found, redirecting to login')
        router.push('/')
        return
      }

      try {
        const userData = JSON.parse(userStr)
        console.log('User data found:', { role: userData.role, username: userData.username })
        
        if (userData.role === 'technician') {
          console.log('User is technician, redirecting to technician dashboard')
          router.push('/dashboard/technician')
          return
        } else if (userData.role !== 'admin') {
          console.log('User is not admin, redirecting to user dashboard')
          router.push('/dashboard/user')
          return
        }
      } catch (e) {
        console.log('Error parsing user data:', e)
        router.push('/')
        return
      }
      
      console.log('Auth check passed, setting isChecked=true')
      setIsChecked(true)
    }

    checkAuth()
  }, [router])

  const [stats, setStats] = useState<{
    open_tickets: number
    sla_breaches: number
    critical_alerts: number
    online_technicians: number
    total_technicians: number
    total_tickets?: number
    closed_tickets?: number
    pending_approvals?: number
  } | null>(null)
  const [summary, setSummary] = useState<any | null>(null)
  const [trends, setTrends] = useState<any | null>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [queueTickets, setQueueTickets] = useState<any[]>([])
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticketActionMessage, setTicketActionMessage] = useState<string | null>(null)
  const [recentActivities, setRecentActivities] = useState<any[]>([])

  // Load chat history from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedChat = localStorage.getItem('helpdesk_admin_chat_history')
      if (savedChat) {
        try {
          setChatHistory(JSON.parse(savedChat))
        } catch (e) {
          console.error('Error parsing admin chat history:', e)
        }
      }
    }
  }, [])

  // Save chat history to localStorage whenever chatHistory changes
  useEffect(() => {
    if (typeof window !== 'undefined' && chatHistory.length > 0) {
      localStorage.setItem('helpdesk_admin_chat_history', JSON.stringify(chatHistory))
    }
  }, [chatHistory])

  const fetchActivities = async () => {
    try {
      const activityRes = await dashboardApi.activityLog(20)
      const rawActivities: any[] = activityRes.data?.activities || []
      const now = new Date()
      const formatted = rawActivities.map((a: any) => {
        const ts = new Date(a.timestamp)
        const diffMs = now.getTime() - ts.getTime()
        const diffSec = Math.floor(diffMs / 1000)
        const diffMin = Math.floor(diffSec / 60)
        const diffHr  = Math.floor(diffMin / 60)
        const diffDay = Math.floor(diffHr / 24)

        let timeLabel = ''
        if (diffSec < 60)      timeLabel = `${diffSec} detik yang lalu`
        else if (diffMin < 60) timeLabel = `${diffMin} menit yang lalu`
        else if (diffHr < 24)  timeLabel = `${diffHr} jam yang lalu`
        else                   timeLabel = `${diffDay} hari yang lalu`

        return {
          id:        a.id,
          action:    a.action,
          text:      a.text,
          ticketNo:  a.ticket_no,
          ticketId:  a.ticket_id,
          actorName: a.actor_name,
          time:      timeLabel,
          timestamp: ts,
        }
      })
      setRecentActivities(formatted)
    } catch (err) {
      console.error('Failed to load activity logs:', err)
    }
  }

  useEffect(() => {
    // Only fetch if auth check completed
    if (!isChecked) return

    const fetchDashboardData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [queueRes, statsRes, summaryRes, trendsRes] = await Promise.all([
          ticketApi.list(1, 20),
          dashboardApi.stats(),
          dashboardApi.summary(),
          dashboardApi.trends()
        ])

        setQueueTickets(queueRes.data?.tickets || [])
        setSelectedTicket(queueRes.data?.tickets?.[0] || null)
        setTickets(queueRes.data?.tickets || [])
        setStats(statsRes.data || null)
        setSummary(summaryRes.data || null)
        setTrends(trendsRes.data || null)
        await fetchActivities()
      } catch (err) {
        console.error('Failed to load admin dashboard data', err)
        setError('Gagal memuat beberapa data dashboard. Pastikan semua service backend berjalan.')
        // Fallback for tickets
        try {
          const queueRes = await ticketApi.list(1, 20)
          setQueueTickets(queueRes.data?.tickets || [])
          setTickets(queueRes.data?.tickets || [])
        } catch (_) {}
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()

    const interval = setInterval(fetchActivities, 10000)
    return () => clearInterval(interval)
  }, [isChecked])

  const activeConversations = stats?.open_tickets ?? 0
  const aiResolutionRate = useMemo(() => {
    if (!tickets.length) return null
    const resolved = tickets.filter((ticket) => ticket.status === 'resolved').length
    return Math.round((resolved / tickets.length) * 100)
  }, [tickets])

  const humanHandoverRate = useMemo(() => {
    if (!summary || !summary.ticket_age || !summary.ticket_age.total_open) return 0
    const totalOpen = summary.ticket_age.total_open
    const assignedOpen = summary.ticket_age.assigned_open_count
    return Math.round((assignedOpen / totalOpen) * 100)
  }, [summary])

  const severityTrends = useMemo(() => {
    return trends?.severity_trends || []
  }, [trends])

  const categoryTrends = useMemo(() => {
    return trends?.category_trends || []
  }, [trends])

  const unresolvedIntents = useMemo(() => {
    return queueTickets.filter((ticket) => ticket.status === 'need_approval' || ticket.status === 'open')
  }, [queueTickets])

  const handleSelectTicket = (ticket: any) => {
    setSelectedTicket(ticket)
    setTicketActionMessage(null)
  }

  const handleTakeOver = async () => {
    if (!selectedTicket || !user) {
      setTicketActionMessage('Pilih tiket terlebih dahulu untuk mengambil alih.')
      return
    }

    try {
      await ticketApi.assign(selectedTicket.id, user.id)
      setTicketActionMessage(`Tiket ${selectedTicket.ticket_no} berhasil diambil alih.`)
      const response = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(response.data)
    } catch (err) {
      console.error('Failed to take over ticket', err)
      setTicketActionMessage('Gagal mengambil alih tiket. Silakan coba lagi.')
    }
  }

  const handleSendChat = async () => {
    if (!chatInput.trim()) return

    const userMessage = chatInput.trim()
    setChatHistory((history) => [...history, { role: 'user', text: userMessage }])
    setChatInput('')

    try {
      const response = await aiApi.chat(selectedTicket ? `Tiket ${selectedTicket.ticket_no}: ${userMessage}` : userMessage)
      const assistantText = response.data?.analysis?.ai_report || 'AI tidak menghasilkan jawaban saat ini.'
      setChatHistory((history) => [...history, { role: 'assistant', text: assistantText }])
    } catch (err) {
      console.error('AI chat failed', err)
      setChatHistory((history) => [...history, { role: 'assistant', text: 'Gagal meminta saran AI. Silakan coba lagi.' }])
    }
  }

  const handleSyncKB = async () => {
    setIsSyncing(true)
    try {
      await qdrantApi.syncKB()
      setTicketActionMessage('Knowledge base berhasil disinkronkan ke Qdrant.')
    } catch (err) {
      console.error('Sync KB failed', err)
      setTicketActionMessage('Gagal menyinkronkan knowledge base. Cek konfigurasi backend.')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleResetDatabaseClick = async () => {
    const confirmed = window.confirm("PERINGATAN: Tindakan ini akan menghapus seluruh data tiket, komentar, lampiran, riwayat eskalasi, tugas otomatis, notifikasi, dan percakapan AI secara permanen. Apakah Anda yakin ingin melakukan reset?")
    if (!confirmed) return

    setIsResetting(true)
    setError(null)
    setTicketActionMessage(null)

    try {
      const res = await systemApi.resetDatabase()
      setTicketActionMessage(res.data?.message || 'Database berhasil di-reset.')
      
      // Clear local states
      setQueueTickets([])
      setTickets([])
      setSelectedTicket(null)
      setStats((prev: any) => prev ? {
        ...prev,
        open_tickets: 0,
        sla_breaches: 0,
        critical_alerts: 0,
        pending_approvals: 0,
        total_tickets: 0,
        closed_tickets: 0
      } : null)
      setSummary(null)
      setTrends(null)
      setRecentActivities([])
    } catch (err: any) {
      console.error('Failed to reset database', err)
      setError(err.response?.data?.error || 'Gagal melakukan reset database. Silakan coba lagi.')
    } finally {
      setIsResetting(false)
    }
  }

  // Listen to WebSocket broadcasts for database reset
  useEffect(() => {
    if (!isChecked) return

    const handleWsMessage = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (!data) return

      if (data.type === 'database_reset') {
        console.log('Received database_reset signal via WebSocket')
        setQueueTickets([])
        setTickets([])
        setSelectedTicket(null)
        setStats((prev: any) => prev ? {
          ...prev,
          open_tickets: 0,
          sla_breaches: 0,
          critical_alerts: 0,
          pending_approvals: 0,
          total_tickets: 0,
          closed_tickets: 0
        } : null)
        setSummary(null)
        setTrends(null)
        setRecentActivities([])
      }
    }

    window.addEventListener('websocket-message', handleWsMessage)
    return () => {
      window.removeEventListener('websocket-message', handleWsMessage)
    }
  }, [isChecked])

  // Show loading while checking auth
  if (!isChecked) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
          <p className={`mt-4 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex overflow-hidden transition-colors duration-300 relative ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <ParticleNetwork />
      <Sidebar />
      <div className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'xl:pl-20' : 'xl:pl-80'}`}>
        <Header />

        {/* Right Scrollable Content Column */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <section className="w-full space-y-4">
              <div className={`no-hover flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between rounded-3xl border transition-all duration-300 ${
                isDarkMode 
                  ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white shadow-lg shadow-slate-200/50'
              }`}>
                <div>
                  <p className={`text-xs uppercase tracking-[0.3em] font-semibold ${isDarkMode ? 'text-cyan-400' : 'text-sky-600'}`}>Dashboard</p>
                  <h1 className={`mt-1.5 text-2xl font-semibold transition-colors ${isDarkMode ? 'text-white drop-shadow-[0_0_8px_rgba(0,210,255,0.2)]' : 'text-slate-900'}`}>IT HelpDesk</h1>
                  <p className={`mt-1.5 max-w-2xl text-xs transition-colors ${isDarkMode ? 'text-slate-350' : 'text-slate-500'}`}>Ringkasan real-time untuk tiket, monitoring, AI chat, dan intervensi manusia.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-all ${
                    isDarkMode 
                      ? 'border-rose-500/30 bg-slate-950/80 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.1)]' 
                      : 'border-slate-200 bg-slate-100 text-slate-700'
                  }`}>
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${(stats?.critical_alerts ?? 0) > 0 ? 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-400'}`} />
                    {stats?.critical_alerts ?? 0} Alert Aktif
                  </div>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 shadow-md shadow-sky-500/20 active:scale-95"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {error && (
                <div className={`rounded-3xl border p-5 text-sm transition-all ${
                  isDarkMode 
                    ? 'border-rose-500/20 bg-rose-500/10 text-rose-100' 
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}>
                  {error}
                </div>
              )}

              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* 1. Total Tickets */}
                <Link href="/dashboard/tickets" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-sky-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>Total Tickets</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{isLoading ? '—' : (stats?.total_tickets ?? 0)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total tiket terdaftar di database.</p>
                </Link>

                {/* 2. Open Tickets */}
                <Link href="/dashboard/tickets?status=open" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-orange bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-indigo-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>Open Tickets</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-amber-400' : 'text-indigo-600'}`}>{isLoading ? '—' : activeConversations}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket aktif dalam antrean baru.</p>
                </Link>

                {/* 3. Closed Tickets */}
                <Link href="/dashboard/tickets?status=closed" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-green bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-emerald-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>Closed Tickets</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{isLoading ? '—' : (stats?.closed_tickets ?? 0)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket terselesaikan dan ditutup.</p>
                </Link>

                {/* 4. AI Resolution Rate */}
                <Link href="/dashboard/tickets" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-teal-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>AI Resolution Rate</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-cyan-400' : 'text-emerald-605'}`}>{aiResolutionRate ?? 'N/A'}%</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Rasio penyelesaian otomatis oleh AI.</p>
                </Link>

                {/* 5. Human Handover Rate */}
                <Link href="/dashboard/tickets" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-orange bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-amber-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>Handover Rate</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{humanHandoverRate ?? 0}%</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket dialihkan ke teknisi manusia.</p>
                </Link>

                {/* 6. Alert Aktif */}
                <Link href="/dashboard/alerts" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-red bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-rose-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-rose-400 font-semibold' : 'text-rose-600'}`}>Alert Aktif</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-rose-455' : 'text-rose-600'}`}>{isLoading ? '—' : (stats?.critical_alerts ?? 0)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Alert sistem status kritis/aktif.</p>
                </Link>

                {/* 7. Device Online */}
                <Link href="/dashboard/monitor" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-green bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-emerald-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-emerald-400 font-semibold' : 'text-emerald-600'}`}>Device Online</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{isLoading ? '—' : (summary?.device_health?.active_devices ?? 0)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Jumlah agen client yang aktif online.</p>
                </Link>

                {/* 8. Device Offline */}
                <Link href="/dashboard/monitor" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-red bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-rose-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-rose-400 font-semibold' : 'text-rose-600'}`}>Device Offline</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-rose-455' : 'text-rose-600'}`}>{isLoading ? '—' : (summary?.device_health?.offline_devices ?? 0)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Jumlah agen client yang offline.</p>
                </Link>

                {/* 9. Approval Pending */}
                <Link href="/dashboard/approvals" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer col-span-1 sm:col-span-2 lg:col-span-1 ${
                  isDarkMode 
                    ? 'neon-glow-purple bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-purple-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-purple-400 font-semibold' : 'text-purple-600'}`}>Approval Pending</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{isLoading ? '—' : (stats?.pending_approvals ?? 0)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Remote action yang butuh otorisasi.</p>
                </Link>

                {/* 10. Posts & Artikel KB */}
                <Link href="/dashboard/posts" className={`rounded-3xl p-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                  isDarkMode 
                    ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                    : 'border-slate-200 bg-white hover:border-sky-500 shadow-md shadow-slate-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>Kelola Posts</p>
                  <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>📝</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Kelola postingan & sinkronisasi AI KB.</p>
                </Link>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div className="space-y-4">
                  <div className={`p-4 rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                      ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                      : 'border-slate-200 bg-white shadow-lg shadow-slate-200/50'
                  }`}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className={`text-xl font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Live Chat & Ticket Monitoring</h2>
                      <p className={`mt-2 text-sm transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Lihat antrean tiket, buka percakapan AI, dan ambil alih jika diperlukan.</p>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em] transition-all ${
                      isDarkMode ? 'bg-slate-900/90 text-slate-300' : 'bg-slate-100 text-slate-600'
                    }`}>
                      AI Chat Live
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="space-y-4">
                      <div className={`rounded-3xl border p-4 transition-all duration-300 ${
                        isDarkMode ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <h3 className={`text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Queue List</h3>
                          <span className={`rounded-full px-3 py-1 text-xs transition-all ${
                            isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                          }`}>{queueTickets.length} tiket</span>
                        </div>
                        <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-1">
                          {queueTickets.map((ticket) => (
                            <button
                              key={ticket.id}
                              onClick={() => handleSelectTicket(ticket)}
                              className={`gaya-list-baru w-full rounded-3xl border p-4 text-left transition duration-300 ${
                                selectedTicket?.id === ticket.id 
                                  ? (isDarkMode ? 'border-sky-400 bg-slate-900/90' : 'border-sky-500 bg-sky-50/50 ring-1 ring-sky-500') 
                                  : (isDarkMode ? 'border-white/10 bg-slate-950/70 hover:border-sky-300/60 hover:bg-slate-900/80' : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50/65')
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className={`text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{ticket.ticket_no || 'Tiket'}</p>
                                <span className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                  isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/80 text-slate-700 border border-slate-300/30'
                                }`}>{ticket.status}</span>
                              </div>
                              <p className={`mt-2 text-sm transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-650'}`}>{ticket.title}</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                                <span className={`rounded-full px-2 py-1 transition-all ${
                                  isDarkMode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-100 text-emerald-850'
                                }`}>{ticket.severity}</span>
                                {ticket.assignee?.name ? (
                                  <span className={`rounded-full px-2 py-1 transition-all ${
                                    isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600 border border-slate-300/30'
                                  }`}>{ticket.assignee.name}</span>
                                ) : ticket.assigned_to ? (
                                  <span className={`rounded-full px-2 py-1 transition-all ${
                                    isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600 border border-slate-300/30'
                                  }`}>assigned</span>
                                ) : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={`rounded-3xl border p-4 transition-all duration-300 ${
                        isDarkMode ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
                      }`}>
                        <h3 className={`text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Ticket Activity</h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className={`rounded-3xl p-4 transition-all ${isDarkMode ? 'bg-slate-900/90' : 'bg-white border border-slate-200/80 shadow-sm'}`}>
                            <p className={`text-xs uppercase tracking-[0.28em] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Open Queue</p>
                            <p className={`mt-2 text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{queueTickets.length}</p>
                          </div>
                          <div className={`rounded-3xl p-4 transition-all ${isDarkMode ? 'bg-slate-900/90' : 'bg-white border border-slate-200/80 shadow-sm'}`}>
                            <p className={`text-xs uppercase tracking-[0.28em] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Assigned</p>
                            <p className={`mt-2 text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{queueTickets.filter((t) => t.assigned_to).length}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-3xl border p-4 transition-all duration-300 ${
                      isDarkMode ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
                    }`}>
                      <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Chat Window</h3>
                        <span className={`rounded-full px-3 py-1 text-xs transition-colors ${isDarkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-200/80 text-slate-700'}`}>AI Support</span>
                      </div>
                      <div className={`mt-4 h-[340px] space-y-3 overflow-y-auto rounded-3xl border p-4 text-sm transition-all ${
                        isDarkMode 
                          ? 'border-white/5 bg-slate-900/80 text-slate-300' 
                          : 'border-slate-200 bg-white text-slate-700 shadow-inner'
                      }`}>
                        {chatHistory.length ? (
                          chatHistory.map((message, index) => (
                            <div key={`${message.role}-${index}`} className={`rounded-3xl p-4 transition-all duration-300 ${
                              message.role === 'assistant' 
                                ? (isDarkMode ? 'bg-slate-800/80 text-slate-100' : 'bg-slate-100 text-slate-800 border border-slate-200') 
                                : (isDarkMode ? 'bg-slate-950/90 text-slate-200' : 'bg-sky-50 text-slate-900 border border-sky-100')
                            }`}>
                              <p className={`text-xs uppercase tracking-[0.3em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{message.role === 'assistant' ? 'AI' : 'User'}</p>
                              <p className="mt-2 break-words text-sm leading-6">{message.text}</p>
                            </div>
                          ))
                        ) : (
                          <p className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>Mulai percakapan dengan AI untuk mendapatkan saran teknis atau root cause.</p>
                        )}
                      </div>
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={chatInput}
                          onChange={(event) => setChatInput(event.target.value)}
                          rows={3}
                          placeholder={selectedTicket ? `Tanyakan tentang tiket ${selectedTicket.ticket_no}` : 'Ketik pertanyaan AI...'}
                          className={`w-full rounded-3xl border px-4 py-3 text-sm outline-none transition-all ${
                            isDarkMode 
                              ? 'border-white/10 bg-slate-950/90 text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20' 
                              : 'border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 shadow-sm'
                          }`}
                        />
                        <button
                          onClick={handleSendChat}
                          className="w-full rounded-3xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 active:scale-[0.98]"
                          type="button"
                        >
                          Kirim ke AI
                        </button>
                      </div>
                    </div>
                  </div>
                  </div>
                  
                  {/* 3. Issue & Trend Analytics */}
                  <div className={`p-4 rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                      ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                      : 'border-slate-200 bg-white shadow-lg'
                  }`}>
                    <h2 className={`text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Issue & Trend Analytics</h2>
                    <p className={`mt-1.5 text-xs transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tren severity dan kategori tiket berdasarkan data nyata dari database.</p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <h3 className={`text-sm font-semibold transition-colors ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Severity Trends</h3>
                        <div className="mt-4 space-y-3">
                          {severityTrends.length ? (
                            severityTrends.map((trend: any) => {
                              const count = trend.count || 0
                              const max = Math.max(...severityTrends.map((item: any) => item.count), 1)
                              return (
                                <div key={trend.severity} className="space-y-2">
                                  <div className={`flex items-center justify-between text-sm transition-colors ${isDarkMode ? 'text-slate-300' : 'text-slate-650'}`}>
                                    <span className="capitalize">{trend.severity}</span>
                                    <span>{count} tiket</span>
                                  </div>
                                  <div className={`h-2 overflow-hidden rounded-full ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100 border border-slate-200/80'}`}>
                                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(8, (count / max) * 100))}%` }} />
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada tren severity untuk ditampilkan.</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className={`text-sm font-semibold transition-colors ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Top Categories</h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {categoryTrends.length ? (
                            categoryTrends.map((trend: any) => (
                              <div key={trend.category} className={`rounded-3xl border p-4 transition-all duration-300 ${
                                isDarkMode ? 'border-white/10 bg-slate-900/80' : 'border-slate-200 bg-slate-50'
                              }`}>
                                <p className="text-sm font-semibold">{trend.category}</p>
                                <p className={`mt-2 text-3xl font-semibold ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>{trend.count}</p>
                                <p className={`mt-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket dengan kategori ini.</p>
                              </div>
                            ))
                          ) : (
                            <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada kategori tiket untuk ditampilkan.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={`p-4 rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                      ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                      : 'border-slate-200 bg-white shadow-lg'
                  }`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className={`text-xl font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Human-in-the-Loop Control</h2>
                        <p className={`mt-2 text-sm transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ambil alih percakapan AI dan gunakan rekomendasi sebagai asisten Anda.</p>
                      </div>
                      <button
                        onClick={handleTakeOver}
                        className="rounded-3xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 active:scale-[0.98]"
                        type="button"
                      >
                        Take Over
                      </button>
                    </div>
                    {selectedTicket ? (
                      <div className={`mt-6 space-y-3 rounded-3xl border p-4 transition-all duration-300 ${
                        isDarkMode ? 'border-cyan-500/25 bg-slate-950/80 shadow-[0_0_10px_rgba(0,210,255,0.05)]' : 'border-slate-200 bg-slate-50'
                      }`}>
                        <p className={`text-xs uppercase tracking-[0.28em] ${isDarkMode ? 'text-cyan-400 font-semibold' : 'text-slate-500'}`}>Tiket Terpilih</p>
                        <p className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{selectedTicket.title}</p>
                        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status: {selectedTicket.status} • Severity: {selectedTicket.severity}</p>
                        <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          {(() => {
                            const { text, attachmentUrl } = parseDescription(selectedTicket.description);
                            return (
                              <>
                                <span className="block whitespace-pre-wrap">{text}</span>
                                {attachmentUrl && (
                                  <div className="mt-4 p-3 bg-slate-950/40 rounded-xl border border-dashed border-slate-700">
                                    <span className="text-xs text-slate-400 block mb-2 font-medium">Lampiran File:</span>
                                    {isImage(attachmentUrl) ? (
                                      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-block group overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                                        <img 
                                          src={attachmentUrl} 
                                          alt="Lampiran Tiket" 
                                          className="max-h-64 object-contain transition-transform duration-300 group-hover:scale-105"
                                        />
                                      </a>
                                    ) : (
                                      <a 
                                        href={attachmentUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sky-400 text-sm font-semibold transition-all"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Unduh Lampiran ({attachmentUrl.split('/').pop()})
                                      </a>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </p>
                      </div>
                    ) : (
                      <div className={`mt-6 rounded-3xl border p-4 transition-all duration-300 ${
                        isDarkMode 
                          ? 'border-cyan-500/25 bg-slate-950/80 text-slate-400 shadow-[0_0_10px_rgba(0,210,255,0.05)]' 
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}>
                        Pilih tiket dari antrean untuk melihat detail dan melakukan intervensi.
                      </div>
                    )}
                    {ticketActionMessage && (
                      <p className={`mt-4 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{ticketActionMessage}</p>
                    )}
                  </div>

                  <div className={`p-4 rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                      ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                      : 'border-slate-200 bg-white shadow-lg'
                  }`}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className={`text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Knowledge Base & AI Training</h2>
                        <p className={`mt-1.5 text-xs transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sinkronkan KB, lihat gap konten, dan latih AI dengan data nyata.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncKB}
                        className="rounded-3xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 active:scale-[0.98]"
                        disabled={isSyncing}
                      >
                        {isSyncing ? 'Sync...' : 'Sync KB'}
                      </button>
                    </div>
                    <div className="mt-6 grid gap-3">
                      {unresolvedIntents.length ? (
                        unresolvedIntents.slice(0, 4).map((ticket) => (
                          <div key={ticket.id} className={`rounded-3xl border p-4 transition-all duration-300 ${
                            isDarkMode ? 'border-cyan-500/25 bg-slate-950/80 shadow-[0_0_10px_rgba(0,210,255,0.05)]' : 'border-slate-200 bg-slate-50'
                          }`}>
                            <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{ticket.title}</p>
                            <p className={`mt-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{ticket.description}</p>
                          </div>
                        ))
                      ) : (
                        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada ticket 'need_approval' atau tiket terbuka yang belum ditangani.</p>
                      )}
                    </div>
                  </div>

                  <div className={`p-4 rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                      ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                      : 'border-slate-200 bg-white shadow-lg'
                  }`}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className={`text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Database Management & Cleanup</h2>
                        <p className={`mt-1.5 text-xs transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Reset database tiket, komentar, notifikasi, dan percakapan AI agar bersih dari awal.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetDatabaseClick}
                        className="rounded-3xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700 active:scale-[0.98]"
                        disabled={isResetting}
                      >
                        {isResetting ? 'Resetting...' : 'Reset Database'}
                      </button>
                    </div>
                  </div>


                  {/* 4. REAL-TIME ACTIVITY STREAM */}
                  <div className={`p-4 rounded-3xl border transition-all duration-300 ${
                    isDarkMode 
                      ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                      : 'border-slate-200 bg-white shadow-lg'
                  }`}>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                      <h2 className={`text-lg font-semibold transition-colors flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        Aktivitas Terbaru
                      </h2>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Realtime</span>
                    </div>

                    <div className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-1">
                      {recentActivities.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-8 text-center">Belum ada aktivitas terbaru.</p>
                      ) : (
                        recentActivities.map((act: any) => {
                          const actionConfig: Record<string, { icon: string; dotColor: string; textColor: string }> = {
                            ticket_created:  { icon: '🎫', dotColor: 'bg-sky-400',     textColor: 'text-sky-400'     },
                            ticket_assigned: { icon: '👤', dotColor: 'bg-indigo-400',  textColor: 'text-indigo-400'  },
                            ticket_resolved: { icon: '✅', dotColor: 'bg-emerald-400', textColor: 'text-emerald-400' },
                            ticket_closed:   { icon: '🔒', dotColor: 'bg-slate-400',   textColor: 'text-slate-400'   },
                            comment_added:   { icon: '💬', dotColor: 'bg-amber-400',   textColor: 'text-amber-400'   },
                            presence_update: { icon: '🟢', dotColor: 'bg-violet-400',  textColor: 'text-violet-400'  },
                          }
                          const cfg = actionConfig[act.action] || { icon: '•', dotColor: 'bg-slate-500', textColor: 'text-slate-500' }

                          return (
                            <div key={act.id} className="text-xs flex gap-3 items-start group hover:bg-slate-50 dark:hover:bg-white/[0.03] rounded-xl px-2 py-1.5 -mx-2 transition-all">
                              <span className="mt-0.5 text-sm shrink-0 select-none">{cfg.icon}</span>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className={`font-medium leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{act.text}</p>
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold uppercase tracking-wide ${cfg.textColor}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                                    {act.action?.replace(/_/g, ' ')}
                                  </span>
                                  <span className="text-[10px] text-slate-500">·</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{act.time}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
  )
}
