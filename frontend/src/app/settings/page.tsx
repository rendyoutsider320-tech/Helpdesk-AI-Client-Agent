'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuthStore } from '@/store'

type ThemeOption = 'light' | 'dark' | 'system'

const applyTheme = (theme: ThemeOption) => {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
    localStorage.setItem('theme', 'dark')
  } else if (theme === 'light') {
    document.documentElement.classList.add('light')
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', prefersDark)
    document.documentElement.classList.toggle('light', !prefersDark)
    localStorage.setItem('theme', 'system')
  }
}

export default function SettingsPage() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const [theme, setTheme] = useState<ThemeOption>('system')
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeOption | null
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      setTheme(savedTheme)
      applyTheme(savedTheme)
    } else {
      setTheme('system')
      applyTheme('system')
    }

    const savedAutoRefresh = localStorage.getItem('auto_refresh_dashboard')
    setAutoRefresh(savedAutoRefresh === 'true')

    const handleThemeChange = () => {
      const updated = localStorage.getItem('theme') as ThemeOption | null
      if (updated === 'light' || updated === 'dark' || updated === 'system') {
        setTheme(updated)
      }
    }

    window.addEventListener('themechange', handleThemeChange)
    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [])

  const handleThemeChange = (selected: ThemeOption) => {
    setTheme(selected)
    applyTheme(selected)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('themechange'))
    }
  }

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }

    if (user?.role === 'admin') {
      router.push('/dashboard/admin')
    } else if (user?.role === 'technician') {
      router.push('/dashboard/technician')
    } else if (user?.role === 'user') {
      router.push('/dashboard/user')
    } else {
      router.push('/')
    }
  }

  const handleAutoRefreshToggle = () => {
    const nextValue = !autoRefresh
    setAutoRefresh(nextValue)
    localStorage.setItem('auto_refresh_dashboard', nextValue ? 'true' : 'false')
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-100 dark:bg-slate-950 p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <section className="rounded-[32px] border border-slate-200/80 bg-white/90 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={handleGoBack}
                className="mb-4 sm:mb-0 inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                type="button"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Kembali</span>
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Pengaturan Akun</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">Preferensi Dashboard</h1>
              </div>
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                Theme control center
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Tema</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Pilih tampilan yang cocok untuk pengalaman premium Anda.
                </p>
                <div className="mt-5 space-y-4">
                  {(['light', 'dark', 'system'] as ThemeOption[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleThemeChange(option)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        theme === option
                          ? 'border-amber-400 bg-amber-50 text-slate-900 shadow-sm dark:border-amber-500 dark:bg-amber-500/10 dark:text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold capitalize">{option === 'system' ? 'Sistem' : option === 'dark' ? 'Gelap' : 'Terang'}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {option === 'system'
                              ? 'Ikuti preferensi sistem operasi.'
                              : option === 'dark'
                              ? 'Tampilan malam penuh.'
                              : 'Tampilan terang cerah.'}
                          </p>
                        </div>
                        {theme === option && (
                          <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">Aktif</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Preferensi Tambahan</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Kelola pengaturan dashboard dan pengalaman pengguna Anda.
                </p>
                <div className="mt-6 space-y-5">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-950">
                    <div>
                      <h3 className="font-medium text-slate-900 dark:text-white">Refresh dashboard otomatis</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Muat ulang data dashboard secara berkala ketika Anda berada di halaman utama.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoRefreshToggle}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        autoRefresh
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {autoRefresh ? 'Aktif' : 'Mati'}
                    </button>
                  </div>


                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
