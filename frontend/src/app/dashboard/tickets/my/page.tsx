'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { ticketApi } from '@/lib/api'
import { useAuthStore } from '@/store'

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTickets = async () => {
      try {
        const response = await ticketApi.list(1, 100)
        
        let userID = localStorage.getItem('user_id') || ''
        const userStr = localStorage.getItem('user')
        
        if (!userID && userStr) {
          try {
            const userData = JSON.parse(userStr)
            userID = userData.id || userData.user_id || ''
          } catch (e) {
            console.error('Error parsing user data:', e)
          }
        }
        
        if (!userID) {
          userID = useAuthStore.getState().user?.id || ''
        }

        console.log('MyTicketsPage: Filtering tickets for userID =', userID)
        
        const myTickets = response.data?.tickets?.filter((t: any) => t.created_by === userID) || []
        setTickets(myTickets)
      } catch (err) {
        console.error('Failed to load tickets', err)
        setError('Gagal memuat tiket Anda. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadTickets()
  }, [])

  return (
    <DashboardPageShell title="Tiket Saya" subtitle="Kelola tiket support yang telah Anda buat.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Tiket Saya</h2>
        <p className="mt-3 text-sm text-slate-400">Menampilkan tiket yang telah Anda buat.</p>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat tiket...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : tickets.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="divide-y divide-white/5">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{ticket.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{ticket.ticket_no} • Status: {ticket.status}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      ticket.severity === 'critical' ? 'bg-rose-500/20 text-rose-300' :
                      ticket.severity === 'high' ? 'bg-orange-500/20 text-orange-300' :
                      ticket.severity === 'medium' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-slate-700/20 text-slate-300'
                    }`}>{ticket.severity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Anda belum membuat tiket apapun.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
