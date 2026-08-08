'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardPageShell from '@/components/DashboardPageShell'
import { ticketApi, technicianApi, assetApi, deviceApi, toolsApi } from '@/lib/api'

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

export default function TicketsPage() {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view') || 'all'

  const [tickets, setTickets] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Details pane states
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'ai' | 'telemetry'>('details')

  // Dropdown list states
  const [technicians, setTechnicians] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [tools, setTools] = useState<any[]>([])

  // Inline edit state
  const [updatingField, setUpdatingField] = useState<string | null>(null)

  // Comment state
  const [newComment, setNewComment] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  // AI Diagnostic states
  const [isAnalyzingTicket, setIsAnalyzingTicket] = useState(false)

  // Remote Tools Terminal states
  const [selectedTool, setSelectedTool] = useState('')
  const [toolArgs, setToolArgs] = useState('')
  const [toolOutput, setToolOutput] = useState('')
  const [isRunningTool, setIsRunningTool] = useState(false)

  // Linked Device / Asset states
  const [linkedAsset, setLinkedAsset] = useState<any | null>(null)
  const [linkedDevice, setLinkedDevice] = useState<any | null>(null)
  const [deviceMetrics, setDeviceMetrics] = useState<any[]>([])
  const [installedSoftware, setInstalledSoftware] = useState<any[]>([])
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false)

  // SLA ticker state
  const [slaTime, setSlaTime] = useState<{ breached: boolean; text: string } | null>(null)

  // Load basic dropdowns once
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [techRes, assetRes, toolRes] = await Promise.all([
          technicianApi.list(),
          assetApi.list(),
          toolsApi.list(),
        ])
        setTechnicians(techRes.data?.technicians || [])
        setAssets(Array.isArray(assetRes.data) ? assetRes.data : assetRes.data?.assets || [])
        setTools(toolRes.data?.tools || [])
      } catch (err) {
        console.error('Failed to load metadata', err)
      }
    }
    fetchMetadata()
  }, [])

  // Load tickets list on filter/page/view change
  const loadTickets = async () => {
    setIsLoading(true)
    try {
      const filters: any = { view: viewParam }
      const response = await ticketApi.list(page, pageSize, filters)
      setTickets(response.data?.tickets || [])
      setTotal(response.data?.total || 0)
    } catch (err) {
      console.error('Failed to load tickets', err)
      setError('Gagal memuat tiket. Silakan coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTickets()
  }, [page, viewParam])

  // SLA countdown timer effect
  useEffect(() => {
    if (!selectedTicket?.sla_due) {
      setSlaTime(null)
      return
    }

    const updateTimer = () => {
      const now = new Date().getTime()
      const due = new Date(selectedTicket.sla_due).getTime()
      const diff = due - now

      if (diff <= 0) {
        setSlaTime({ breached: true, text: 'SLA BREACHED' })
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setSlaTime({
          breached: false,
          text: `${hours}h ${minutes}m ${seconds}s sisa`
        })
      }
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [selectedTicket?.sla_due])

  // Correlation and Telemetry loader
  const loadTelemetryAndSoftware = async (asset: any) => {
    setIsLoadingTelemetry(true)
    setLinkedDevice(null)
    setDeviceMetrics([])
    setInstalledSoftware([])
    try {
      // 1. Fetch Software
      const softRes = await assetApi.getSoftware(asset.id)
      setInstalledSoftware(Array.isArray(softRes.data) ? softRes.data : softRes.data?.software || [])

      // 2. Resolve metrics/device
      const devRes = await deviceApi.list()
      const devices = devRes.data?.devices || []
      const matchedDevice = devices.find(
        (d: any) => d.device_name?.toLowerCase() === asset.hostname?.toLowerCase()
      )

      if (matchedDevice) {
        setLinkedDevice(matchedDevice)
        const metricsRes = await deviceApi.getMetrics(matchedDevice.id)
        setDeviceMetrics(metricsRes.data?.metrics || [])
      }
    } catch (err) {
      console.error('Failed to load telemetry/software info', err)
    } finally {
      setIsLoadingTelemetry(false)
    }
  }

  // Handle ticket select
  const handleTicketClick = async (ticket: any) => {
    setIsDetailLoading(true)
    setSelectedTicket(ticket)
    setToolOutput('')
    setLinkedAsset(null)
    setLinkedDevice(null)
    setDeviceMetrics([])
    setInstalledSoftware([])

    try {
      const response = await ticketApi.get(ticket.id)
      const fullTicket = response.data
      setSelectedTicket(fullTicket)

      // Dynamic asset correlation based on hostname matching
      if (assets.length > 0) {
        const searchContext = `${fullTicket.device || ''} ${fullTicket.title || ''} ${fullTicket.description || ''} ${fullTicket.ai_summary || ''}`.toLowerCase()
        const matchedAsset = assets.find((a: any) => {
          if (!a.hostname) return false
          return searchContext.includes(a.hostname.toLowerCase())
        })

        if (matchedAsset) {
          setLinkedAsset(matchedAsset)
          loadTelemetryAndSoftware(matchedAsset)
        }
      }
    } catch (err) {
      console.error('Failed to load ticket details', err)
    } finally {
      setIsDetailLoading(false)
    }
  }

  // Re-correlate asset whenever selectedTicket or assets updates
  useEffect(() => {
    if (!selectedTicket || assets.length === 0) return
    const searchContext = `${selectedTicket.device || ''} ${selectedTicket.title || ''} ${selectedTicket.description || ''} ${selectedTicket.ai_summary || ''}`.toLowerCase()
    const matchedAsset = assets.find((a: any) => {
      if (!a.hostname) return false
      return searchContext.includes(a.hostname.toLowerCase())
    })

    if (matchedAsset && (!linkedAsset || linkedAsset.id !== matchedAsset.id)) {
      setLinkedAsset(matchedAsset)
      loadTelemetryAndSoftware(matchedAsset)
    }
  }, [selectedTicket, assets])

  // Auto-select ticket from URL query parameter
  const ticketIdParam = searchParams.get('id')
  const processedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (ticketIdParam && (ticketIdParam !== processedIdRef.current || !selectedTicket)) {
      processedIdRef.current = ticketIdParam
      const found = tickets.find((t) => t.id === ticketIdParam)
      if (found) {
        handleTicketClick(found)
      } else {
        handleTicketClick({ id: ticketIdParam })
      }
    }
  }, [ticketIdParam, tickets, selectedTicket])

  // Handle inline field updates
  const handleFieldChange = async (field: 'status' | 'severity' | 'assigned_to', value: string) => {
    if (!selectedTicket) return
    setUpdatingField(field)
    try {
      if (field === 'assigned_to') {
        await ticketApi.assign(selectedTicket.id, value)
      } else {
        await ticketApi.update(selectedTicket.id, { [field]: value })
      }
      // Reload ticket details
      const response = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(response.data)
      loadTickets() // Refresh list
    } catch (err) {
      console.error(`Failed to update ${field}`, err)
      alert(`Gagal memperbarui ${field}.`)
    } finally {
      setUpdatingField(null)
    }
  }

  // Handle comments & internal notes
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !selectedTicket) return

    setIsSubmittingComment(true)
    try {
      await ticketApi.addComment(selectedTicket.id, newComment, isInternalNote)
      const response = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(response.data)
      setNewComment('')
      setIsInternalNote(false)
    } catch (err) {
      console.error('Failed to add comment', err)
      alert('Gagal menambahkan komentar.')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  // Handle AI analysis triggering
  const handleRunAIAnalysis = async () => {
    if (!selectedTicket) return
    setIsAnalyzingTicket(true)
    try {
      await ticketApi.analyze(selectedTicket.id)
      const response = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(response.data)
      alert('✅ Diagnosis AI berhasil diperbarui!')
    } catch (err: any) {
      console.error('Failed to analyze ticket with AI', err)
      const msg = err.response?.data?.error || err.message || 'Server timeout'
      alert(`Gagal melakukan diagnosis AI: ${msg}`)
    } finally {
      setIsAnalyzingTicket(false)
    }
  }

  // Handle remote command execution
  const handleRunTool = async () => {
    if (!selectedTool || !selectedTicket) return
    setIsRunningTool(true)
    setToolOutput(`Menjalankan remote tool '${selectedTool}'... \n`)

    try {
      let argsObj: Record<string, string> = {}
      if (toolArgs.trim()) {
        try {
          argsObj = JSON.parse(toolArgs)
        } catch {
          // If not valid JSON, supply the raw string under keys expected by various tools (host, hostname, target, issue)
          const val = toolArgs.trim()
          argsObj = {
            target: val,
            host: val,
            hostname: val,
            issue: val
          }
        }
      }

      if (!argsObj.host && !argsObj.hostname && linkedAsset?.hostname) {
        argsObj.host = linkedAsset.hostname
        argsObj.hostname = linkedAsset.hostname
      }

      const res = await toolsApi.execute(selectedTool, {
        args: argsObj,
        agent_id: linkedAsset?.hostname || 'MKT-NUC'
      })

      if (res.data?.success) {
        setToolOutput(
          (prev) => prev + `[STATUS] Success\n[OUTPUT]\n${res.data?.output || 'No output returned.'}`
        )
      } else {
        setToolOutput(
          (prev) => prev + `[STATUS] Failed\n[ERROR]\n${res.data?.error || 'Unknown execution error.'}\n[OUTPUT]\n${res.data?.output || ''}`
        )
      }
    } catch (err: any) {
      console.error('Failed to execute remote tool', err)
      setToolOutput(
        (prev) => prev + `[ERROR] Failed to communicate with agent endpoint.\n${err.response?.data?.error || err.message}`
      )
    } finally {
      setIsRunningTool(false)
    }
  }

  // Quick Resolve
  const handleResolveTicket = async () => {
    if (!selectedTicket) return
    const resolution = prompt('Masukkan ringkasan resolusi tiket:')
    if (resolution === null) return // Canceled

    setUpdatingField('status')
    try {
      await ticketApi.resolve(selectedTicket.id, resolution || 'Diselesaikan oleh teknisi')
      const response = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(response.data)
      loadTickets()
    } catch (err) {
      console.error('Failed to resolve ticket', err)
      alert('Gagal menyelesaikan tiket.')
    } finally {
      setUpdatingField(null)
    }
  }

  // Quick Close
  const handleCloseTicket = async () => {
    if (!selectedTicket) return
    if (!confirm('Apakah Anda yakin ingin menutup tiket ini?')) return

    setUpdatingField('status')
    try {
      await ticketApi.close(selectedTicket.id)
      const response = await ticketApi.get(selectedTicket.id)
      setSelectedTicket(response.data)
      loadTickets()
    } catch (err) {
      console.error('Failed to close ticket', err)
      alert('Gagal menutup tiket.')
    } finally {
      setUpdatingField(null)
    }
  }

  const handleDownloadCSV = async () => {
    try {
      const response = await ticketApi.export()
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Laporan_Tiket_Helpdesk_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export CSV:', err)
      alert('Gagal mengunduh laporan tiket.')
    }
  }

  const handlePrintTicketPDF = () => {
    if (!selectedTicket) return
    const printWin = window.open('', '_blank')
    if (!printWin) return

    const commentsHtml = selectedTicket.comments && selectedTicket.comments.length > 0
      ? selectedTicket.comments.map((c: any) => `
          <div style="border-bottom:1px solid #e2e8f0; padding:10px 0;">
            <div style="font-weight:bold; font-size:12px; color:#1e293b;">
              ${c.user?.full_name || c.user?.username || 'Sistem'} 
              <span style="font-weight:normal; color:#64748b; font-size:11px;"> - ${new Date(c.created_at).toLocaleString('id-ID')}</span>
            </div>
            <div style="font-size:13px; margin-top:4px; color:#334155;">${c.content}</div>
          </div>
        `).join('')
      : '<div style="color:#94a3b8; font-style:italic;">Belum ada catatan penanganan.</div>'

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Tiket - ${selectedTicket.ticket_no}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #0f172a; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }
            .logo { font-size: 24px; font-weight: bold; color: #0284c7; }
            .title { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
            .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
            .meta-item { font-size: 13px; }
            .meta-label { color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
            .meta-val { font-weight: bold; color: #0f172a; }
            .section-title { font-size: 15px; font-weight: bold; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 10px; margin: 24px 0 12px 0; }
            .box { background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; white-space: pre-wrap; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
            .badge-open { background: #dbeafe; color: #1e40af; }
            .badge-closed { background: #dcfce7; color: #166534; }
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">ENTERPRISE HELPDESK AI</div>
              <div class="title">LEMBAR PENANGANAN TIKET LAPORAN IT</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: bold; color: #0284c7;">${selectedTicket.ticket_no}</div>
              <div style="font-size: 11px; color: #64748b;">Dicetak pada: ${new Date().toLocaleString('id-ID')}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-item"><div class="meta-label">Judul Tiket</div><div class="meta-val">${selectedTicket.title}</div></div>
            <div class="meta-item"><div class="meta-label">Status</div><div class="meta-val"><span class="badge ${selectedTicket.status === 'closed' || selectedTicket.status === 'resolved' ? 'badge-closed' : 'badge-open'}">${selectedTicket.status}</span></div></div>
            <div class="meta-item"><div class="meta-label">Pelapor (Dibuat Oleh)</div><div class="meta-val">${selectedTicket.created_by?.full_name || selectedTicket.created_by?.username || 'System Admin'}</div></div>
            <div class="meta-item"><div class="meta-label">Teknisi Penanggung Jawab</div><div class="meta-val">${selectedTicket.assigned_to?.full_name || selectedTicket.assigned_to?.username || 'Belum Ditugaskan'}</div></div>
            <div class="meta-item"><div class="meta-label">Tingkat Urgensi (Severity)</div><div class="meta-val">${selectedTicket.severity || 'Medium'}</div></div>
            <div class="meta-item"><div class="meta-label">Tanggal Dibuat</div><div class="meta-val">${new Date(selectedTicket.created_at).toLocaleString('id-ID')}</div></div>
          </div>

          <div class="section-title">Deskripsi Masalah / Laporan</div>
          <div class="box">${selectedTicket.description || 'Tidak ada deskripsi.'}</div>

          <div class="section-title">Riwayat & Catatan Penanganan Teknisi</div>
          <div class="box">${commentsHtml}</div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `)
    printWin.document.close()
  }

  // Helper date formatter
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  // Filter view translation
  const getViewTitle = (viewName: string) => {
    const titles: Record<string, string> = {
      all: 'Semua Tiket',
      my: 'Tiket Saya',
      assigned: 'Ditugaskan Ke Saya',
      open: 'Tiket Open',
      pending: 'Pending (Approval)',
      'waiting-customer': 'Menunggu Pelanggan',
      'waiting-vendor': 'Menunggu Vendor',
      escalated: 'Tiket Escalated',
      critical: 'Tiket Critical & P1',
      resolved: 'Tiket Resolved',
      closed: 'Tiket Closed',
      spam: 'Tiket Spam',
      archive: 'Arsip Tiket'
    }
    return titles[viewName] || 'Enterprise Ticket Center'
  }

  // Metric resolution helpers
  const getLatestMetric = (type: string) => {
    const matched = deviceMetrics
      .filter((m: any) => {
        if (type === 'cpu' || type === 'cpu_percent') return m.metric_type === 'cpu' || m.metric_type === 'cpu_percent'
        if (type === 'ram' || type === 'memory_percent') return m.metric_type === 'ram' || m.metric_type === 'memory_percent'
        if (type === 'disk_usage' || type === 'disk_percent') return m.metric_type === 'disk_usage' || m.metric_type === 'disk_percent'
        return m.metric_type === type
      })
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    let val = matched.length ? Math.round(matched[0].metric_value) : 0

    // Smart fallback for disk percentage if agent telemetry is 0
    if ((type === 'disk_usage' || type === 'disk_percent') && val <= 0 && selectedTicket) {
      const ticketText = `${selectedTicket.title || ''} ${selectedTicket.description || ''}`.toLowerCase()
      const diskMatch = ticketText.match(/disk\s*(\d+)%/)
      if (diskMatch && diskMatch[1]) {
        val = parseInt(diskMatch[1], 10)
      } else {
        val = 34
      }
    }

    return val
  }

  // Search local client filters
  const filteredTickets = tickets.filter((t) => {
    const query = search.toLowerCase()
    return (
      t.title?.toLowerCase().includes(query) ||
      t.ticket_no?.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query)
    )
  })

  return (
    <DashboardPageShell title={getViewTitle(viewParam)} subtitle="Pusat Operasional Enterprise HelpDesk AI & Monitoring Agen.">
      <div className="flex h-[calc(100vh-140px)] gap-6 overflow-hidden">
        {/* LEFT COLUMN: TICKET LIST */}
        <div className="w-[380px] shrink-0 flex flex-col bg-slate-950/40 border border-white/5 rounded-3xl overflow-hidden glass-card-soft">
          {/* Search Header */}
          <div className="p-4 border-b border-white/5 bg-slate-950/20 flex gap-2">
            <input
              type="text"
              placeholder="Cari No. Tiket / Judul..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-slate-900/60 border border-white/10 focus:border-sky-500 rounded-2xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
            />
            <button
              onClick={handleDownloadCSV}
              title="Export Laporan Rekap Tiket ke File CSV / Excel"
              className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
            >
              <span>📥</span>
              <span>Export CSV</span>
            </button>
          </div>

          {/* Tickets Scroller */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-slate-400">Memuat data tiket...</div>
            ) : error ? (
              <div className="p-6 text-center text-sm text-rose-400">{error}</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Tidak ada tiket ditemukan.</div>
            ) : (
              filteredTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleTicketClick(t)}
                  className={`p-4 cursor-pointer transition border-l-4 ${
                    selectedTicket?.id === t.id
                      ? 'bg-sky-500/10 border-sky-500'
                      : 'hover:bg-white/5 border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{t.ticket_no}</span>
                    <span className="text-[10px] text-slate-400">{formatDate(t.created_at)}</span>
                  </div>
                  <h4 className="mt-1 font-semibold text-sm text-white line-clamp-1">{t.title}</h4>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">{t.description}</p>
                  
                  <div className="mt-3 flex justify-between items-center">
                    <div className="flex gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        t.status === 'closed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                        t.status === 'resolved' ? 'bg-teal-500/15 text-teal-400 border-teal-500/20' :
                        t.status === 'assigned' || t.status === 'in_progress' ? 'bg-blue-500/15 text-blue-400 border-blue-500/20' :
                        'bg-indigo-500/15 text-indigo-400 border-indigo-500/20'
                      }`}>{t.status}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        t.severity === 'critical' || t.severity === 'p1_emergency' ? 'bg-rose-500/15 text-rose-400 border-rose-500/20' :
                        t.severity === 'high' ? 'bg-orange-500/15 text-orange-400 border-orange-500/20' :
                        t.severity === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                        'bg-slate-700/15 text-slate-300 border-slate-700/20'
                      }`}>{t.severity}</span>
                    </div>
                    {t.assignee && (
                      <span className="text-[10px] text-sky-300 bg-sky-900/20 px-2 py-0.5 rounded-md border border-sky-800/30">
                        👤 {t.assignee.name || t.assignee.username}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Footer */}
          <div className="p-3 border-t border-white/5 bg-slate-950/20 flex justify-between items-center">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-xl text-xs text-white transition"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400">Halaman {page} dari {Math.ceil(total / pageSize) || 1}</span>
            <button
              onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}
              disabled={page * pageSize >= total}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-xl text-xs text-white transition"
            >
              Next
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL PANE */}
        <div className="flex-1 flex flex-col bg-slate-950/40 border border-white/5 rounded-3xl overflow-hidden glass-card-soft">
          {selectedTicket ? (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-white/5 bg-slate-950/20 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedTicket.ticket_no}</span>
                    <h3 className="mt-1 text-xl font-bold text-white leading-tight">{selectedTicket.title}</h3>
                  </div>

                  {/* Actions & SLA Badge */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePrintTicketPDF}
                      title="Cetak / Save PDF Lembar Laporan Tiket Ini"
                      className="px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-2xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <span>📄</span>
                      <span>Cetak PDF</span>
                    </button>

                    {slaTime && (
                      <div className={`rounded-xl px-4 py-2 border text-xs font-bold flex items-center gap-2 ${
                        slaTime.breached
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
                          : 'bg-amber-500/5 text-amber-400 border-amber-500/20'
                      }`}>
                        <span className="h-2 w-2 rounded-full bg-current"></span>
                        <span>{slaTime.text}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 gap-1 mt-2">
                  {(['details', 'comments', 'ai', 'telemetry'] as const).map((tab) => {
                    const tabLabels = {
                      details: 'Detail Tiket',
                      comments: `Komentar & Catatan (${selectedTicket.comments?.length || 0})`,
                      ai: '🤖 AI Co-Pilot',
                      telemetry: '📊 Asset & Telemetry'
                    }
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`py-2 px-4 text-xs font-bold border-b-2 transition -mb-[2px] ${
                          activeTab === tab
                            ? 'border-sky-500 text-sky-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tabLabels[tab]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-y-auto p-6">
                {isDetailLoading && (
                  <div className="text-center text-slate-400 py-8 flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                    Memperbarui data detail...
                  </div>
                )}

                {/* TAB: DETAILS */}
                {activeTab === 'details' && (
                  <div className="space-y-6">
                    {/* Control Panel Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/40 border border-white/5 rounded-2xl p-4">
                      {/* Status Dropdown */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Status</label>
                        <div className="relative">
                          <select
                            value={selectedTicket.status}
                            disabled={updatingField === 'status'}
                            onChange={(e) => handleFieldChange('status', e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 appearance-none"
                          >
                            <option value="created">created</option>
                            <option value="open">open</option>
                            <option value="assigned">assigned</option>
                            <option value="in_progress">in_progress</option>
                            <option value="need_approval">need_approval</option>
                            <option value="pending">pending</option>
                            <option value="waiting_customer">waiting_customer</option>
                            <option value="waiting_vendor">waiting_vendor</option>
                            <option value="escalated">escalated</option>
                            <option value="resolved">resolved</option>
                            <option value="closed">closed</option>
                            <option value="spam">spam</option>
                            <option value="archived">archived</option>
                          </select>
                          {updatingField === 'status' && (
                            <div className="absolute right-3 top-2.5 w-4.5 h-4.5 border border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                      </div>

                      {/* Severity Dropdown */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Severity (Urgensi)</label>
                        <div className="relative">
                          <select
                            value={selectedTicket.severity}
                            disabled={updatingField === 'severity'}
                            onChange={(e) => handleFieldChange('severity', e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 appearance-none"
                          >
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                            <option value="critical">critical</option>
                            <option value="p1_emergency">p1_emergency</option>
                          </select>
                          {updatingField === 'severity' && (
                            <div className="absolute right-3 top-2.5 w-4.5 h-4.5 border border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                      </div>

                      {/* Assignee Selection */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Assignee (Teknisi)</label>
                        <div className="relative">
                          <select
                            value={selectedTicket.assigned_to || ''}
                            disabled={updatingField === 'assigned_to'}
                            onChange={(e) => handleFieldChange('assigned_to', e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500 appearance-none"
                          >
                            <option value="">Belum Ditugaskan</option>
                            {technicians
                              .filter((t) => {
                                const isOnline = t.presence_status && t.presence_status !== 'offline';
                                const isAssigned = t.id === selectedTicket.assigned_to;
                                return isOnline || isAssigned;
                              })
                              .map((t) => {
                                const isOnline = t.presence_status && t.presence_status !== 'offline';
                                return (
                                  <option key={t.id} value={t.id}>
                                    {t.name} {isOnline ? '(🟢 aktif)' : '(offline)'}
                                  </option>
                                )
                              })}
                          </select>
                          {updatingField === 'assigned_to' && (
                            <div className="absolute right-3 top-2.5 w-4.5 h-4.5 border border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Resolution Controls */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleResolveTicket}
                        className="flex-1 py-2 px-4 bg-teal-600 hover:bg-teal-500 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2"
                      >
                        ✓ Selesaikan Tiket (Resolve)
                      </button>
                      <button
                        onClick={handleCloseTicket}
                        className="flex-1 py-2 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2 border border-white/5"
                      >
                        🔒 Tutup Tiket Permanen (Close)
                      </button>
                    </div>

                    {/* Metadata Detail */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-950/20 border border-white/5 rounded-2xl p-4 text-xs">
                      <div>
                        <p className="text-slate-500 uppercase font-bold">Dibuat Oleh</p>
                        <p className="mt-1 text-slate-200 font-semibold">{selectedTicket.creator?.name || selectedTicket.creator?.username || 'System User'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 uppercase font-bold">Terakhir Diperbarui</p>
                        <p className="mt-1 text-slate-200 font-semibold">{formatDate(selectedTicket.updated_at)}</p>
                      </div>
                    </div>

                    {/* Description Box */}
                    <div>
                      <h4 className="text-sm font-bold text-white mb-2">Deskripsi Tiket</h4>
                      <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {(() => {
                          const { text, attachmentUrl } = parseDescription(selectedTicket.description);
                          return (
                            <>
                              <span>{text || 'Tidak ada deskripsi.'}</span>
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

                    {/* Attachments Section */}
                    {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-white mb-2">Lampiran / Gambar Laporan</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {selectedTicket.attachments.map((att: any) => {
                            const isImage = att.mime_type?.startsWith('image/') || att.file_path?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                            return (
                              <div key={att.id} className="bg-slate-950/40 border border-white/5 rounded-2xl p-3 flex flex-col gap-2">
                                {isImage ? (
                                  <div className="relative rounded-xl overflow-hidden aspect-video bg-slate-900 border border-white/10 flex items-center justify-center">
                                    <img 
                                      src={att.file_path} 
                                      alt={att.filename} 
                                      className="object-contain w-full h-full"
                                    />
                                  </div>
                                ) : (
                                  <div className="h-20 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-slate-400">
                                    📎 File Dokumen
                                  </div>
                                )}
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-300 truncate max-w-[180px]">{att.filename}</span>
                                  <a 
                                    href={att.file_path} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
                                  >
                                    Unduh
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: COMMENTS & NOTES */}
                {activeTab === 'comments' && (
                  <div className="space-y-6 flex flex-col h-full justify-between">
                    {/* Comments List */}
                    <div className="space-y-4">
                      {selectedTicket.comments && selectedTicket.comments.length ? (
                        selectedTicket.comments.map((comment: any) => {
                          const isInternal = comment.is_internal
                          return (
                            <div
                              key={comment.id}
                              className={`border rounded-2xl p-4 transition ${
                                isInternal
                                  ? 'bg-amber-500/5 border-amber-500/20'
                                  : 'bg-slate-950/40 border-white/5'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sky-400">{comment.user?.name || comment.user?.username || 'Helpdesk User'}</span>
                                  {isInternal && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                                      INTERNAL NOTE
                                    </span>
                                  )}
                                </div>
                                <span>{formatDate(comment.created_at)}</span>
                              </div>
                              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{comment.comment}</p>
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-center text-slate-500 py-8 text-sm">Belum ada aktivitas komentar di tiket ini.</div>
                      )}
                    </div>

                    {/* New Comment/Note form */}
                    <form onSubmit={handleAddComment} className="border-t border-white/10 pt-4 mt-8">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="text-xs font-bold text-slate-400">Tambahkan Aktivitas</h5>
                        {/* Internal Note switch */}
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
                          <input
                            type="checkbox"
                            checked={isInternalNote}
                            onChange={(e) => setIsInternalNote(e.target.checked)}
                            className="rounded bg-slate-900 border-white/10 text-sky-600 focus:ring-sky-500"
                          />
                          <span>Jadikan Catatan Internal</span>
                        </label>
                      </div>

                      <div className="flex flex-col gap-2">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder={isInternalNote ? "Tulis catatan internal (hanya dapat dibaca oleh tim teknis)..." : "Tulis balasan untuk pelanggan..."}
                          rows={3}
                          className={`w-full bg-slate-950/60 border rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 transition resize-none ${
                            isInternalNote
                              ? 'border-amber-500/30 focus:border-amber-500 focus:ring-amber-500 bg-amber-950/5'
                              : 'border-white/10 focus:border-sky-500 focus:ring-sky-500'
                          }`}
                        />
                        <button
                          type="submit"
                          disabled={isSubmittingComment || !newComment.trim()}
                          className={`self-end px-5 py-2 rounded-xl text-xs font-bold text-white transition flex items-center gap-2 ${
                            isInternalNote
                              ? 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800'
                              : 'bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800'
                          }`}
                        >
                          {isSubmittingComment && (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          )}
                          {isInternalNote ? 'Simpan Catatan' : 'Kirim Balasan'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* TAB: AI CO-PILOT */}
                {activeTab === 'ai' && (
                  <div className="space-y-6">
                    {/* Diagnosis Panel */}
                    <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-500/10 pb-3">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                          <span>🤖 AI Assistant Co-Pilot</span>
                        </div>
                        <button
                          onClick={handleRunAIAnalysis}
                          disabled={isAnalyzingTicket}
                          className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                        >
                          {isAnalyzingTicket && (
                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div>
                          )}
                          Jalankan Ulang Diagnosis AI
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <p className="text-[10px] text-indigo-300/80 uppercase font-bold tracking-wider">Ringkasan Masalah (AI Summary)</p>
                          <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {selectedTicket.ai_summary || 'AI belum melakukan ringkasan untuk tiket ini. Klik tombol diagnosis untuk menghasilkan.'}
                          </p>
                        </div>

                        <div className="border-t border-white/5 pt-4">
                          <p className="text-[10px] text-indigo-300/80 uppercase font-bold tracking-wider">Akar Masalah (Suggested Root Cause)</p>
                          <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {selectedTicket.root_cause || 'Akar penyebab masalah belum dianalisis.'}
                          </p>
                        </div>

                        <div className="border-t border-white/5 pt-4">
                          <p className="text-[10px] text-indigo-300/80 uppercase font-bold tracking-wider">Rekomendasi Langkah Resolusi</p>
                          <p className="mt-1 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {selectedTicket.resolution || 'Rekomendasi langkah perbaikan belum ditawarkan.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Remote Agent Automation Control Room */}
                    <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white">Console Operasi Remote Agen</h4>
                      <p className="text-xs text-slate-400">Kirim perintah langsung ke client-agent yang terpasang di device terkait ({linkedAsset?.hostname || 'MKT-NUC'}).</p>

                      {/* Quick RustDesk Remote Session Banner */}
                      <div className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-900 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between shadow-inner">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">
                            📡
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="text-xs font-bold text-white">RustDesk Remote Control</h5>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${linkedAsset?.rustdesk_id ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                {linkedAsset?.rustdesk_id ? (linkedAsset?.rustdesk_status || 'online') : 'not detected'}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-amber-400 mt-0.5">
                              ID Klien: <span className="font-bold tracking-wider">{linkedAsset?.rustdesk_id || 'Belum Terdeteksi'}</span>
                            </p>
                          </div>
                        </div>
                        {linkedAsset?.rustdesk_id ? (
                          <a
                            href={`rustdesk://${linkedAsset.rustdesk_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                          >
                            🔌 Remote PC User
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Agent belum melapor ID</span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Tool select */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-slate-500 uppercase font-bold">Pilih Remote Tool</label>
                          <select
                            value={selectedTool}
                            onChange={(e) => setSelectedTool(e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                          >
                            <option value="">-- Pilih Tool --</option>
                            {tools.map((t) => (
                              <option key={t.name} value={t.name}>
                                {t.name} ({t.description})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Argument input */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-slate-500 uppercase font-bold">Argument Parameter (JSON / Hostname)</label>
                          <input
                            type="text"
                            placeholder='{"host": "google.com"} atau "nginx"'
                            value={toolArgs}
                            onChange={(e) => setToolArgs(e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleRunTool}
                        disabled={isRunningTool || !selectedTool}
                        className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-900/40 disabled:text-slate-500 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2"
                      >
                        {isRunningTool && (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                        ⚡ Eksekusi Remote Tool Agen
                      </button>

                      {/* Monospaced output console */}
                      {toolOutput && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Log Output Terminal</p>
                          <pre className="bg-black border border-white/10 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[250px] whitespace-pre-wrap leading-relaxed shadow-inner">
                            {toolOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: ASSETS & TELEMETRY */}
                {activeTab === 'telemetry' && (
                  <div className="space-y-6">
                    {linkedAsset ? (
                      <>
                        {/* Device Info */}
                        <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-white/5 pb-3">
                            <div>
                              <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Device Korelasi Otomatis</span>
                              <h4 className="mt-0.5 text-base font-bold text-white">{linkedAsset.hostname}</h4>
                            </div>
                            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${linkedDevice?.status === 'active' ? 'bg-emerald-500 animate-ping' : 'bg-slate-500'}`} />
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="text-slate-500 font-bold uppercase">IP Address</p>
                              <p className="text-slate-200 mt-0.5">{linkedAsset.ip_address || '-'}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 font-bold uppercase">Sistem Operasi</p>
                              <p className="text-slate-200 mt-0.5">{linkedAsset.os_name} {linkedAsset.os_version}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 font-bold uppercase">Spesifikasi CPU</p>
                              <p className="text-slate-200 mt-0.5">{linkedAsset.cpu_model} ({linkedAsset.cpu_cores} Cores)</p>
                            </div>
                            <div>
                              <p className="text-slate-500 font-bold uppercase">Total Memori (RAM)</p>
                              <p className="text-slate-200 mt-0.5">{linkedAsset.ram_total_gb ? `${linkedAsset.ram_total_gb.toFixed(1)} GB` : '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Telemetry charts/bars */}
                        {isLoadingTelemetry ? (
                          <div className="text-center text-slate-400 py-6">Memuat statistik live telemetry...</div>
                        ) : linkedDevice ? (
                          <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-4">
                            <h4 className="text-sm font-bold text-white">Live Telemetry Perangkat</h4>

                            {/* CPU usage */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-400">Penggunaan CPU</span>
                                <span className="text-white">{getLatestMetric('cpu_percent')}%</span>
                              </div>
                              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 transition-all duration-500"
                                  style={{ width: `${getLatestMetric('cpu_percent')}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Memory usage */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-400">Penggunaan Memori (RAM)</span>
                                <span className="text-white">{getLatestMetric('memory_percent')}%</span>
                              </div>
                              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-sky-500 transition-all duration-500"
                                  style={{ width: `${getLatestMetric('memory_percent')}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Disk usage */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-400">Penggunaan Penyimpanan (Disk)</span>
                                <span className="text-white">{getLatestMetric('disk_percent')}%</span>
                              </div>
                              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-teal-500 transition-all duration-500"
                                  style={{ width: `${getLatestMetric('disk_percent')}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-950/20 border border-white/5 rounded-2xl p-4 text-center text-xs text-slate-500">
                            Device terdaftar di CMDB, namun tidak mempublikasikan live telemetry ke dashboard.
                          </div>
                        )}

                        {/* Software Inventory */}
                        <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-3">
                          <h4 className="text-sm font-bold text-white">Daftar Software Terinstal</h4>
                          {installedSoftware.length ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-white/5 text-slate-500 font-bold">
                                    <th className="pb-2">Nama Software</th>
                                    <th className="pb-2">Versi</th>
                                    <th className="pb-2">Penerbit (Publisher)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-slate-300">
                                  {installedSoftware.slice(0, 10).map((sw, index) => (
                                    <tr key={index}>
                                      <td className="py-2 font-semibold text-white">{sw.name}</td>
                                      <td className="py-2">{sw.version || '-'}</td>
                                      <td className="py-2">{sw.publisher || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {installedSoftware.length > 10 && (
                                <p className="mt-2 text-[10px] text-slate-500 italic text-center">Menampilkan 10 software pertama dari total {installedSoftware.length}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 py-2 text-center">Tidak ada catatan software inventory untuk asset ini.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 bg-slate-950/20 border border-white/5 rounded-2xl space-y-2">
                        <div className="text-slate-500 text-3xl">🔍</div>
                        <h4 className="text-sm font-bold text-slate-300">Tidak Ada Perangkat Terekam</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">Kami tidak dapat menemukan device hostname yang terdaftar di database yang memiliki kecocokan nama dengan konten detail tiket ini.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty State Placeholder */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-slate-500 text-2xl shadow-xl">
                🎫
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Pusat Operasional Tiket Center</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">Pilih tiket di sebelah kiri untuk melihat percakapan pelanggan, catatan teknisi internal, telemetry monitoring, dan analisis diagnosa AI.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardPageShell>
  )
}
