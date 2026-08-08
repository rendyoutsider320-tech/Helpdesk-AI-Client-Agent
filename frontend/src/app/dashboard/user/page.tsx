'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore, useLayoutStore } from '@/store'
import ParticleNetwork from '@/components/ParticleNetwork'
import {
  aiApi,
  ticketApi,
  deviceApi,
  assetApi,
  notificationApi,
  systemApi,
  contentApi,
  authApi,
  dashboardApi,
  profileApi,
  kbApi,
  technicianApi
} from '@/lib/api'

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

// Interfaces
interface TicketComment {
  id: string
  ticket_id: string
  comment: string
  is_internal: boolean
  user_id: string
  created_by?: string // legacy compat
  user?: {
    id: string
    name: string
    username: string
    role: string
  }
  creator?: {
    id: string
    name: string
    username: string
    role: string
  }
  created_at: string
}

interface Ticket {
  id: string
  ticket_no: string
  title: string
  description: string
  severity: string
  status: string
  created_by: string
  assigned_to?: string | null
  assignee?: {
    id: string
    name: string
    username: string
    role: string
  } | null
  sla_due?: string | null
  resolved_at?: string | null
  closed_at?: string | null
  created_at: string
  updated_at: string
  category?: string
  sub_category?: string
  device?: string
  department?: string
  comments?: TicketComment[]
}

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  text?: string // backward compat
  timestamp: string
  attachmentUrl?: string
  attachmentType?: string
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: string
}

