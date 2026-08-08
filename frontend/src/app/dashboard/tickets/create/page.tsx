'use client'

import { useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { ticketApi } from '@/lib/api'
import { useRouter } from 'next/navigation'

export default function CreateTicketPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await ticketApi.create(formData.title, formData.description, formData.severity)
      router.push('/dashboard/tickets')
    } catch (err: any) {
      console.error('Failed to create ticket', err)
      setError(err.response?.data?.error || 'Gagal membuat tiket. Silakan coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <DashboardPageShell title="Buat Tiket Baru" subtitle="Buat tiket support baru untuk masalah yang Anda hadapi.">
      <div className="glass-card-soft rounded-3xl p-6 max-w-2xl">
        <h2 className="text-xl font-semibold text-white">Form Tiket Baru</h2>

        {error && (
          <div className="mt-4 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Judul Tiket <span className="text-slate-500 text-xs">({formData.title.length}/255)</span></label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Contoh: Koneksi internet putus"
              maxLength={255}
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-slate-200 placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Deskripsi <span className="text-slate-500 text-xs">({formData.description.length}/2000)</span></label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Jelaskan masalah yang Anda alami..."
              maxLength={2000}
              rows={5}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-slate-200 placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Tingkat Severity</label>
            <select
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-slate-200"
            >
              <option value="low">Rendah</option>
              <option value="medium">Sedang</option>
              <option value="high">Tinggi</option>
              <option value="critical">Kritis</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-2xl bg-sky-500 px-6 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {isLoading ? 'Membuat...' : 'Buat Tiket'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-2xl bg-slate-800 px-6 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    </DashboardPageShell>
  )
}
