'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store'
import { useWebSocket } from '@/hooks/useWebSocket'
import { presenceApi } from '@/lib/api'

function PresenceManager() {
  const user = useAuthStore((state) => state.user)

  // Maintain real-time WebSocket connection for all logged-in users (admins & technicians)
  useWebSocket(user?.id || '')

  useEffect(() => {
    if (!user || user.role !== 'technician') return

    // Trigger initial heartbeat immediately
    presenceApi.heartbeat().catch((err) => console.error('Heartbeat error:', err))

    // Set up recurring heartbeat every 30 seconds
    const interval = setInterval(() => {
      presenceApi.heartbeat().catch((err) => console.error('Heartbeat error:', err))
    }, 30000)

    return () => clearInterval(interval)
  }, [user])

  return null
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [loadingText, setLoadingText] = useState('Memuat Helpdesk AI...')

  useEffect(() => {
    try {
      useAuthStore.getState().loadFromStorage()
      const savedUserStr = localStorage.getItem('user')
      if (savedUserStr) {
        try {
          const u = JSON.parse(savedUserStr)
          if (u.role === 'admin') {
            setLoadingText('Memuat Cockpit Administrator...')
          } else if (u.role === 'technician') {
            setLoadingText('Memuat Cockpit Teknisi...')
          }
        } catch (_) {}
      }
    } catch (e) {
      console.error('Auth hydration error:', e)
    } finally {
      setTimeout(() => {
        setIsHydrated(true)
      }, 500)
    }
  }, [])

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center space-y-4 max-w-md p-6 bg-slate-900 border border-white/10 rounded-3xl shadow-2xl">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
          <p className="text-slate-400 font-medium animate-pulse">{loadingText}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <PresenceManager />
      {children}
    </>
  )
}