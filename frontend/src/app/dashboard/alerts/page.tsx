'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { alertApi } from '@/lib/api'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const response = await alertApi.list()
        setAlerts(response.data?.alerts || [])
      } catch (err) {
        console.error('Failed to load alerts', err)
        setError('Gagal memuat alert. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadAlerts()
  }, [])

  const handleResolveAlert = async (id: string) => {
    try {
      await alertApi.resolve(id)
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'resolved' } : a)))
    } catch (err) {
      console.error('Failed to resolve alert', err)
    }
  }

  const filteredAlerts = alerts.filter((a) => (filterStatus === 'all' ? true : a.status === filterStatus))

  return (
    <DashboardPageShell title="Alert Log" subtitle="Kelola dan monitor alert sistem secara real-time.">
      <div className="glass-card-soft rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Daftar Alert</h2>
            <p className="mt-1 text-sm text-slate-400">Menampilkan semua alert yang masuk ke sistem.</p>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="resolved">Terselesaikan</option>
          </select>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat alert...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : filteredAlerts.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="divide-y divide-white/5">
              {filteredAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{alert.message}</p>
                    <p className="mt-1 text-sm text-slate-500">{alert.metric} • {new Date(alert.created_at).toLocaleString('id-ID')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' :
                      alert.severity === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>{alert.severity}</span>
                    {alert.status === 'active' && (
                      <button
                        onClick={() => handleResolveAlert(alert.id)}
                        className="rounded-full bg-emerald-500 px-3 py-1 text-xs text-white hover:bg-emerald-600"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Belum ada alert.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
