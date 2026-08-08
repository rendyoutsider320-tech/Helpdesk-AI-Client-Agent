'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import DashboardPageShell from '@/components/DashboardPageShell'
import { websiteMonitorApi } from '@/lib/api'

interface SSLInfo {
  monitor_id: string
  url: string
  name: string
  ssl_days_remaining: number
  cert_issuer: string
  cert_subject: string
  cert_fingerprint: string
  cert_valid_from: string | null
  cert_valid_to: string | null
  last_checked: string
  ssl_health: 'healthy' | 'warning' | 'critical' | 'unknown'
}

interface MonitorListItem {
  id: string
  name: string
  url: string
  ssl_days_remaining: number
  cert_issuer: string
  cert_subject: string
  cert_valid_to: string | null
  last_checked: string | null
  available: boolean
}

function SSLGauge({ days }: { days: number }) {
  const max = 365
  const pct = Math.min(Math.max(days / max * 100, 0), 100)
  const color = days <= 7 ? '#f43f5e' : days <= 30 ? '#eab308' : '#10b981'
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - pct / 100)

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={radius} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-lg font-bold text-white leading-none">{days > 0 ? days : 'N/A'}</p>
        <p className="text-[9px] text-slate-400">HARI</p>
      </div>
    </div>
  )
}

function HealthBadge({ health }: { health: string }) {
  const map: Record<string, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse',
    unknown: 'bg-slate-700 text-slate-400 border-slate-600',
  }
  const labels: Record<string, string> = {
    healthy: '✓ Sehat', warning: '⚠ Perlu Diperbarui', critical: '🔴 Kritis', unknown: '— Tidak Diketahui'
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${map[health]}`}>{labels[health]}</span>
}

export default function SSLDashboardPage() {
  const [monitors, setMonitors] = useState<MonitorListItem[]>([])
  const [sslDetails, setSslDetails] = useState<Record<string, SSLInfo>>({})
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const listRes = await websiteMonitorApi.list()
      const list: MonitorListItem[] = listRes.data || []
      setMonitors(list)

      // Load SSL details per monitor
      const details: Record<string, SSLInfo> = {}
      await Promise.all(list.map(async (m) => {
        try {
          const res = await websiteMonitorApi.getSSL(m.id)
          details[m.id] = res.data
        } catch { }
      }))
      setSslDetails(details)
    } catch { }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const healthy = Object.values(sslDetails).filter(s => s.ssl_health === 'healthy').length
  const warning = Object.values(sslDetails).filter(s => s.ssl_health === 'warning').length
  const critical = Object.values(sslDetails).filter(s => s.ssl_health === 'critical').length

  // Sort by days remaining ascending
  const sorted = [...monitors].sort((a, b) => (a.ssl_days_remaining ?? 999) - (b.ssl_days_remaining ?? 999))

  return (
    <DashboardPageShell
      title="SSL Dashboard"
      subtitle="Pantau masa berlaku sertifikat SSL seluruh website monitor"
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm">
        <Link href="/dashboard/website-monitor" className="text-sky-400 hover:underline">Website Monitor</Link>
        <span className="text-slate-600">→</span>
        <span className="text-slate-400">SSL Dashboard</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total SSL', value: monitors.length, color: 'text-sky-400', icon: '🔒' },
          { label: 'Sehat', value: healthy, color: 'text-emerald-400', icon: '✅' },
          { label: 'Perlu Perhatian', value: warning, color: 'text-yellow-400', icon: '⚠️' },
          { label: 'Kritis', value: critical, color: 'text-rose-400', icon: '🔴' },
        ].map(c => (
          <div key={c.label} className="glass-card-soft p-5 rounded-3xl">
            <div className="text-2xl mb-1">{c.icon}</div>
            <p className="text-xs text-slate-400 font-semibold uppercase mb-1">{c.label}</p>
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* SSL Cards Grid */}
      <div className="grid md:grid-cols-2 gap-5 mb-6">
        {isLoading ? (
          [1, 2, 3, 4].map(i => <div key={i} className="h-48 rounded-3xl bg-slate-800/50 animate-pulse" />)
        ) : sorted.length === 0 ? (
          <div className="md:col-span-2 text-center py-12 text-slate-400">Belum ada monitor dengan data SSL</div>
        ) : (
          sorted.map(m => {
            const ssl = sslDetails[m.id]
            const days = ssl?.ssl_days_remaining ?? m.ssl_days_remaining ?? -1
            const health = ssl?.ssl_health ?? (days < 0 ? 'unknown' : days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'healthy')

            return (
              <div key={m.id} className={`glass-card-soft p-6 rounded-3xl border ${health === 'critical' ? 'border-rose-500/30' : health === 'warning' ? 'border-yellow-500/20' : 'border-white/5'}`}>
                <div className="flex items-start gap-5">
                  <SSLGauge days={days} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <HealthBadge health={health} />
                    </div>
                    <Link href={`/dashboard/website-monitor/${m.id}`}
                      className="text-base font-semibold text-white hover:text-sky-300 transition-colors block truncate">
                      {m.name}
                    </Link>
                    <p className="text-xs text-slate-400 truncate">{m.url}</p>

                    {ssl && (
                      <div className="mt-3 space-y-1.5 text-xs">
                        {ssl.cert_subject && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Subject</span>
                            <span className="text-slate-300 font-mono truncate max-w-[180px]">{ssl.cert_subject}</span>
                          </div>
                        )}
                        {ssl.cert_issuer && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Issuer</span>
                            <span className="text-slate-300 truncate max-w-[180px]">{ssl.cert_issuer}</span>
                          </div>
                        )}
                        {ssl.cert_valid_to && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Expire</span>
                            <span className={`font-semibold ${health === 'critical' ? 'text-rose-400' : health === 'warning' ? 'text-yellow-400' : 'text-emerald-400'}`}>
                              {new Date(ssl.cert_valid_to).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {!ssl && days < 0 && (
                      <p className="mt-2 text-xs text-slate-500">Belum ada data SSL. Website mungkin tidak menggunakan HTTPS.</p>
                    )}

                    {m.last_checked && (
                      <p className="mt-2 text-[10px] text-slate-600">
                        Cek terakhir: {new Date(m.last_checked).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* SSL Expiry Timeline */}
      {!isLoading && sorted.length > 0 && (
        <div className="glass-card-soft p-6 rounded-3xl">
          <h3 className="text-sm font-semibold text-white mb-5">📅 Timeline Expiry SSL</h3>
          <div className="space-y-3">
            {sorted.map(m => {
              const ssl = sslDetails[m.id]
              const days = ssl?.ssl_days_remaining ?? m.ssl_days_remaining ?? -1
              const pct = days > 0 ? Math.min(days / 365 * 100, 100) : 0
              const barColor = days <= 7 ? 'bg-rose-400' : days <= 30 ? 'bg-yellow-400' : 'bg-emerald-400'

              return (
                <div key={m.id}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <Link href={`/dashboard/website-monitor/${m.id}`} className="text-slate-300 hover:text-sky-300 truncate max-w-[200px]">
                      {m.name}
                    </Link>
                    <span className={`font-bold ${days <= 7 ? 'text-rose-400' : days <= 30 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                      {days > 0 ? `${days} hari` : 'N/A'}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-800">
                    <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </DashboardPageShell>
  )
}
