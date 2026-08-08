'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import { useAuthStore, useLayoutStore } from '@/store'

export default function DashboardPageShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const sidebarCollapsed = useLayoutStore((state) => state.sidebarCollapsed)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    const syncTheme = () => {
      const savedTheme = localStorage.getItem('theme')
      const isDark =
        savedTheme === 'dark' ||
        (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
      setIsDarkMode(isDark)
    }

    syncTheme()
    window.addEventListener('themechange', syncTheme)
    return () => window.removeEventListener('themechange', syncTheme)
  }, [])

  const dashboardLabel = user?.role === 'technician' 
    ? 'Dashboard Teknisi' 
    : user?.role === 'user' 
    ? 'Dashboard User' 
    : 'Dashboard Admin'

  return (
    <div className={`h-screen flex overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <Sidebar />
      <div className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'xl:pl-20' : 'xl:pl-80'}`}>
        <Header />

        {/* Right Scrollable Content Column */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <section className="w-full space-y-4">
            <div className={`rounded-3xl border transition-all duration-300 p-5 ${
              isDarkMode 
                ? 'border-white/10 bg-slate-900/75 shadow-2xl shadow-slate-950/20 backdrop-blur-xl' 
                : 'border-slate-200 bg-white shadow-lg shadow-slate-200/50'
            }`}>
              <p className={`text-xs uppercase tracking-[0.3em] font-semibold ${isDarkMode ? 'text-sky-300/80' : 'text-sky-600'}`}>{dashboardLabel}</p>
              <h1 className={`mt-1.5 text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h1>
              <p className={`mt-1.5 max-w-2xl text-xs ${isDarkMode ? 'text-slate-350' : 'text-slate-500'}`}>{subtitle}</p>
            </div>
            {children}
          </section>
        </main>
      </div>
    </div>
  )
}

