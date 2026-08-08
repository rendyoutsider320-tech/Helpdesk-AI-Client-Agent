'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import DashboardPageShell from '@/components/DashboardPageShell'
import { websiteMonitorApi } from '@/lib/api'

interface MonitorDetail {
  monitor: {
    id: string
    name: string
    url: string
    description: string
    check_type: string
    interval_seconds: number
    timeout_seconds: number
    is_active: boolean
    location: string
    check_ssl: boolean
    follow_redirects: boolean
    keyword_check: string
    created_at: string
  }
  last_metric: {
    available: boolean
    response_time_ms: number
    ttfb_ms: number
    dns_ms: number
    connect_ms: number
    tls_ms: number
    status_code: number
    ssl_days_remaining: number
    page_size_bytes: number
    redirect_count: number
    cert_issuer: string
    cert_subject: string
    cert_fingerprint: string
    cert_valid_from: string | null
    cert_valid_to: string | null
    keyword_found: boolean
    error_message: string
    timestamp: string
  }
  uptime: {
    '24h': { percent: number; up_checks: number; down_checks: number }
    '7d': { percent: number; up_checks: number; down_checks: number }
    '30d': { percent: number; up_checks: number; down_checks: number }
  }
}

interface Metric {
  id: string
  available: boolean
  response_time_ms: number
  ttfb_ms: number
  dns_ms: number
  tls_ms: number
  status_code: number
  ssl_days_remaining: number
  timestamp: string
  error_message: string
}

interface Incident {
  id: string
  title: string
  severity: string
  status: string
  started_at: string
  resolved_at: string | null
  duration_seconds: number
  error_message: string
}

function TimingBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-slate-200">{value} ms</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function UptimeCard({ period, data }: { period: string; data: { percent?: number; up_checks?: number; down_checks?: number } }) {
  const percent = data && typeof data.percent === 'number' ? data.percent : 0
  const up_checks = data && typeof data.up_checks === 'number' ? data.up_checks : 0
  const down_checks = data && typeof data.down_checks === 'number' ? data.down_checks : 0
  const color = percent >= 99 ? 'text-emerald-400' : percent >= 95 ? 'text-yellow-400' : 'text-rose-400'
  return (
    <div className="text-center p-4 rounded-2xl bg-slate-900/40 border border-white/5">
      <p className="text-xs text-slate-400 font-semibold uppercase mb-1">{period}</p>
      <p className={`text-2xl font-bold ${color}`}>{percent.toFixed(2)}%</p>
      <p className="text-[10px] text-slate-500 mt-1">{up_checks} up / {down_checks} down</p>
    </div>
  )
}

