'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { deviceApi } from '@/lib/api'

export default function MonitorPage() {
  const [devices, setDevices] = useState<any[]>([])
  const [deviceMetrics, setDeviceMetrics] = useState<Record<string, any[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const response = await deviceApi.list()
        const devList = response.data?.devices || []
        setDevices(devList)

        // Fetch metrics for each device
        const metricsMap: Record<string, any[]> = {}
        await Promise.all(
          devList.map(async (dev: any) => {
            try {
              const res = await deviceApi.getMetrics(dev.id)
              metricsMap[dev.id] = res.data?.metrics || []
            } catch (err) {
              console.error(`Failed to fetch metrics for device ${dev.id}`, err)
            }
          })
        )
        setDeviceMetrics(metricsMap)
      } catch (err) {
        console.error('Failed to load devices', err)
        setError('Gagal memuat data monitoring. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadDevices()
    const interval = setInterval(loadDevices, 2000) // Refresh every 2 seconds for real-time monitoring
    return () => clearInterval(interval)
  }, [])

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

  return (
    <DashboardPageShell title="Live Monitor" subtitle="Pantau status real-time perangkat dan sistem.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Monitor Perangkat</h2>
        <p className="mt-3 text-sm text-slate-400">Menampilkan status real-time semua perangkat dalam jaringan.</p>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat data monitoring...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : devices.length ? (
          <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_1.5fr_1.5fr_1.2fr] gap-4 border-b border-white/10 px-6 py-4 text-xs uppercase font-bold tracking-wider text-slate-400">
                <span>Perangkat</span>
                <span>User</span>
                <span>CPU</span>
                <span>RAM</span>
                <span>Disk</span>
                <span>Network</span>
                <span>Agent</span>
                <span>Last Seen</span>
              </div>
              <div className="divide-y divide-white/5">
                {devices.map((device) => {
                  const cpuVal = getLatestMetric(device.id, 'cpu')
                  const ramVal = getLatestMetric(device.id, 'ram')
                  const diskVal = getLatestMetric(device.id, 'disk_usage')

                  return (
                    <div key={device.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_1.5fr_1.5fr_1.2fr] gap-4 px-6 py-4 text-sm items-center">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">{device.device_name}</p>
                      </div>
                      <span className="text-slate-300 font-medium">
                        {device.active_user || device.username || device.user || '-'}
                      </span>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${getMetricColor(cpuVal)}`}>
                          {cpuVal !== null ? `${Math.round(cpuVal)}%` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${getMetricColor(ramVal)}`}>
                          {ramVal !== null ? `${Math.round(ramVal)}%` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${getMetricColor(diskVal)}`}>
                          {diskVal !== null ? `${Math.round(diskVal)}%` : '-'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-300 font-mono text-xs" title="IP LAN / Utama">
                          {device.ip_address || device.ip_lan || '-'}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className={`h-1.5 w-1.5 rounded-full ${device.ip_wifi ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span className="text-slate-400">Wifi:</span>
                          <span className={device.ip_wifi ? 'text-emerald-400 font-mono font-semibold' : 'text-slate-500 font-sans'}>
                            {device.ip_wifi || 'Off'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${
                          device.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${device.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          {device.status === 'active' ? `Aktif (${device.agent_version || 'v2.0.0'})` : 'Offline'}
                        </span>
                      </div>
                      <span className="text-slate-400 text-xs font-medium">
                        {device.last_seen ? new Date(device.last_seen).toLocaleString('id-ID') : 'N/A'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Belum ada perangkat terdaftar.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
