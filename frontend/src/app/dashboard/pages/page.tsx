'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { contentApi } from '@/lib/api'

export default function DashboardPagesPage() {
  const [pages, setPages] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const handleDeletePage = async (id: string) => {
    if (!confirm('Hapus halaman ini?')) {
      return
    }

    try {
      await contentApi.deletePage(id)
      setPages((s) => s.filter((page) => page.id !== id))
    } catch (err) {
      console.error('Failed to delete page', err)
      setError('Gagal menghapus halaman. Silakan coba lagi.')
    }
  }

  const handleEditPage = async (page: any) => {
    const newTitle = prompt('Edit judul halaman:', page.title)
    if (newTitle === null) {
      return
    }

    const newContent = prompt('Edit isi halaman:', page.content || page.description || '')
    if (newContent === null) {
      return
    }

    try {
      const response = await contentApi.updatePage(page.id, {
        title: newTitle,
        content: newContent,
      })
      const updatedPage = response.data
      setPages((s) => s.map((item) => (item.id === page.id ? updatedPage : item)))
    } catch (err) {
      console.error('Failed to update page', err)
      setError('Gagal memperbarui halaman. Silakan coba lagi.')
    }
  }

  useEffect(() => {
    const loadPages = async () => {
      try {
        const response = await contentApi.listPages()
        setPages(response.data?.pages || [])
      } catch (err) {
        console.error('Failed to load pages', err)
        setError('Gagal memuat halaman. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadPages()
  }, [])

  return (
    <DashboardPageShell title="Pages / Halaman" subtitle="Kelola halaman statis dan konten landing page yang ditampilkan kepada pengguna.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Halaman Statis</h2>
        <p className="mt-3 text-sm text-slate-400">Tempat untuk mengatur halaman seperti Tentang Kami, Kontak, dan kebijakan perusahaan.</p>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari judul..." className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              <option value="">Semua Kategori</option>
              {Array.from(new Set(pages.map((p) => p.category).filter(Boolean))).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { setQuery(''); setCategory(''); }} className="rounded-2xl bg-slate-800 px-3 py-2 text-sm text-slate-200">Reset</button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat halaman...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : pages.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="grid grid-cols-[1fr_140px_120px] gap-4 border-b border-white/10 px-6 py-4 text-sm uppercase text-slate-400">
              <span>Judul Halaman</span>
              <span>Kategori</span>
              <span>Terakhir Update</span>
            </div>
            <div className="divide-y divide-white/5">
              {pages
                .filter((page) => (category ? page.category === category : true))
                .filter((page) => (query ? (page.title || '').toLowerCase().includes(query.toLowerCase()) : true))
                .map((page) => (
                <div key={page.id} className="grid grid-cols-[1fr_140px_120px] gap-4 px-6 py-5 text-sm text-slate-300">
                  <div>
                    <p className="font-semibold text-white">{page.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{page.content?.slice(0, 120) || page.description || 'Tidak ada ringkasan.'}</p>
                  </div>
                  <span className="text-slate-400">{page.category || '-'}</span>
                  <span className="text-slate-400">{new Date(page.updated_at).toLocaleDateString('id-ID')}</span>
                  <div className="ml-4 flex items-center gap-2">
                    <button onClick={() => window.open(`/kb/${page.id}`, '_blank')} className="rounded-full bg-sky-500 px-3 py-1 text-xs text-white">View</button>
                    <button onClick={() => handleEditPage(page)} className="rounded-full bg-amber-500 px-3 py-1 text-xs text-white">Edit</button>
                    <button onClick={() => handleDeletePage(page.id)} className="rounded-full bg-rose-500 px-3 py-1 text-xs text-white">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Belum ada halaman statis yang terdaftar.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
