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

  useEffect(() => {
    try {
      useAuthStore.getState().loadFromStorage()
    } catch (e) {
      console.error('Auth hydration error:', e)
    } finally {
      setIsHydrated(true)
    }
  }, [])

  if (!isHydrated) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-400 tracking-wider">Memuat Helpdesk AI...</p>
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