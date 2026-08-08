'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import DashboardPageShell from '@/components/DashboardPageShell'
import { websiteMonitorApi } from '@/lib/api'

interface MonitorStatus {
  id: string
  name: string
  url: string
  description: string
  interval_seconds: number
  check_type: string
  is_active: boolean
  location: string
  available: boolean
  response_time_ms: number
  ttfb_ms: number
  dns_ms: number
  tls_ms: number
  status_code: number
  ssl_days_remaining: number
  page_size_bytes: number
  cert_issuer: string
  cert_valid_to: string | null
  error_message: string
  uptime_percent: number
  last_checked: string | null
  created_at: string
}

function UptimeBadge({ percent }: { percent: number }) {
  const color = percent >= 99 ? 'text-emerald-400' : percent >= 95 ? 'text-yellow-400' : 'text-rose-400'
  return <span className={`font-bold text-sm ${color}`}>{percent.toFixed(2)}%</span>
}

function StatusDot({ available, isActive }: { available: boolean; isActive: boolean }) {
  if (!isActive) return <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
  return <span className={`h-2.5 w-2.5 rounded-full animate-pulse ${available ? 'bg-emerald-400' : 'bg-rose-400'}`} />
}

function SSLBadge({ days }: { days: number }) {
  if (days < 0) return <span className="text-slate-500 text-xs">-</span>
  if (days <= 7) return <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/20 text-rose-300 font-semibold">{days}d ⚠️</span>
  if (days <= 30) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-300 font-semibold">{days}d</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 font-semibold">{days}d ✓</span>
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '-'
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export default function WebsiteMonitorPage() {
  const [monitors, setMonitors] = useState<MonitorStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    interval_seconds: 60,
    timeout_seconds: 15,
    check_ssl: true,
    follow_redirects: true,
    keyword_check: '',
    location: 'Jakarta',
  })
  const [formLoading, setFormLoading] = useState(false)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [probing, setProbing] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const loadMonitors = useCallback(async () => {
    try {
      const res = await websiteMonitorApi.list()
      setMonitors(res.data || [])
    } catch {
      setError('Gagal memuat daftar monitor')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMonitors()
    const interval = setInterval(loadMonitors, 10000)
    return () => clearInterval(interval)
  }, [loadMonitors])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.url) {
      setFormError('Nama dan URL wajib diisi')
      return
    }
    setFormLoading(true)
    setFormError(null)
    try {
      await websiteMonitorApi.create(formData)
      setFormSuccess('Monitor berhasil ditambahkan!')
      setFormData({ name: '', url: '', description: '', interval_seconds: 60, timeout_seconds: 15, check_ssl: true, follow_redirects: true, keyword_check: '', location: 'Jakarta' })
      loadMonitors()
      setTimeout(() => { setShowAddForm(false); setFormSuccess(null) }, 1500)
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Gagal menambahkan monitor')
    } finally {
      setFormLoading(false)
    }
  }

  const handleProbe = async (id: string) => {
    setProbing(id)
    try {
      await websiteMonitorApi.probeNow(id)
      await loadMonitors()
    } catch { }
    finally { setProbing(null) }
  }

  const handleToggle = async (id: string) => {
    setToggling(id)
    try {
      await websiteMonitorApi.toggle(id)
      await loadMonitors()
    } catch { }
    finally { setToggling(null) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus monitor "${name}"?`)) return
    try {
      await websiteMonitorApi.delete(id)
      await loadMonitors()
    } catch { }
  }

  // Stats aggregation
  const online = monitors.filter(m => m.available && m.is_active).length
  const offline = monitors.filter(m => !m.available && m.is_active).length
  const sslExpiring = monitors.filter(m => m.ssl_days_remaining >= 0 && m.ssl_days_remaining <= 30).length
  const avgUptime = monitors.length > 0
    ? monitors.reduce((acc, m) => acc + m.uptime_percent, 0) / monitors.length
    : 100

  return (
    <DashboardPageShell
      title="Website Monitor"
      subtitle="Monitor ketersediaan, performa, DNS, SSL, dan insiden website secara real-time"
    >
      {/* Quick Nav */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <Link href="/dashboard/website-monitor/ssl"
          className="px-4 py-2 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-300 text-sm font-medium transition-all flex items-center gap-2">
          🔒 SSL Dashboard
        </Link>
        <Link href="/dashboard/website-monitor/incidents"
          className="px-4 py-2 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-sm font-medium transition-all flex items-center gap-2">
          🚨 Incident Timeline
        </Link>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setFormError(null); setFormSuccess(null) }}
          className="px-4 py-2 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-sm font-medium transition-all flex items-center gap-2">
          ＋ Tambah Monitor
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Monitor', value: monitors.length, color: 'text-sky-400', icon: '🌐' },
          { label: 'Online', value: online, color: 'text-emerald-400', icon: '✅' },
          { label: 'Offline', value: offline, color: 'text-rose-400', icon: '❌' },
          { label: 'SSL Kritis', value: sslExpiring, color: 'text-yellow-400', icon: '🔒' },
        ].map(card => (
          <div key={card.label} className="glass-card-soft p-5 rounded-3xl">
            <div className="text-2xl mb-1">{card.icon}</div>
            <p className="text-xs text-slate-400 uppercase font-semibold mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Average Uptime Bar */}
      <div className="glass-card-soft p-5 rounded-3xl mb-6">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm text-slate-300 font-medium">Rata-rata Uptime (24 Jam)</p>
          <UptimeBadge percent={avgUptime} />
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800">
          <div
            className={`h-2 rounded-full transition-all ${avgUptime >= 99 ? 'bg-emerald-400' : avgUptime >= 95 ? 'bg-yellow-400' : 'bg-rose-400'}`}
            style={{ width: `${Math.min(avgUptime, 100)}%` }}
          />
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="glass-card-soft p-6 rounded-3xl mb-6">
          <h3 className="text-base font-semibold text-white mb-5">➕ Tambah Monitor Website Baru</h3>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1">NAMA WEBSITE *</label>
              <input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="e.g. Sales Portal" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1">URL *</label>
              <input type="text" value={formData.url} onChange={e => setFormData(p => ({ ...p, url: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="https://example.sams.id" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 font-semibold mb-1">DESKRIPSI</label>
              <input type="text" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Deskripsi singkat website" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1">INTERVAL CEK</label>
              <select value={formData.interval_seconds} onChange={e => setFormData(p => ({ ...p, interval_seconds: Number(e.target.value) }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                <option value={10}>10 Detik</option>
                <option value={15}>15 Detik</option>
                <option value={30}>30 Detik</option>
                <option value={60}>60 Detik</option>
                <option value={120}>2 Menit</option>
                <option value={300}>5 Menit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 font-semibold mb-1">KEYWORD CHECK</label>
              <input type="text" value={formData.keyword_check} onChange={e => setFormData(p => ({ ...p, keyword_check: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Kata kunci di halaman (opsional)" />
            </div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={formData.check_ssl} onChange={e => setFormData(p => ({ ...p, check_ssl: e.target.checked }))}
                  className="rounded" />
                Cek SSL
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={formData.follow_redirects} onChange={e => setFormData(p => ({ ...p, follow_redirects: e.target.checked }))}
                  className="rounded" />
                Follow Redirect
              </label>
            </div>
            {formError && <div className="sm:col-span-2 text-xs text-rose-400 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">{formError}</div>}
            {formSuccess && <div className="sm:col-span-2 text-xs text-emerald-400 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">{formSuccess}</div>}
            <div className="sm:col-span-2 flex gap-3">
              <button type="submit" disabled={formLoading}
                className="px-6 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-colors">
                {formLoading ? 'Menyimpan...' : 'Simpan Monitor'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium text-slate-300 transition-colors">
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Monitor List */}
      <div className="glass-card-soft p-6 rounded-3xl">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold text-white">Daftar Website Target</h2>
          <span className="text-xs text-slate-400">Auto-refresh setiap 10 detik</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 rounded-2xl bg-slate-800/50 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">{error}</div>
        ) : monitors.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">Belum ada monitor yang dikonfigurasi.</p>
        ) : (
          <div className="space-y-3">
            {monitors.map(m => (
              <div key={m.id}
                className="p-5 rounded-2xl border border-white/5 bg-slate-900/40 hover:border-white/10 transition-all">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Status & Name */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-1"><StatusDot available={m.available} isActive={m.is_active} /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/dashboard/website-monitor/${m.id}`}
                          className="font-semibold text-white hover:text-sky-300 transition-colors truncate">
                          {m.name}
                        </Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                          {m.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400">{m.check_type}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{m.url}</p>
                      {m.description && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{m.description}</p>}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-4 gap-4 md:gap-6 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">LATENCY</p>
                      <p className={`text-sm font-bold mt-0.5 ${m.response_time_ms > 1000 ? 'text-rose-400' : m.response_time_ms > 500 ? 'text-yellow-400' : 'text-white'}`}>
                        {m.response_time_ms > 0 ? `${m.response_time_ms}ms` : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">UPTIME</p>
                      <div className="mt-0.5"><UptimeBadge percent={m.uptime_percent} /></div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">SSL</p>
                      <div className="mt-0.5"><SSLBadge days={m.ssl_days_remaining} /></div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">SIZE</p>
                      <p className="text-xs text-slate-300 font-semibold mt-0.5">{formatBytes(m.page_size_bytes)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 items-center flex-shrink-0">
                    <Link href={`/dashboard/website-monitor/${m.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 transition-colors">
                      Detail
                    </Link>
                    <button
                      onClick={() => handleProbe(m.id)}
                      disabled={probing === m.id}
                      className="px-3 py-1.5 rounded-lg text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50 transition-colors">
                      {probing === m.id ? '...' : '▶ Probe'}
                    </button>
                    <button
                      onClick={() => handleToggle(m.id)}
                      disabled={toggling === m.id}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 ${m.is_active ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'}`}>
                      {toggling === m.id ? '...' : m.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleDelete(m.id, m.name)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors">
                      Hapus
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {!m.available && m.error_message && (
                  <div className="mt-3 text-xs text-rose-300 bg-rose-500/5 p-2.5 rounded-xl border border-rose-500/10 truncate">
                    ⚠ {m.error_message}
                  </div>
                )}

                {/* Last checked */}
                {m.last_checked && (
                  <p className="mt-2 text-[10px] text-slate-600">
                    Terakhir dicek: {new Date(m.last_checked).toLocaleString('id-ID')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardPageShell>
  )
}
