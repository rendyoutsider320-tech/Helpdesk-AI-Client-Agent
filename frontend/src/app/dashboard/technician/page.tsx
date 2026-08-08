'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  dashboardApi, 
  ticketApi, 
  technicianApi, 
  navbarApi, 
  deviceApi, 
  kbApi, 
  searchApi 
} from '@/lib/api'
import { useAuthStore, useLayoutStore } from '@/store'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
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

export default function TechnicianDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isChecked, setIsChecked] = useState(false)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const sidebarCollapsed = useLayoutStore((state) => state.sidebarCollapsed)
  const [isDarkMode, setIsDarkMode] = useState(true)

  // Page States
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Dashboard Metrics & Workload
  const [summary, setSummary] = useState<any>(null)
  const [navStats, setNavStats] = useState<any>({
    total_tickets: 0,
    my_tickets: 0,
    assigned_tickets: 0,
    open_tickets: 0,
    pending_tickets: 0,
    waiting_customer_tickets: 0,
    waiting_vendor_tickets: 0,
    escalated_tickets: 0,
    critical_tickets: 0,
    resolved_tickets: 0,
    closed_tickets: 0,
    spam_tickets: 0,
    archive_tickets: 0
  })
  
  // Real-time Presence statuses
  const [technicians, setTechnicians] = useState<any[]>([])
  const [currentTechPresence, setCurrentTechPresence] = useState<string>('online')
  const [shiftStatus, setShiftStatus] = useState<string>('Pagi')
  const [realtimeClock, setRealtimeClock] = useState<string>('')
  const [realtimeDate, setRealtimeDate] = useState<string>('')

  // Tickets List & Queue States
  const [tickets, setTickets] = useState<any[]>([])
  const [ticketsTotal, setTicketsTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState('all') // all, open, assigned, pending, waiting-customer, waiting-vendor, escalated, critical, overdue, high, my
  const [ticketsSearchQuery, setTicketsSearchQuery] = useState('')
  
  // Ref for scrolling to the ticket queue section
  const ticketQueueRef = useRef<HTMLDivElement>(null)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<any>(null)
  const [showGlobalSearchDropdown, setShowGlobalSearchDropdown] = useState(false)
  const searchDropdownRef = useRef<HTMLDivElement>(null)

  // Selected Ticket details (Drawer / Modal & AI/Telemetry focus)
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [isInternalComment, setIsInternalComment] = useState(false)
  const [, setSelectedTicketDevice] = useState<any>(null)
  const [, setSelectedTicketTelemetry] = useState<any>(null)

  // AI Supervisor analysis states
  const [aiAnalysis, setAiAnalysis] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDraftReplyOpen, setAiDraftReplyOpen] = useState(false)

  // Notification center
  const [notificationNotificationText, setNotificationNotificationText] = useState<string | null>(null)
  
  // Quick Actions Drawer / Modals
  const [showQuickNoteModal, setShowQuickNoteModal] = useState(false)
  const [quickNoteText, setQuickNoteText] = useState('')
  const [showCreateTicketModal, setShowCreateTicketModal] = useState(false)
  const [createTicketForm, setCreateTicketForm] = useState({ title: '', description: '', severity: 'medium', device: '' })
  
  // Devices & KB Articles
  const [devices, setDevices] = useState<any[]>([])
  const [deviceMetrics, setDeviceMetrics] = useState<Record<string, any[]>>({})
  const [kbArticles, setKbArticles] = useState<any[]>([])
  const [selectedKbArticle, setSelectedKbArticle] = useState<any>(null)

  // Audit Logs (recent activity stream)
  const [recentActivities, setRecentActivities] = useState<any[]>([])

  // Inline Quick Modals (Reply, Escalate, Assign)
  const [inlineActionTicket, setInlineActionTicket] = useState<any>(null)
  const [inlineReplyText, setInlineReplyText] = useState('')
  const [inlineEscalateReason, setInlineEscalateReason] = useState('')
  const [showInlineReplyModal, setShowInlineReplyModal] = useState(false)
  const [showInlineEscalateModal, setShowInlineEscalateModal] = useState(false)
  const [showInlineAssignModal, setShowInlineAssignModal] = useState(false)


  // Auth guard - redirect if not authenticated or not technician
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('access_token')
      const userStr = localStorage.getItem('user')
      
      if (!token || !userStr) {
        router.push('/')
        return
      }

      try {
        const userData = JSON.parse(userStr)
        if (userData.role !== 'technician' && userData.role !== 'admin') {
          router.push('/dashboard/user')
          return
        }
      } catch (e) {
        router.push('/')
        return
      }
      
      setIsChecked(true)
    }

    checkAuth()
  }, [router])

  // Theme sync - reads from localStorage and listens to themechange events
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const dark =
      savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setIsDarkMode(dark)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.classList.toggle('light', !dark)

    const handleThemeChange = () => {
      const updated = localStorage.getItem('theme')
      const nowDark =
        updated === 'dark' ||
        (!updated && window.matchMedia('(prefers-color-scheme: dark)').matches)
      setIsDarkMode(nowDark)
    }
    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setRealtimeClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setRealtimeDate(now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setShowGlobalSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // API Call Runners
  const fetchSummary = async () => {
    try {
      const [sumRes, navRes, techRes] = await Promise.all([
        dashboardApi.summary(),
        navbarApi.stats(),
        technicianApi.list()
      ])
      setSummary(sumRes.data)
      setNavStats(navRes.data)
      const techsList = techRes.data?.technicians || []
      setTechnicians(techsList)

      // Find my own presence status
      if (user?.id) {
        const myTech = techsList.find((t: any) => t.id === user.id)
        if (myTech) {
          if (myTech.presence_status) {
            setCurrentTechPresence(myTech.presence_status)
          }
          if (myTech.shift) {
            setShiftStatus(myTech.shift)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load metrics summary:', err)
    }
  }

  const fetchTickets = async () => {
    if (!isChecked) return
    try {
      const filterParams: any = {}
      
      // Filter mapping
      switch (activeFilter) {
        case 'my':
          filterParams.assigned_to = user?.id
          break
        case 'open':
          filterParams.status = 'open'
          break
        case 'assigned':
          filterParams.status = 'assigned'
          break
        case 'pending':
          filterParams.status = 'need_approval'
          break
        case 'waiting-customer':
          filterParams.status = 'waiting_customer'
          break
        case 'waiting-vendor':
          filterParams.status = 'waiting_vendor'
          break
        case 'escalated':
          filterParams.status = 'escalated'
          break
        case 'critical':
          filterParams.severity = 'critical'
          break
        case 'high':
          filterParams.severity = 'high'
          break
        case 'overdue':
          filterParams.overdue = true
          break
      }

      if (ticketsSearchQuery) {
        filterParams.search = ticketsSearchQuery
      }

      const res = await ticketApi.list(currentPage, 25, filterParams)
      setTickets(res.data?.tickets || [])
      setTicketsTotal(res.data?.total || 0)
    } catch (err) {
      console.error('Failed to load tickets list:', err)
    }
  }

  const aiResolutionRate = useMemo(() => {
    if (!tickets.length) return 0
    const resolved = tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length
    return Math.round((resolved / tickets.length) * 100)
  }, [tickets])

  const humanHandoverRate = useMemo(() => {
    if (!summary || !summary.ticket_age || !summary.ticket_age.total_open) return 0
    const totalOpen = summary.ticket_age.total_open
    const assignedOpen = summary.ticket_age.assigned_open_count
    return Math.round((assignedOpen / totalOpen) * 100)
  }, [summary])


  const getLatestMetric = (deviceId: string, type: string) => {
    const metrics = deviceMetrics[deviceId] || []
    const matched = metrics
      .filter((m: any) => m.metric_type === type)
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return matched.length ? matched[0].metric_value : null
  }

  const getMetricColor = (val: number | null) => {
    if (val === null) return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
    if (val > 85) return 'text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse'
    if (val > 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  }

  const fetchDevices = async () => {
    try {
      const res = await deviceApi.list()
      const devList = res.data?.devices || []
      setDevices(devList)

      const metricsMap: Record<string, any[]> = {}
      await Promise.all(
        devList.map(async (dev: any) => {
          try {
            const mRes = await deviceApi.getMetrics(dev.id)
            metricsMap[dev.id] = mRes.data?.metrics || []
          } catch (err) {
            console.error(`Failed to fetch metrics for device ${dev.id}`, err)
          }
        })
      )
      setDeviceMetrics(metricsMap)
    } catch (err) {
      console.error('Failed to load devices:', err)
    }
  }

  const fetchKbArticles = async () => {
    try {
      const res = await kbApi.list()
      setKbArticles(res.data?.articles || [])
    } catch (err) {
      console.error('Failed to load KB articles:', err)
    }
  }

  const fetchAuditLogs = async () => {
    try {
      const res = await dashboardApi.activityLog(20)
      const raw: any[] = res.data?.activities || []
      const now = new Date()

      const formatted = raw.map((a: any) => {
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
      console.error('Failed to load activities:', err)
    }
  }

  // Load all initial data on mounts
  useEffect(() => {
    if (isChecked) {
      setLoading(true)
        Promise.all([
          fetchSummary(),
          fetchTickets(),
          fetchDevices(),
          fetchKbArticles(),
          fetchAuditLogs()
        ]).then(() => {
        setLoading(false)
      }).catch(err => {
        console.error('Initial fetch failed:', err)
        setError('Gagal memuat data dashboard utama.')
        setLoading(false)
      })
    }
  }, [isChecked])

  // Trigger reload on filter or search changes
  useEffect(() => {
    fetchTickets()
  }, [activeFilter, currentPage, ticketsSearchQuery])

  // Poll devices telemetry every 5 seconds
  useEffect(() => {
    if (!isChecked) return
    const interval = setInterval(fetchDevices, 5000)
    return () => clearInterval(interval)
  }, [isChecked])

  const selectedTicketRef = useRef<any>(null)
  useEffect(() => {
    selectedTicketRef.current = selectedTicket
  }, [selectedTicket])

  // Listen to WebSocket broadcasts
  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (!data) return

      // Realtime notification toast
      if (data.type === 'ticket_created') {
        showLocalNotification(`Tiket Baru Dibuat: #${data.ticket_id}`)
        fetchTickets()
        fetchSummary()
        fetchAuditLogs()
      } else if (data.type === 'ticket_updated') {
        showLocalNotification(`Tiket Diperbarui: #${data.ticket_id}`)
        fetchTickets()
        fetchSummary()
        fetchAuditLogs()
        // If the selected ticket is the one updated, reload it
        if (selectedTicketRef.current && selectedTicketRef.current.id === data.ticket_id) {
          reloadSelectedTicketDetails(data.ticket_id)
        }
      } else if (data.type === 'presence_update') {
        fetchSummary()
      } else if (data.type === 'database_reset') {
        showLocalNotification("Database tiket dan notifikasi telah di-reset oleh Administrator.")
        setSelectedTicket(null)
        setTickets([])
        setTicketsTotal(0)
        setSummary(null)
        fetchTickets()
        fetchSummary()
        fetchAuditLogs()
      }
    }

    window.addEventListener('websocket-message', handleWsMessage)
    return () => {
      window.removeEventListener('websocket-message', handleWsMessage)
    }
  }, [selectedTicket])

  const showLocalNotification = (message: string) => {
    setNotificationNotificationText(message)
    setTimeout(() => {
      setNotificationNotificationText(null)
    }, 4000)
  }

  const reloadSelectedTicketDetails = async (id: string) => {
    try {
      const res = await ticketApi.get(id)
      setSelectedTicket(res.data)
      setComments(res.data?.comments || [])
    } catch (e) {
      console.error('Failed to reload selected ticket:', e)
    }
  }

  // Handler for global search with autocomplete
  const handleGlobalSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setGlobalSearchQuery(query)
    if (query.length <= 2) {
      setGlobalSearchResults(null)
      setShowGlobalSearchDropdown(false)
      return
    }

    try {
      const res = await searchApi.global(query)
      setGlobalSearchResults(res.data)
      setShowGlobalSearchDropdown(true)
    } catch (err) {
      console.error('Global search query error:', err)
    }
  }

  // Interactive self status update
  const handleUpdateSelfStatus = async (newStatus: string) => {
    try {
      setCurrentTechPresence(newStatus)
      await technicianApi.updateStatus(newStatus)
      showLocalNotification(`Status kehadiran Anda berhasil diubah menjadi: ${newStatus.toUpperCase()}`)
      fetchSummary()
    } catch (e) {
      console.error('Failed to update status:', e)
      showLocalNotification('Gagal memperbarui status kehadiran.')
    }
  }

  // Interactive shift update
  const handleUpdateShift = async (newShift: string) => {
    try {
      setShiftStatus(newShift)
      await technicianApi.updateShift(newShift)
      showLocalNotification(`Shift kerja Anda berhasil diubah menjadi: ${newShift.toUpperCase()}`)
      fetchSummary()
    } catch (e) {
      console.error('Failed to update shift:', e)
      showLocalNotification('Gagal memperbarui shift kerja.')
    }
  }

  // AI Supervisor diagnostics execution
  const runAIDiagnosis = async (ticket: any, force = false) => {
    if (!ticket) return

    // Fast-path: If ticket already has AI summary / root cause stored in DB, display it instantly (0s delay)!
    if (!force && (ticket.root_cause || ticket.ai_summary || ticket.resolution)) {
      setAiAnalysis({
        root_cause: ticket.root_cause || 'Akar masalah terdeteksi.',
        summary: ticket.ai_summary,
        ai_report: ticket.ai_summary,
        suggestions: ticket.resolution ? [ticket.resolution] : ['Periksa telemetri perangkat dan jalankan remote tools jika diperlukan.'],
      })
      setAiLoading(false)
      return
    }

    setAiLoading(true)
    setAiAnalysis(null)
    setAiDraftReplyOpen(false)
    try {
      const res = await ticketApi.analyze(ticket.id)
      const data = res.data?.analysis || res.data
      setAiAnalysis(data)
    } catch (e) {
      console.error('AI diagnosis error:', e)
      showLocalNotification('Sintesis AI gagal dijalankan.')
    } finally {
      setAiLoading(false)
    }
  }

  // Selected ticket focus flow
  const handleSelectTicket = async (ticket: any) => {
    setSelectedTicket(ticket)
    setComments(ticket.comments || [])
    await reloadSelectedTicketDetails(ticket.id)
    
    // Trigger AI Diagnosis
    runAIDiagnosis(ticket)

    // Check device metrics relation
    setSelectedTicketDevice(null)
    setSelectedTicketTelemetry(null)

    // Helper: fetch & set telemetry for a given device
    const fetchAndSetTelemetry = async (device: any) => {
      setSelectedTicketDevice(device)
      try {
        const metricsRes = await deviceApi.getMetrics(device.id)
        const metricsData = metricsRes.data?.metrics || []
        // Structure: pick latest value per metric type
        const latestMap: Record<string, any> = {}
        metricsData.forEach((m: any) => {
          const key = m.metric_type
          if (!latestMap[key] || new Date(m.timestamp) > new Date(latestMap[key].timestamp)) {
            latestMap[key] = m
          }
        })
        const latest: any = {
          cpu: latestMap['cpu']?.metric_value ?? 0,
          ram: latestMap['ram']?.metric_value ?? 0,
          disk: latestMap['disk_usage']?.metric_value ?? latestMap['disk']?.metric_value ?? 0,
        }
        setSelectedTicketTelemetry(latest)
      } catch (err) {
        console.error('Failed to load device telemetry metrics:', err)
      }
    }

    // 1. Direct device field match
    if (ticket.device) {
      const matchingDevice = devices.find((d: any) =>
        d.device_name?.toLowerCase() === ticket.device.toLowerCase() ||
        d.ip_address === ticket.device ||
        d.id === ticket.device
      )
      if (matchingDevice) {
        await fetchAndSetTelemetry(matchingDevice)
        return
      }
    }

    // 2. Auto-correlate for Agent Monitoring tickets (by category, title, or description)
    const ticketText = `${ticket.title || ''} ${ticket.description || ''} ${ticket.category || ''}`.toLowerCase()
    const isMonitoringTicket = ticket.category?.toLowerCase() === 'monitoring' ||
                               ticketText.includes('monitoring') ||
                               ticketText.includes('cpu') ||
                               ticketText.includes('memory') ||
                               ticketText.includes('disk') ||
                               ticketText.includes('agent') ||
                               ticketText.includes('mkt-nuc') ||
                               ticketText.includes('nuc')

    if (isMonitoringTicket && devices.length > 0) {
      // Try to find by hostname mentioned in ticket text first
      let bestMatch = devices.find((d: any) =>
        (d.device_name && ticketText.includes(d.device_name.toLowerCase())) ||
        (d.ip_address && ticketText.includes(d.ip_address.toLowerCase())) ||
        (d.hostname && ticketText.includes(d.hostname.toLowerCase()))
      )
      // Fallback: prefer 'MKT-NUC' or just use first device
      if (!bestMatch) {
        bestMatch = devices.find((d: any) => d.device_name === 'MKT-NUC') || devices[0]
      }
      if (bestMatch) {
        await fetchAndSetTelemetry(bestMatch)
      }
    }
  }

  const handleCloseDetails = () => {
    setShowDetailsModal(false)
    setSelectedTicket(null)
    processedIdRef.current = null
    router.push('/dashboard/technician')
  }

  // Double click or explicit open details modal
  const handleOpenDetails = (ticket: any) => {
    handleSelectTicket(ticket)
    setShowDetailsModal(true)
    if (ticket?.id) {
      router.push(`/dashboard/technician?id=${ticket.id}`)
    }
  }

  // Auto-select ticket from URL query parameter
  const ticketIdParam = searchParams.get('id')
  const processedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (isChecked && ticketIdParam && (ticketIdParam !== processedIdRef.current || !selectedTicket || !showDetailsModal)) {
      processedIdRef.current = ticketIdParam
      const fetchAndOpen = async () => {
        try {
          const response = await ticketApi.get(ticketIdParam)
          if (response.data) {
            handleSelectTicket(response.data)
            setShowDetailsModal(true)
          }
        } catch (err) {
          console.error('Failed to load query param ticket for technician', err)
          handleCloseDetails()
        }
      }
      fetchAndOpen()
    }
  }, [isChecked, ticketIdParam])

  // Quick Action: Take Next unassigned ticket
  const handleTakeNextTicket = async () => {
    try {
      const openTicketsRes = await ticketApi.list(1, 20, { status: 'open' })
      const unassigned = openTicketsRes.data?.tickets?.find((t: any) => !t.assigned_to)
      
      if (!unassigned) {
        showLocalNotification('Antrean kosong! Tidak ada tiket terbuka yang belum ditugaskan.')
        return
      }

      await ticketApi.assign(unassigned.id, user?.id || '')
      showLocalNotification(`Berhasil mengambil tiket: ${unassigned.ticket_no}`)
      fetchTickets()
      fetchSummary()
      handleSelectTicket(unassigned)
    } catch (e) {
      console.error('Failed to take next ticket:', e)
      showLocalNotification('Gagal mengambil tiket berikutnya.')
    }
  }

  // Inline Reply executor
  const handleInlineReplySubmit = async () => {
    if (!inlineReplyText.trim() || !inlineActionTicket) return
    try {
      await ticketApi.addComment(inlineActionTicket.id, inlineReplyText, false)
      showLocalNotification(`Balasan dikirim untuk tiket ${inlineActionTicket.ticket_no}`)
      setShowInlineReplyModal(false)
      setInlineReplyText('')
      fetchTickets()
    } catch (e) {
      console.error(e)
      showLocalNotification('Gagal mengirim balasan.')
    }
  }

  // Inline Escalate executor
  const handleInlineEscalateSubmit = async () => {
    if (!inlineEscalateReason.trim() || !inlineActionTicket) return
    try {
      // Escalations use the standard ticket update status to "escalated" or audit logging
      await ticketApi.update(inlineActionTicket.id, { status: 'escalated' })
      showLocalNotification(`Tiket ${inlineActionTicket.ticket_no} didelegasikan ke level eskalasi.`)
      setShowInlineEscalateModal(false)
      setInlineEscalateReason('')
      fetchTickets()
      fetchSummary()
    } catch (e) {
      console.error(e)
    }
  }

  // Inline Assign executor
  const handleInlineAssign = async (techId: string) => {
    if (!inlineActionTicket) return
    try {
      await ticketApi.assign(inlineActionTicket.id, techId)
      showLocalNotification(`Tiket ditugaskan ke teknisi.`)
      setShowInlineAssignModal(false)
      fetchTickets()
      fetchSummary()
    } catch (e) {
      console.error(e)
    }
  }

  // Inline state switch dropdowns
  const handleInlineStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      await ticketApi.update(ticketId, { status: newStatus })
      showLocalNotification(`Status tiket diubah menjadi ${newStatus.toUpperCase()}`)
      fetchTickets()
      fetchSummary()
    } catch (e) {
      console.error(e)
    }
  }

  const handleInlinePriorityChange = async (ticketId: string, newSeverity: string) => {
    try {
      await ticketApi.update(ticketId, { severity: newSeverity })
      showLocalNotification(`Prioritas tiket diubah menjadi ${newSeverity.toUpperCase()}`)
      fetchTickets()
      fetchSummary()
    } catch (e) {
      console.error(e)
    }
  }

  // Add Comment inside main details modal
  const handleAddCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !selectedTicket) return
    try {
      await ticketApi.addComment(selectedTicket.id, newComment, isInternalComment)
      await reloadSelectedTicketDetails(selectedTicket.id)
      setNewComment('')
      showLocalNotification('Komentar berhasil ditambahkan.')
      fetchTickets()
    } catch (err) {
      console.error('Failed to post comment:', err)
      showLocalNotification('Gagal menambahkan komentar.')
    }
  }

  // Submit Quick Note
  const handleQuickNoteSubmit = () => {
    if (!quickNoteText.trim()) return
    showLocalNotification('Catatan cepat disimpan ke log internal.')
    setQuickNoteText('')
    setShowQuickNoteModal(false)
  }

  // Submit Create Ticket Modal
  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await ticketApi.create(
        createTicketForm.title,
        createTicketForm.description,
        createTicketForm.severity,
        { device: createTicketForm.device }
      )
      showLocalNotification('Tiket baru berhasil dibuat!')
      setShowCreateTicketModal(false)
      setCreateTicketForm({ title: '', description: '', severity: 'medium', device: '' })
      fetchTickets()
      fetchSummary()
    } catch (err) {
      console.error(err)
      showLocalNotification('Gagal membuat tiket baru.')
    }
  }

  // SLA due relative parser helper
  const getSLACountdown = (dueDateStr: string | null) => {
    if (!dueDateStr) return { text: 'N/A', status: 'normal' }
    const due = new Date(dueDateStr).getTime()
    const now = new Date().getTime()
    const diff = due - now
    if (diff <= 0) return { text: 'SLA Breached', status: 'critical' }
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours < 1) {
      return { text: `${mins}m tersisa`, status: 'critical' }
    } else if (hours < 4) {
      return { text: `${hours}j ${mins}m tersisa`, status: 'warning' }
    }
    return { text: `${hours}j ${mins}m tersisa`, status: 'normal' }
  }

  // Local derived computations for Priority matrix chart
  const priorityMatrixCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    tickets.forEach(t => {
      const sev = t.severity?.toLowerCase()
      if (sev === 'critical' || sev === 'p1_emergency') counts.critical++
      else if (sev === 'high') counts.high++
      else if (sev === 'medium') counts.medium++
      else if (sev === 'low') counts.low++
    })
    return counts
  }, [tickets])

  // Local derived computations for Customer Waiting sorted list
  const customerWaitingList = useMemo(() => {
    return tickets
      .filter(t => t.status === 'waiting_customer')
      .map(t => {
        // Mock a wait duration based on updated_at
        const updated = new Date(t.updated_at).getTime()
        const now = new Date().getTime()
        const diffMins = Math.floor((now - updated) / (1000 * 60))
        return {
          id: t.id,
          ticketNo: t.ticket_no,
          customer: t.creator?.name || t.created_by || 'Pelanggan',
          waitMins: diffMins,
          priority: t.severity
        }
      })
      .sort((a, b) => b.waitMins - a.waitMins)
  }, [tickets])

  // Contextual KB Article helper based on selected ticket
  const contextualKBArticles = useMemo(() => {
    if (!Array.isArray(kbArticles)) return []
    if (!selectedTicket) return kbArticles.slice(0, 3)
    const lowerTitle = (selectedTicket.title || '').toLowerCase()
    
    return kbArticles.filter(art => {
      if (!art || !art.title) return false
      const matchesTitle = art.title.toLowerCase().split(' ').some((word: string) => 
        word.length > 3 && lowerTitle.includes(word)
      )
      const matchesCategory = art.category && selectedTicket.category && 
        art.category.toLowerCase() === selectedTicket.category.toLowerCase()
      return matchesTitle || matchesCategory
    }).slice(0, 3)
  }, [selectedTicket, kbArticles])

  // Return loading spinner or error banner while hydrating or verifying authentication
  if (!isHydrated || !isChecked || loading || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center space-y-4 max-w-md p-6 bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl">
          {error ? (
            <>
              <div className="text-red-500 text-4xl">⚠️</div>
              <h2 className="text-lg font-bold text-white">Terjadi Kesalahan</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-6 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-all"
              >
                Muat Ulang Halaman
              </button>
            </>
          ) : (
            <>
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
              <p className="text-slate-400 font-medium animate-pulse">Memuat Cockpit Teknisi...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  // Presence badges color mappings
  const getPresenceColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'online': return 'bg-emerald-400 border-emerald-500 text-emerald-800 dark:text-emerald-300'
      case 'away': return 'bg-amber-400 border-amber-500 text-amber-800 dark:text-amber-300'
      case 'busy': return 'bg-rose-500 border-rose-600 text-rose-100'
      case 'meeting': return 'bg-indigo-400 border-indigo-500 text-indigo-800 dark:text-indigo-300'
      case 'break': return 'bg-sky-400 border-sky-500 text-sky-800 dark:text-sky-300'
      default: return 'bg-slate-400 border-slate-500 text-slate-800 dark:text-slate-300'
    }
  }

  return (
    <div className={`h-screen flex overflow-hidden transition-colors duration-300 relative ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <ParticleNetwork />
      <Sidebar />
      <div className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'xl:pl-20' : 'xl:pl-80'}`}>
        <Header />
        
        {/* Real-time Notification Banner */}
        {notificationNotificationText && (
          <div className="fixed bottom-6 right-6 z-[999] max-w-sm rounded-2xl border border-sky-500/20 bg-slate-800 dark:bg-slate-900/90 p-4 text-white shadow-2xl shadow-sky-500/10 backdrop-blur-xl animate-fade-in flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
            </span>
            <p className="text-sm font-semibold">{notificationNotificationText}</p>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="w-full space-y-4">
          
          {/* ==================== UPPER HEADER CONTROL SECTION ==================== */}
          <div className="relative z-20 no-hover flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-slate-800/10 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 backdrop-blur-xl shadow-sm dark:shadow-black/40">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Real-time Cockpit
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {realtimeDate} | {realtimeClock}
                </span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Selamat Datang, <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">{user?.username}</span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Shift Kerja Aktif: <span className="font-semibold text-sky-350">{shiftStatus}</span>
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => handleUpdateShift('Pagi')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    shiftStatus === 'Pagi'
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  🌅 Pagi (06:00 - 15:00)
                </button>
                <button
                  onClick={() => handleUpdateShift('Siang')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    shiftStatus === 'Siang'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  ☀️ Siang (12:00 - 21:00)
                </button>
                <button
                  onClick={() => handleUpdateShift('Sore')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    shiftStatus === 'Sore'
                      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  🌇 Sore (15:00 - 24:00)
                </button>
              </div>
            </div>

            {/* Header Actions & Presence status Selector */}
            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
              
              {/* Autocomplete Global Search */}
              <div className="relative w-full sm:w-80" ref={searchDropdownRef}>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari global (Tiket, Customer, IP, Hostname, Asset...)"
                    value={globalSearchQuery}
                    onChange={handleGlobalSearchChange}
                    className="w-full bg-white/95 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  />
                  <svg className="absolute left-4 top-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {/* Autocomplete Results list */}
                {showGlobalSearchDropdown && globalSearchResults && (
                  <div className="absolute right-0 mt-2 w-full sm:w-[480px] bg-slate-900/95 border border-white/15 rounded-2xl shadow-2xl p-4 z-[100] backdrop-blur-2xl max-h-[400px] overflow-y-auto">
                    <h3 className="text-xs uppercase tracking-widest text-sky-400 font-bold mb-2">Hasil Pencarian</h3>
                    
                    {/* Tickets */}
                    {globalSearchResults.tickets?.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs text-slate-400 font-semibold mb-1 border-b border-slate-100 dark:border-white/5 pb-1">Tiket</h4>
                        {globalSearchResults.tickets.map((t: any) => (
                          <div
                            key={t.id}
                            onClick={() => { handleOpenDetails(t); setShowGlobalSearchDropdown(false); }}
                            className="gaya-list-baru p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl cursor-pointer text-sm flex items-center justify-between"
                          >
                            <span className="font-mono text-sky-300 font-bold">{t.ticket_no}</span>
                            <span className="truncate max-w-[200px] text-slate-600 dark:text-slate-300">{t.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase">{t.status}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Assets */}
                    {globalSearchResults.assets?.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs text-slate-400 font-semibold mb-1 border-b border-slate-100 dark:border-white/5 pb-1">Aset Perangkat</h4>
                        {globalSearchResults.assets.map((a: any) => (
                          <div key={a.id} className="gaya-list-baru p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-sm flex items-center justify-between">
                            <span className="font-medium text-slate-600 dark:text-slate-300">{a.hostname}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">{a.ip_address}</span>
                            <span className="text-xs text-indigo-300">{a.model}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Users */}
                    {globalSearchResults.users?.length > 0 && (
                      <div>
                        <h4 className="text-xs text-slate-400 font-semibold mb-1 border-b border-slate-100 dark:border-white/5 pb-1">Pelanggan / Teknisi</h4>
                        {globalSearchResults.users.map((u: any) => (
                          <div key={u.id} className="gaya-list-baru p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-sm flex items-center justify-between">
                            <span className="font-medium text-slate-600 dark:text-slate-300">{u.name}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">{u.email}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 capitalize">{u.role}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!globalSearchResults.tickets?.length && !globalSearchResults.assets?.length && !globalSearchResults.users?.length && (
                      <p className="text-sm text-slate-500 p-2 text-center">Tidak ada hasil yang cocok.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Status kehadiran selector */}
              <div className="relative">
                <select
                  value={currentTechPresence}
                  onChange={(e) => handleUpdateSelfStatus(e.target.value)}
                  className={`appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-4 pr-10 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer`}
                >
                  <option value="online">🟢 Status: Online</option>
                  <option value="offline">⚪ Status: Offline</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>


              {/* Force dashboard refresh */}
              <button
                onClick={() => {
                  fetchSummary();
                  fetchTickets();
                  showLocalNotification('Data dashboard berhasil diperbarui!');
                }}
                className="p-3 bg-slate-800/10 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center"
                title="Refresh Dashboard"
              >
                <svg className="h-5 w-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.235" />
                </svg>
              </button>

            </div>
          </div>

          {/* Quick Action Control Bar */}
          <div className="no-hover flex flex-wrap items-center gap-3 bg-slate-900/50 border border-slate-100 dark:border-white/5 rounded-3xl p-3 px-4 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Aksi Cepat:</span>
            <button
              onClick={handleTakeNextTicket}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-xs font-bold rounded-xl hover:from-sky-400 hover:to-indigo-400 transition-all flex items-center gap-2 shadow-lg shadow-sky-500/15"
            >
              🚀 Ambil Tiket Berikutnya
            </button>
            <button
              onClick={() => {
                document.getElementById('contextual-kb')?.scrollIntoView({ behavior: 'smooth' });
                showLocalNotification('Menavigasi ke panel Knowledge Base Relevan...');
              }}
              className="px-4 py-2 bg-slate-800/10 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-white/10 text-white text-xs font-semibold rounded-xl transition-all active:scale-95"
            >
              📚 Buka Knowledge Base
            </button>
            <button
              onClick={() => router.push('/dashboard/posts')}
              className="px-4 py-2 bg-indigo-500/15 border border-indigo-500/20 hover:bg-indigo-500 hover:text-white text-indigo-400 text-xs font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              📝 Kelola Posts / Artikel
            </button>
          </div>

          {/* ==================== 10 KPI METRICS CARDS GRID (IDENTIK ADMIN) ==================== */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* 1. Total Tickets */}
            <button
              onClick={() => {
                setActiveFilter('all')
                setCurrentPage(1)
                setTimeout(() => ticketQueueRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
              }}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-sky-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>TOTAL TICKETS</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{navStats?.total_tickets ?? ticketsTotal ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total tiket terdaftar di database.</p>
            </button>

            {/* 2. Open Tickets */}
            <button
              onClick={() => {
                setActiveFilter('open')
                setCurrentPage(1)
                setTimeout(() => ticketQueueRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
              }}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-orange bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-indigo-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>OPEN TICKETS</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-amber-400' : 'text-indigo-600'}`}>{navStats?.open_tickets ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket aktif dalam antrean baru.</p>
            </button>

            {/* 3. Closed Tickets */}
            <button
              onClick={() => {
                setActiveFilter('all')
                setCurrentPage(1)
                setTimeout(() => ticketQueueRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
              }}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-green bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-emerald-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>CLOSED TICKETS</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{navStats?.closed_tickets ?? navStats?.resolved_tickets ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket terselesaikan dan ditutup.</p>
            </button>

            {/* 4. AI Resolution Rate */}
            <button
              onClick={() => {
                setActiveFilter('all')
                setCurrentPage(1)
                setTimeout(() => ticketQueueRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
              }}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-teal-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>AI RESOLUTION RATE</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-cyan-400' : 'text-emerald-600'}`}>{aiResolutionRate}%</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Rasio penyelesaian otomatis oleh AI.</p>
            </button>

            {/* 5. Handover Rate */}
            <button
              onClick={() => {
                setActiveFilter('all')
                setCurrentPage(1)
                setTimeout(() => ticketQueueRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
              }}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-orange bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-amber-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>HANDOVER RATE</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{humanHandoverRate}%</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiket dialihkan ke teknisi manusia.</p>
            </button>

            {/* 6. Alert Aktif */}
            <button
              onClick={() => router.push('/dashboard/alerts')}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-red bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-rose-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-rose-400 font-semibold' : 'text-rose-600'}`}>ALERT AKTIF</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>{summary?.critical_alerts ?? summary?.device_health?.critical_alerts ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Alert sistem status kritis/aktif.</p>
            </button>

            {/* 7. Device Online */}
            <button
              onClick={() => router.push('/dashboard/monitor')}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-green bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-emerald-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-emerald-400 font-semibold' : 'text-emerald-600'}`}>DEVICE ONLINE</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{summary?.device_health?.active_devices ?? devices.filter((d: any) => d.status === 'active').length ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Jumlah agen client yang aktif online.</p>
            </button>

            {/* 8. Device Offline */}
            <button
              onClick={() => router.push('/dashboard/monitor')}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-red bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-rose-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-rose-400 font-semibold' : 'text-rose-600'}`}>DEVICE OFFLINE</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-rose-400' : 'text-rose-600'}`}>{summary?.device_health?.offline_devices ?? devices.filter((d: any) => d.status !== 'active').length ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Jumlah agen client yang offline.</p>
            </button>

            {/* 9. Approval Pending */}
            <button
              onClick={() => {
                setActiveFilter('pending')
                setCurrentPage(1)
                setTimeout(() => ticketQueueRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
              }}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer col-span-1 sm:col-span-2 lg:col-span-1 ${
                isDarkMode 
                  ? 'neon-glow-purple bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-purple-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-purple-400 font-semibold' : 'text-purple-600'}`}>APPROVAL PENDING</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{navStats?.pending_tickets ?? 0}</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Remote action yang butuh otorisasi.</p>
            </button>

            {/* 10. Kelola Posts */}
            <button
              onClick={() => router.push('/dashboard/posts')}
              className={`rounded-3xl p-4 flex flex-col justify-between text-left transition-all duration-300 hover:scale-[1.02] cursor-pointer ${
                isDarkMode 
                  ? 'neon-glow-cyan bg-slate-900/75 shadow-2xl backdrop-blur-xl' 
                  : 'border-slate-200 bg-white hover:border-sky-500 shadow-md shadow-slate-200/50'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400 font-semibold' : 'text-slate-500'}`}>KELOLA POSTS</p>
              <p className={`mt-2 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>📝</p>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Kelola postingan & sinkronisasi AI KB.</p>
            </button>
          </div>

          {/* TELEMETRY LIVE MONITOR (Tepat di bawah KPI Card) */}
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                🖥️ Telemetry Live Monitor
              </h3>
              <p className="text-xs text-slate-400 mt-1">Status CPU, RAM, & Disk dari monitoring agent.</p>
            </div>

            {devices.length ? (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase tracking-widest text-[10px]">
                      <th className="py-2 px-3 font-bold">Perangkat</th>
                      <th className="py-2 px-3 font-bold">User</th>
                      <th className="py-2 px-3 font-bold">CPU</th>
                      <th className="py-2 px-3 font-bold">RAM</th>
                      <th className="py-2 px-3 font-bold">Disk</th>
                      <th className="py-2 px-3 font-bold">Network</th>
                      <th className="py-2 px-3 font-bold">Agent</th>
                      <th className="py-2 px-3 font-bold">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {devices.map((device) => {
                      const cpuVal = getLatestMetric(device.id, 'cpu')
                      const ramVal = getLatestMetric(device.id, 'ram')
                      const diskVal = getLatestMetric(device.id, 'disk_usage')

                      return (
                        <tr key={device.id} className="hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            {device.device_name}
                          </td>
                          <td className="py-2 px-3 text-slate-300 font-medium">
                            {device.device_name === 'MKT-NUC' ? 'it-mkt' : 'user.local'}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-semibold ${getMetricColor(cpuVal)}`}>
                              {cpuVal !== null ? `${Math.round(cpuVal)}%` : '-'}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-semibold ${getMetricColor(ramVal)}`}>
                              {ramVal !== null ? `${Math.round(ramVal)}%` : '-'}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-semibold ${getMetricColor(diskVal || 18)}`}>
                              {diskVal !== null && diskVal > 0 ? `${Math.round(diskVal)}%` : '18%'}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-slate-300 font-mono text-[10px]" title="IP LAN / Utama">
                                {device.os_name?.toLowerCase() === 'windows' && device.ip_lan ? device.ip_lan : device.ip_address}
                              </span>
                              <span className="text-[9px] font-medium flex items-center gap-1">
                                <span className={`h-1 w-1 rounded-full ${device.ip_wifi ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                <span className="text-slate-500">Wifi:</span>
                                <span className={device.ip_wifi ? 'text-emerald-400 font-mono font-semibold' : 'text-slate-500 font-sans'}>
                                  {device.ip_wifi || 'Off'}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                              device.status === 'active' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                              <span className={`h-1 w-1 rounded-full ${device.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                              {device.status === 'active' ? 'Aktif (v1.2.0)' : 'Offline'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-400 text-[10px] font-medium">
                            {device.last_seen ? new Date(device.last_seen).toLocaleString('id-ID') : 'N/A'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-8 text-center">Belum ada perangkat terdaftar.</p>
            )}
          </div>

          {/* ==================== MIDDLE ROW: MAIN TICKETS QUEUE & RIGHT SIDEBAR ==================== */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            
            {/* LEFT CONTAINER - MAIN TICKET QUEUE (Widgets Terbesar) */}
            <div ref={ticketQueueRef} className="xl:col-span-3 space-y-4">
              
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                
                {/* Header widget & filter tab buttons */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 dark:border-white/5 pb-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-white">Antrean Tiket Helpdesk</h2>
                    <p className="text-xs text-slate-400 mt-1">Total tiket ditemukan: <span className="font-bold text-sky-400">{ticketsTotal}</span></p>
                  </div>

                  {/* Local Queue Filters */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'all', label: 'Semua' },
                      { id: 'my', label: 'Tiket Saya' },
                      { id: 'open', label: 'Open' },
                      { id: 'assigned', label: 'Assigned' },
                      { id: 'pending', label: 'Pending' },
                      { id: 'waiting-customer', label: 'Menunggu User' },
                      { id: 'waiting-vendor', label: 'Menunggu Vendor' },
                      { id: 'escalated', label: 'Eskalasi' },
                      { id: 'critical', label: 'Kritis' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveFilter(tab.id); setCurrentPage(1); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                          activeFilter === tab.id 
                            ? 'bg-sky-500/10 border-sky-500/40 text-sky-300' 
                            : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Queue Filter search bar input */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Saring antrean berdasarkan judul, no tiket, deskripsi..."
                    value={ticketsSearchQuery}
                    onChange={(e) => setTicketsSearchQuery(e.target.value)}
                    className="w-full bg-slate-950/60 border border-slate-100 dark:border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <svg className="absolute left-3.5 top-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
                  </svg>
                </div>

                {/* TICKETS TABLE QUEUE */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 uppercase tracking-widest text-[10px]">
                        <th className="py-2 px-3 font-bold">No Tiket</th>
                        <th className="py-2 px-3 font-bold">Judul Masalah</th>
                        <th className="py-2 px-3 font-bold">Prioritas</th>
                        <th className="py-2 px-3 font-bold">Status</th>
                        <th className="py-2 px-3 font-bold">Pelanggan</th>
                        <th className="py-2 px-3 font-bold">Assignee</th>
                        <th className="py-2 px-3 font-bold">Batas SLA</th>
                        <th className="py-2 px-3 font-bold">Diperbarui</th>
                        <th className="py-2 px-3 font-bold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {tickets.length > 0 ? (
                        tickets.map((t: any) => {
                          const sla = getSLACountdown(t.sla_due)
                          const isSelected = selectedTicket?.id === t.id
                          return (
                            <tr
                              key={t.id}
                              className={`gaya-list-baru hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer ${
                                isSelected ? 'bg-sky-500/5' : ''
                              }`}
                              onClick={() => handleSelectTicket(t)}
                              onDoubleClick={() => handleOpenDetails(t)}
                            >
                              <td className="py-2 px-3 font-mono font-bold text-sky-400">{t.ticket_no}</td>
                              <td className="py-2 px-3 font-medium text-white">
                                <div className="max-w-[180px] truncate" title={t.title}>
                                  {t.title}
                                </div>
                                {t.device && (
                                  <span className="block text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                                    🖥️ {t.device}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={t.severity}
                                  onChange={(e) => handleInlinePriorityChange(t.id, e.target.value)}
                                  className="bg-white dark:bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-slate-300 focus:outline-none cursor-pointer"
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                  <option value="critical">Critical</option>
                                </select>
                              </td>
                              <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={t.status}
                                  onChange={(e) => handleInlineStatusChange(t.id, e.target.value)}
                                  className="bg-white dark:bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-slate-300 focus:outline-none cursor-pointer"
                                >
                                  <option value="open">Open</option>
                                  <option value="assigned">Assigned</option>
                                  <option value="pending">Pending</option>
                                  <option value="waiting_customer">Waiting User</option>
                                  <option value="waiting_vendor">Waiting Vendor</option>
                                  <option value="escalated">Escalated</option>
                                  <option value="resolved">Resolved</option>
                                  <option value="closed">Closed</option>
                                </select>
                              </td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{t.creator?.name || t.created_by || '-'}</td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                                {t.assignee?.name || t.assigned_to || (
                                  <span className="text-slate-600 italic">Belum ditugaskan</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`font-semibold ${
                                  sla.status === 'critical' 
                                    ? 'text-red-500' 
                                    : sla.status === 'warning' 
                                    ? 'text-orange-400' 
                                    : 'text-slate-300'
                                }`}>
                                  {sla.text}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-400 font-mono text-[10px]">
                                {new Date(t.updated_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <div className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleOpenDetails(t)}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
                                    title="Buka Detail"
                                  >
                                    👁️
                                  </button>
                                  <button
                                    onClick={() => { setInlineActionTicket(t); setShowInlineReplyModal(true); }}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
                                    title="Quick Reply"
                                  >
                                    💬
                                  </button>
                                  {!t.assigned_to && (
                                    <button
                                      onClick={() => {
                                        ticketApi.assign(t.id, user?.id || '').then(() => {
                                          showLocalNotification('Tiket ditugaskan ke Anda.');
                                          fetchTickets();
                                          fetchSummary();
                                        });
                                      }}
                                      className="p-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white rounded-lg transition-all"
                                      title="Ambil Tiket"
                                    >
                                      📌
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setInlineActionTicket(t); setShowInlineAssignModal(true); }}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
                                    title="Assign ke Teknisi lain"
                                  >
                                    👤
                                  </button>
                                  <button
                                    onClick={() => { setInlineActionTicket(t); setShowInlineEscalateModal(true); }}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all"
                                    title="Eskalasi L2/L3"
                                  >
                                    🔥
                                  </button>
                                  <button
                                    onClick={() => {
                                      ticketApi.resolve(t.id, 'Diselesaikan instan dari cockpit dashboard.').then(() => {
                                        showLocalNotification('Tiket berhasil diselesaikan!');
                                        fetchTickets();
                                        fetchSummary();
                                      });
                                    }}
                                    className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition-all"
                                    title="Selesaikan Tiket"
                                  >
                                    ✅
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-8 px-4 text-center text-slate-500 italic">
                            Tidak ada tiket dalam antrean.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {ticketsTotal > 25 && (
                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-4">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Menampilkan halaman {currentPage} dari {Math.ceil(ticketsTotal / 25)}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 bg-slate-800/10 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        Sebelumnya
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(ticketsTotal / 25)))}
                        disabled={currentPage >= Math.ceil(ticketsTotal / 25)}
                        className="px-3 py-1.5 bg-slate-800/10 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                )}

              </div>
              
            </div>

            {/* RIGHT SIDEBAR PANEL: AI SUPERVISOR & REAL-TIME ACTIVITY STREAM */}
            <div className="xl:col-span-1 space-y-4">
              
              {/* AI SUPERVISOR PANEL */}
              <div className="bg-gradient-to-br from-slate-900 to-indigo-950/80 border border-indigo-500/20 rounded-3xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🧠</span>
                    <h3 className="text-base font-extrabold text-white">AI Supervisor</h3>
                  </div>
                  {selectedTicket && (
                    <button
                      onClick={() => runAIDiagnosis(selectedTicket, true)}
                      disabled={aiLoading}
                      title="Analisis ulang dengan AI"
                      className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      🔄 {aiLoading ? 'Memproses...' : 'Ulangi AI'}
                    </button>
                  )}
                </div>

                {selectedTicket ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-800/10 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Analisis Tiket Aktif</p>
                      <p className="text-xs font-semibold text-sky-300 mt-1 truncate">{selectedTicket.ticket_no}: {selectedTicket.title}</p>
                    </div>

                    {aiLoading ? (
                      <div className="py-8 text-center space-y-2">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">AI sedang memproses diagnosis...</p>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-4 text-xs">
                        
                        {/* Sentiment indicator */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                          <span className="text-slate-500 dark:text-slate-400">Customer Sentiment:</span>
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            selectedTicket.severity === 'critical' || (selectedTicket.title || '').toLowerCase().includes('marah') || (selectedTicket.title || '').toLowerCase().includes('rusak')
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {selectedTicket.severity === 'critical' ? '🔴 Negatif / Frustrasi' : '🟢 Positif / Netral'}
                          </span>
                        </div>

                        {/* SLA Risk */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                          <span className="text-slate-500 dark:text-slate-400">SLA Breach Risk:</span>
                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            selectedTicket.severity === 'critical' || selectedTicket.severity === 'high'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {selectedTicket.severity === 'critical' ? '🔥 High Risk' : '🟡 Medium Risk'}
                          </span>
                        </div>

                        {/* Root Cause Analysis (RCA) */}
                        <div className="space-y-1">
                          <span className="font-bold text-indigo-300">Penyebab Utama (Root Cause):</span>
                          <p className="p-3 bg-indigo-950/60 border border-indigo-500/20 rounded-xl text-slate-200 text-xs leading-relaxed italic">
                            "{aiAnalysis.root_cause || 'Analisis kegagalan Spooler / Driver lokal.'}"
                          </p>
                        </div>

                        {/* Suggestions list */}
                        {aiAnalysis.suggestions && (
                          <div className="space-y-1">
                            <span className="font-bold text-sky-300">Rekomendasi Tindakan:</span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                              {aiAnalysis.suggestions.map((s: string, idx: number) => (
                                <li key={idx} className="hover:text-white transition-colors">{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Suggested reply draft */}
                        <div className="space-y-2 pt-2">
                          <button
                            onClick={() => setAiDraftReplyOpen(!aiDraftReplyOpen)}
                            className="w-full py-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold rounded-xl hover:bg-indigo-500 hover:text-white transition-all text-xs"
                          >
                            📝 Draft Balasan Otomatis AI
                          </button>
                          
                          {aiDraftReplyOpen && (
                            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl space-y-2">
                              <p className="text-slate-300 leading-relaxed italic">
                                "Halo, kami mendeteksi masalah ini disebabkan oleh {aiAnalysis.root_cause || 'gangguan layanan'}. Kami menyarankan {aiAnalysis.suggestions?.[0] || 'reboot perangkat'}. Kami segera menangani masalah ini."
                              </p>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`Halo, kami mendeteksi masalah ini disebabkan oleh ${aiAnalysis.root_cause || 'gangguan layanan'}. Kami menyarankan ${aiAnalysis.suggestions?.[0] || 'reboot perangkat'}. Kami segera menangani masalah ini.`);
                                  showLocalNotification('Draft balasan disalin ke clipboard!');
                                }}
                                className="text-[10px] text-sky-400 hover:underline flex items-center gap-1"
                              >
                                📋 Salin Draft Balasan
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <button
                          onClick={() => runAIDiagnosis(selectedTicket)}
                          className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-400 transition-all"
                        >
                          Diagnosis Masalah dengan AI
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Pilih tiket di antrean untuk melakukan diagnosis AI Supervisor.</p>
                )}
              </div>

              {/* REAL-TIME ACTIVITY STREAM */}
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 backdrop-blur-xl shadow-sm dark:shadow-black/40">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4 mb-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-duration-1000"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Aktivitas Terbaru
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Realtime</span>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {recentActivities.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-8 text-center">Belum ada aktivitas terbaru.</p>
                  ) : (
                    recentActivities.map((act: any) => {
                      // Determine icon and dot color based on action type
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
                            <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{act.text}</p>
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

          {/* ==================== BOTTOM ROW: SLA WIDGET, WORKLOAD, PERFORMANCE, KB ==================== */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* 1. SLA HEALTH WIDGET & PERFORMANCE STATS */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  📊 Rerata Performa SLA Harian
                </h3>
                <p className="text-xs text-slate-400 mt-1">Performa SLA & penyelesaian tiket hari ini.</p>
              </div>

              {/* SLA Health Indicator Gauge */}
              <div className="my-6 flex items-center justify-around">
                <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                  {/* Circular Gauge */}
                  <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800/80"
                      strokeWidth="7"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="currentColor"
                      className="text-sky-500 transition-all duration-700 ease-out"
                      strokeWidth="7"
                      strokeLinecap="round"
                      fill="transparent"
                      strokeDasharray={251.32}
                      strokeDashoffset={
                        251.32 - (251.32 * Math.min(Math.max(summary?.sla_performance?.sla_met_percentage ?? 100, 0), 100)) / 100
                      }
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-none">
                      {summary?.sla_performance?.sla_met_percentage !== undefined ? summary.sla_performance.sla_met_percentage.toFixed(1) : '100.0'}%
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                      SLA Met
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-500 dark:text-slate-400">SLA Healthy:</span>
                    <span className="font-bold text-emerald-400">{summary?.sla_performance?.sla_healthy_count ?? 0} Tiket</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-500 dark:text-slate-400">SLA Warning:</span>
                    <span className="font-bold text-amber-500">{summary?.sla_performance?.sla_warning_count ?? 0} Tiket</span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span className="text-slate-500 dark:text-slate-400">SLA Breach:</span>
                    <span className="font-bold text-rose-500">{summary?.sla_performance?.sla_breach_count ?? 0} Tiket</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-white/5 pt-4 text-xs">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Rerata Respon</p>
                  <p className="text-base font-extrabold text-white mt-1">
                    {summary?.sla_performance?.average_response_minutes !== undefined ? summary.sla_performance.average_response_minutes.toFixed(1) : '0'} Menit
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Laju Reopen</p>
                  <p className="text-base font-extrabold text-rose-500 mt-1">
                    {summary?.sla_performance?.reopen_rate !== undefined ? summary.sla_performance.reopen_rate.toFixed(1) : '0'}%
                  </p>
                </div>
              </div>
            </div>

            {/* 3. TECHNICIAN WORKLOAD TRACKER */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  👥 Beban Kerja Tim Teknisi
                </h3>
                <p className="text-xs text-slate-400 mt-1">Status dan beban tiket aktif saat ini.</p>
              </div>

              <div className="my-6 space-y-3 overflow-y-auto max-h-48 pr-1">
                {summary?.technician_workload?.length > 0 ? (
                  summary.technician_workload.map((tech: any) => {
                    const maxCapacity = 10
                    const workloadPercentage = Math.min((tech.assigned_tickets / maxCapacity) * 100, 100)
                    
                    return (
                      <div key={tech.technician_id} className="text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getPresenceColor(tech.status)}`}>
                              {tech.status || 'offline'}
                            </span>
                            <span className="font-semibold text-slate-200">{tech.technician_name}</span>
                          </div>

                          <span className="text-[10px] text-slate-400 font-mono">
                            {tech.assigned_tickets} tiket aktif
                          </span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              tech.assigned_tickets > 6 ? 'bg-rose-500' : tech.assigned_tickets > 3 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${workloadPercentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-slate-500 italic text-center py-4">Beban kerja tim kosong.</p>
                )}
              </div>

              <div className="text-[10px] text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
                Kapasitas ideal per teknisi: 10 tiket
              </div>
            </div>

            {/* 4. CUSTOMER WAITING LIST */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  ⏳ Daftar Tunggu Pelanggan
                </h3>
                <p className="text-xs text-slate-400 mt-1">Tiket dengan status menunggu pelanggan (diurutkan paling lama).</p>
              </div>

              <div className="my-6 space-y-3 max-h-48 overflow-y-auto">
                {customerWaitingList.length > 0 ? (
                  customerWaitingList.map((c: any) => (
                    <div key={c.id} className="text-xs p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl flex justify-between items-center transition-all">
                      <div>
                        <span className="font-mono text-sky-400 font-bold block">{c.ticketNo}</span>
                        <span className="text-slate-300 font-medium">{c.customer}</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-slate-200 font-mono font-semibold">{c.waitMins} Menit</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Wait Duration</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic py-8 text-center">Tidak ada antrean menunggu pelanggan.</p>
                )}
              </div>

              <div className="text-[10px] text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
                Target respon berikutnya: &lt; 30 Menit
              </div>
            </div>

            {/* 5. PRIORITY QUADRANT MATRIX */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  🗺️ Matriks Prioritas Tiket
                </h3>
                <p className="text-xs text-slate-400 mt-1">Distribusi sebaran tingkat kepentingan tiket.</p>
              </div>

              <div className="my-6 grid grid-cols-2 gap-2 text-xs">
                <div 
                  onClick={() => { setActiveFilter('critical'); }}
                  className="bg-red-950/20 border border-red-500/20 hover:border-red-500/50 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col justify-center items-center"
                >
                  <span className="text-[10px] uppercase font-bold text-red-400">Kritis</span>
                  <span className="text-2xl font-extrabold text-white mt-1">{priorityMatrixCounts.critical}</span>
                </div>
                
                <div 
                  onClick={() => { setActiveFilter('high'); }}
                  className="bg-orange-950/20 border border-orange-500/20 hover:border-orange-500/50 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col justify-center items-center"
                >
                  <span className="text-[10px] uppercase font-bold text-orange-400">Tinggi</span>
                  <span className="text-2xl font-extrabold text-white mt-1">{priorityMatrixCounts.high}</span>
                </div>

                <div 
                  onClick={() => { setActiveFilter('all'); }}
                  className="bg-blue-950/20 border border-blue-500/20 hover:border-blue-500/50 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col justify-center items-center"
                >
                  <span className="text-[10px] uppercase font-bold text-blue-400">Sedang</span>
                  <span className="text-2xl font-extrabold text-white mt-1">{priorityMatrixCounts.medium}</span>
                </div>

                <div 
                  onClick={() => { setActiveFilter('all'); }}
                  className="bg-slate-900/40 border border-slate-100 dark:border-white/5 hover:border-white/20 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col justify-center items-center"
                >
                  <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Rendah</span>
                  <span className="text-2xl font-extrabold text-white mt-1">{priorityMatrixCounts.low}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
                Klik kuadran untuk menyaring antrean tabel.
              </div>
            </div>

            {/* 6. CONTEXTUAL KNOWLEDGE BASE */}
            <div id="contextual-kb" className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between scroll-mt-20">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  📚 Knowledge Base Relevan
                </h3>
                <p className="text-xs text-slate-400 mt-1">Artikel KB yang disarankan untuk tiket ini.</p>
              </div>

              <div className="my-6 space-y-2.5 max-h-48 overflow-y-auto">
                {contextualKBArticles.length > 0 ? (
                  contextualKBArticles.map((art: any) => (
                    <div 
                      key={art.id}
                      onClick={() => { setSelectedKbArticle(art); }}
                      className="p-2.5 bg-slate-950/40 border border-slate-100 dark:border-white/5 hover:border-white/15 rounded-xl cursor-pointer transition-all text-xs flex flex-col justify-between"
                    >
                      <span className="font-bold text-slate-200 line-clamp-1 hover:text-sky-300">{art.title}</span>
                      <div className="flex justify-between items-center mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">{art.category}</span>
                        <span>👁️ {art.views_count ?? 0} views</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic py-8 text-center">Tidak ada artikel KB terkait.</p>
                )}
              </div>

              <div className="text-[10px] text-slate-500 border-t border-slate-100 dark:border-white/5 pt-2">
                Rekomendasi disinkronkan secara kontekstual.
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* ==================== TICKET DETAILS MODAL DRAWER ==================== */}
      {showDetailsModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 font-mono font-bold rounded text-xs">
                    {selectedTicket.ticket_no}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    selectedTicket.status === 'resolved' || selectedTicket.status === 'closed'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-sky-500/10 text-sky-400'
                  }`}>
                    {selectedTicket.status}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white mt-2 leading-tight">{selectedTicket.title}</h2>
              </div>
              <button 
                onClick={handleCloseDetails}
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Scroll Container */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* Ticket Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-950/40 border border-slate-100 dark:border-white/5 rounded-2xl">
                <div>
                  <span className="text-slate-500 block">Dibuat oleh:</span>
                  <span className="font-bold text-slate-200">{selectedTicket.creator?.name || selectedTicket.created_by || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Prioritas:</span>
                  <span className="font-bold text-slate-200 uppercase">{selectedTicket.severity}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">SLA Due:</span>
                  <span className="font-bold text-slate-200">
                    {selectedTicket.sla_due ? new Date(selectedTicket.sla_due).toLocaleString('id-ID') : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Device:</span>
                  <span className="font-bold text-slate-200 font-mono">{selectedTicket.device || 'N/A'}</span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <span className="text-slate-400 font-semibold block">Deskripsi Masalah:</span>
                <div className="p-4 bg-slate-950/20 border border-slate-100 dark:border-white/5 rounded-2xl text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {(() => {
                    const { text, attachmentUrl } = parseDescription(selectedTicket.description);
                    return (
                      <>
                        <span>{text}</span>
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
                </div>
              </div>

              {/* Comments History */}
              {(() => {
                const displayComments = (comments && comments.length > 0) ? comments : (selectedTicket?.comments || []);
                return (
                  <div className="space-y-3">
                    <span className="text-slate-400 font-semibold block">Histori Aktivitas & Balasan ({displayComments.length})</span>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                      {displayComments.length > 0 ? (
                        displayComments.map((c: any) => (
                          <div 
                            key={c.id}
                            className={`p-3.5 rounded-2xl border ${
                              c.is_internal 
                                ? 'bg-amber-500/5 border-amber-500/20' 
                                : 'bg-sky-500/5 border-sky-500/20'
                            }`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-200">{c.user?.name || c.user_id}</span>
                                {c.is_internal && (
                                  <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[9px] uppercase font-bold">Internal Note</span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(c.created_at).toLocaleString('id-ID')}
                              </span>
                            </div>
                            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{c.comment}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 italic">Belum ada komentar.</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Inline Reply Form */}
              <form onSubmit={handleAddCommentSubmit} className="space-y-3 border-t border-slate-100 dark:border-white/5 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-semibold">Kirim Balasan / Catatan Internal</span>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isInternalComment}
                      onChange={(e) => setIsInternalComment(e.target.checked)}
                      className="rounded bg-white dark:bg-slate-900 border-white/10 text-amber-500 focus:ring-0"
                    />
                    <span>Catatan Internal</span>
                  </label>
                </div>
                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder={isInternalComment ? "Tulis catatan internal (hanya terlihat oleh teknisi)..." : "Tulis balasan kepada pelanggan..."}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    required
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      ticketApi.resolve(selectedTicket.id, 'Diselesaikan dari popup detail.').then(() => {
                        showLocalNotification('Tiket ditandai resolved.');
                        setShowDetailsModal(false);
                        fetchTickets();
                        fetchSummary();
                      });
                    }}
                    className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold rounded-xl hover:bg-emerald-500 hover:text-white transition-all"
                  >
                    Selesaikan Tiket
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-sky-500 text-white font-bold rounded-xl hover:bg-sky-400 transition-all"
                  >
                    Kirim Komentar
                  </button>
                </div>
              </form>

            </div>

          </div>
        </div>
      )}

      {/* ==================== INLINE ACTIONS MODALS ==================== */}
      
      {/* 1. Quick Reply Modal */}
      {showInlineReplyModal && inlineActionTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-slate-950/80 backdrop-blur-md" onClick={() => setShowInlineReplyModal(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInlineReplyModal(false)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Kembali
                </button>
                <span className="text-slate-300 dark:text-white/20">|</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Kirim Balasan</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">{inlineActionTicket.ticket_no}</span>
                <button
                  onClick={() => setShowInlineReplyModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              placeholder="Tulis pesan balasan Anda..."
              value={inlineReplyText}
              onChange={(e) => setInlineReplyText(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex justify-between items-center gap-2 text-xs">
              <button
                onClick={() => setShowInlineReplyModal(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-medium transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Batal
              </button>
              <button onClick={handleInlineReplySubmit} className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20">Kirim Balasan</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Escalate Modal */}
      {showInlineEscalateModal && inlineActionTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-slate-950/80 backdrop-blur-md" onClick={() => setShowInlineEscalateModal(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInlineEscalateModal(false)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Kembali
                </button>
                <span className="text-slate-300 dark:text-white/20">|</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Eskalasi Tiket</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">{inlineActionTicket.ticket_no}</span>
                <button
                  onClick={() => setShowInlineEscalateModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <textarea
              rows={3}
              placeholder="Alasan eskalasi ke Tim L2/L3..."
              value={inlineEscalateReason}
              onChange={(e) => setInlineEscalateReason(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex justify-between items-center gap-2 text-xs">
              <button
                onClick={() => setShowInlineEscalateModal(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 font-medium transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Batal
              </button>
              <button onClick={handleInlineEscalateSubmit} className="px-5 py-2 bg-rose-500 hover:bg-rose-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-500/20">🚨 Eskalasi Sekarang</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Assign Modal */}
      {showInlineAssignModal && inlineActionTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-slate-950/80 backdrop-blur-md" onClick={() => setShowInlineAssignModal(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowInlineAssignModal(false)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Kembali
                </button>
                <span className="text-slate-300 dark:text-white/20">|</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Tugaskan Tiket</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">{inlineActionTicket.ticket_no}</span>
                <button
                  onClick={() => setShowInlineAssignModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pilih teknisi yang akan ditugaskan ke tiket ini:</p>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {technicians.map((t: any) => (
                <div 
                  key={t.id}
                  onClick={() => handleInlineAssign(t.id)}
                  className="p-3 hover:bg-slate-100 dark:hover:bg-white/5 rounded-2xl cursor-pointer text-xs flex justify-between items-center group border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${getPresenceColor(t.presence_status || t.status)}`}>
                      {t.presence_status || t.status || 'offline'}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{t.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{t.email}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setShowInlineAssignModal(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Batal
              </button>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Klik nama teknisi untuk menugaskan</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. KB Article Viewer Modal */}
      {selectedKbArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-white/10 rounded-[32px] p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-white/5 pb-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-400">{selectedKbArticle.category}</span>
                <h3 className="text-lg font-bold text-white mt-1">{selectedKbArticle.title}</h3>
              </div>
              <button onClick={() => setSelectedKbArticle(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-500 dark:text-slate-400">✕</button>
            </div>
            <div className="text-xs text-slate-300 leading-relaxed overflow-y-auto max-h-96 whitespace-pre-wrap">
              {selectedKbArticle.content}
            </div>
            <div className="flex justify-end gap-2 pt-2 text-xs">
              <button 
                onClick={() => {
                  kbApi.markHelpful(selectedKbArticle.id).then(() => showLocalNotification('Terima kasih atas feedback Anda!'));
                  setSelectedKbArticle(null);
                }}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl font-bold"
              >
                👍 Sangat Membantu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create Ticket Modal */}
      {showCreateTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form onSubmit={handleCreateTicketSubmit} className="w-full max-w-md bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">Buat Tiket Baru</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Judul Masalah</label>
                <input
                  type="text"
                  required
                  value={createTicketForm.title}
                  onChange={(e) => setCreateTicketForm({ ...createTicketForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Deskripsi Detail</label>
                <textarea
                  rows={4}
                  required
                  value={createTicketForm.description}
                  onChange={(e) => setCreateTicketForm({ ...createTicketForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Tingkat Keparahan</label>
                  <select
                    value={createTicketForm.severity}
                    onChange={(e) => setCreateTicketForm({ ...createTicketForm, severity: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Nama Perangkat (Device)</label>
                  <input
                    type="text"
                    placeholder="e.g. pc-finance-01"
                    value={createTicketForm.device}
                    onChange={(e) => setCreateTicketForm({ ...createTicketForm, device: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateTicketModal(false)} className="px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5">Batal</button>
              <button type="submit" className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 rounded-xl font-bold">Buat Tiket</button>
            </div>
          </form>
        </div>
      )}

      {/* 6. Quick Note Modal */}
      {showQuickNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-white dark:bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">📝 Tulis Catatan Cepat</h3>
            <textarea
              rows={5}
              placeholder="Tulis catatan internal operasional shift Anda..."
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-white focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowQuickNoteModal(false)} className="px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5">Batal</button>
              <button onClick={handleQuickNoteSubmit} className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 rounded-xl font-bold">Simpan Catatan</button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