function SparkLine({ metrics }: { metrics: Metric[] }) {
  if (metrics.length < 2) return null
  const values = metrics.map(m => m.response_time_ms)
  const max = Math.max(...values, 1)
  const w = 100
  const h = 40

  const points = metrics.map((m, i) => {
    const x = (i / (metrics.length - 1)) * w
    const y = h - (m.response_time_ms / max) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke="#0ea5e9"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function WebsiteMonitorDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [detail, setDetail] = useState<MonitorDetail | null>(null)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isProbing, setIsProbing] = useState(false)
  const [probeResult, setProbeResult] = useState<any>(null)

  const loadData = useCallback(async () => {
    try {
      const [detailRes, metricsRes, incidentsRes] = await Promise.all([
        websiteMonitorApi.get(id),
        websiteMonitorApi.getMetrics(id, undefined, undefined, 144), // 24h at 1/10min
        websiteMonitorApi.getIncidents(id),
      ])
      setDetail(detailRes.data)
      setMetrics(metricsRes.data || [])
      setIncidents(incidentsRes.data || [])
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleProbe = async () => {
    setIsProbing(true)
    setProbeResult(null)
    try {
      const res = await websiteMonitorApi.probeNow(id)
      setProbeResult(res.data)
      await loadData()
    } catch { }
    finally { setIsProbing(false) }
  }

  const handleResolveIncident = async (incidentId: string) => {
    try {
      await websiteMonitorApi.resolveIncident(incidentId)
      await loadData()
    } catch { }
  }

  if (isLoading) {
    return (
      <DashboardPageShell title="Loading..." subtitle="">
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-3xl bg-slate-800/50 animate-pulse" />)}
        </div>
      </DashboardPageShell>
    )
  }

  if (!detail) {
    return (
      <DashboardPageShell title="Monitor Tidak Ditemukan" subtitle="">
        <Link href="/dashboard/website-monitor" className="text-sky-400 hover:underline text-sm">← Kembali ke daftar</Link>
      </DashboardPageShell>
    )
  }

  const { monitor, last_metric: lm, uptime } = detail
  const timingMax = lm ? Math.max(lm.response_time_ms, 1) : 1

  return (
    <DashboardPageShell
      title={monitor.name}
      subtitle={monitor.url}
    >
      {/* Back nav */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <Link href="/dashboard/website-monitor" className="text-sm text-sky-400 hover:underline">← Daftar Monitor</Link>
        <span className="text-slate-600">·</span>
        <Link href={`/dashboard/website-monitor/ssl`} className="text-sm text-slate-400 hover:text-slate-300">SSL Dashboard</Link>
        <span className="text-slate-600">·</span>
        <Link href="/dashboard/website-monitor/incidents" className="text-sm text-slate-400 hover:text-slate-300">Incident Timeline</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Status Card */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <div className="flex justify-between items-start mb-5">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full animate-pulse ${lm?.available ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <h2 className="text-xl font-bold text-white">{lm?.available ? 'ONLINE' : 'OFFLINE'}</h2>
                  {lm?.status_code > 0 && (
                    <span className="text-sm text-slate-400 font-mono">HTTP {lm.status_code}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{monitor.description}</p>
              </div>
              <button onClick={handleProbe} disabled={isProbing}
                className="px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-300 text-sm font-medium transition-colors disabled:opacity-50">
                {isProbing ? '⏳ Probing...' : '▶ Probe Now'}
              </button>
            </div>

            {lm && (
              <>
                {/* Quick Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Response', value: `${lm.response_time_ms}ms`, color: lm.response_time_ms > 1000 ? 'text-rose-400' : lm.response_time_ms > 500 ? 'text-yellow-400' : 'text-emerald-400' },
                    { label: 'TTFB', value: `${lm.ttfb_ms}ms`, color: 'text-sky-400' },
                    { label: 'Page Size', value: lm.page_size_bytes > 0 ? `${(lm.page_size_bytes / 1024).toFixed(0)}KB` : '-', color: 'text-slate-200' },
                    { label: 'Redirect', value: `${lm.redirect_count}x`, color: 'text-slate-200' },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 text-center">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase">{item.label}</p>
                      <p className={`text-base font-bold mt-0.5 ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Timing Breakdown */}
                <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">Timing Breakdown</h3>
                <div className="space-y-3">
                  <TimingBar label="DNS Lookup" value={lm.dns_ms} max={timingMax} color="bg-purple-400" />
                  <TimingBar label="TCP Connect" value={lm.connect_ms} max={timingMax} color="bg-blue-400" />
                  <TimingBar label="TLS Handshake" value={lm.tls_ms} max={timingMax} color="bg-sky-400" />
                  <TimingBar label="TTFB" value={lm.ttfb_ms} max={timingMax} color="bg-emerald-400" />
                  <TimingBar label="Total Response" value={lm.response_time_ms} max={timingMax} color="bg-sky-600" />
                </div>

                {lm.error_message && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-xs text-rose-300">
                    ⚠ {lm.error_message}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Latency Chart */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <h3 className="text-sm font-semibold text-white mb-4">📈 Tren Latency (24 Jam Terakhir)</h3>
            {metrics.length < 2 ? (
              <p className="text-slate-500 text-sm">Belum cukup data untuk ditampilkan.</p>
            ) : (
              <div className="h-24 w-full rounded-2xl bg-slate-950/60 border border-white/5 p-2">
                <SparkLine metrics={metrics} />
              </div>
            )}
            {metrics.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
                <div>Min: {Math.min(...metrics.map(m => m.response_time_ms))} ms</div>
                <div>Avg: {Math.round(metrics.reduce((s, m) => s + m.response_time_ms, 0) / metrics.length)} ms</div>
                <div>Max: {Math.max(...metrics.map(m => m.response_time_ms))} ms</div>
              </div>
            )}

            {/* Recent checks table */}
            <div className="mt-4 divide-y divide-white/5">
              {metrics.slice(-8).reverse().map(m => (
                <div key={m.id} className="py-2 flex justify-between items-center text-xs">
                  <span className="text-slate-400">{new Date(m.timestamp).toLocaleTimeString('id-ID')}</span>
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold ${m.available ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.available ? `✓ ${m.status_code}` : '✗ Offline'}
                    </span>
                    <span className="text-slate-300 font-mono">{m.response_time_ms}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Probe Result */}
          {probeResult && (
            <div className="glass-card-soft p-6 rounded-3xl border border-sky-500/20">
              <h3 className="text-sm font-semibold text-white mb-3">🔍 Hasil Probe Terbaru</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {Object.entries(probeResult).filter(([k]) => !['error_message'].includes(k)).map(([key, val]) => (
                  <div key={key} className="p-2 rounded-xl bg-slate-900/60 border border-white/5">
                    <p className="text-slate-500 uppercase font-semibold">{key.replace(/_/g, ' ')}</p>
                    <p className="text-slate-200 font-mono mt-0.5">{String(val)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incident list */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-white">🚨 Riwayat Insiden</h3>
              <Link href="/dashboard/website-monitor/incidents" className="text-xs text-sky-400 hover:underline">Lihat semua →</Link>
            </div>
            {incidents.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">✅ Tidak ada insiden tercatat</p>
            ) : (
              <div className="space-y-3">
                {incidents.slice(0, 5).map(inc => (
                  <div key={inc.id} className={`p-4 rounded-2xl border ${inc.status === 'open' ? 'border-rose-500/20 bg-rose-500/5' : 'border-white/5 bg-slate-900/40'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-white">{inc.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Mulai: {new Date(inc.started_at).toLocaleString('id-ID')}
                          {inc.resolved_at && ` · Selesai: ${new Date(inc.resolved_at).toLocaleString('id-ID')}`}
                          {inc.duration_seconds > 0 && ` · Durasi: ${Math.round(inc.duration_seconds / 60)}m`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${inc.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                          {inc.severity}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${inc.status === 'open' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {inc.status}
                        </span>
                        {inc.status === 'open' && (
                          <button onClick={() => handleResolveIncident(inc.id)}
                            className="text-xs px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors">
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Uptime Stats */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <h3 className="text-sm font-semibold text-white mb-4">📊 Uptime Statistics</h3>
            <div className="space-y-3">
              {uptime && (
                <>
                  <UptimeCard period="24 Jam" data={uptime['24h']} />
                  <UptimeCard period="7 Hari" data={uptime['7d']} />
                  <UptimeCard period="30 Hari" data={uptime['30d']} />
                </>
              )}
            </div>
          </div>

          {/* SSL Info */}
          {lm && lm.cert_subject && (
            <div className="glass-card-soft p-6 rounded-3xl">
              <h3 className="text-sm font-semibold text-white mb-4">🔒 SSL Certificate</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Sisa Hari</span>
                  <span className={`font-bold ${lm.ssl_days_remaining <= 7 ? 'text-rose-400' : lm.ssl_days_remaining <= 30 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {lm.ssl_days_remaining} hari
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Subject</span>
                  <span className="text-slate-200 font-mono truncate max-w-[150px]">{lm.cert_subject}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Issuer</span>
                  <span className="text-slate-200 truncate max-w-[150px]">{lm.cert_issuer}</span>
                </div>
                {lm.cert_valid_from && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Valid From</span>
                    <span className="text-slate-300">{new Date(lm.cert_valid_from).toLocaleDateString('id-ID')}</span>
                  </div>
                )}
                {lm.cert_valid_to && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Valid To</span>
                    <span className="text-slate-300">{new Date(lm.cert_valid_to).toLocaleDateString('id-ID')}</span>
                  </div>
                )}
                {lm.cert_fingerprint && (
                  <div>
                    <p className="text-slate-500 mb-1">SHA256 Fingerprint</p>
                    <p className="font-mono text-[9px] text-slate-400 break-all">{lm.cert_fingerprint}</p>
                  </div>
                )}
                <Link href={`/dashboard/website-monitor/ssl`}
                  className="block text-center text-sky-400 hover:underline mt-2">
                  Lihat SSL Dashboard →
                </Link>
              </div>
            </div>
          )}

          {/* Config Info */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <h3 className="text-sm font-semibold text-white mb-4">⚙️ Konfigurasi</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Interval', value: `${monitor.interval_seconds}s` },
                { label: 'Timeout', value: `${monitor.timeout_seconds}s` },
                { label: 'Type', value: monitor.check_type },
                { label: 'Location', value: monitor.location },
                { label: 'Cek SSL', value: monitor.check_ssl ? 'Ya' : 'Tidak' },
                { label: 'Follow Redirect', value: monitor.follow_redirects ? 'Ya' : 'Tidak' },
                { label: 'Keyword', value: monitor.keyword_check || 'Tidak ada' },
              ].map(item => (
                <div key={item.label} className="flex justify-between">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="text-slate-300 font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardPageShell>
  )
}
