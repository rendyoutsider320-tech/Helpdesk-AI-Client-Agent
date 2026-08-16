'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store'
import { useRouter } from 'next/navigation'
import { authApi, notificationApi } from '@/lib/api'

interface Notification {
  id: string
  title: string
  message: string
  type: 'ticket' | 'alert' | 'system' | 'sla' | string
  is_read: boolean
  created_at: string
  link?: string
}

export default function Header() {
  const [mounted, setMounted] = useState(false)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const router = useRouter()
  const [isDarkMode, setIsDarkMode] = useState(false)

  // ── Notification State ──────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [loadingNotif, setLoadingNotif] = useState(false)
  const notifPanelRef = useRef<HTMLDivElement>(null)
  const notifBtnRef = useRef<HTMLButtonElement>(null)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const fetchNotifications = useCallback(async () => {
    try {
      setLoadingNotif(true)
      const res = await notificationApi.list()
      const rawData = res.data?.notifications ?? res.data?.data ?? res.data ?? []
      const formatted = (Array.isArray(rawData) ? rawData : []).map((n: any) => {
        let link = n.link
        if (!link && n.resource_type === 'ticket' && n.resource_id) {
          if (user?.role === 'admin') {
            link = `/dashboard/tickets?id=${n.resource_id}`
          } else if (user?.role === 'technician') {
            link = `/dashboard/technician?id=${n.resource_id}`
          } else {
            link = `/dashboard/user?id=${n.resource_id}`
          }
        }
        return {
          ...n,
          type: n.notification_type || n.resource_type || n.type || 'system',
          link
        }
      })
      setNotifications(formatted)
    } catch {
      // silently fail – notifications are non-critical
    } finally {
      setLoadingNotif(false)
    }
  }, [user?.role])

  // Fetch on mount & poll every 3s & listen to WebSocket events
  useEffect(() => {
    if (!mounted) return
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 3_000)

    const handleWsMessage = (e: Event) => {
      const data = (e as CustomEvent).detail
      if (!data) return
      if (data.type === 'ticket_created' || data.type === 'ticket_updated' || data.type === 'notification_created') {
        fetchNotifications()
      } else if (data.type === 'database_reset') {
        setNotifications([])
        fetchNotifications()
      }
    }

    window.addEventListener('websocket-message', handleWsMessage)

    return () => {
      clearInterval(interval)
      window.removeEventListener('websocket-message', handleWsMessage)
    }
  }, [mounted, fetchNotifications])

  // Close panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        notifPanelRef.current &&
        !notifPanelRef.current.contains(e.target as Node) &&
        notifBtnRef.current &&
        !notifBtnRef.current.contains(e.target as Node)
      ) {
        setShowNotifPanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkRead = async (id: string) => {
    try {
      await notificationApi.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch {}
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {}
  }

  const handleDeleteNotif = async (id: string) => {
    try {
      await notificationApi.delete(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch {}
  }

  // ── Notification icon by type ───────────────────────────────
  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'ticket':
      case 'ticket_created':
      case 'ticket_assigned':
      case 'ticket_resolved':
        return '🎫'
      case 'comment_added':
        return '💬'
      case 'alert':
      case 'alert_critical':
        return '🚨'
      case 'sla':
        return '⏰'
      case 'system':
        return '⚙️'
      default:
        return '🔔'
    }
  }

  const getNotifColor = (type: string) => {
    switch (type) {
      case 'ticket':
      case 'ticket_created':
      case 'ticket_assigned':
      case 'ticket_resolved':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
      case 'comment_added':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      case 'alert':
      case 'alert_critical':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
      case 'sla':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      case 'system':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
      default:
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    }
  }

  // ── Theme ───────────────────────────────────────────────────
  useEffect(() => {
    const syncTheme = () => {
      const savedTheme = localStorage.getItem('theme')
      const isDark =
        savedTheme === 'dark' ||
        (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
      setIsDarkMode(isDark)
      document.documentElement.classList.toggle('dark', isDark)
      document.documentElement.classList.toggle('light', !isDark)
    }

    setMounted(true)
    syncTheme()
    window.addEventListener('themechange', syncTheme)
    return () => window.removeEventListener('themechange', syncTheme)
  }, [])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (e) {
      console.error('API logout failed', e)
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    localStorage.removeItem('helpdesk_chat_history')
    localStorage.removeItem('helpdesk_admin_chat_history')
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;'
    logout()
    router.push('/')
  }

  const toggleDarkMode = () => {
    const newIsDark = !isDarkMode
    setIsDarkMode(newIsDark)
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', newIsDark)
    document.documentElement.classList.toggle('light', !newIsDark)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('themechange'))
    }
  }

  const goToSettings = () => router.push('/settings')
  const themeLabel = isDarkMode ? 'Gelap' : 'Terang'

  if (!mounted) return null

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 shadow-sm sticky top-0 z-50">
      <div className="max-w-full px-4 sm:px-8 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">Helpdesk AI</h1>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 sm:gap-6">
          {user && (
            <div className="flex items-center gap-2 sm:gap-3">

              {/* User info */}
              <div className="text-right hidden sm:block">
                <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white truncate">{user.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user.role}</p>
              </div>

              {/* Theme badge */}
              <div className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Mode: {themeLabel}
              </div>

              {/* Dark mode toggle */}
              <button
                onClick={toggleDarkMode}
                className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                title="Toggle dark mode"
                type="button"
              >
                {isDarkMode ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.536l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm5.657 9.193l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zM5 11a1 1 0 100-2H4a1 1 0 100 2h1z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* ── NOTIFICATION BELL ───────────────────────── */}
              <div className="relative flex-shrink-0">
                <button
                  ref={notifBtnRef}
                  id="notification-bell-btn"
                  onClick={() => {
                    setShowNotifPanel((v) => !v)
                    if (!showNotifPanel) fetchNotifications()
                  }}
                  className="relative inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  title="Notifikasi"
                  type="button"
                >
                  {/* Bell icon */}
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>

                  {/* Unread badge */}
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* ── Notification Dropdown Panel ─────────── */}
                {showNotifPanel && (
                  <div
                    ref={notifPanelRef}
                    id="notification-panel"
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/60 overflow-hidden z-[9999]"
                    style={{ animation: 'fadeSlideDown 0.15s ease-out' }}
                  >
                    {/* Panel Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">Notifikasi</span>
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white">
                            {unreadCount} baru
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="text-[10px] font-semibold text-sky-500 hover:text-sky-400 transition-colors"
                            type="button"
                          >
                            Tandai semua dibaca
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifPanel(false)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                          type="button"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700/60">
                      {loadingNotif ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <svg className="w-5 h-5 text-sky-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="text-xs text-gray-400">Memuat notifikasi...</span>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-2xl">
                            🔔
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tidak ada notifikasi</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Semua sudah terbaca</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`group flex items-start gap-3 px-4 py-3 transition-all hover:bg-gray-50 dark:hover:bg-slate-800/60 ${
                              !notif.is_read ? 'bg-sky-50/50 dark:bg-sky-500/5' : ''
                            }`}
                          >
                            {/* Icon */}
                            <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-xl border flex items-center justify-center text-sm ${getNotifColor(notif.type)}`}>
                              {getNotifIcon(notif.type)}
                            </div>

                            {/* Content */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => {
                                if (!notif.is_read) handleMarkRead(notif.id)
                                if (notif.link) router.push(notif.link)
                                setShowNotifPanel(false)
                              }}
                            >
                              <div className="flex items-center gap-1.5">
                                <p className={`text-xs font-semibold truncate ${!notif.is_read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                                  {notif.title}
                                </p>
                                {!notif.is_read && (
                                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-sky-500" />
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                {notif.message}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                {new Date(notif.created_at).toLocaleString('id-ID', {
                                  day: '2-digit', month: 'short',
                                  hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex-shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!notif.is_read && (
                                <button
                                  onClick={() => handleMarkRead(notif.id)}
                                  title="Tandai dibaca"
                                  className="p-1 rounded-md text-sky-400 hover:bg-sky-500/10 transition-all"
                                  type="button"
                                >
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteNotif(notif.id)}
                                title="Hapus"
                                className="p-1 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                type="button"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Panel Footer */}
                    {notifications.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {notifications.length} total · {unreadCount} belum dibaca
                        </span>
                        <button
                          onClick={() => {
                            setNotifications([])
                            setShowNotifPanel(false)
                          }}
                          className="text-[10px] text-gray-400 hover:text-rose-400 transition-colors font-medium"
                          type="button"
                        >
                          Hapus semua
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* ── END NOTIFICATION BELL ───────────────────── */}

              {/* Settings button */}
              <button
                onClick={goToSettings}
                className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                title="Pengaturan"
                type="button"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0a1.724 1.724 0 002.486 1.002c.84-.484 1.92.28 1.61 1.175a1.724 1.724 0 001.412 2.277c.98.23.98 1.708 0 1.938a1.724 1.724 0 00-1.412 2.278c.31.894-.77 1.66-1.61 1.176a1.724 1.724 0 00-2.486 1.002c-.299.921-1.602.921-1.901 0a1.724 1.724 0 00-2.486-1.002c-.84.484-1.92-.282-1.61-1.176a1.724 1.724 0 00-1.412-2.278c-.979-.23-.979-1.708 0-1.938a1.724 1.724 0 001.412-2.277c-.31-.895.77-1.659 1.61-1.175.948.546 2.227-.102 2.486-1.002z" />
                </svg>
              </button>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center px-3 sm:px-4 py-2 rounded-lg bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600 transition-colors font-medium text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                type="button"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Animation keyframe injected via style tag */}
      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </header>
  )
}
