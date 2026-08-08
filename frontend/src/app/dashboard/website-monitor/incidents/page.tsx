'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import DashboardPageShell from '@/components/DashboardPageShell'
import { websiteMonitorApi } from '@/lib/api'

interface Incident {
  id: string
  monitor_id: string
  title: string
  description: string
  severity: string
  status: string
  started_at: string
  resolved_at: string | null
  duration_seconds: number
  error_message: string
  monitor?: {
    name: string
    url: string
  }
}

function SeverityBadge({ sev }: { sev: string }) {
  const cls = sev === 'critical' ? 'bg-rose-500/20 text-rose-300' :
    sev === 'warning' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-sky-500/10 text-sky-300'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{sev}</span>
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status === 'open' ? 'bg-rose-500/20 text-rose-300 animate-pulse' : 'bg-emerald-500/10 text-emerald-400'}`}>
      {status === 'open' ? '🔴 Open' : '✅ Resolved'}
    </span>
  )
}

function formatDuration(secs: number) {
  if (secs === 0) return 'Berlangsung...'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}j ${m}m`
  if (m > 0) return `${m}m ${s}d`
  return `${s}d`
}

export default function IncidentTimelinePage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all')

  const load = useCallback(async () => {
    try {
      const res = await websiteMonitorApi.getAllIncidents(100)
      setIncidents(res.data || [])
    } catch { }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const handleResolve = async (id: string) => {
    try {
      await websiteMonitorApi.resolveIncident(id)
      await load()
    } catch { }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus semua riwayat insiden?')) return
    try {
      await websiteMonitorApi.deleteAllIncidents()
      await load()
    } catch { }
  }

  const filtered = incidents.filter(i => filter === 'all' || i.status === filter)
  const openCount = incidents.filter(i => i.status === 'open').length
  const resolvedCount = incidents.filter(i => i.status === 'resolved').length
  const totalDowntime = incidents.filter(i => i.status === 'resolved').reduce((s, i) => s + i.duration_seconds, 0)

  return (
    <DashboardPageShell
      title="Incident Timeline"
      subtitle="Riwayat lengkap insiden downtime seluruh website monitor"
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm">
        <Link href="/dashboard/website-monitor" className="text-sky-400 hover:underline">Website Monitor</Link>
        <span className="text-slate-600">→</span>
        <span className="text-slate-400">Incident Timeline</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card-soft p-5 rounded-3xl">
          <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Total Insiden</p>
          <p className="text-3xl font-bold text-white">{incidents.length}</p>
        </div>
        <div className="glass-card-soft p-5 rounded-3xl">
          <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Open</p>
          <p className={`text-3xl font-bold ${openCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{openCount}</p>
        </div>
        <div className="glass-card-soft p-5 rounded-3xl">
          <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Resolved</p>
          <p className="text-3xl font-bold text-emerald-400">{resolvedCount}</p>
        </div>
        <div className="glass-card-soft p-5 rounded-3xl">
          <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Total Downtime</p>
          <p className="text-2xl font-bold text-yellow-400">{formatDuration(totalDowntime)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          {(['all', 'open', 'resolved'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${filter === f ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
              {f === 'all' ? 'Semua' : f === 'open' ? '🔴 Open' : '✅ Resolved'}
              {f !== 'all' && <span className="ml-1 text-xs">({f === 'open' ? openCount : resolvedCount})</span>}
            </button>
          ))}
        </div>

        {incidents.length > 0 && (
          <button
            onClick={handleDeleteAll}
            className="px-4 py-1.5 rounded-xl text-sm font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 hover:text-white transition-colors"
          >
            🗑️ Hapus Semua
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="glass-card-soft p-6 rounded-3xl">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-800/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-slate-400 text-sm">Tidak ada insiden ditemukan</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-white/5" />

            <div className="space-y-4">
              {filtered.map((inc) => (
                <div key={inc.id} className="pl-12 relative">
                  {/* Timeline dot */}
                  <div className={`absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 border-slate-900 ${inc.status === 'open' ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />

                  <div className={`p-5 rounded-2xl border transition-all ${inc.status === 'open' ? 'border-rose-500/20 bg-rose-500/5' : 'border-white/5 bg-slate-900/40'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <SeverityBadge sev={inc.severity} />
                          <StatusBadge status={inc.status} />
                        </div>
                        <p className="text-sm font-semibold text-white">{inc.title}</p>
                        {inc.monitor && (
                          <Link href={`/dashboard/website-monitor/${inc.monitor_id}`}
                            className="text-xs text-sky-400 hover:underline">
                            {inc.monitor.name} — {inc.monitor.url}
                          </Link>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-slate-400">
                          {new Date(inc.started_at).toLocaleString('id-ID')}
                        </p>
                        {inc.resolved_at && (
                          <p className="text-xs text-slate-500">
                            → {new Date(inc.resolved_at).toLocaleString('id-ID')}
                          </p>
                        )}
                        <p className="text-xs text-yellow-400 font-semibold mt-1">
                          ⏱ {formatDuration(inc.duration_seconds)}
                        </p>
                      </div>
                    </div>

                    {inc.error_message && (
                      <p className="mt-2 text-xs text-slate-400 bg-slate-900/60 p-2 rounded-xl border border-white/5 truncate">
                        {inc.error_message}
                      </p>
                    )}

                    {inc.status === 'open' && (
                      <div className="mt-3">
                        <button onClick={() => handleResolve(inc.id)}
                          className="px-3 py-1.5 rounded-lg text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors font-medium">
                          ✓ Tandai Resolved
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardPageShell>
  )
}
