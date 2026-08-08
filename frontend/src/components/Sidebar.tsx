'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { navbarApi, technicianApi } from '@/lib/api'
import { usePresenceStore, useAuthStore, useLayoutStore } from '@/store'

const getCollapsedLabel = (label: string) => {
  const emojiRegex = /^[\p{Emoji}\u200d\uFE0F\u2700-\u27BF\u2b50\u2600-\u26FF\u2300-\u23FF]+/u;
  const match = label.match(emojiRegex);
  if (match) return match[0];
  if (label.includes('Dashboard')) return '🏠';
  if (label.includes('Live Monitor')) return '📊';
  if (label.includes('Alert Log')) return '🚨';
  if (label.includes('Website Monitor')) return '🌐';
  if (label.includes('SSL Dashboard')) return '🔒';
  if (label.includes('Incident Timeline')) return '🚨';
  if (label.includes('Approval Center')) return '✅';
  if (label.includes('Asset Inventory')) return '📦';
  if (label.includes('Posts')) return '📝';
  if (label.includes('Arsip')) return '📁';
  return label.substring(0, 2).toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = searchParams.get('view')
  const [stats, setStats] = useState<any>({ total_tickets: 0, my_tickets: 0, unread_alerts: 0, pending_approvals: 0 })
  const [technicians, setTechnicians] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const technicianPresences = usePresenceStore((state) => state.technicianPresences)
  const user = useAuthStore((state) => state.user)
  const collapsed = useLayoutStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar)
  const activeRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [pathname, view])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsRes, techRes] = await Promise.all([
          navbarApi.stats(),
          technicianApi.list(),
        ])
        setStats(statsRes.data)
        const techs = techRes.data?.technicians || []
        setTechnicians(techs)
      } catch (err) {
        console.error('Failed to load navbar data', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  const NavLink = ({ href, label, badge = null }: { href: string; label: string; badge?: number | null }) => {
    const url = new URL(href, 'http://localhost')
    const hrefView = url.searchParams.get('view')
    const hrefPath = url.pathname
    const active = pathname === hrefPath && (hrefView === null ? !view : view === hrefView)

    return (
      <Link
        href={href}
        scroll={false}
        ref={active ? activeRef : null}
        title={collapsed ? label : undefined}
        className={`gaya-list-baru flex items-center ${
          collapsed ? 'justify-center px-2 py-2.5 mx-auto w-12' : 'justify-between px-4 py-2 ml-4'
        } rounded-2xl text-sm transition-all ${active
          ? 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/20 dark:border-sky-500/30 font-semibold'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
          }`}
      >
        {collapsed ? (
          <span className="text-lg relative">
            {getCollapsedLabel(label)}
            {badge !== null && badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white ring-1 ring-white dark:ring-slate-950">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
        ) : (
          <>
            <span>{label}</span>
            {badge !== null && badge > 0 && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ml-2 shrink-0">
                {badge}
              </span>
            )}
          </>
        )}
      </Link>
    )
  }

  const TechnicianItem = ({ tech }: { tech: any }) => {
    const storePresence = technicianPresences.find((p) => p.technician_id === tech.id)
    const activeStatus = storePresence ? storePresence.status : (tech.presence_status || 'offline')
    const isOnline = activeStatus !== 'offline'
    const statusText = isOnline ? 'aktif' : 'offline'
    const statusColor = isOnline ? 'bg-emerald-400' : 'bg-slate-500'
    const activeShift = storePresence?.shift || tech.shift || ''

    if (collapsed) {
      return (
        <div 
          className="flex items-center justify-center relative py-1 mx-auto"
          title={`${tech.name || 'Unknown'} (${statusText}) ${activeShift ? `Shift: ${activeShift}` : ''}`}
        >
          <div className="relative h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs uppercase cursor-default">
            {tech.name?.substring(0, 2).toUpperCase() || '??'}
            <span className={`absolute -bottom-0.5 -right-0.5 inline-flex h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-950 ${statusColor}`} />
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-1 rounded-2xl px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-all ml-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-700 dark:text-slate-300 font-medium">{tech.name || 'Unknown'}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 capitalize">{statusText}</span>
            <span className={`inline-flex h-2 w-2 rounded-full ${statusColor}`} />
          </div>
        </div>
        {activeShift && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold tracking-wider text-sky-500 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/20 px-1.5 py-0.5 rounded uppercase">
              Shift: {activeShift}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 ${collapsed ? 'w-20' : 'w-80'} bg-white dark:bg-slate-950/95 border-r border-slate-200 dark:border-white/10 flex flex-col text-slate-800 dark:text-slate-200 shadow-2xl backdrop-blur-xl transition-all duration-300`}>
      {/* Collapse Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-6 -right-3.5 z-50 h-7 w-7 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-950 dark:hover:text-white shadow-md transition-all duration-300 hover:scale-110 cursor-pointer"
        title={collapsed ? "Perluas Sidebar" : "Sembunyikan Sidebar"}
        type="button"
      >
        <svg 
          className={`w-3.5 h-3.5 transform transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-sky-500/20 shrink-0">
            {user?.username ? user.username.substring(0, 2).toUpperCase() : 'HD'}
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white leading-tight">Helpdesk AI</h2>
              <span className="text-xs text-sky-500 font-semibold tracking-wider uppercase">
                {user?.role === 'technician' ? 'Teknisi' : 'Administrator'}
              </span>
            </div>
          )}
        </div>
        {!collapsed && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Kelola tiket, monitoring alert, dan AI helpdesk dari satu tempat.
          </p>
        )}
      </div>

      {/* Navigation List - Scrollable */}
      <nav className={`flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-none`}>
        {/* UTAMA */}
        <div className="space-y-1.5">
          {!collapsed ? (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500/80 border-l-2 border-sky-500/50 pl-2 ml-2 mb-2">Utama</p>
          ) : (
            <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2" />
          )}
          <NavLink href={user?.role === 'technician' ? '/dashboard/technician' : '/dashboard/admin'} label="Dashboard" />
        </div>

        {/* TICKET CENTER */}
        <div className="space-y-1.5">
          {!collapsed ? (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500/80 border-l-2 border-sky-500/50 pl-2 ml-2 mb-2">Ticket Center</p>
          ) : (
            <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2" />
          )}
          <NavLink href="/dashboard/tickets/create" label="➕ Buat Tiket Baru" />
          {!collapsed && <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2 mx-4" />}
          <NavLink href="/dashboard/tickets?view=all" label="🎫 Semua Tiket" badge={stats.total_tickets} />
          <NavLink href="/dashboard/tickets?view=my" label="👤 Tiket Saya" badge={stats.my_tickets} />
          <NavLink href="/dashboard/tickets?view=assigned" label="📌 Ditugaskan ke Saya" badge={stats.assigned_tickets} />
          <NavLink href="/dashboard/tickets?view=open" label="🔵 Open" badge={stats.open_tickets} />
          <NavLink href="/dashboard/tickets?view=pending" label="🟡 Pending (Approval)" badge={stats.pending_tickets} />
          <NavLink href="/dashboard/tickets?view=waiting-customer" label="🟠 Menunggu Pelanggan" badge={stats.waiting_customer_tickets} />
          <NavLink href="/dashboard/tickets?view=waiting-vendor" label="🟣 Menunggu Vendor" badge={stats.waiting_vendor_tickets} />
          <NavLink href="/dashboard/tickets?view=escalated" label="🔥 Escalated" badge={stats.escalated_tickets} />
          <NavLink href="/dashboard/tickets?view=critical" label="❌ Critical & P1" badge={stats.critical_tickets} />
          <NavLink href="/dashboard/tickets?view=resolved" label="🟢 Resolved" badge={stats.resolved_tickets} />
          <NavLink href="/dashboard/tickets?view=closed" label="🔒 Closed" badge={stats.closed_tickets} />
          <NavLink href="/dashboard/tickets?view=spam" label="⚠️ Spam" badge={stats.spam_tickets} />
          <NavLink href="/dashboard/tickets?view=archive" label="Arsip" badge={stats.archive_tickets} />
        </div>

        {/* MONITORING */}
        <div className="space-y-1.5">
          {!collapsed ? (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500/80 border-l-2 border-sky-500/50 pl-2 ml-2 mb-2">Monitoring</p>
          ) : (
            <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2" />
          )}
          <NavLink href="/dashboard/monitor" label="Live Monitor" />
          <NavLink href="/dashboard/alerts" label="Alert Log" badge={stats.unread_alerts} />
          <NavLink href="/dashboard/website-monitor" label="🌐 Website Monitor" />
          <NavLink href="/dashboard/website-monitor/ssl" label="🔒 SSL Dashboard" />
          <NavLink href="/dashboard/website-monitor/incidents" label="🚨 Incident Timeline" />
        </div>

        {/* ENTERPRISE */}
        <div className="space-y-1.5">
          {!collapsed ? (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500/80 border-l-2 border-sky-500/50 pl-2 ml-2 mb-2">Enterprise</p>
          ) : (
            <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2" />
          )}
          <NavLink href="/dashboard/approvals" label="Approval Center" badge={stats.pending_approvals} />
          <NavLink href="/dashboard/assets" label="Asset Inventory" />
        </div>

        {/* KONTEN & AI */}
        <div className="space-y-1.5">
          {!collapsed ? (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500/80 border-l-2 border-sky-500/50 pl-2 ml-2 mb-2">Konten & AI</p>
          ) : (
            <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2" />
          )}
          <NavLink href="/dashboard/posts" label="📝 Posts / Artikel KB" />
          {user?.role === 'admin' && (
            <NavLink href="/dashboard/users" label="👥 Manajemen Pengguna" />
          )}
        </div>

        {/* TIM TEKNIS */}
        <div className="space-y-1.5">
          {!collapsed ? (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500/80 border-l-2 border-sky-500/50 pl-2 ml-2 mb-2">Tim Teknis</p>
          ) : (
            <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-2" />
          )}
          {loading ? (
            <div className="px-4 py-2 text-xs text-slate-500 ml-4">Loading...</div>
          ) : (() => {
            const onlineTechs = technicians
              .filter((tech) => {
                const storePresence = technicianPresences.find((p) => p.technician_id === tech.id)
                const activeStatus = storePresence ? storePresence.status : (tech.presence_status || 'offline')
                return activeStatus !== 'offline'
              })
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

            return onlineTechs.length > 0 ? (
              onlineTechs.map((tech) => <TechnicianItem key={tech.id} tech={tech} />)
            ) : (
              !collapsed && <div className="px-4 py-2 text-xs text-slate-500 ml-4">Tidak ada teknisi online</div>
            )
          })()}
        </div>
      </nav>

      {/* Account Footer */}
      {user && (
        <div className={`p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 shrink-0" title={collapsed ? user.username : undefined}>
              {user.username?.substring(0, 2).toUpperCase() || 'AD'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.username}</p>
                <p className="text-xs text-slate-400 capitalize truncate">{user.role} • Aktif</p>
              </div>
            )}
            {!collapsed && <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
          </div>
        </div>
      )}
    </aside>
  )
}
