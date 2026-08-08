'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { sreApi, eventApi } from '@/lib/api'

interface SLO {
  id: string
  name: string
  target_percent: number
  window_days: number
  sli_type: string
  current_value: number
  error_budget_percent: number
}

interface SreMetrics {
  mttr_hours: number
  mttd_hours: number
  mtbf_hours: number
}

export default function SlaDashboardPage() {
  const [slos, setSlos] = useState<SLO[]>([])
  const [metrics, setMetrics] = useState<SreMetrics | null>(null)
  const [breachEvents, setBreachEvents] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const [sloRes, metricsRes, eventsRes] = await Promise.all([
          sreApi.getDashboard(),
          sreApi.getMetrics(),
          eventApi.list()
        ])
        setSlos(sloRes.data || [])
        setMetrics(metricsRes.data || null)
        
        // Filter out only SLA breach events or related notifications
        const allEvents = eventsRes.data?.events || []
        const breaches = allEvents.filter((ev: any) => 
          ev.event_type === 'sla_breach' || ev.event_type === 'sla_warning' || ev.message.includes('SLA')
        )
        setBreachEvents(breaches)
      } catch (err) {
        console.error('Failed to load SRE metrics', err)
        setError('Gagal memuat metrik SRE & SLO.')
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  return (
    <DashboardPageShell
      title="SRE SLO & SLA Dashboard"
      subtitle="Monitor ketersediaan SLO, sisa anggaran kesalahan (error budget), dan metrik reliabilitas sistem (MTTR, MTTD, MTBF)."
    >
      {isLoading ? (
        <p className="text-slate-400 text-sm">Memuat metrik SRE...</p>
      ) : error ? (
        <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-sm">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* Key Reliability Stats Row */}
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="glass-card-soft p-6 rounded-3xl relative overflow-hidden">
              <div className="absolute right-4 top-4 h-12 w-12 text-slate-800/40 font-bold text-4xl select-none">MTTR</div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mean Time to Repair (MTTR)</p>
              <h3 className="mt-3 text-3xl font-bold text-white">
                {metrics ? `${metrics.mttr_hours.toFixed(1)}j` : '4.2j'}
              </h3>
              <p className="mt-2 text-xs text-slate-500">Rata-rata waktu penyelesaian tiket gangguan.</p>
            </div>

            <div className="glass-card-soft p-6 rounded-3xl relative overflow-hidden">
              <div className="absolute right-4 top-4 h-12 w-12 text-slate-800/40 font-bold text-4xl select-none">MTTD</div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mean Time to Detect (MTTD)</p>
              <h3 className="mt-3 text-3xl font-bold text-sky-400">
                {metrics ? `${(metrics.mttd_hours * 60).toFixed(0)}m` : '12m'}
              </h3>
              <p className="mt-2 text-xs text-slate-500">Rata-rata waktu deteksi masalah sejak alert aktif.</p>
            </div>

            <div className="glass-card-soft p-6 rounded-3xl relative overflow-hidden">
              <div className="absolute right-4 top-4 h-12 w-12 text-slate-800/40 font-bold text-4xl select-none">MTBF</div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mean Time Between Failures (MTBF)</p>
              <h3 className="mt-3 text-3xl font-bold text-emerald-400">
                {metrics ? `${metrics.mtbf_hours.toFixed(0)}j` : '72j'}
              </h3>
              <p className="mt-2 text-xs text-slate-500">Rata-rata selang waktu antar kegagalan/gangguan.</p>
            </div>
          </div>

          {/* SLO Gauges & Error Budgets Row */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <h2 className="text-xl font-semibold text-white mb-6">Kepatuhan Target SLO (30 Hari)</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {slos.map(slo => {
                const currentVal = slo.current_value || 0
                const isHealthy = currentVal >= slo.target_percent
                // Circular progress calculation
                const radius = 36
                const circ = 2 * Math.PI * radius
                const strokeOffset = circ - (Math.min(currentVal, 100) / 100) * circ

                return (
                  <div key={slo.id} className="p-5 rounded-2xl border border-white/5 bg-slate-950/40 flex flex-col items-center text-center space-y-4">
                    <h3 className="font-semibold text-white text-sm">{slo.name}</h3>
                    
                    {/* SVG Gauge */}
                    <div className="relative h-24 w-24">
                      <svg className="h-full w-full -rotate-90">
                        <circle cx="48" cy="48" r={radius} className="stroke-slate-800" strokeWidth="6" fill="transparent" />
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          className={isHealthy ? 'stroke-sky-500' : 'stroke-rose-500'}
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray={circ}
                          strokeDashoffset={strokeOffset}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-bold text-white">{currentVal.toFixed(2)}%</span>
                        <span className="text-[10px] text-slate-500 font-semibold">TARGET {slo.target_percent}%</span>
                      </div>
                    </div>

                    <div className="w-full pt-3 border-t border-white/5 flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-semibold">ERROR BUDGET</span>
                      <span className={`font-bold ${slo.error_budget_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {slo.error_budget_percent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* SLA Warning & Breach Log events */}
          <div className="glass-card-soft p-6 rounded-3xl">
            <h2 className="text-xl font-semibold text-white mb-2">Pemberitahuan Pelanggaran SLA Terkini</h2>
            <p className="text-sm text-slate-400 mb-6">Mencatat peringatan mendekati batas SLA dan kegagalan kepatuhan resolusi tiket.</p>
            {breachEvents.length === 0 ? (
              <div className="p-4 rounded-xl border border-white/5 bg-slate-950/20 text-slate-500 text-sm text-center">
                Belum ada insiden pelanggaran SLA terekam dalam log aktivitas.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-950/20 divide-y divide-white/5">
                {breachEvents.slice(0, 10).map((ev, index) => (
                  <div key={index} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-xs text-white">{ev.message}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{new Date(ev.timestamp).toLocaleString('id-ID')}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                      ev.event_type === 'sla_breach' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {ev.event_type === 'sla_breach' ? 'BREACHED' : 'WARNING'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardPageShell>
  )
}
