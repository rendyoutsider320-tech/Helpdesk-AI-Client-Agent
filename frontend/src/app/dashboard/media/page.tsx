'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { contentApi } from '@/lib/api'

export default function DashboardMediaPage() {
  const [media, setMedia] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mimeFilter, setMimeFilter] = useState('')

  const handleDeleteMedia = async (id: string) => {
    if (!confirm('Hapus attachment media ini?')) {
      return
    }

    try {
      await contentApi.deleteMedia(id)
      setMedia((s) => s.filter((item) => item.id !== id))
    } catch (err) {
      console.error('Failed to delete media', err)
      setError('Gagal menghapus media. Silakan coba lagi.')
    }
  }

  useEffect(() => {
    const loadMedia = async () => {
      try {
        const response = await contentApi.listMedia()
        setMedia(response.data?.media || [])
      } catch (err) {
        console.error('Failed to load media', err)
        setError('Gagal memuat media. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadMedia()
  }, [])

  return (
    <DashboardPageShell title="Media" subtitle="Kelola file, gambar, dan dokumen yang digunakan dalam halaman dan tiket support.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Penyimpanan Media</h2>
        <p className="mt-3 text-sm text-slate-400">Anda dapat menambahkan integrasi penyimpanan file atau attachment media di backend untuk menampilkan file di halaman ini.</p>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari file..." className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" />
            <select value={mimeFilter} onChange={(e) => setMimeFilter(e.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              <option value="">Semua Jenis</option>
              {Array.from(new Set(media.map((m) => m.mime_type).filter(Boolean))).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { setQuery(''); setMimeFilter(''); }} className="rounded-2xl bg-slate-800 px-3 py-2 text-sm text-slate-200">Reset</button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat media...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : media.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="grid grid-cols-[1fr_120px_120px_120px] gap-4 border-b border-white/10 px-6 py-4 text-sm uppercase text-slate-400">
              <span>Nama File</span>
              <span>Jenis</span>
              <span>Ukuran</span>
              <span>Ticket</span>
            </div>
            <div className="divide-y divide-white/5">
              {media
                .filter((item) => (mimeFilter ? item.mime_type === mimeFilter : true))
                .filter((item) => (query ? (item.filename || '').toLowerCase().includes(query.toLowerCase()) : true))
                .map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_120px_120px_120px] gap-4 px-6 py-5 text-sm text-slate-300">
                  <div>
                    <p className="font-semibold text-white">{item.filename}</p>
                    <p className="mt-1 text-slate-500">{item.file_path || item.mime_type || 'Tidak ada jalur'}</p>
                  </div>
                  <span className="text-slate-400">{item.mime_type || '-'}</span>
                  <span className="text-slate-400">{item.file_size ? `${item.file_size} B` : '-'}</span>
                  <span className="text-slate-400">{item.ticket_id || '-'}</span>
                  <div className="ml-4 flex items-center gap-2">
                    <button onClick={() => item.file_path && window.open(item.file_path, '_blank')} className="rounded-full bg-sky-500 px-3 py-1 text-xs text-white">Download</button>
                    <button onClick={() => handleDeleteMedia(item.id)} className="rounded-full bg-rose-500 px-3 py-1 text-xs text-white">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Belum ada attachment media.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