export default function UserDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const logoutStore = useAuthStore((state) => state.logout)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const sidebarCollapsed = useLayoutStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar)

  // Navigation & UI States
  const [isChecked, setIsChecked] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, ai-assistant, create-ticket, my-tickets, kb, assets, notifications, announcements, profile, settings
  const [searchQuery, setSearchQuery] = useState('')
  const [ticketsPage, setTicketsPage] = useState(1)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loadingNotif, setLoadingNotif] = useState(false)
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const notifPanelRef = useRef<HTMLDivElement>(null)

  // Real-time & Telemetry State
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [kbArticles, setKbArticles] = useState<any[]>([])
  
  // Detail Views State
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null)
  const [assetSoftware, setAssetSoftware] = useState<any[]>([])
  const [loadingSoftware, setLoadingSoftware] = useState(false)
  const [viewingKBArticle, setViewingKBArticle] = useState<any | null>(null)
  
  // Loading & Error States
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Chat/AI Copilot state - DB-backed
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [chatAttachmentFile, setChatAttachmentFile] = useState<File | null>(null)
  const [chatAttachmentPreview, setChatAttachmentPreview] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [techniciansPresence, setTechniciansPresence] = useState<Record<string, string>>({})
  const [remoteTyping, setRemoteTyping] = useState<{ conversationId: string; userId: string; isTyping: boolean } | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const typingTimeoutRef = useRef<any>(null)
  const isTypingRef = useRef<boolean>(false)
  const [isUploading, setIsUploading] = useState(false)
  const [semanticSearch, setSemanticSearch] = useState(true)
  
  // Create Ticket Form state
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketSeverity, setTicketSeverity] = useState('medium') // low, medium, high, critical
  const [ticketCategory, setTicketCategory] = useState('Software')
  const [ticketSubCategory, setTicketSubCategory] = useState('Aplikasi Kantor')
  const [ticketDepartment, setTicketDepartment] = useState('IT')
  const [ticketDeviceCorrelation, setTicketDeviceCorrelation] = useState('')
  const [ticketPreview, setTicketPreview] = useState(false)
  const [ticketSuccessMsg, setTicketSuccessMsg] = useState('')

  // AI Create Ticket analysis state
  const [aiDraftAnalysis, setAiDraftAnalysis] = useState<{
    suggestions: string[]
    aiReport: string
    confidence: number
  } | null>(null)
  const [aiDraftDuplicates, setAiDraftDuplicates] = useState<any[]>([])
  const [aiDraftKBMatches, setAiDraftKBMatches] = useState<any[]>([])
  const [isAiDraftLoading, setIsAiDraftLoading] = useState(false)
  const [ticketAttachmentUrl, setTicketAttachmentUrl] = useState('')
  const [ticketAttachmentFile, setTicketAttachmentFile] = useState<File | null>(null)
  const [isTicketUploading, setIsTicketUploading] = useState(false)

  const handleTicketAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsTicketUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = localStorage.getItem('access_token')
      const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
      const response = await fetch(`${baseURL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload file')
      }

      const result = await response.json()
      setTicketAttachmentFile(file)
      setTicketAttachmentUrl(result.url)
    } catch (err) {
      console.error(err)
      alert('Gagal mengunggah file. Silakan coba lagi.')
    } finally {
      setIsTicketUploading(false)
    }
  }

  // View Ticket Detail comment state
  const [newCommentText, setNewCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)

  // Profile Settings Form state
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('0812-3456-7890')
  const [profileDept, setProfileDept] = useState('Pemasaran')
  const [passwordOld, setPasswordOld] = useState('')
  const [passwordNew, setPasswordNew] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  // Settings tab preferences
  const [prefNotificationChannel, setPrefNotificationChannel] = useState({
    email: true,
    whatsapp: false,
    telegram: true,
  })
  const [prefSoundAlerts, setPrefSoundAlerts] = useState(true)

  // Scroll ref for chat
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (isHydrated) {
      const token = localStorage.getItem('access_token')
      const userStr = localStorage.getItem('user')
      if (!token || !userStr) {
        router.push('/')
      } else {
        setIsChecked(true)
        // Initialize profile states
        try {
          const u = JSON.parse(userStr)
          setProfileName(u.name || u.username)
          setProfileEmail(u.email || '')
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [isHydrated, router])

  // Sync theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const isDark =
      savedTheme === 'dark' ||
      (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setIsDarkMode(isDark)
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('light', !isDark)
  }, [])

  // Load initial tab from URL or localStorage once authenticated
  useEffect(() => {
    if (isChecked) {
      const urlParams = new URLSearchParams(window.location.search)
      const tabParam = urlParams.get('tab')
      const allowedTabs = ['dashboard', 'ai-assistant', 'create-ticket', 'my-tickets', 'kb', 'assets', 'notifications', 'announcements', 'profile', 'settings']
      
      if (tabParam && allowedTabs.includes(tabParam)) {
        setActiveTab(tabParam)
      } else {
        const savedTab = localStorage.getItem('clientActiveTab')
        if (savedTab && allowedTabs.includes(savedTab)) {
          setActiveTab(savedTab)
        }
      }
    }
  }, [isChecked])

  // Sync activeTab changes to localStorage and URL search params
  useEffect(() => {
    if (isChecked && activeTab) {
      localStorage.setItem('clientActiveTab', activeTab)
      
      const urlParams = new URLSearchParams(window.location.search)
      if (urlParams.get('tab') !== activeTab) {
        urlParams.set('tab', activeTab)
        router.replace(`${window.location.pathname}?${urlParams.toString()}`, { scroll: false })
      }
    }
  }, [activeTab, isChecked, router])


  const toggleTheme = () => {
    const newIsDark = !isDarkMode
    setIsDarkMode(newIsDark)
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', newIsDark)
    document.documentElement.classList.toggle('light', !newIsDark)
    window.dispatchEvent(new Event('themechange'))
  }


  // Load chat sessions from DB
  const loadChatSessions = useCallback(async () => {
    try {
      const res = await aiApi.listConversations()
      const convs = res.data?.conversations || []
      // Map DB conversations to ChatSession shape
      const sessions: ChatSession[] = convs.map((c: any) => ({
        id: c.id,
        title: c.title,
        messages: [],
        updatedAt: c.updated_at,
      }))
      setChatSessions(sessions)
      if (sessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(sessions[0].id)
      } else if (sessions.length === 0) {
        // Create default session
        const res2 = await aiApi.createConversation('Sesi Obrolan Baru')
        const newConv = res2.data?.conversation
        if (newConv) {
          setChatSessions([{ id: newConv.id, title: newConv.title, messages: [], updatedAt: newConv.updated_at }])
          setCurrentSessionId(newConv.id)
        }
      }
    } catch (err) {
      console.error('Failed to load chat sessions', err)
    }
  }, [])

  useEffect(() => {
    if (isChecked) {
      loadChatSessions()
    }
  }, [isChecked, loadChatSessions])

  // Load messages for the current session
  useEffect(() => {
    if (!currentSessionId) return
    aiApi.listMessages(currentSessionId).then(res => {
      const msgs: ChatMessage[] = (res.data?.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        text: m.content,
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        attachmentUrl: m.attachment_url,
        attachmentType: m.attachment_type,
      }))
      // If no messages yet (new session), add greeting
      if (msgs.length === 0) {
        msgs.push({
          role: 'assistant',
          content: 'Halo! Saya **Copilot AI** bantuan teknis IT Anda.\n\nSaya dapat membantu:\n- 🔧 Diagnosa masalah hardware/software\n- 🌐 Troubleshoot jaringan\n- 📚 Cari solusi di Knowledge Base\n- 🎫 Buat tiket dukungan\n\nCeritakan masalah Anda dan saya akan membantu menemukan solusinya.',
          text: '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })
      }
      setChatSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: msgs } : s))
    }).catch(console.error)
  }, [currentSessionId])

  const currentSession = useMemo(() => {
    return chatSessions.find((s) => s.id === currentSessionId) || null
  }, [chatSessions, currentSessionId])

  // Fetch all dashboard & live monitor telemetry on interval
  const loadData = async () => {
    try {
      const [ticketsRes, assetsRes, devicesRes, notificationsRes, systemRes, summaryRes, postsRes, pagesRes, techniciansRes] = await Promise.all([
        ticketApi.list(1, 100),
        assetApi.list().catch(() => ({ data: [] })),
        deviceApi.list().catch(() => ({ data: { devices: [] } })),
        notificationApi.list().catch(() => ({ data: { notifications: [] } })),
        systemApi.status().catch(() => ({ data: { postgres: 'operational', ai: 'operational', backend: 'operational', active_agents: 0 } })),
        dashboardApi.summary().catch(() => ({ data: null })),
        contentApi.listPosts(1, 10).catch(() => ({ data: { posts: [] } })),
        kbApi.list().catch(() => ({ data: { articles: [] } })),
        technicianApi.list().catch(() => ({ data: { technicians: [] } }))
      ])

      // Tickets (only user's tickets if user role is user/client, else all)
      const userTickets = ticketsRes.data?.tickets || []
      const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
      const localUser = userStr ? JSON.parse(userStr) : null
      const currentUserId = user?.id || localUser?.id
      const currentUserRole = user?.role || localUser?.role || 'user'

      const filteredTickets = currentUserRole === 'user' 
        ? userTickets.filter((t: any) => t.created_by === currentUserId || t.user_id === currentUserId)
        : userTickets
      setTickets(filteredTickets)

      setAssets(assetsRes.data || [])
      setNotifications(notificationsRes.data?.notifications || [])
      void devicesRes
      void summaryRes
      void systemRes
      const allPosts = postsRes.data?.posts || []
      const allArticles = pagesRes.data?.articles || []
      
      const announcementPosts = allPosts.filter((p: any) => 
        p.category?.toLowerCase() === 'announcement' || 
        p.category?.toLowerCase() === 'pengumuman'
      )
      setAnnouncements(announcementPosts)
      
      const kbOnlyArticles = allArticles.filter((art: any) => 
        art.category?.toLowerCase() !== 'announcement' && 
        art.category?.toLowerCase() !== 'pengumuman'
      )
      setKbArticles(kbOnlyArticles)

      // Initialize presence map from technicians fetched database status
      const techs = techniciansRes.data?.technicians || []
      const presenceMap: Record<string, string> = {}
      techs.forEach((t: any) => {
        presenceMap[t.id] = t.presence_status || 'offline'
      })
      setTechniciansPresence(presenceMap)

      // Update selected ticket in detail view if active
      if (selectedTicket) {
        const fresh = filteredTickets.find((t: Ticket) => t.id === selectedTicket.id)
        if (fresh) {
          // fetch comments details
          const detailRes = await ticketApi.get(selectedTicket.id)
          setSelectedTicket(detailRes.data)
        }
      }
    } catch (e) {
      console.error('Error fetching dashboard datasets', e)
    }
  }

  // Send typing indicator through WebSocket
  const sendTypingIndicator = (isTyping: boolean) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'typing',
        conversation_id: currentSessionId,
        user_id: user?.id,
        is_typing: isTyping
      }))
    }
  }

  // Handle typing state timer
  const handleUserTyping = () => {
    if (!isTypingRef.current) {
      isTypingRef.current = true
      sendTypingIndicator(true)
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false
      sendTypingIndicator(false)
    }, 2000)
  }

  // Auto-select ticket from URL query parameter
  const ticketIdParam = searchParams.get('id')
  const processedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (isChecked && ticketIdParam && (ticketIdParam !== processedIdRef.current || !selectedTicket || activeTab !== 'my-tickets')) {
      processedIdRef.current = ticketIdParam
      const fetchAndOpen = async () => {
        try {
          const response = await ticketApi.get(ticketIdParam)
          if (response.data) {
            setSelectedTicket(response.data)
            setActiveTab('my-tickets')
          }
        } catch (err) {
          console.error('Failed to load query param ticket for client', err)
          router.push('/dashboard/user')
        }
      }
      fetchAndOpen()
    }
  }, [isChecked, ticketIdParam])

  // Live WebSocket Connection for Telemetry, presence & updates
  useEffect(() => {
    if (!isChecked) return

    loadData() // Initial load

    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    const localUser = userStr ? JSON.parse(userStr) : null
    const currentUserId = user?.id || localUser?.id

    if (!currentUserId) return

    let wsHost = window.location.host
    let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    const apiUrl = process.env.NEXT_PUBLIC_API_URL
    if (apiUrl && apiUrl.startsWith('http')) {
      try {
        const url = new URL(apiUrl)
        let hostName = url.hostname
        const port = url.port

        if ((hostName === 'localhost' || hostName === '127.0.0.1') &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1') {
          hostName = window.location.hostname
        }

        wsHost = port ? `${hostName}:${port}` : hostName
        protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      } catch (e) {
        console.error('Failed to parse NEXT_PUBLIC_API_URL:', e)
      }
    }

    const wsUrl = `${protocol}//${wsHost}/ws/${currentUserId}`
    let socket: WebSocket | null = null
    let reconnectTimeout: any = null

    const connect = () => {
      socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        console.log('User Dashboard WebSocket connected')
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'presence_update') {
            setTechniciansPresence(prev => ({
              ...prev,
              [data.technician_id]: data.status
            }))
          } else if (data.type === 'ticket_created' || data.type === 'ticket_updated') {
            // Live update tickets, dashboard summary & comments on mutation events
            loadData()
          } else if (data.type === 'database_reset') {
            console.log('Received database_reset signal via WebSocket')
            setTickets([])
            setSelectedTicket(null)
            setNotifications([])
            setAnnouncements([])
            loadData()
            loadChatSessions()
          } else if (data.type === 'typing') {
            if (data.conversation_id === currentSessionId && data.user_id !== currentUserId) {
              setRemoteTyping({
                conversationId: data.conversation_id,
                userId: data.user_id,
                isTyping: data.is_typing
              })
              // Reset typing automatically after 4s
              setTimeout(() => {
                setRemoteTyping(prev => {
                  if (prev && prev.userId === data.user_id && prev.conversationId === data.conversation_id) {
                    return null
                  }
                  return prev
                })
              }, 4000)
            }
          }
        } catch (e) {
          console.error('Error handling websocket message:', e)
        }
      }

      socket.onclose = () => {
        console.log('User Dashboard WebSocket disconnected, reconnecting...')
        reconnectTimeout = setTimeout(connect, 3000)
      }

      socket.onerror = (error) => {
        console.error('User Dashboard WebSocket error:', error)
      }
    }

    connect()

    return () => {
      if (socket) {
        socket.onclose = null
        socket.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
    }
  }, [isChecked, user?.id, currentSessionId, selectedTicket])

  // KB Live search with debounce (Standard SQL / Semantic Qdrant)
  useEffect(() => {
    const performKBSearch = async () => {
      if (!searchQuery) {
        // Load default published articles
        try {
          const res = await kbApi.list()
          setKbArticles(res.data?.articles || res.data || [])
        } catch (e) {
          console.error(e)
        }
        return
      }

      try {
        const res = await kbApi.search(searchQuery, semanticSearch)
        setKbArticles(res.data?.articles || res.data || [])
      } catch (err) {
        console.error('KB Search failed:', err)
      }
    }

    const handler = setTimeout(performKBSearch, 300)
    return () => clearTimeout(handler)
  }, [searchQuery, semanticSearch])

  // Debounced AI Draft ticket analysis
  useEffect(() => {
    if (!ticketSubject.trim() && !ticketDesc.trim()) {
      setAiDraftAnalysis(null)
      setAiDraftDuplicates([])
      setAiDraftKBMatches([])
      return
    }

    const analyzeTicketDraft = async () => {
      setIsAiDraftLoading(true)
      try {
        const token = localStorage.getItem('access_token')
        const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
        const response = await fetch(`${baseURL}/ai/analyze-draft`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            subject: ticketSubject,
            description: ticketDesc,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setAiDraftAnalysis({
            suggestions: data.analysis?.suggestions || [],
            aiReport: data.analysis?.ai_report || data.analysis?.root_cause || '',
            confidence: data.analysis?.confidence || 75.0,
          })
          setAiDraftDuplicates(data.duplicates || [])
          setAiDraftKBMatches(data.kb_articles || [])
        }
      } catch (err) {
        console.error('Failed to analyze ticket draft:', err)
      } finally {
        setIsAiDraftLoading(false)
      }
    }

    const delayDebounceFn = setTimeout(() => {
      if (ticketSubject.length > 3 || ticketDesc.length > 5) {
        analyzeTicketDraft()
      }
    }, 1000)

    return () => clearTimeout(delayDebounceFn)
  }, [ticketSubject, ticketDesc])

  // Auto-scroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages, chatLoading, streamingContent])

  // Global search filters
  const filteredTicketsList = useMemo(() => {
    if (!searchQuery) return tickets
    return tickets.filter(t => 
      t.ticket_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [tickets, searchQuery])

  // Reset tickets page on search query change
  useEffect(() => {
    setTicketsPage(1)
  }, [searchQuery])

  const ticketsPerPage = 6
  const totalTicketsPages = Math.ceil(filteredTicketsList.length / ticketsPerPage)

  const paginatedTicketsList = useMemo(() => {
    const startIndex = (ticketsPage - 1) * ticketsPerPage
    return filteredTicketsList.slice(startIndex, startIndex + ticketsPerPage)
  }, [filteredTicketsList, ticketsPage])

  const filteredAssetsList = useMemo(() => {
    if (!searchQuery) return assets
    return assets.filter(a => 
      a.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.hardware_info?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.os_version?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [assets, searchQuery])

  const filteredKBArticles = useMemo(() => {
    return kbArticles
  }, [kbArticles])

  // Count unread notifications
  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter(n => !n.is_read).length
  }, [notifications])

  // Count online technicians using live presence statuses
  const onlineTechniciansCount = useMemo(() => {
    return Object.values(techniciansPresence).filter(status => status === 'online').length
  }, [techniciansPresence])

  // Notification management functions
  const handleMarkNotificationRead = async (id: string) => {
    try {
      await notificationApi.markRead(id)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleMarkAllNotificationsRead = async () => {
    try {
      await notificationApi.markAllRead()
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteNotification = async (id: string) => {
    try {
      await notificationApi.delete(id)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        notifPanelRef.current &&
        !notifPanelRef.current.contains(e.target as Node) &&
        notifBtnRef.current &&
        !notifBtnRef.current.contains(e.target as Node)
      ) {
        setIsNotificationOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // AI Streaming chat interaction via SSE
  const handleSendChat = async (e?: FormEvent, overrideText?: string) => {
    if (e) e.preventDefault()
    const userText = (overrideText || chatInput).trim()
    if (!userText || chatLoading) return
    if (!currentSessionId) return

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg: ChatMessage = {
      role: 'user',
      content: userText,
      text: userText,
      timestamp,
      attachmentUrl: chatAttachmentPreview || undefined,
      attachmentType: chatAttachmentFile?.type?.startsWith('image/') ? 'image' : chatAttachmentFile ? 'log' : undefined,
    }

    // Optimistically add user message to UI
    setChatSessions(prev => prev.map(s =>
      s.id === currentSessionId
        ? { ...s, messages: [...s.messages, userMsg] }
        : s
    ))
    setChatInput('')
    setChatAttachmentFile(null)
    setChatAttachmentPreview('')
    setChatLoading(true)
    setStreamingContent('')

    try {
      const token = localStorage.getItem('access_token')
      const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
      const resp = await fetch(`${baseURL}/ai/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          message: userText, 
          conversation_id: currentSessionId,
          attachment_url: userMsg.attachmentUrl || "",
          attachment_type: userMsg.attachmentType || ""
        }),
      })

      if (!resp.ok || !resp.body) {
        throw new Error(`AI Error: ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let boundary = buffer.indexOf('\n')
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary).trim()
          buffer = buffer.slice(boundary + 1)

          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim()
              if (jsonStr) {
                const data = JSON.parse(jsonStr)
                if (data.content) {
                  accumulated += data.content
                  setStreamingContent(accumulated)
                }
                if (data.done) {
                  // Finalize message in state
                  const assistantMsg: ChatMessage = {
                    role: 'assistant',
                    content: accumulated,
                    text: accumulated,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  }
                  setChatSessions(prev => prev.map(s =>
                    s.id === currentSessionId
                      ? { ...s, messages: [...s.messages, assistantMsg] }
                      : s
                  ))
                  setStreamingContent('')
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE JSON chunk:', line, e)
            }
          }
          boundary = buffer.indexOf('\n')
        }
      }
    } catch (err: any) {
      console.error(err)
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `⚠️ Gagal menghubungi AI Copilot: ${err.message || 'Unknown error'}.\n\nPastikan Ollama berjalan dan model tersedia.`,
        text: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setChatSessions(prev => prev.map(s =>
        s.id === currentSessionId
          ? { ...s, messages: [...s.messages, errorMsg] }
          : s
      ))
    } finally {
      setChatLoading(false)
      setStreamingContent('')
    }
  }

  // Voice input using Web Speech API
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Browser tidak mendukung Voice Input. Gunakan Chrome.')
      return
    }
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognitionClass()
    recognition.lang = 'id-ID'
    recognition.continuous = false
    recognition.interimResults = false
    setIsVoiceRecording(true)
    recognition.start()
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setChatInput(prev => prev + transcript)
      setIsVoiceRecording(false)
    }
    recognition.onerror = () => setIsVoiceRecording(false)
    recognition.onend = () => setIsVoiceRecording(false)
  }

  // File attachment handling (uploads immediately to backend)
  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = localStorage.getItem('access_token')
      const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
      const response = await fetch(`${baseURL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload file')
      }

      const result = await response.json()
      setChatAttachmentFile(file)
      setChatAttachmentPreview(result.url)
    } catch (err) {
      console.error(err)
      alert('Gagal mengunggah file. Silakan coba lagi.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Copy message to clipboard
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      // Could show toast here
    })
  }

  // Export full conversation as text
  const handleExportConversation = () => {
    if (!currentSession) return
    const lines = currentSession.messages.map(m =>
      `[${m.timestamp}] ${m.role === 'user' ? 'User' : 'AI Copilot'}:\n${m.content || m.text}`
    ).join('\n\n---\n\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `copilot-${currentSessionId}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Create new chat session from DB
  const handleCreateNewSession = async () => {
    try {
      const res = await aiApi.createConversation(`Obrolan Baru #${chatSessions.length + 1}`)
      const newConv = res.data?.conversation
      if (newConv) {
        const newSession: ChatSession = {
          id: newConv.id,
          title: newConv.title,
          messages: [{
            role: 'assistant',
            content: 'Halo! Saya Copilot AI bantuan teknis Anda. Jelaskan masalah IT Anda.',
            text: '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }],
          updatedAt: newConv.updated_at,
        }
        setChatSessions(prev => [newSession, ...prev])
        setCurrentSessionId(newConv.id)
      }
    } catch (err) {
      console.error('Failed to create conversation', err)
    }
  }

  const handleDeleteSession = async (id: string, e: any) => {
    e.stopPropagation()
    try {
      await aiApi.deleteConversation(id)
      const filtered = chatSessions.filter(s => s.id !== id)
      setChatSessions(filtered)
      if (currentSessionId === id && filtered.length > 0) {
        setCurrentSessionId(filtered[0].id)
      }
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }


  // Create Ticket Submit
  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault()
    if (!ticketSubject.trim() || !ticketDesc.trim()) return

    setLoading(prev => ({ ...prev, createTicket: true }))
    setErrors(prev => ({ ...prev, createTicket: '' }))
    setTicketSuccessMsg('')

    let finalDesc = ticketDesc
    if (ticketAttachmentUrl) {
      finalDesc += `\n\n[Lampiran File: ${ticketAttachmentUrl}]`
    }

    const extraFields = {
      category: ticketCategory,
      sub_category: ticketSubCategory,
      device: ticketDeviceCorrelation,
      department: ticketDepartment,
    }

    try {
      const res = await ticketApi.create(ticketSubject, finalDesc, ticketSeverity, extraFields)
      setTicketSuccessMsg(`Tiket ${res.data?.ticket_no || ''} berhasil dibuat!`)
      setTicketSubject('')
      setTicketDesc('')
      setTicketDeviceCorrelation('')
      setTicketAttachmentFile(null)
      setTicketAttachmentUrl('')
      setTicketPreview(false)
      loadData()
      
      // Auto redirect to My Tickets tab
      setTimeout(() => {
        setActiveTab('my-tickets')
        setTicketSuccessMsg('')
      }, 2000)
    } catch (err: any) {
      console.error(err)
      setErrors(prev => ({ ...prev, createTicket: 'Gagal membuat tiket. Hubungi admin sistem.' }))
    } finally {
      setLoading(prev => ({ ...prev, createTicket: false }))
    }
  }

  // Load Software details for specific asset
  const handleSelectAsset = async (asset: any) => {
    setSelectedAsset(asset)
    setLoadingSoftware(true)
    setAssetSoftware([])
    try {
      const res = await assetApi.getSoftware(asset.id)
      setAssetSoftware(res.data?.software || [])
    } catch (err) {
      console.error('Failed to load software for asset', err)
    } finally {
      setLoadingSoftware(false)
    }
  }

  // Add Comment to Detail Ticket
  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!newCommentText.trim() || !selectedTicket) return

    setCommentLoading(true)
    try {
      await ticketApi.addComment(selectedTicket.id, newCommentText.trim(), false)
      setNewCommentText('')
      
      // Refresh current ticket
      const detailRes = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(detailRes.data)
    } catch (err) {
      console.error('Failed to add comment', err)
    } finally {
      setCommentLoading(false)
    }
  }

  // Escalate current chat session context into Create Ticket Form
  const handleEscalateChatToTicket = () => {
    if (!currentSession) return
    const userMsgs = currentSession.messages.filter(m => m.role === 'user').map(m => m.content || m.text || '').join('\n\n')
    const assistantMsgs = currentSession.messages.filter(m => m.role === 'assistant').map(m => m.content || m.text || '').join('\n\n')
    
    setTicketSubject(`AI Copilot: ${currentSession.title}`)
    setTicketDesc(`--- Riwayat Percakapan AI Copilot ---\n\nUser:\n${userMsgs}\n\nAI Suggestions:\n${assistantMsgs}`)
    setActiveTab('create-ticket')
  }

  // Change Profile Info - Real API
  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await profileApi.update({ name: profileName, email: profileEmail })
      // Update local user store
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const u = JSON.parse(userStr)
        u.name = profileName
        u.email = profileEmail
        localStorage.setItem('user', JSON.stringify(u))
      }
      alert('Informasi profil berhasil diperbarui!')
    } catch (err: any) {
      alert('Gagal memperbarui profil: ' + (err?.response?.data?.error || err.message))
    }
  }

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!passwordOld || !passwordNew) return
    try {
      await profileApi.updatePassword(passwordOld, passwordNew)
      alert('Password berhasil diperbarui!')
      setPasswordOld('')
      setPasswordNew('')
    } catch (err: any) {
      alert('Gagal mengubah password: ' + (err?.response?.data?.error || err.message))
    }
  }


  // Standard Logout logic
  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (e) {
      console.error('API logout failed', e)
    }

    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    localStorage.removeItem('helpdesk_chat_history')
    localStorage.removeItem('helpdesk_admin_chat_history')
    localStorage.removeItem('clientActiveTab')
    
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;'
    logoutStore()
    router.push('/')
  }

  // Formatter functions
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // SLA due relative parser helper
  const getSLACountdown = (dueDateStr: string | null | undefined) => {
    if (!dueDateStr) return { text: 'N/A', status: 'normal' }
    const due = new Date(dueDateStr).getTime()
    const now = new Date().getTime()
    const diff = due - now
    if (diff <= 0) return { text: 'SLA Terlewati (Breached)', status: 'critical' }
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours < 1) {
      return { text: `${mins}m tersisa`, status: 'critical' }
    } else if (hours < 4) {
      return { text: `${hours}j ${mins}m tersisa`, status: 'warning' }
    }
    return { text: `${hours}j ${mins}m tersisa`, status: 'normal' }
  }



  if (!isHydrated || !isChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400"></div>
          <p className="mt-4 text-slate-300 font-medium">Memuat Portal Pelanggan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen relative ${isDarkMode ? 'dark' : ''} bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors duration-300`}>
      <ParticleNetwork />
      <div className="flex h-screen overflow-hidden">
        
        {/* ================= SIDEBAR NAVIGATION ================= */}
        <aside className={`fixed inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          {/* Collapse Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="absolute top-6 -right-3.5 z-50 h-7 w-7 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-950 dark:hover:text-white shadow-md transition-all duration-300 hover:scale-110 cursor-pointer hidden lg:flex"
            title={sidebarCollapsed ? "Perluas Sidebar" : "Sembunyikan Sidebar"}
            type="button"
          >
            <svg 
              className={`w-3.5 h-3.5 transform transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className={`p-6 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}>
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-sky-500/20 shrink-0">
              HD
            </div>
            {!sidebarCollapsed && (
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white leading-tight">Helpdesk AI</h2>
                <span className="text-xs text-sky-500 font-semibold tracking-wider uppercase">Portal Client</span>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5 scrollbar-none">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'create-ticket', label: 'Buat Tiket Baru', icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z' },
              { id: 'my-tickets', label: 'Tiket Saya', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
              { id: 'kb', label: 'Knowledge Base', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
              { id: 'notifications', label: 'Notifikasi', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', badge: unreadNotificationsCount },
              { id: 'announcements', label: 'Pengumuman', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
              { id: 'profile', label: 'Profil Saya', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
              { id: 'settings', label: 'Pengaturan', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM12 15a3 3 0 100-6 3 3 0 000 6z' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id)
                  setMobileMenuOpen(false)
                }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`gaya-list-baru ${
                  sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3 lg:mx-auto lg:w-12 w-full flex justify-between px-4 py-3' : 'w-full flex justify-between px-4 py-3'
                } rounded-2xl text-sm font-medium transition-all ${
                  activeTab === item.id
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className={`flex items-center gap-3`}>
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {(!sidebarCollapsed || mobileMenuOpen) && <span>{item.label}</span>}
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shrink-0 ${
                    sidebarCollapsed ? 'lg:absolute lg:-top-1.5 lg:-right-1.5 lg:h-4 lg:w-4 lg:text-[8px] lg:ring-1 lg:ring-white lg:dark:ring-slate-950 relative ml-2' : 'ml-2'
                  }`}>
                    {sidebarCollapsed && item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </button>
            ))}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              title={sidebarCollapsed ? "Logout" : undefined}
              className={`w-full flex items-center ${
                sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3 lg:mx-auto lg:w-12 px-4 py-3' : 'px-4 py-3'
              } gap-3 rounded-2xl text-sm font-medium text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 border border-transparent transition-all`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {(!sidebarCollapsed || mobileMenuOpen) && <span>Logout</span>}
            </button>
          </nav>

          <div className={`p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 ${sidebarCollapsed ? 'lg:flex lg:justify-center' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 shrink-0" title={sidebarCollapsed ? user?.username : undefined}>
                {user?.username?.substring(0, 2).toUpperCase() || 'US'}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.username}</p>
                  <p className="text-xs text-slate-400 capitalize truncate">{user?.role} • Umum</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Sidebar Overlay for mobile */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          />
        )}

        {/* ================= MAIN CONTAINER ================= */}
        <div className={`flex-1 flex flex-col ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'} overflow-hidden transition-all duration-300`}>
          
          {/* ================= TOP NAVBAR ================= */}
          <header className="bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 backdrop-blur-md sticky top-0 z-30 shrink-0">
            <div className="px-6 py-3.5 flex items-center justify-between gap-4">
              
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden shrink-0"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                {/* Global Search Input */}
                <div className="relative max-w-md hidden sm:block">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Cari di ${activeTab}...`}
                    className="w-80 pl-9 pr-4 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-transparent rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white dark:focus:bg-slate-900 dark:focus:border-slate-700 transition-all text-slate-950 dark:text-white"
                  />
                </div>

                {/* Announcement Ticker */}
                {announcements.length > 0 && (
                  <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20 max-w-sm truncate animate-pulse">
                    <span className="uppercase text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-black shrink-0">Penting</span>
                    <span className="truncate">{announcements[0].title}</span>
                  </div>
                )}
              </div>

              {/* Toolbar Controls */}
              <div className="flex items-center gap-3 shrink-0">
                
                {/* Theme Switcher Toggler */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all"
                  title="Ganti Tema"
                >
                  {isDarkMode ? (
                    <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm5.657 9.193l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zM5 11a1 1 0 100-2H4a1 1 0 100 2h1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                </button>

                {/* ── NOTIFICATION BELL ── */}
                <div className="relative flex-shrink-0">
                  <button
                    ref={notifBtnRef}
                    id="client-notification-bell-btn"
                    onClick={() => {
                      setIsNotificationOpen((v) => !v)
                      if (!isNotificationOpen) {
                        setLoadingNotif(true)
                        notificationApi.list()
                          .then((res) => {
                            const data = res.data?.data ?? res.data ?? []
                            setNotifications(Array.isArray(data) ? data : [])
                          })
                          .catch(() => {})
                          .finally(() => setLoadingNotif(false))
                      }
                    }}
                    className="relative p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all"
                    title="Notifikasi"
                    type="button"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadNotificationsCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse">
                        {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                      </span>
                    )}
                  </button>

                  {/* ── Dropdown Panel ── */}
                  {isNotificationOpen && (
                    <div
                      ref={notifPanelRef}
                      id="client-notification-panel"
                      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden z-[9999]"
                      style={{ animation: 'fadeSlideDown 0.15s ease-out' }}
                    >
                      {/* Panel Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">Notifikasi</span>
                          {unreadNotificationsCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white">
                              {unreadNotificationsCount} baru
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {unreadNotificationsCount > 0 && (
                            <button
                              onClick={handleMarkAllNotificationsRead}
                              className="text-[10px] font-semibold text-sky-500 hover:text-sky-400 transition-colors"
                              type="button"
                            >
                              Tandai semua dibaca
                            </button>
                          )}
                          <button
                            onClick={() => setIsNotificationOpen(false)}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                            type="button"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Notification List */}
                      <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/60">
                        {loadingNotif ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-2">
                            <svg className="w-5 h-5 text-sky-400 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-xs text-gray-400">Memuat notifikasi...</span>
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-2xl">🔔</div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tidak ada notifikasi</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Semua sudah terbaca</p>
                          </div>
                        ) : (
                          notifications.map((notif: any) => {
                            const typeIcon = notif.type === 'ticket' ? '🎫' : notif.type === 'alert' ? '🚨' : notif.type === 'sla' ? '⏰' : notif.type === 'system' ? '⚙️' : '🔔'
                            const typeColor = notif.type === 'ticket' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                              : notif.type === 'alert' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : notif.type === 'sla' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                            return (
                              <div
                                key={notif.id}
                                className={`group flex items-start gap-3 px-4 py-3 transition-all hover:bg-gray-50 dark:hover:bg-slate-800/60 ${
                                  !notif.is_read ? 'bg-sky-50/50 dark:bg-sky-500/5' : ''
                                }`}
                              >
                                {/* Icon */}
                                <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl border flex items-center justify-center text-sm ${typeColor}`}>
                                  {typeIcon}
                                </div>

                                {/* Content */}
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() => {
                                    if (!notif.is_read) handleMarkNotificationRead(notif.id)
                                    setIsNotificationOpen(false)
                                    if (notif.resource_type === 'ticket' && notif.resource_id) {
                                      router.push(`/dashboard/user?id=${notif.resource_id}`)
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <p className={`text-xs font-semibold truncate ${!notif.is_read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                                      {notif.title}
                                    </p>
                                    {!notif.is_read && (
                                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-sky-500" />
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                    {notif.message}
                                  </p>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                    {new Date(notif.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>

                                {/* Actions */}
                                <div className="flex-shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {!notif.is_read && (
                                    <button
                                      onClick={() => handleMarkNotificationRead(notif.id)}
                                      title="Tandai dibaca"
                                      className="p-1 rounded-md text-sky-400 hover:bg-sky-500/10 transition-all"
                                      type="button"
                                    >
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteNotification(notif.id)}
                                    title="Hapus"
                                    className="p-1 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                    type="button"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Panel Footer */}
                      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 flex justify-between items-center">
                        <button
                          onClick={() => { setActiveTab('notifications'); setIsNotificationOpen(false) }}
                          className="text-[10px] text-sky-500 hover:text-sky-400 font-semibold transition-colors"
                          type="button"
                        >
                          Lihat semua notifikasi
                        </button>
                        {notifications.length > 0 && (
                          <button
                            onClick={() => { setNotifications([]); setIsNotificationOpen(false) }}
                            className="text-[10px] text-gray-400 hover:text-rose-400 transition-colors font-medium"
                            type="button"
                          >
                            Hapus semua
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* ── END NOTIFICATION BELL ── */}

                {/* User Info Avatar */}
                <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
                  <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                    {user?.username?.substring(0, 2).toUpperCase() || 'US'}
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 hidden md:inline truncate max-w-28">{user?.username}</span>
                </div>

              </div>

            </div>

          </header>

          {/* Animation keyframe for notification dropdown */}
          <style>{`
            @keyframes fadeSlideDown {
              from { opacity: 0; transform: translateY(-8px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          {/* ================= MAIN VIEW CONTENT ================= */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-slate-955">

            {/* ================= VIEW: DASHBOARD ================= */}
            {activeTab === 'dashboard' && (
              <div className="space-y-4 w-full">
                
                {/* Welcome Card Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-955 p-5 text-white shadow-2xl border border-white/5">
                  <div className="absolute right-0 top-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 space-y-3">
                    <span className="text-xs font-black uppercase tracking-[0.25em] text-sky-400">Portal Dukungan AI</span>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Selamat Datang, {user?.username}!</h1>
                    <p className="text-slate-350 max-w-2xl text-xs leading-relaxed">
                      Butuh bantuan IT hari ini? Anda bisa memantau telemetri aset perangkat keras atau membuat tiket bantuan langsung ke teknisi kami.
                    </p>
                    <div className="flex flex-wrap gap-4 pt-2">
                      <button
                        onClick={() => setActiveTab('create-ticket')}
                        className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
                      >
                        Buat Tiket Baru
                      </button>
                    </div>

                  </div>
                </div>

                {/* Ticket Summaries Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {[
                    { title: 'Tiket Terbuka', val: tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved').length, color: 'text-sky-500 border-sky-500/10 bg-sky-500/5' },
                    { title: 'Menunggu Tanggapan', val: tickets.filter(t => t.status === 'need_approval').length, color: 'text-amber-500 border-amber-500/10 bg-amber-500/5' },
                    { title: 'Terselesaikan', val: tickets.filter(t => t.status === 'resolved').length, color: 'text-emerald-500 border-emerald-500/10 bg-emerald-500/5' },
                    { title: 'Semua Tiket Saya', val: tickets.length, color: 'text-slate-400 border-slate-500/10 bg-slate-500/5' },
                  ].map((sum, i) => (
                    <div key={i} className={`rounded-3xl border p-4 shadow-sm ${sum.color}`}>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{sum.title}</p>
                      <p className="text-2xl font-black mt-1.5">{sum.val}</p>
                    </div>
                  ))}
                </div>



                {/* Double Panel Layout */}
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                  
                  {/* Left Column: Recent Tickets & Announcements */}
                  <div className="space-y-4">
                    
                    {/* Recent Tickets Table */}
                    <div className="glass-card-soft rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-slate-900 dark:text-white">Tiket Terkini</h2>
                        <button onClick={() => setActiveTab('my-tickets')} className="text-xs text-sky-500 hover:underline font-semibold">Semua Tiket</button>
                      </div>
                      {filteredTicketsList.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-black">
                                <th className="pb-3">Tiket No</th>
                                <th className="pb-3">Subjek</th>
                                <th className="pb-3">Prioritas</th>
                                <th className="pb-3">Status</th>
                                <th className="pb-3">Dibuat</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                              {filteredTicketsList.slice(0, 5).map((t) => (
                                <tr key={t.id} className="hover:bg-slate-55/30 dark:hover:bg-slate-800/20 cursor-pointer" onClick={async () => { 
                                  try { 
                                    const res = await ticketApi.get(t.id)
                                    setSelectedTicket(res.data)
                                  } catch { 
                                    setSelectedTicket(t) 
                                  } 
                                  setActiveTab('my-tickets') 
                                }}>
                                  <td className="py-3 font-semibold text-sky-500">{t.ticket_no}</td>
                                  <td className="py-3 font-medium text-slate-900 dark:text-white truncate max-w-44">{t.title}</td>
                                  <td className="py-3 capitalize">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      t.severity === 'critical' || t.severity === 'high' ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-slate-400'
                                    }`}>{t.severity}</span>
                                  </td>
                                  <td className="py-3 capitalize">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      t.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-sky-500/10 text-sky-500'
                                    }`}>{t.status}</span>
                                  </td>
                                  <td className="py-3 text-slate-400">{formatDate(t.created_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-slate-400 text-sm">Tidak ada tiket bantuan.</div>
                      )}
                    </div>

                    {/* Announcements Board */}
                    <div className="glass-card-soft rounded-3xl p-6 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-bold text-slate-900 dark:text-white">Pengumuman & Pemeliharaan</h2>
                        <button onClick={() => setActiveTab('announcements')} className="text-xs text-sky-500 hover:underline font-semibold">Semua Pengumuman</button>
                      </div>
                      <div className="space-y-3">
                        {announcements.length > 0 ? (
                          announcements.slice(0, 3).map((ann) => (
                            <div key={ann.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] uppercase font-black text-sky-500 block mb-1">{formatDate(ann.created_at)}</span>
                              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{ann.title}</h3>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ann.content}</p>
                            </div>
                          ))
                        ) : (
                          <>
                            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                              <span className="text-[10px] uppercase font-black text-amber-500 block mb-1">30 Jun 2026</span>
                              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Pemeliharaan Server Database Helpdesk</h3>
                              <p className="text-xs text-slate-400 mt-1">Layanan helpdesk akan mengalami downtime selama 30 menit mulai pukul 23:00 WIB untuk optimasi database CMDB.</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/10">
                              <span className="text-[10px] uppercase font-black text-sky-500 block mb-1">25 Jun 2026</span>
                              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Pembaruan Versi Desktop Agent Client</h3>
                              <p className="text-xs text-slate-400 mt-1">Kami merilis helpdesk agent v2.1. Silakan instal atau update agen Anda untuk sinkronisasi metric CPU real-time.</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Recommendations & System Status */}
                  <div className="space-y-4">
                    
                    {/* System Status widgets */}
                    <div className="glass-card-soft rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                      <h2 className="font-bold text-slate-900 dark:text-white">Status Sistem Dukungan</h2>
                      <div className="space-y-3">
                        {[
                          { name: 'Teknisi Online', status: onlineTechniciansCount > 0 ? `${onlineTechniciansCount} aktif` : '0 aktif', dot: onlineTechniciansCount > 0 ? 'bg-emerald-400' : 'bg-slate-400' },
                        ].map((sys, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{sys.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{sys.status}</span>
                              <span className={`h-2 w-2 rounded-full ${sys.dot}`} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>


                    {/* Favorite Articles */}
                    <div className="glass-card-soft rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                      <h2 className="font-bold text-slate-900 dark:text-white">Artikel Populer</h2>
                        {kbArticles.length > 0 ? (
                          kbArticles.slice(0, 5).map((art: any) => (
                            <button 
                              key={art.id} 
                              onClick={() => setViewingKBArticle(art)} 
                              className="w-full text-left text-xs hover:text-sky-500 cursor-pointer truncate block py-2 px-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-300 transition-all duration-200 hover:translate-x-1.5 flex items-center gap-2"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-600 transition-colors group-hover:bg-sky-500 shrink-0" />
                              <span className="truncate">{art.title}</span>
                            </button>
                          ))
                        ) : (
                          [
                            'Cara menyambungkan ke WiFi korporat',
                            'Mengatasi printer tidak terdeteksi windows 11',
                            'Prosedur pengajuan software berbayar (MS Visio)',
                          ].map((art, idx) => (
                            <button 
                              key={idx} 
                              onClick={() => setActiveTab('kb')} 
                              className="w-full text-left text-xs hover:text-sky-500 cursor-pointer truncate block py-2 px-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-300 transition-all duration-200 hover:translate-x-1.5 flex items-center gap-2"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-600 transition-colors group-hover:bg-sky-500 shrink-0" />
                              <span className="truncate">{art}</span>
                            </button>
                          ))
                        )}
                    </div>

                  </div>

                </div>

              </div>
            )}

            {/* ================= VIEW: AI ASSISTANT (COPILOT) ================= */}
            {activeTab === 'ai-assistant' && (
              <div className="flex gap-4 w-full h-[calc(100vh-140px)] overflow-hidden">

                {/* ---- LEFT: Conversation History Sidebar ---- */}
                <div className="hidden lg:flex flex-col w-72 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-500/5 to-sky-500/5">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">AI Copilot</div>
                      <div className="text-[10px] text-sky-500 font-semibold flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                        Qwen3 8B · Ollama
                      </div>
                    </div>
                    <button
                      onClick={handleCreateNewSession}
                      className="p-2 rounded-xl bg-sky-500 text-white hover:bg-sky-400 transition-all shadow-sm shadow-sky-500/20 active:scale-95"
                      title="Percakapan Baru"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {chatSessions.length === 0 && (
                      <div className="text-center text-xs text-slate-400 py-8">Belum ada percakapan</div>
                    )}
                    {chatSessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => setCurrentSessionId(session.id)}
                        className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs text-left transition-all ${
                          currentSessionId === session.id
                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-3.5 h-3.5 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span className="truncate font-medium">{session.title}</span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-500 rounded text-slate-400 transition-all"
                          title="Hapus"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </button>
                    ))}
                  </div>

                  {/* Quick Prompts */}
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-1">Pertanyaan Populer</div>
                    <div className="space-y-1">
                      {[
                        'Internet saya tidak bisa connect',
                        'PC lambat, gimana solusinya?',
                        'Cara reset password domain',
                        'Printer offline tidak terdeteksi',
                      ].map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendChat(undefined, q)}
                          disabled={chatLoading}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all truncate"
                        >
                          💬 {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ---- RIGHT: Chat Window ---- */}
                <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col overflow-hidden min-w-0">

                  {/* Header */}
                  <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-sky-500/5">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">AI Copilot</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${chatLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                          {chatLoading ? 'Sedang memproses...' : 'Siap membantu'}
                          {onlineTechniciansCount > 0 && (
                            <span className="text-emerald-500 font-bold ml-1.5 flex items-center gap-1">
                              <span className="h-1 w-1 rounded-full bg-emerald-500" />
                              {onlineTechniciansCount} Teknisi Online
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleExportConversation}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-xs font-semibold"
                        title="Export Percakapan"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          if (!currentSession) return
                          const txt = currentSession.messages.map(m => `[${m.role.toUpperCase()}]\n${m.content || m.text}`).join('\n\n')
                          navigator.clipboard.writeText(txt)
                        }}
                        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        title="Salin Percakapan"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={handleEscalateChatToTicket}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition-all shadow-sm shadow-sky-500/20 active:scale-95"
                        title="Eskalasi ke Tiket"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Buat Tiket
                      </button>
                    </div>
                  </div>

                  {/* Messages Container */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {(!currentSession || currentSession.messages.length === 0) && !chatLoading && (
                      <div className="flex flex-col items-center justify-center h-full text-center py-8">
                        <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 flex items-center justify-center mb-4 border border-indigo-500/20">
                          <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Asisten AI Copilot</h3>
                        <p className="text-sm text-slate-400 max-w-sm mb-6">Tanyakan apa saja untuk memecahkan masalah IT Anda atau buat tiket langsung.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl w-full">
                          {[
                            { title: 'Koneksi internet terputus', desc: 'Langkah memecahkan masalah wifi/jaringan' },
                            { title: 'PC berjalan lambat', desc: 'Cara membersihkan file temporary dan RAM' },
                            { title: 'Reset password akun', desc: 'Instruksi reset password email/domain kantor' },
                            { title: 'Printer offline/tidak terdeteksi', desc: 'Panduan konfigurasi ulang driver printer' },
                          ].map((item, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSendChat(undefined, item.title)}
                              className="p-4 text-left rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-500/50 dark:hover:border-sky-500/50 hover:bg-slate-50 dark:hover:bg-slate-850/40 transition-all group"
                            >
                              <div className="font-semibold text-xs text-slate-900 dark:text-white group-hover:text-sky-500 transition-colors">{item.title}</div>
                              <div className="text-[11px] text-slate-400 mt-1">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentSession?.messages.map((msg, index) => (
                      <div
                        key={msg.id || index}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0 mr-2 mt-1 shadow-sm">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                        )}
                        <div className={`max-w-[80%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          {msg.attachmentUrl && msg.attachmentType === 'image' && (
                            <img
                              src={msg.attachmentUrl}
                              alt="attachment"
                              className="rounded-2xl max-w-xs max-h-48 object-cover mb-1 border border-slate-200 dark:border-slate-700"
                            />
                          )}
                          {msg.attachmentUrl && msg.attachmentType !== 'image' && (
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold mb-1 border border-slate-200 dark:border-slate-700 text-sky-500 transition-all"
                            >
                              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>Lampiran Dokumen/Log</span>
                            </a>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed relative ${
                              msg.role === 'user'
                                ? 'bg-sky-500 text-white rounded-br-none shadow-sm shadow-sky-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {/* Render with basic markdown-like formatting */}
                            <div className="whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                              {(msg.content || msg.text || '').split('\n').map((line, i) => {
                                // Bold: **text**
                                const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                  .replace(/`(.*?)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
                                if (line.startsWith('- ') || line.startsWith('• ')) {
                                  return <div key={i} className="flex gap-2 items-start" dangerouslySetInnerHTML={{ __html: `<span class="text-sky-400 mt-0.5">•</span><span>${formatted.replace(/^[-•]\s/, '')}</span>` }} />
                                }
                                if (line.startsWith('## ')) return <div key={i} className="font-bold text-base mt-2" dangerouslySetInnerHTML={{ __html: formatted.replace(/^## /, '') }} />
                                if (line.startsWith('# ')) return <div key={i} className="font-bold text-lg mt-2" dangerouslySetInnerHTML={{ __html: formatted.replace(/^# /, '') }} />
                                return <div key={i} dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }} />
                              })}
                            </div>

                            {/* Copy button on assistant messages */}
                            {msg.role === 'assistant' && (
                              <button
                                onClick={() => handleCopyMessage(msg.content || msg.text || '')}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-white/10 dark:bg-black/20 hover:bg-white/20 transition-all"
                                title="Salin pesan"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                        </div>
                        {msg.role === 'user' && (
                          <div className="h-7 w-7 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 ml-2 mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                            {user?.username?.substring(0, 1).toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Streaming indicator */}
                    {chatLoading && streamingContent && (
                      <div className="flex justify-start group">
                        <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0 mr-2 mt-1 shadow-sm">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div className="max-w-[80%]">
                          <div className="rounded-2xl rounded-bl-none px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100">
                            <div className="whitespace-pre-wrap">{streamingContent}</div>
                            <span className="inline-block w-1 h-4 bg-sky-500 animate-pulse ml-0.5 align-middle" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Typing indicator (before stream starts) */}
                    {chatLoading && !streamingContent && (
                      <div className="flex items-start gap-2">
                        <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0 shadow-sm">
                          <svg className="w-3.5 h-3.5 text-white animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                          </svg>
                        </div>
                        <div className="rounded-2xl rounded-bl-none px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 text-sm flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          <span className="ml-1 text-xs">AI sedang berpikir...</span>
                        </div>
                      </div>
                    )}

                    {/* Remote typing indicator */}
                    {remoteTyping && remoteTyping.isTyping && (
                      <div className="flex items-start gap-2">
                        <div className="h-7 w-7 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-xs font-bold text-slate-600 dark:text-slate-300">
                          T
                        </div>
                        <div className="rounded-2xl rounded-bl-none px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 text-sm flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          <span className="ml-1 text-xs">Teknisi sedang mengetik...</span>
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Attachment uploading strip */}
                  {isUploading && (
                    <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <svg className="w-5 h-5 text-sky-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                      <span className="text-xs text-slate-400">Mengunggah file...</span>
                    </div>
                  )}

                  {/* Attachment preview strip */}
                  {chatAttachmentPreview && (
                    <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                      {chatAttachmentFile?.type?.startsWith('image/') ? (
                        <img src={chatAttachmentPreview} alt="preview" className="h-12 w-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center border border-sky-500/20">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                      <span className="text-xs text-slate-500 flex-1">{chatAttachmentFile?.name}</span>
                      <button
                        type="button"
                        onClick={() => { setChatAttachmentFile(null); setChatAttachmentPreview('') }}
                        className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Input Area */}
                  <form onSubmit={handleSendChat} className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2 shrink-0 bg-white dark:bg-slate-900">

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.log,.txt,.csv"
                      className="hidden"
                      onChange={handleFileAttach}
                    />

                    {/* File Upload Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shrink-0 border border-slate-200 dark:border-slate-700 active:scale-95"
                      title="Upload gambar, screenshot, atau log"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>

                    <textarea
                      value={chatInput}
                      onChange={(e) => {
                        setChatInput(e.target.value)
                        handleUserTyping()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendChat()
                        }
                      }}
                      placeholder="Tanyakan masalah IT... (Enter untuk kirim, Shift+Enter untuk baris baru)"
                      rows={1}
                      className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-sm text-slate-950 dark:text-white border border-slate-200 dark:border-slate-700/80 transition-all resize-none"
                      style={{ minHeight: '48px', maxHeight: '120px' }}
                    />

                    {/* Voice Input Button */}
                    <button
                      type="button"
                      onClick={handleVoiceInput}
                      className={`p-3 rounded-2xl transition-all shrink-0 border active:scale-95 ${
                        isVoiceRecording
                          ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                      }`}
                      title={isVoiceRecording ? 'Merekam suara...' : 'Voice Input (Bahasa Indonesia)'}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>

                    <button
                      type="submit"
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm shadow-sky-500/20 active:scale-95"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            )}


            {/* ================= VIEW: CREATE TICKET ================= */}

            {activeTab === 'create-ticket' && (
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] w-full">
                
                {/* Form Card */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Buat Tiket Bantuan</h2>
                    <p className="text-xs text-slate-400 mt-1">Isi formulir lengkap untuk melaporkan insiden ke tim teknis.</p>
                  </div>

                  {ticketSuccessMsg && (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 text-sm font-semibold border border-emerald-500/20">
                      {ticketSuccessMsg}
                    </div>
                  )}

                  {errors.createTicket && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-500 text-sm font-semibold border border-rose-500/20">
                      {errors.createTicket}
                    </div>
                  )}

                  {ticketPreview ? (
                    /* Ticket Submit Preview */
                    <div className="space-y-6">
                      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-4 text-sm">
                        <h3 className="font-bold text-slate-900 dark:text-white border-b pb-2">Konfirmasi Pengajuan Tiket</h3>
                        <div>
                          <span className="text-slate-400 block text-xs">Subjek</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{ticketSubject}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-slate-400 block text-xs">Kategori</span>
                            <span>{ticketCategory} ({ticketSubCategory})</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-xs">Prioritas</span>
                            <span className="capitalize">{ticketSeverity}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-xs">Departemen</span>
                            <span>{ticketDepartment}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-xs">Aset Perangkat</span>
                            <span>{ticketDeviceCorrelation || 'None'}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">Deskripsi Detail</span>
                          <p className="whitespace-pre-line mt-1 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">{ticketDesc}</p>
                        </div>
                        {ticketAttachmentUrl && (
                          <div>
                            <span className="text-slate-400 block text-xs">Lampiran</span>
                            <span className="text-xs text-sky-500 font-semibold truncate block mt-1">{ticketAttachmentUrl}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-4">
                        <button
                          onClick={() => setTicketPreview(false)}
                          className="flex-1 px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm transition-all hover:bg-slate-200"
                        >
                          Edit Kembali
                        </button>
                        <button
                          onClick={handleCreateTicket}
                          disabled={loading.createTicket}
                          className="flex-1 px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-all shadow-lg shadow-sky-500/20"
                        >
                          {loading.createTicket ? 'Mengirim...' : 'Kirim Tiket Sekarang'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Ticket Input Form */
                    <form onSubmit={(e) => { e.preventDefault(); setTicketPreview(true); }} className="space-y-4">
                      
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Kategori Utama</label>
                          <select
                            value={ticketCategory}
                            onChange={(e) => setTicketCategory(e.target.value)}
                            className="input-field"
                          >
                            <option value="Software">Software & Aplikasi</option>
                            <option value="Hardware">Hardware & Perangkat Keras</option>
                            <option value="Network">Jaringan & Internet</option>
                            <option value="Accounts">Akun & Kredensial</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Sub Kategori</label>
                          <select
                            value={ticketSubCategory}
                            onChange={(e) => setTicketSubCategory(e.target.value)}
                            className="input-field"
                          >
                            <option value="Aplikasi Kantor">Aplikasi Kantor (Word, Excel)</option>
                            <option value="Email & Cloud">Email & Cloud</option>
                            <option value="PC Lambat">PC Lambat / Hang</option>
                            <option value="Koneksi WiFi">Koneksi WiFi Kantor</option>
                            <option value="VPN Client">VPN Client Masalah</option>
                            <option value="Reset Password">Lupa Password / Akun Lock</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Prioritas Tingkat Keparahan</label>
                          <select
                            value={ticketSeverity}
                            onChange={(e) => setTicketSeverity(e.target.value)}
                            className="input-field"
                          >
                            <option value="low">Rendah (Low)</option>
                            <option value="medium">Sedang (Medium)</option>
                            <option value="high">Tinggi (High)</option>
                            <option value="critical">Kritis (Critical - P1 Emergency)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Aset Perangkat Terkait</label>
                          <select
                            value={ticketDeviceCorrelation}
                            onChange={(e) => setTicketDeviceCorrelation(e.target.value)}
                            className="input-field"
                          >
                            <option value="">Tidak ada korelasi perangkat</option>
                            {assets.map(asset => (
                              <option key={asset.id} value={asset.hostname}>{asset.hostname} ({asset.ip_address || 'CMDB'})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Departemen Pelapor</label>
                        <select
                          value={ticketDepartment}
                          onChange={(e) => setTicketDepartment(e.target.value)}
                          className="input-field"
                        >
                          <option value="IT">Teknologi Informasi (IT)</option>
                          <option value="Pemasaran">Pemasaran / Marketing</option>
                          <option value="Keuangan">Keuangan & Finance</option>
                          <option value="HRD">Sumber Daya Manusia (HRD)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Subjek / Judul Masalah</label>
                        <input
                          type="text"
                          required
                          value={ticketSubject}
                          onChange={(e) => setTicketSubject(e.target.value)}
                          placeholder="Contoh: Gagal koneksi VPN setelah update windows"
                          className="input-field"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Deskripsi Kronologi Masalah</label>
                        <textarea
                          required
                          value={ticketDesc}
                          onChange={(e) => setTicketDesc(e.target.value)}
                          rows={6}
                          placeholder="Jelaskan secara detail langkah-langkah terjadinya error, kode error bila ada, dan spesifikasi pendukung..."
                          className="input-field"
                        />
                      </div>

                      {/* Real Attachment Upload */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Lampiran Berkas / Screenshot</label>
                        <div className="relative">
                          <input
                            type="file"
                            id="ticket-file-input"
                            onChange={handleTicketAttachmentUpload}
                            className="hidden"
                          />
                          <label
                            htmlFor="ticket-file-input"
                            className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl py-6 text-xs text-slate-400 hover:border-sky-500 hover:text-sky-500 cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-900/30"
                          >
                            {isTicketUploading ? (
                              <div className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-400"></div>
                                <span>Mengunggah berkas...</span>
                              </div>
                            ) : ticketAttachmentFile ? (
                              <div className="text-center">
                                <p className="font-semibold text-sky-500">✅ {ticketAttachmentFile.name}</p>
                                <p className="text-[10px] text-slate-500">Klik untuk mengganti berkas</p>
                              </div>
                            ) : (
                              <>
                                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4-4m4 4v12" />
                                </svg>
                                <span>Pilih file gambar, log, atau screenshot (.jpg, .png, .log, .pdf)</span>
                              </>
                            )}
                          </label>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full px-5 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-all shadow-lg shadow-sky-500/20 active:scale-95"
                      >
                        Tinjau Pengajuan Tiket
                      </button>

                    </form>
                  )}
                </div>

                {/* Right Column: AI Suggestion & Duplicate Detection Panel */}
                <div className="space-y-4">
                  
                  {/* AI suggestion block */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 font-bold text-xs">AI</span>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Copilot AI Assistant</h3>
                      </div>
                      {aiDraftAnalysis && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-xs font-semibold">
                          <span>Confidence:</span>
                          <span className="font-bold">{aiDraftAnalysis.confidence.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Sambil mengetik, Copilot menganalisa masalah Anda untuk mencari duplikasi, merekomendasikan solusi instan, dan memprediksi SLA secara real-time.
                    </p>

                    {isAiDraftLoading ? (
                      <div className="py-8 text-center space-y-2">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
                        <p className="text-xs text-slate-400">Copilot sedang menganalisa masalah...</p>
                      </div>
                    ) : aiDraftAnalysis ? (
                      <div className="space-y-4">
                        
                        {/* Recommendations/AI Solution */}
                        <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/10 space-y-2 text-xs">
                          <p className="font-bold text-sky-500 flex items-center gap-1">
                            💡 Solusi yang Direkomendasikan
                          </p>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                            {aiDraftAnalysis.aiReport}
                          </p>
                          {aiDraftAnalysis.suggestions.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="font-semibold text-slate-400">Langkah Penyelesaian:</p>
                              {aiDraftAnalysis.suggestions.map((sug, i) => (
                                <p key={i} className="text-slate-500 dark:text-slate-400">• {sug}</p>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Duplicate Detection */}
                        {aiDraftDuplicates.length > 0 && (
                          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 space-y-2 text-xs">
                            <p className="font-bold text-amber-500 flex items-center gap-1">
                              ⚠️ Tiket Serupa Ditemukan (Duplicate Detection)
                            </p>
                            <p className="text-[11px] text-slate-400">Masalah ini mungkin sudah dilaporkan oleh rekan Anda:</p>
                            <div className="space-y-2">
                              {aiDraftDuplicates.map((t, idx) => (
                                <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                                  <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                                    <span>{t.ticket_no}</span>
                                    <span className="capitalize text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{t.status}</span>
                                  </div>
                                  <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">{t.title}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Knowledge recommendations */}
                        {aiDraftKBMatches.length > 0 && (
                          <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2 text-xs">
                            <p className="font-bold text-emerald-500 flex items-center gap-1">
                              📚 Rekomendasi Knowledge Base
                            </p>
                            <div className="space-y-2">
                              {aiDraftKBMatches.map((art, idx) => (
                                <div key={idx} className="space-y-1">
                                  <p className="font-semibold text-slate-700 dark:text-slate-300">{art.title}</p>
                                  <p className="text-slate-400 line-clamp-2 text-[11px]">{art.content}</p>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                alert(`Terima kasih! Rekomendasi solusi telah berhasil membantu Anda.`);
                                setTicketSubject('');
                                setTicketDesc('');
                                setAiDraftAnalysis(null);
                                setAiDraftDuplicates([]);
                                setAiDraftKBMatches([]);
                              }}
                              className="w-full mt-2 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold transition-all border border-emerald-500/20"
                            >
                              Masalah Selesai (Batal Tiket)
                            </button>
                          </div>
                        )}

                        {/* If user decides issue is NOT solved yet */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center">
                          <p className="text-[10px] text-slate-400">Rekomendasi di atas belum menyelesaikan kendala Anda?</p>
                          <button
                            type="button"
                            onClick={handleCreateTicket}
                            disabled={loading.createTicket}
                            className="w-full mt-2.5 px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs transition-all shadow-md shadow-amber-500/10 active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Masalah Belum Selesai, Ajukan Tiket Sekarang ↓</span>
                          </button>
                        </div>

                      </div>
                    ) : (
                      <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs leading-relaxed">
                        Analisa Copilot AI, duplicate detection, dan solusi KB instan akan muncul secara dinamis saat Anda mengetik subjek dan kronologi masalah.
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm text-xs text-slate-400 leading-relaxed space-y-3">
                    <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">Ketentuan SLA Bantuan</h4>
                    <p>• Prioritas Kritis (Critical / P1) ditangani maksimal dalam 1 jam.</p>
                    <p>• Prioritas Tinggi (High) diselesaikan maksimal dalam 4 jam kerja.</p>
                    <p>• Prioritas Sedang & Rendah akan ditanggapi maksimal dalam 24 jam.</p>
                  </div>

                </div>

              </div>
            )}

            {/* ================= VIEW: MY TICKETS & DETAIL TICKET SPLIT VIEW ================= */}
            {activeTab === 'my-tickets' && (
              <div className="w-full space-y-4">
                
                {selectedTicket ? (
                  /* Detail Ticket View */
                  <div className="grid gap-4 lg:grid-cols-[1fr_2fr] h-[calc(100vh-140px)] overflow-hidden">
                    
                    {/* Left Pane: Ticket Details */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 overflow-y-auto space-y-4 text-sm">
                      <button
                        onClick={() => {
                          setSelectedTicket(null)
                          router.push('/dashboard/user')
                        }}
                        className="text-xs text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1 font-semibold"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Kembali ke Daftar
                      </button>

                      <div className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-sky-500">{selectedTicket.ticket_no}</span>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">{selectedTicket.title}</h2>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedTicket.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-sky-500/10 text-sky-500'
                        }`}>{selectedTicket.status.toUpperCase()}</span>
                      </div>

                      <div className="space-y-4 text-xs">
                        <div>
                          <span className="text-slate-400 block mb-1">Prioritas / Severity</span>
                          <span className="capitalize font-semibold text-rose-500 bg-rose-500/5 px-2 py-1 rounded">{selectedTicket.severity}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-1">Dibuat Pada</span>
                          <span className="font-semibold">{formatDate(selectedTicket.created_at)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-1">SLA Penyelesaian</span>
                          {(() => {
                            const sla = getSLACountdown(selectedTicket.sla_due);
                            return (
                              <span className={`font-semibold px-2 py-1 rounded text-xs ${
                                sla.status === 'critical' ? 'text-rose-500 bg-rose-500/5' :
                                sla.status === 'warning' ? 'text-amber-500 bg-amber-500/5' :
                                'text-slate-300 bg-slate-500/5'
                              }`}>
                                {sla.text}
                              </span>
                            );
                          })()}
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-1">Teknisi Ditugaskan</span>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px]">
                              {selectedTicket.assignee?.name?.substring(0,2).toUpperCase() || 'AI'}
                            </div>
                            <span className="font-semibold">{selectedTicket.assignee?.name || 'Assigned to AI Copilot'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Ticket Actions */}
                      <div className="pt-4 border-t border-slate-150 dark:border-slate-800 space-y-2">
                        {selectedTicket.status !== 'closed' && (
                          <button
                            onClick={async () => {
                              if (confirm('Apakah Anda yakin ingin menutup tiket ini?')) {
                                try {
                                  await ticketApi.close(selectedTicket.id)
                                  const res = await ticketApi.get(selectedTicket.id)
                                  setSelectedTicket(res.data)
                                  loadData()
                                } catch (e) { console.error(e) }
                              }
                            }}
                            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/10 hover:text-rose-500 text-slate-600 dark:text-slate-300 font-bold text-xs transition-all"
                          >
                            Tutup Tiket (Selesai)
                          </button>
                        )}
                        <button
                          onClick={() => window.print()}
                          className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold text-xs transition-all"
                        >
                          Cetak / Ekspor PDF
                        </button>
                      </div>

                    </div>

                    {/* Right Pane: Conversation Timeline */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col h-full overflow-hidden shadow-sm">
                      
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">Linimasa & Log Percakapan</span>
                        <span className="text-xs text-slate-400">Total {selectedTicket.comments?.length || 0} komentar</span>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Original ticket description */}
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-250 dark:border-slate-800 text-sm space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-bold text-slate-900 dark:text-slate-200">{user?.username} (Pembuat Tiket)</span>
                            <span>{formatDate(selectedTicket.created_at)}</span>
                          </div>
                          {(() => {
                            const { text, attachmentUrl } = parseDescription(selectedTicket.description);
                            return (
                              <>
                                <p className="whitespace-pre-line leading-relaxed mt-2 text-slate-700 dark:text-slate-300">{text}</p>
                                {attachmentUrl && (
                                  <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                                    <span className="text-xs text-slate-400 block mb-2 font-medium">Lampiran File:</span>
                                    {isImage(attachmentUrl) ? (
                                      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-block group overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
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
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-500 dark:text-sky-400 text-sm font-semibold transition-all"
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

                        {/* Comments list */}
                        {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                          selectedTicket.comments.map((comment) => (
                            <div key={comment.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-2 bg-slate-50/30 dark:bg-slate-900/20">
                              <div className="flex items-center justify-between text-xs text-slate-400">
                                <span className="font-semibold text-slate-900 dark:text-slate-200">{comment.user?.name || comment.creator?.name || comment.user_id || comment.created_by || 'Teknisi'}</span>
                                <span>{formatDate(comment.created_at)}</span>
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{comment.comment}</p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-slate-400 text-xs">Belum ada komentar balasan dari teknisi.</div>
                        )}
                      </div>

                      {/* Reply form */}
                      <form onSubmit={handleAddComment} className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2 shrink-0 bg-slate-50/20 dark:bg-slate-900/20">
                        <input
                          type="text"
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          placeholder="Tulis tanggapan atau berikan info tambahan..."
                          className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-sm text-slate-950 dark:text-white border border-slate-200 dark:border-slate-700/80 transition-all"
                        />
                        <button
                          type="submit"
                          disabled={commentLoading || !newCommentText.trim()}
                          className="px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-all"
                        >
                          Balas
                        </button>
                      </form>

                    </div>

                  </div>
                ) : (
                  /* Standard Tickets Table List */
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Tiket Dukungan</h2>
                        <p className="text-xs text-slate-400 mt-1">Lacak status penyelesaian tiket dan histori penanganan masalah.</p>
                      </div>
                      
                      {/* Priority Filters */}
                      <div className="flex gap-2">
                        <button onClick={() => setSearchQuery('')} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-250 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold">
                          Reset Filter
                        </button>
                      </div>
                    </div>

                    {paginatedTicketsList.length > 0 ? (
                      <div className="space-y-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-black text-xs">
                                <th className="pb-3 px-4">Tiket No</th>
                                <th className="pb-3">Subjek & Detail Masalah</th>
                                <th className="pb-3">Prioritas</th>
                                <th className="pb-3">Status</th>
                                <th className="pb-3">Terakhir Diperbarui</th>
                                <th className="pb-3 text-right pr-4">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                              {paginatedTicketsList.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-850/30 transition-all duration-200">
                                  <td className="py-4 px-4 font-semibold text-sky-500 text-xs">{t.ticket_no}</td>
                                  <td className="py-4">
                                    <div className="font-bold text-slate-900 dark:text-white truncate max-w-sm">{t.title}</div>
                                    {t.category && (
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-semibold uppercase">
                                        <span className="text-sky-500">{t.category}</span>
                                        <span>•</span>
                                        <span>{t.sub_category || 'General'}</span>
                                        {t.department && (
                                          <>
                                            <span>•</span>
                                            <span className="text-indigo-400">{t.department}</span>
                                          </>
                                        )}
                                        {t.device && (
                                          <>
                                            <span>•</span>
                                            <span className="text-emerald-500 font-mono">{t.device}</span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-4 capitalize">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block ${
                                      t.severity === 'critical' ? 'bg-rose-500/15 text-rose-500 border border-rose-500/20' :
                                      t.severity === 'high' ? 'bg-orange-500/15 text-orange-500 border border-orange-500/20' :
                                      t.severity === 'medium' ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20' :
                                      'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                                    }`}>{t.severity}</span>
                                  </td>
                                  <td className="py-4 capitalize">
                                    <div className="flex items-center gap-2">
                                      <span className={`h-2.5 w-2.5 rounded-full ${
                                        t.status === 'resolved' ? 'bg-emerald-500 animate-pulse' :
                                        t.status === 'closed' ? 'bg-slate-400' :
                                        t.status === 'open' ? 'bg-amber-500' :
                                        'bg-sky-500'
                                      }`} />
                                      <span className={`text-[10px] font-black uppercase tracking-wider ${
                                        t.status === 'resolved' ? 'text-emerald-500' :
                                        t.status === 'closed' ? 'text-slate-400' :
                                        t.status === 'open' ? 'text-amber-500' :
                                        'text-sky-500'
                                      }`}>{t.status}</span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-xs text-slate-400">{formatDate(t.updated_at)}</td>
                                  <td className="py-4 text-right pr-4">
                                    <button
                                      onClick={async () => {
                                        try {
                                          const res = await ticketApi.get(t.id)
                                          setSelectedTicket(res.data)
                                          setActiveTab('my-tickets')
                                          router.push(`/dashboard/user?id=${t.id}`)
                                        } catch (err) {
                                          console.error('Failed to load ticket detail:', err)
                                          // Fallback: use list data and still navigate to detail
                                          setSelectedTicket(t)
                                          setActiveTab('my-tickets')
                                          router.push(`/dashboard/user?id=${t.id}`)
                                        }
                                      }}
                                      className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-95"
                                    >
                                      Detail
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination Controls */}
                        {totalTicketsPages > 1 && (
                          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                            <div className="text-xs text-slate-400">
                              Menampilkan <span className="font-semibold text-slate-700 dark:text-slate-350">{((ticketsPage - 1) * ticketsPerPage) + 1}</span> - <span className="font-semibold text-slate-700 dark:text-slate-350">{Math.min(ticketsPage * ticketsPerPage, filteredTicketsList.length)}</span> dari <span className="font-semibold text-slate-700 dark:text-slate-350">{filteredTicketsList.length}</span> tiket
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={ticketsPage === 1}
                                onClick={() => setTicketsPage(p => Math.max(p - 1, 1))}
                                className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-500 transition-all border border-slate-200 dark:border-slate-700"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                              </button>
                              
                              {Array.from({ length: totalTicketsPages }, (_, i) => i + 1).map((pg) => (
                                <button
                                  key={pg}
                                  onClick={() => setTicketsPage(pg)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                    ticketsPage === pg
                                      ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                                      : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-705'
                                  }`}
                                >
                                  {pg}
                                </button>
                              ))}

                              <button
                                disabled={ticketsPage === totalTicketsPages}
                                onClick={() => setTicketsPage(p => Math.min(p + 1, totalTicketsPages))}
                                className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-500 transition-all border border-slate-200 dark:border-slate-700"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-400 text-sm">Tidak ada tiket yang cocok dengan kriteria.</div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ================= VIEW: KNOWLEDGE BASE ================= */}
            {activeTab === 'kb' && (
              <div className="space-y-4 w-full">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm text-center max-w-2xl mx-auto space-y-3">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto text-xl">📚</div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Knowledge Base (Pusat Pengetahuan)</h2>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Cari artikel panduan, dokumentasi pemecahan masalah (troubleshooting), dan kebijakan IT korporat.
                  </p>
                  
                  {/* Search KB field & Semantic Toggle */}
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari kata kunci: VPN, printer, password..."
                        className="w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs">
                      <span className={`${!semanticSearch ? 'text-indigo-500 font-bold' : 'text-slate-400'}`}>Pencarian Standar</span>
                      <button
                        onClick={() => setSemanticSearch(!semanticSearch)}
                        className={`w-10 h-5 rounded-full transition-all relative ${semanticSearch ? 'bg-indigo-500' : 'bg-slate-350 dark:bg-slate-700'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all transform ${semanticSearch ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <span className={`flex items-center gap-1 ${semanticSearch ? 'text-indigo-500 font-bold' : 'text-slate-400'}`}>
                        Pencarian Semantik AI
                        <span className="px-1.5 py-0.2 bg-indigo-500/10 text-indigo-500 rounded text-[9px] font-black uppercase">RAG</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredKBArticles.length > 0 ? (
                    filteredKBArticles.map((art) => (
                      <div key={art.id} className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 flex flex-col justify-between shadow-sm hover:scale-[1.01] hover:border-indigo-500/50 transition-all duration-300">
                        <div className="space-y-2">
                          <span className="text-[10px] font-black uppercase text-indigo-500 bg-indigo-500/5 px-2 py-0.5 rounded">KB Article</span>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{art.title}</h3>
                          <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{art.content || 'Panduan langkah-langkah mengatasi gangguan IT'}</p>
                        </div>
                        <button
                          onClick={() => setViewingKBArticle(art)}
                          className="text-xs text-indigo-500 hover:text-indigo-600 cursor-pointer font-bold mt-3 block"
                        >
                          Baca Selengkapnya →
                        </button>
                      </div>
                    ))
                  ) : (
                    <>
                      {[
                        { title: 'Konfigurasi VPN Kantor', category: 'Jaringan', content: 'Panduan lengkap cara instalasi, import file profile .ovpn, dan setup kredensial keamanan untuk akses jaringan internal dari rumah.' },
                        { title: 'Instalasi Driver Printer HP- LaserJet', category: 'Hardware', content: 'Langkah pemecahan masalah jika printer tidak merespon print queue. Hapus spooler printer via services.msc lalu jalankan script driver.' },
                        { title: 'Reset Akun Active Directory Mandiri', category: 'Keamanan', content: 'Jika akun Anda terblokir akibat salah password 3 kali berturut-turut, buka portal ad-selfservice lalu verifikasi OTP nomor telepon terdaftar.' },
                      ].map((art, idx) => (
                        <div key={idx} className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 flex flex-col justify-between shadow-sm hover:scale-[1.01] hover:border-indigo-500/50 transition-all duration-300">
                          <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase text-indigo-500 bg-indigo-500/5 px-2 py-0.5 rounded">{art.category}</span>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{art.title}</h3>
                            <p className="text-xs text-slate-400 leading-relaxed">{art.content}</p>
                          </div>
                          <button onClick={() => setViewingKBArticle(art)} className="text-xs text-indigo-500 hover:text-indigo-600 cursor-pointer font-bold mt-3 block">
                            Baca Selengkapnya →
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

              </div>
            )}

            {/* ================= VIEW: MY ASSETS (CMDB) & DEVICE DETAIL TELEMETRY ================= */}
            {activeTab === 'assets' && (
              <div className="space-y-4 w-full">
                
                {selectedAsset ? (
                  /* Detail Device View */
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-sm">
                    <button
                      onClick={() => setSelectedAsset(null)}
                      className="text-xs text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1 font-semibold"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Kembali ke Daftar Aset
                    </button>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                      <div>
                        <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">TELEMETRI PERANGKAT REAL-TIME</span>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">{selectedAsset.hostname}</h2>
                        <p className="text-xs text-slate-400 mt-1">IP: {selectedAsset.ip_address || '10.20.0.49'} • OS: {selectedAsset.os_version || 'windows'}</p>
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 font-bold text-xs rounded-full border border-emerald-500/20 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        Pulsing Active
                      </span>
                    </div>

                    {/* Hardware Spec & Metrics Widgets */}
                    <div className="grid gap-6 md:grid-cols-3">
                      
                      {/* Cpu Usage Widget */}
                      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                          <span>CPU Usage</span>
                          <span className="text-sky-500">32%</span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: '32%' }} />
                        </div>
                        <p className="text-[10px] text-slate-400">11th Gen Intel(R) Core(TM) i3 @ 3.00GHz</p>
                      </div>

                      {/* Ram Usage Widget */}
                      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                          <span>RAM Usage</span>
                          <span className="text-sky-500">78%</span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: '78%' }} />
                        </div>
                        <p className="text-[10px] text-slate-400">4.00 GB Total Capacity</p>
                      </div>

                      {/* Disk usage Widget */}
                      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                          <span>Storage Disk</span>
                          <span className="text-amber-500">86%</span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: '86%' }} />
                        </div>
                        <p className="text-[10px] text-slate-400">Sisa 14 GB dari 120 GB</p>
                      </div>

                    </div>

                    {/* Installed Software List & Running Services */}
                    <div className="grid gap-6 md:grid-cols-2">
                      
                      {/* Software List */}
                      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Software Terpasang (CMDB)</h3>
                        {loadingSoftware ? (
                          <div className="text-xs text-slate-400 py-4">Memuat daftar aplikasi...</div>
                        ) : assetSoftware.length > 0 ? (
                          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
                            {assetSoftware.map((sw, idx) => (
                              <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{sw.name}</span>
                                <span className="text-slate-400">{sw.version}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 py-4 space-y-2">
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">Google Chrome</span>
                              <span className="text-slate-400">v120.0.2</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">Microsoft Office 365</span>
                              <span className="text-slate-400">v16.0.1</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">OpenVPN Client</span>
                              <span className="text-slate-400">v2.6.5</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Services Running */}
                      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Layanan & Proses Background</h3>
                        <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
                          {[
                            { name: 'NATS Telemetry Collector', type: 'Service', status: 'Running', color: 'text-emerald-500 bg-emerald-500/10' },
                            { name: 'Helpdesk Desktop Agent', type: 'Process', status: 'Running', color: 'text-emerald-500 bg-emerald-500/10' },
                            { name: 'Windows Update Service', type: 'Service', status: 'Stopped', color: 'text-slate-400 bg-slate-500/10' },
                            { name: 'Antivirus Defender Shield', type: 'Process', status: 'Running', color: 'text-emerald-500 bg-emerald-500/10' },
                          ].map((srv, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-slate-800 dark:text-slate-200">{srv.name}</p>
                                <span className="text-[10px] text-slate-400 uppercase font-bold">{srv.type}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${srv.color}`}>{srv.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                  </div>
                ) : (
                  /* Assets Table list */
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Aset Inventori Saya (CMDB)</h2>
                      <p className="text-xs text-slate-400 mt-1">Daftar lengkap perangkat keras & lunak milik Anda yang terdaftar pada sistem central helpdesk.</p>
                    </div>

                    {filteredAssetsList.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-black text-xs">
                              <th className="pb-3 px-4">Nama Hostname</th>
                              <th className="pb-3">Spesifikasi Info</th>
                              <th className="pb-3">Sistem Operasi</th>
                              <th className="pb-3">Status</th>
                              <th className="pb-3">Last Seen</th>
                              <th className="pb-3 text-right pr-4">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            {filteredAssetsList.map((asset) => (
                              <tr key={asset.id} className="hover:bg-slate-55/20 transition-all">
                                <td className="py-4 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                  {asset.hostname}
                                </td>
                                <td className="py-4 text-xs text-slate-400 truncate max-w-sm">{asset.hardware_info || '11th Gen Intel(R) Core(TM) i3, 4GB RAM'}</td>
                                <td className="py-4 capitalize text-xs">{asset.os_version || 'windows'}</td>
                                <td className="py-4">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500">Active</span>
                                </td>
                                <td className="py-4 text-xs text-slate-400">{formatDate(asset.last_seen || asset.updated_at)}</td>
                                <td className="py-4 text-right pr-4">
                                  <button
                                    onClick={() => handleSelectAsset(asset)}
                                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                                  >
                                    Detail
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* Empty CMDB state / Fallback */
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-black text-xs">
                              <th className="pb-3 px-4">Nama Hostname</th>
                              <th className="pb-3">Spesifikasi Info</th>
                              <th className="pb-3">Sistem Operasi</th>
                              <th className="pb-3">Status</th>
                              <th className="pb-3">Last Seen</th>
                              <th className="pb-3 text-right pr-4">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            <tr className="hover:bg-slate-55/20 transition-all">
                              <td className="py-4 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                MKT-NUC
                              </td>
                              <td className="py-4 text-xs text-slate-400 truncate max-w-sm">11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz, 4.00 GB RAM</td>
                              <td className="py-4 capitalize text-xs">windows</td>
                              <td className="py-4">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500">Active</span>
                              </td>
                              <td className="py-4 text-xs text-slate-400">{formatDate(new Date().toISOString())}</td>
                              <td className="py-4 text-right pr-4">
                                <button
                                  onClick={() => handleSelectAsset({ id: 'fallback-id', hostname: 'MKT-NUC', ip_address: '10.20.0.49', os_version: 'windows' })}
                                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                                >
                                  Detail
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}


            {/* ================= VIEW: NOTIFICATIONS ================= */}
            {activeTab === 'notifications' && (
              <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pusat Notifikasi</h2>
                    <p className="text-xs text-slate-400 mt-1">Kelola pemberitahuan masuk terkait tiket dan alert sistem.</p>
                  </div>
                  {unreadNotificationsCount > 0 && (
                    <button
                      onClick={handleMarkAllNotificationsRead}
                      className="px-4 py-2 bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 text-xs font-semibold rounded-xl transition-all"
                    >
                      Tandai Semua Dibaca
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.length > 0 ? (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={async () => {
                          if (!notif.is_read) {
                            try {
                              await notificationApi.markRead(notif.id)
                              setNotifications((prev) =>
                                prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
                              )
                            } catch (err) {
                              console.error('Failed to mark read:', err)
                            }
                          }
                          if (notif.resource_type === 'ticket' && notif.resource_id) {
                            router.push(`/dashboard/user?id=${notif.resource_id}`)
                          }
                        }}
                        className={`py-4 flex gap-4 items-start cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 px-3 rounded-2xl transition-all duration-200 ${
                          !notif.is_read ? 'bg-sky-500/5' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-semibold text-sm text-slate-900 dark:text-white ${!notif.is_read ? 'text-sky-500' : ''}`}>
                            {notif.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{notif.message}</p>
                          <span className="text-[10px] text-slate-400 block mt-2">{formatDate(notif.created_at)}</span>
                        </div>
                        <div className="flex gap-2">
                          {!notif.is_read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkNotificationRead(notif.id)
                              }}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/10 hover:text-sky-500 text-[10px] font-bold rounded"
                            >
                              Tandai Dibaca
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteNotification(notif.id)
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-sm">Tidak ada notifikasi masuk.</div>
                  )}
                </div>
              </div>
            )}

            {/* ================= VIEW: ANNOUNCEMENTS ================= */}
            {activeTab === 'announcements' && (
              <div className="w-full space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pengumuman & Update Sistem</h2>
                  <p className="text-xs text-slate-400 mt-1">Dapatkan informasi rilis fitur, status maintenance server, dan berita terhangat.</p>
                </div>

                <div className="space-y-4">
                  {announcements.length > 0 ? (
                    announcements.map((ann) => (
                      <div key={ann.id} className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
                        <span className="text-[10px] font-bold text-sky-500">{formatDate(ann.created_at)}</span>
                        <h3 className="text-md font-bold text-slate-950 dark:text-white">{ann.title}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{ann.content}</p>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
                        <span className="text-[10px] font-bold text-sky-500">30 Juni 2026, 12:00 WIB</span>
                        <h3 className="text-md font-bold text-slate-950 dark:text-white">Pemeliharaan Server Database Helpdesk</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          Layanan helpdesk akan mengalami masa pemeliharaan rutin guna meningkatkan kinerja query CMDB dan telemetri agent client. Selama masa pemeliharaan, client dashboard tetap dapat diakses namun sinkronisasi CPU/RAM devices akan ditunda sementara. Estimasi waktu downtime 30 menit. Terima kasih atas pengertiannya.
                        </p>
                      </div>
                      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
                        <span className="text-[10px] font-bold text-sky-500">25 Juni 2026, 10:15 WIB</span>
                        <h3 className="text-md font-bold text-slate-950 dark:text-white">Upgrade Sistem Keamanan Dua Faktor (2FA)</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          Guna memproteksi akun pengguna dari serangan brute force, portal client kini mendukung pengaktifan Two-Factor Authentication (2FA) melalui aplikasi authenticator (Google Authenticator / Duo). Pengguna dapat mengaktifkan fitur ini secara opsional melalui tab Profil Saya.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ================= VIEW: PROFILE ================= */}
            {activeTab === 'profile' && (
              <div className="grid gap-4 lg:grid-cols-2 w-full">
                
                {/* Personal Info Form */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                  <h3 className="text-md font-bold text-slate-900 dark:text-white">Edit Informasi Profil</h3>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nama Lengkap</label>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Email Bisnis</label>
                      <input
                        type="email"
                        required
                        value={profileEmail}
                        onChange={(e) => setProfileEmail(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nomor Telepon / WA</label>
                      <input
                        type="text"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Departemen</label>
                      <input
                        type="text"
                        value={profileDept}
                        onChange={(e) => setProfileDept(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-md transition-all active:scale-95"
                    >
                      Simpan Perubahan
                    </button>
                  </form>
                </div>

                {/* Password & Security Panel */}
                <div className="space-y-4">
                  
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                    <h3 className="text-md font-bold text-slate-900 dark:text-white">Ubah Password</h3>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Password Lama</label>
                        <input
                          type="password"
                          required
                          value={passwordOld}
                          onChange={(e) => setPasswordOld(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Password Baru</label>
                        <input
                          type="password"
                          required
                          value={passwordNew}
                          onChange={(e) => setPasswordNew(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-sm transition-all"
                      >
                        Perbarui Password
                      </button>
                    </form>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Two-Factor Authentication (2FA)</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 pr-4">Minta kode OTP tambahan saat login lewat aplikasi Google Authenticator.</span>
                      <button
                        onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          twoFactorEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {twoFactorEnabled ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </div>
                  </div>



                </div>

              </div>
            )}

            {/* ================= VIEW: APP SETTINGS ================= */}
            {activeTab === 'settings' && (
              <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pengaturan Aplikasi Portal</h2>
                  <p className="text-xs text-slate-400 mt-1">Konfigurasi preferensi notifikasi, pilihan visual tema, dan sistem suara alert.</p>
                </div>

                <div className="space-y-6 text-sm">
                  
                  {/* Theme Mode Option */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-slate-900 dark:text-white">Tampilan Visual (Tema)</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => { setIsDarkMode(false); localStorage.setItem('theme', 'light'); document.documentElement.classList.add('light'); document.documentElement.classList.remove('dark'); }}
                        className={`p-4 rounded-2xl border text-xs font-bold text-center transition-all ${
                          !isDarkMode ? 'border-sky-500 bg-sky-500/5 text-sky-500' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        Terang (Light Mode)
                      </button>
                      <button
                        onClick={() => { setIsDarkMode(true); localStorage.setItem('theme', 'dark'); document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light'); }}
                        className={`p-4 rounded-2xl border text-xs font-bold text-center transition-all ${
                          isDarkMode ? 'border-sky-500 bg-sky-500/5 text-sky-500' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        Gelap (Dark Mode)
                      </button>
                    </div>
                  </div>

                  {/* Notification Channels Preferences */}
                  <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-900 dark:text-white">Saluran Pemberitahuan Tiket</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Notifikasi Email', key: 'email', desc: 'Kirim rangkuman komentar teknisi via alamat email bisnis Anda.' },
                        { label: 'Notifikasi WhatsApp', key: 'whatsapp', desc: 'Kirim alert penutupan tiket instan ke nomor WA Anda.' },
                        { label: 'Notifikasi Bot Telegram', key: 'telegram', desc: 'Hubungkan chat ID Anda dengan bot dukung IT Helpdesk.' },
                      ].map((pref) => (
                        <div key={pref.key} className="flex items-start justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{pref.label}</p>
                            <span className="text-[10px] text-slate-400 mt-1 block">{pref.desc}</span>
                          </div>
                          <button
                            onClick={() => {
                              setPrefNotificationChannel(prev => ({
                                ...prev,
                                [pref.key]: !prev[pref.key as keyof typeof prev]
                              }))
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              prefNotificationChannel[pref.key as keyof typeof prefNotificationChannel] 
                                ? 'bg-sky-500 text-white' 
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                            }`}
                          >
                            {prefNotificationChannel[pref.key as keyof typeof prefNotificationChannel] ? 'On' : 'Off'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sound alert switch */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">Pemberitahuan Suara (Sound)</h3>
                      <p className="text-xs text-slate-400 mt-1">Mainkan efek suara notifikasi saat ada balasan tiket masuk.</p>
                    </div>
                    <button
                      onClick={() => setPrefSoundAlerts(!prefSoundAlerts)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        prefSoundAlerts ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {prefSoundAlerts ? 'Aktif' : 'Senyap'}
                    </button>
                  </div>

                </div>
              </div>
            )}

          </main>
        </div>

      </div>

      {/* Modal View Artikel KB */}
      {viewingKBArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card-soft w-full max-w-2xl rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl relative bg-white dark:bg-slate-900">
            <button 
              onClick={() => setViewingKBArticle(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="space-y-4">
              <span className="inline-block px-3 py-1 text-xs font-semibold bg-indigo-500/10 text-indigo-500 rounded-full">
                {viewingKBArticle.category || 'Umum'}
              </span>
              
              <h3 className="text-2xl font-bold text-slate-950 dark:text-white leading-tight">
                {viewingKBArticle.title}
              </h3>
              
              <div className="flex items-center gap-4 text-xs text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-4">
                <span>Diperbarui: <strong className="text-slate-700 dark:text-slate-200">{new Date(viewingKBArticle.updated_at || viewingKBArticle.created_at || new Date()).toLocaleDateString('id-ID')}</strong></span>
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto pr-2 mt-4">
                <p className="text-sm text-slate-650 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {viewingKBArticle.content || viewingKBArticle.description || 'Konten panduan sedang diisi.'}
                </p>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => setViewingKBArticle(null)}
                  className="rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-5 py-2 text-sm font-semibold text-slate-700 dark:text-white transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
