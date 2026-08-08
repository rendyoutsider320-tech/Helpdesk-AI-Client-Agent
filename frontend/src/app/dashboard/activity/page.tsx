'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { eventApi } from '@/lib/api'

export default function DashboardActivityPage() {
  const [events, setEvents] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const response = await eventApi.list()
        setEvents(response.data?.events || [])
      } catch (err) {
        console.error('Failed to load events', err)
        setError('Gagal memuat aktivitas. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadEvents()
  }, [])

  return (
    <DashboardPageShell title="Activity" subtitle="Lihat log aktivitas sistem, event, dan peristiwa penting dalam helpdesk.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Log Aktivitas</h2>
        <p className="mt-3 text-sm text-slate-400">Ringkasan event terbaru yang diterima oleh backend.</p>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat aktivitas...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : events.length ? (
          <div className="mt-6 space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-3xl border border-white/10 bg-slate-900/80 p-4">
                <div className="flex items-center justify-between gap-4 text-sm text-slate-300">
                  <span className="font-semibold text-white">{event.title || event.type || 'Event'}</span>
                  <span>{new Date(event.timestamp).toLocaleString('id-ID')}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{event.message || event.details || 'Detail event tidak tersedia.'}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Tidak ada aktivitas event terbaru.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
