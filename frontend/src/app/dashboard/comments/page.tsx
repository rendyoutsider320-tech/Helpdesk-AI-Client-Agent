'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { contentApi } from '@/lib/api'

export default function DashboardCommentsPage() {
  const [comments, setComments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    const loadComments = async () => {
      try {
        const response = await contentApi.listComments()
        setComments(response.data?.comments || [])
      } catch (err) {
        console.error('Failed to load comments', err)
        setError('Gagal memuat komentar. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadComments()
  }, [])

  const approveComment = async (id: string) => {
    try {
      await contentApi.approveComment(id)
      setComments((s) => s.map((c) => (c.id === id ? { ...c, is_internal: false } : c)))
    } catch (err) {
      console.error('Failed to approve comment', err)
      setError('Gagal menyetujui komentar. Silakan coba lagi.')
    }
  }

  const deleteComment = async (id: string) => {
    if (!confirm('Hapus komentar ini?')) {
      return
    }

    try {
      await contentApi.deleteComment(id)
      setComments((s) => s.filter((comment) => comment.id !== id))
    } catch (err) {
      console.error('Failed to delete comment', err)
      setError('Gagal menghapus komentar. Silakan coba lagi.')
    }
  }

  return (
    <DashboardPageShell title="Comments" subtitle="Pantau komentar pengguna dan persetujuan feedback pada konten yang dipublikasikan.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Review Komentar</h2>
        <p className="mt-3 text-sm text-slate-400">Halaman komentar akan menunjukkan masukan pengguna dan kontrol moderasi saat API komentar terintegrasi.</p>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari komentar atau pengguna..." className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200">
              <option value="">Semua</option>
              <option value="internal">Internal</option>
              <option value="public">Publik</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { setQuery(''); setFilterType(''); }} className="rounded-2xl bg-slate-800 px-3 py-2 text-sm text-slate-200">Reset</button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat komentar...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : comments.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="grid grid-cols-[1fr_140px_120px_120px] gap-4 border-b border-white/10 px-6 py-4 text-sm uppercase text-slate-400">
              <span>Ticket</span>
              <span>Pengguna</span>
              <span>Jenis</span>
              <span>Waktu</span>
            </div>
            <div className="divide-y divide-white/5">
              {comments
                .filter((c) => (filterType ? (filterType === 'internal' ? c.is_internal : !c.is_internal) : true))
                .filter((c) => (query ? (c.comment || '').toLowerCase().includes(query.toLowerCase()) || (c.user?.name || '').toLowerCase().includes(query.toLowerCase()) : true))
                .map((comment) => (
                <div key={comment.id} className="grid grid-cols-[1fr_140px_120px_120px] gap-4 px-6 py-5 text-sm text-slate-300">
                  <div>
                    <p className="font-semibold text-white">{comment.comment?.slice(0, 80) || '-'}</p>
                    <p className="mt-1 text-slate-500">{comment.user?.name || comment.user_id || 'Anonim'}</p>
                  </div>
                  <span className="text-slate-400">{comment.user?.username || comment.user_id || '-'}</span>
                  <span className="text-slate-400">{comment.is_internal ? 'Internal' : 'Publik'}</span>
                  <span className="text-slate-400">{new Date(comment.created_at).toLocaleString('id-ID')}</span>
                  <div className="ml-4 flex items-center gap-2">
                    {comment.is_internal && <button onClick={() => approveComment(comment.id)} className="rounded-full bg-emerald-500 px-3 py-1 text-xs text-white">Approve</button>}
                    <button onClick={() => deleteComment(comment.id)} className="rounded-full bg-rose-500 px-3 py-1 text-xs text-white">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Belum ada komentar tiket.</div>
        )}
      </div>
    </DashboardPageShell>
  )
}
