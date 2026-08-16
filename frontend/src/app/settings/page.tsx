'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuthStore } from '@/store'

type ThemeOption = 'light' | 'dark' | 'system'

interface AIConfig {
  llm_model: string
  embedding_model: string
  embedding_provider: string
  ollama_url: string
  openai_api_key?: string
  openai_api_base?: string
  gemini_api_key?: string
}

interface AIModelsResponse {
  success: boolean
  installed_ollama_models: string[]
  cloud_models: string[]
  embedding_models: string[]
  current_config: AIConfig
}

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
  const token = useAuthStore((state) => state.accessToken)

  const [theme, setTheme] = useState<ThemeOption>('system')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // AI Configuration State
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    llm_model: 'qwen3:8b-q4_K_M',
    embedding_model: 'bge-m3',
    embedding_provider: 'ollama',
    ollama_url: 'http://ollama:11434',
    openai_api_key: '',
  })

  const [installedOllamaModels, setInstalledOllamaModels] = useState<string[]>([])
  const [cloudModels, setCloudModels] = useState<string[]>([])
  const [embeddingModels, setEmbeddingModels] = useState<string[]>([])
  
  const [isCustomModel, setIsCustomModel] = useState(false)
  const [customModelName, setCustomModelName] = useState('')

  const [loadingModels, setLoadingModels] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)

  // Test Model State
  const [testPrompt, setTestPrompt] = useState('Tes koneksi AI: Berikan salam dan konfirmasi bahwa kamu siap membantu helpdesk IT.')
  const [testingModel, setTestingModel] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

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

    // Fetch AI Models & Config
    fetchAIModelsAndConfig()

    return () => window.removeEventListener('themechange', handleThemeChange)
  }, [token])

  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  const fetchAIModelsAndConfig = async (isManual = false) => {
    setLoadingModels(true)
    if (isManual) setRefreshMsg(null)

    const startTime = Date.now()

    try {
      const authHeaders: Record<string, string> = {}
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/v1/ai/models', {
        headers: authHeaders,
      })

      if (res.ok) {
        const data: AIModelsResponse = await res.json()
        if (data.success) {
          const ollamaList = data.installed_ollama_models || []
          setInstalledOllamaModels(ollamaList)
          setCloudModels(data.cloud_models || [])
          setEmbeddingModels(data.embedding_models || [])

          if (data.current_config) {
            setAiConfig(data.current_config)

            const currentLLM = data.current_config.llm_model
            const allKnown = [
              ...ollamaList,
              ...(data.cloud_models || []),
            ]
            if (currentLLM && !allKnown.includes(currentLLM)) {
              setIsCustomModel(true)
              setCustomModelName(currentLLM)
            }
          }

          if (isManual) {
            setRefreshMsg(`Berhasil! ${ollamaList.length} model Ollama terdeteksi di server.`)
            setTimeout(() => setRefreshMsg(null), 4000)
          }
        }
      }
    } catch (err) {
      console.error('Gagal mengambil daftar model AI:', err)
      if (isManual) {
        setRefreshMsg('Gagal terhubung ke backend untuk memperbarui list model.')
        setTimeout(() => setRefreshMsg(null), 4000)
      }
    } finally {
      // Ensure minimum 400ms spinner for satisfying visual click feedback
      const elapsed = Date.now() - startTime
      const remainingDelay = Math.max(0, 400 - elapsed)
      setTimeout(() => {
        setLoadingModels(false)
      }, remainingDelay)
    }
  }

  const handleSaveAIConfig = async () => {
    setSavingConfig(true)
    setSaveSuccessMsg(null)
    setSaveErrorMsg(null)

    const finalLLMModel = isCustomModel ? customModelName.trim() : aiConfig.llm_model

    if (!finalLLMModel) {
      setSaveErrorMsg('Nama model LLM tidak boleh kosong.')
      setSavingConfig(false)
      return
    }

    const payload: AIConfig = {
      ...aiConfig,
      llm_model: finalLLMModel,
    }

    try {
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/v1/ai/config', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setSaveSuccessMsg(data.message || 'Model AI berhasil diperbarui dan diterapkan secara Hot-Reload!')
        setAiConfig(data.config)
        setTimeout(() => setSaveSuccessMsg(null), 5000)
      } else {
        setSaveErrorMsg(data.error || 'Gagal menyukai konfigurasi model AI.')
      }
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Terjadi kesalahan koneksi ke server.')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleRunTestPrompt = async () => {
    setTestingModel(true)
    setTestResult(null)
    setTestError(null)

    const targetModel = isCustomModel ? customModelName.trim() : aiConfig.llm_model

    try {
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch('/api/v1/ai/test', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          model: targetModel,
          prompt: testPrompt,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult(data.response)
      } else {
        setTestError(data.error || 'Gagal menguji model AI.')
      }
    } catch (err: any) {
      setTestError(err?.message || 'Gagal terhubung ke service pengujian AI.')
    } finally {
      setTestingModel(false)
    }
  }

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

  const canEditAIConfig = user?.role === 'admin' || user?.role === 'technician'

  return (
    <>
      <Header />
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <section className="rounded-[32px] border border-slate-200/80 bg-white/90 p-6 sm:p-8 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/80">
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
                <p className="text-sm uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-400 font-semibold">
                  Pusat Kendali Pengaturan
                </p>
                <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">Preferensi Sistem & AI Copilot</h1>
              </div>
              <div className="rounded-full bg-indigo-50 border border-indigo-200 px-4 py-2 text-xs sm:text-sm font-semibold text-indigo-700 shadow-sm dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300">
                ✨ Dynamic LLM Hot-Reload Active
              </div>
            </div>

            {/* Notification Banners */}
            {saveSuccessMsg && (
              <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-emerald-800 dark:text-emerald-300 flex items-center gap-3 animate-fade-in">
                <span className="text-xl">✅</span>
                <p className="text-sm font-medium">{saveSuccessMsg}</p>
              </div>
            )}
            {saveErrorMsg && (
              <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/40 p-4 text-rose-800 dark:text-rose-300 flex items-center gap-3 animate-fade-in">
                <span className="text-xl">⚠️</span>
                <p className="text-sm font-medium">{saveErrorMsg}</p>
              </div>
            )}

            {/* AI CONFIGURATION SECTION */}
            <div className="mt-8 rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 p-6 sm:p-8 shadow-md dark:border-indigo-900/60 dark:from-slate-900/90 dark:via-slate-900/80 dark:to-slate-950">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-indigo-600/10 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    Live Hot-Reload Active
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">🤖 Konfigurasi Model LLM & AI</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Ganti model LLM secara instan tanpa perlu me-restart server atau mengedit file server.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {refreshMsg && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-3 py-1.5 rounded-xl animate-fade-in">
                      {refreshMsg}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchAIModelsAndConfig(true)}
                    disabled={loadingModels}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-95 transition"
                  >
                    <svg className={`w-4 h-4 ${loadingModels ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {loadingModels ? 'Memuat List...' : 'Refresh List Model'}
                  </button>
                  {canEditAIConfig && (
                    <button
                      type="button"
                      onClick={handleSaveAIConfig}
                      disabled={savingConfig}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 transition"
                    >
                      {savingConfig ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                          Menyimpan...
                        </>
                      ) : (
                        <>⚡ Simpan & Terapkan Model</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {!canEditAIConfig && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                  ℹ️ Pengubahan model AI terbatas untuk role Admin atau Teknisi.
                </div>
              )}

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {/* Select LLM Model */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Model LLM Utama (Utama)
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Model AI yang digunakan untuk analisis tiket, chat copilot, dan troubleshooting.
                  </p>

                  <select
                    disabled={!canEditAIConfig || isCustomModel}
                    value={aiConfig.llm_model}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomModel(true)
                      } else {
                        setIsCustomModel(false)
                        setAiConfig({ ...aiConfig, llm_model: e.target.value })
                      }
                    }}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <optgroup label="🏠 Model Ollama Lokal (Terdeteksi di Server)">
                      {installedOllamaModels.map((model) => (
                        <option key={model} value={model}>
                          {model} {model === 'qwen3:8b-q4_K_M' ? '(Aktif / Direkomendasikan)' : ''}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="☁️ Model Cloud API">
                      {cloudModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </optgroup>
                    <option value="__custom__">✏️ Masukkan Nama Model Kustom...</option>
                  </select>

                  {isCustomModel && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Contoh: deepseek-r1:14b atau llama3:70b"
                          value={customModelName}
                          onChange={(e) => setCustomModelName(e.target.value)}
                          className="w-full rounded-xl border border-indigo-400 bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-900 dark:text-white dark:border-indigo-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomModel(false)
                            if (installedOllamaModels.length > 0) {
                              setAiConfig({ ...aiConfig, llm_model: installedOllamaModels[0] })
                            }
                          }}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          Batal
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Pastikan model kustom tersebut sudah di-pull di container Ollama.
                      </p>
                    </div>
                  )}
                </div>

                {/* Select Embedding Model */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Model Embedding (Vector RAG)
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Digunakan untuk pengindeksan dokumen Knowledge Base & pencarian Qdrant Vector.
                  </p>

                  <select
                    disabled={!canEditAIConfig}
                    value={aiConfig.embedding_model}
                    onChange={(e) => setAiConfig({ ...aiConfig, embedding_model: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {embeddingModels.map((model) => (
                      <option key={model} value={model}>
                        {model} {model === 'bge-m3' ? '(Direkomendasikan)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ollama URL */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Ollama Server URL
                  </label>
                  <input
                    type="text"
                    disabled={!canEditAIConfig}
                    value={aiConfig.ollama_url}
                    onChange={(e) => setAiConfig({ ...aiConfig, ollama_url: e.target.value })}
                    placeholder="http://ollama:11434"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                {/* OpenAI API Key */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                    OpenAI API Key (Opsional Fallback)
                  </label>
                  <input
                    type="password"
                    disabled={!canEditAIConfig}
                    value={aiConfig.openai_api_key || ''}
                    onChange={(e) => setAiConfig({ ...aiConfig, openai_api_key: e.target.value })}
                    placeholder="sk-..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                {/* Google Gemini API Key */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>✨ Google Gemini API Key</span>
                    <span className="text-[10px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">GEMINI</span>
                  </label>
                  <input
                    type="password"
                    disabled={!canEditAIConfig}
                    value={aiConfig.gemini_api_key || ''}
                    onChange={(e) => setAiConfig({ ...aiConfig, gemini_api_key: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* TEST AI MODEL PROMPT CARD */}
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧪</span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Uji Coba Respon Model AI</h3>
                  </div>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    Target Model: {isCustomModel ? customModelName : aiConfig.llm_model}
                  </span>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={testPrompt}
                    onChange={(e) => setTestPrompt(e.target.value)}
                    placeholder="Tulis pesan pengujian..."
                    className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleRunTestPrompt}
                    disabled={testingModel || !testPrompt.trim()}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500 transition"
                  >
                    {testingModel ? 'Menguji...' : 'Jalankan Tes'}
                  </button>
                </div>

                {testResult && (
                  <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 text-sm text-slate-800 dark:text-slate-200 animate-fade-in">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">
                      ✅ Respon dari {isCustomModel ? customModelName : aiConfig.llm_model}:
                    </p>
                    <p className="whitespace-pre-wrap leading-relaxed">{testResult}</p>
                  </div>
                )}

                {testError && (
                  <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 animate-fade-in">
                    <p className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-400 mb-1">
                      ❌ Gagal Menguji Model:
                    </p>
                    <p className="text-xs">{testError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* DASHBOARD PREFERENCES SECTION */}
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
