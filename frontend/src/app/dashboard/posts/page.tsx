'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { contentApi, qdrantApi } from '@/lib/api'

export default function DashboardPostsPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [viewingPost, setViewingPost] = useState<any | null>(null)

  // ── Modal Full Editor State ─────────────────────────────────
  const [editorModalOpen, setEditorModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    category: 'Hardware & Display',
    status: 'published',
    tags: '',
    content: ''
  })
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write')
  const [isSaving, setIsSaving] = useState(false)

  const defaultCategories = [
    'Hardware & Display',
    'POS & Terminal Kasir',
    'Printer & Peripheral',
    'Jaringan & Network',
    'Software & OS',
    'Security & Policy',
    'Prosedur Operasional (SOP)',
    'Umum / Artikel'
  ]

  const handleDeletePost = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus artikel ini?')) {
      return
    }

    try {
      await contentApi.deletePost(id)
      setPosts((s) => s.filter((post) => post.id !== id))
    } catch (err) {
      console.error('Failed to delete post', err)
      setError('Gagal menghapus artikel. Silakan coba lagi.')
    }
  }

  // ── Open Editor Modal for Creating ───────────────────────────
  const openCreateModal = () => {
    setIsEditMode(false)
    setEditingPostId(null)
    setFormData({
      title: '',
      category: 'Hardware & Display',
      status: 'published',
      tags: 'sop, troubleshooting',
      content: ''
    })
    setEditorTab('write')
    setEditorModalOpen(true)
  }

  // ── Open Editor Modal for Editing ───────────────────────────
  const openEditModal = (post: any) => {
    setIsEditMode(true)
    setEditingPostId(post.id)
    setFormData({
      title: post.title || '',
      category: post.category || 'Hardware & Display',
      status: post.status || 'published',
      tags: Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags || ''),
      content: post.content || post.description || ''
    })
    setEditorTab('write')
    setEditorModalOpen(true)
  }

  // ── Toolbar Formatting Insertion Helpers ─────────────────────
  const insertFormatting = (prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = document.getElementById('sop-editor-textarea') as HTMLTextAreaElement
    if (!textarea) {
      setFormData(prev => ({ ...prev, content: prev.content + prefix + defaultText + suffix }))
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = textarea.value.substring(start, end) || defaultText
    const newText = textarea.value.substring(0, start) + prefix + selectedText + suffix + textarea.value.substring(end)
    
    setFormData(prev => ({ ...prev, content: newText }))

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length)
    }, 50)
  }

  const insertSOPTemplate = () => {
    const template = `### 📋 Deskripsi Kendala
[Tuliskan gejala masalah atau laporan yang diterima dari user]

### 🔍 Langkah-Langkah Diagnosis
1. Cek koneksi kabel, adaptor daya, dan status indikator LED.
2. Cek status service/driver pada PC Client atau perangkat terkait.
3. Lakukan tes ping atau pengecekan log sistem.

### 💡 Solusi & Langkah Penanganan (Troubleshooting)
1. **Langkah 1**: Restart service atau perangkat terkait.
2. **Langkah 2**: Lakukan konfigurasi ulang jika diperlukan.

### 🚨 Catatan Penting / Eskalasi
> [!NOTE]
> Jika kendala belum teratasi setelah 15 menit, lakukan eskalasi ke Supervisor/L2.`

    if (formData.content.trim()) {
      if (confirm('Sisipkan Template SOP standar ke dalam editor?')) {
        setFormData(prev => ({ ...prev, content: prev.content + '\n\n' + template }))
      }
    } else {
      setFormData(prev => ({ ...prev, content: template }))
    }
  }

  // ── Save Post Handler ─────────────────────────────────────────
  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      alert('Judul artikel/SOP wajib diisi.')
      return
    }
    if (!formData.content.trim()) {
      alert('Isi artikel/SOP tidak boleh kosong.')
      return
    }

    const tagsArr = formData.tags
      ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []

    setIsSaving(true)
    try {
      if (isEditMode && editingPostId) {
        const response = await contentApi.updatePost(editingPostId, {
          title: formData.title,
          content: formData.content,
          category: formData.category,
          tags: tagsArr,
          status: formData.status
        })
        const updatedPost = response.data
        setPosts((s) => s.map((item) => (item.id === editingPostId ? { ...item, ...updatedPost } : item)))
        setEditorModalOpen(false)
        alert('Artikel KB / SOP berhasil diperbarui!')
      } else {
        const response = await contentApi.createPost({
          title: formData.title,
          content: formData.content,
          category: formData.category,
          tags: tagsArr,
          status: formData.status
        })
        const newPost = response.data
        setPosts((s) => [newPost, ...s])
        setEditorModalOpen(false)

        if (confirm('Artikel berhasil dibuat! Apakah Anda ingin langsung mensinkronkan ke AI Knowledge Base (Qdrant)?')) {
          await handleSyncQdrant()
        }
      }
    } catch (err) {
      console.error('Failed to save post', err)
      alert('Gagal menyimpan artikel. Silakan periksa kembali server API Anda.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSyncQdrant = async () => {
    try {
      setIsLoading(true)
      await qdrantApi.syncKB()
      alert('Sinkronisasi ke AI Knowledge Base (Qdrant) berhasil!')
    } catch (err) {
      console.error('Failed to sync to Qdrant', err)
      alert('Gagal mensinkronkan artikel ke database AI.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await contentApi.listPosts()
        setPosts(response.data?.posts || [])
      } catch (err) {
        console.error('Failed to load posts', err)
        setError('Gagal memuat posts. Silakan coba lagi.')
      } finally {
        setIsLoading(false)
      }
    }

    loadPosts()
  }, [])

  return (
    <DashboardPageShell title="Posts / Artikel KB & SOP" subtitle="Kelola konten informasi teknis, pengumuman, dan prosedur operasional (SOP) untuk tim teknisi dan pengguna.">
      <div className="glass-card-soft rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-white">Kelola Posts & Artikel SOP</h2>
        <p className="mt-2 text-sm text-slate-400">Pusat manajemen artikel basis pengetahuan (Knowledge Base) dan panduan troubleshooting operasional IT.</p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Cari judul artikel..." 
              className="rounded-2xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50" 
            />
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)} 
              className="rounded-2xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50"
            >
              <option value="">Semua Kategori</option>
              {Array.from(new Set([...defaultCategories, ...posts.map((p) => p.category).filter(Boolean)])).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setQuery(''); setCategory(''); }} 
              className="rounded-2xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm text-slate-200 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-black/20"
            >
              Reset
            </button>
            <button 
              onClick={openCreateModal} 
              className="rounded-2xl bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-semibold text-white cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-sky-500/25 flex items-center gap-1.5"
            >
              <span>➕</span> Tambah Artikel
            </button>
            <button 
              onClick={handleSyncQdrant} 
              className="rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-emerald-500/25 flex items-center gap-1.5"
            >
              <span>Sync ke AI</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat posts...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : posts.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="grid grid-cols-[1fr_160px_100px_110px_170px] gap-4 border-b border-white/10 px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Judul Artikel / SOP</span>
              <span>Kategori</span>
              <span>Status</span>
              <span>Diperbarui</span>
              <span className="text-right">Aksi</span>
            </div>
            <div className="p-2 space-y-1">
              {posts
                .filter((post) => (category ? post.category === category : true))
                .filter((post) => (query ? (post.title || '').toLowerCase().includes(query.toLowerCase()) : true))
                .map((post) => (
                <div 
                  key={post.id} 
                  onClick={() => setViewingPost(post)}
                  className="grid grid-cols-[1fr_160px_100px_110px_170px] gap-4 px-4 py-3.5 text-sm text-slate-300 group cursor-pointer hover:bg-slate-800/50 transition-all duration-200 hover:translate-x-1 rounded-2xl items-center"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white group-hover:text-sky-400 transition-colors flex items-center gap-2 truncate">
                      <span className="h-2 w-2 rounded-full bg-sky-500/50 group-hover:bg-sky-400 shrink-0" />
                      <span className="truncate">{post.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 pl-4 truncate">{post.content?.slice(0, 100) || post.description || 'Tidak ada ringkasan.'}</p>
                  </div>
                  <span className="text-xs text-slate-300 font-medium px-2 py-1 bg-slate-800 border border-slate-700/50 rounded-xl inline-block w-fit truncate">{post.category || '-'}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg w-fit ${post.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {post.status || 'published'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{post.updated_at ? new Date(post.updated_at).toLocaleDateString('id-ID') : '-'}</span>
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setViewingPost(post)} className="rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer">Lihat</button>
                    <button onClick={() => openEditModal(post)} className="rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer">Edit</button>
                    <button onClick={() => handleDeletePost(post.id)} className="rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2 py-1 text-xs font-semibold transition-colors cursor-pointer">Hapus</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Belum ada artikel KB tersedia.</div>
        )}
      </div>

      {/* ==================== MODAL BESAR: EDITOR RICH TEXT ARTIKEL / SOP ==================== */}
      {editorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] text-slate-100 overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-slate-950/40">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  📝 {isEditMode ? 'Edit Artikel KB / SOP' : 'Buat Artikel KB / SOP Baru'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Kelola judul, kategori, dan isi panduan teknis dengan format teks kaya (Rich Text).</p>
              </div>
              <button 
                onClick={() => setEditorModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSavePost} className="p-6 overflow-y-auto space-y-5 flex-1">
              
              {/* Row 1: Title, Category, Status */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Judul Artikel / SOP <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: SOP Penanganan Display LCD Customer Kasir Blank"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  />
                </div>

                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Kategori</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    {defaultCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Tags */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Tag / Kata Kunci <span className="text-slate-500 font-normal">(Pisahkan dengan koma)</span></label>
                <input
                  type="text"
                  placeholder="e.g. pos, lcd, printer, spooler, trouble"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                />
              </div>

              {/* Row 3: Editor Toolbar & Area */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                
                {/* Rich Text Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2 rounded-2xl border border-white/10">
                  <div className="flex items-center gap-1 overflow-x-auto py-1">
                    <button
                      type="button"
                      onClick={() => insertFormatting('**', '**', 'Teks Tebal')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-colors"
                      title="Bold / Teks Tebal"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('*', '*', 'Teks Miring')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs italic font-serif text-slate-200 border border-slate-700 transition-colors"
                      title="Italic / Teks Miring"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('### ', '\n', 'Judul Sub-Bagian')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-colors"
                      title="Sub-heading H3"
                    >
                      H3
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('- ', '\n', 'Poin item list')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
                      title="Bullet List"
                    >
                      • List
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('1. ', '\n', 'Langkah penanganan')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
                      title="Numbered List"
                    >
                      1. List
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('```bash\n', '\n```\n', '# Perintah terminal')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors"
                      title="Kode Perintah"
                    >
                      &lt;/&gt; Code
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('> [!NOTE]\n> ', '\n', 'Catatan khusus di sini...')}
                      className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs border border-indigo-500/30 transition-colors"
                      title="Catatan Note Alert"
                    >
                      💡 Note
                    </button>
                    <button
                      type="button"
                      onClick={() => insertFormatting('> [!WARNING]\n> ', '\n', 'Peringatan penting di sini...')}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs border border-amber-500/30 transition-colors"
                      title="Peringatan Warning Alert"
                    >
                      ⚠️ Warning
                    </button>
                    <button
                      type="button"
                      onClick={insertSOPTemplate}
                      className="px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold border border-sky-500/30 transition-colors flex items-center gap-1"
                      title="Sisipkan Template Standar SOP Penanganan IT"
                    >
                      📋 Sisipkan Template SOP
                    </button>
                  </div>

                  {/* Mode Tab Switcher */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditorTab('write')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${editorTab === 'write' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      ✏️ Tulis Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorTab('preview')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${editorTab === 'preview' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      👁️ Preview Tampilan
                    </button>
                  </div>
                </div>

                {/* Editor vs Preview Content Area */}
                {editorTab === 'write' ? (
                  <textarea
                    id="sop-editor-textarea"
                    rows={12}
                    required
                    placeholder="Tuliskan isi SOP / Artikel secara lengkap. Gunakan toolbar di atas untuk format teks tebal, list, atau langkah penanganan..."
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white font-mono leading-relaxed focus:outline-none focus:border-sky-500/50"
                  />
                ) : (
                  <div className="min-h-[280px] max-h-[400px] overflow-y-auto bg-slate-950 border border-white/10 rounded-2xl p-5 text-sm text-slate-200 space-y-3 leading-relaxed">
                    {formData.content ? (
                      <div className="whitespace-pre-wrap font-sans">
                        {formData.content}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-8 text-center">Belum ada konten untuk ditampilkan dalam preview.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className="text-xs text-slate-400 hidden sm:inline">
                  💡 Konten akan langsung tersedia untuk diagnosa AI jika disinkronkan.
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setEditorModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white transition-all shadow-md hover:shadow-sky-500/25 flex items-center gap-1.5"
                  >
                    {isSaving ? 'Menyimpan...' : isEditMode ? '💾 Simpan Perubahan' : '➕ Buat Artikel Baru'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL VIEW DETAIL ARTIKEL ==================== */}
      {viewingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card-soft w-full max-w-3xl rounded-3xl p-6 border border-white/10 shadow-2xl relative bg-slate-900">
            <button 
              onClick={() => setViewingPost(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              ✕
            </button>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-block px-3 py-1 text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full">
                  {viewingPost.category || 'General'}
                </span>
                <span className="inline-block px-2.5 py-0.5 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  {viewingPost.status || 'published'}
                </span>
              </div>
              
              <h3 className="text-2xl font-bold text-white leading-tight">
                {viewingPost.title}
              </h3>
              
              <div className="flex items-center gap-4 text-xs text-slate-400 border-b border-white/10 pb-3">
                <span>Diperbarui: <strong className="text-slate-200">{viewingPost.updated_at ? new Date(viewingPost.updated_at).toLocaleDateString('id-ID') : '-'}</strong></span>
                {viewingPost.tags && viewingPost.tags.length > 0 && (
                  <span>Tag: <strong className="text-sky-300">{Array.isArray(viewingPost.tags) ? viewingPost.tags.join(', ') : viewingPost.tags}</strong></span>
                )}
              </div>
              
              <div className="max-h-[55vh] overflow-y-auto pr-2 mt-4 bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {viewingPost.content || viewingPost.description}
                </p>
              </div>
              
              <div className="mt-6 flex justify-between items-center">
                <button 
                  onClick={() => {
                    const targetPost = viewingPost;
                    setViewingPost(null);
                    openEditModal(targetPost);
                  }}
                  className="rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-4 py-2 text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  ✏️ Edit Full Artikel
                </button>
                <button 
                  onClick={() => setViewingPost(null)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-700 px-5 py-2 text-xs font-semibold text-white transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardPageShell>
  )
}
