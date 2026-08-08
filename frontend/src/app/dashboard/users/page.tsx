'use client'

import { useEffect, useState } from 'react'
import DashboardPageShell from '@/components/DashboardPageShell'
import { usersApi } from '@/lib/api'
import { useAuthStore } from '@/store'

export default function DashboardUsersPage() {
  const currentUser = useAuthStore((state) => state.user)
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')

  // ── Modal State ──────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetResult, setResetResult] = useState<{ message: string; new_password?: string } | null>(null)

  // ── Form State ───────────────────────────────────────────────
  const [createForm, setCreateForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'user',
    shift: 'Pagi',
    status: 'active'
  })

  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    username: '',
    email: '',
    role: 'user',
    shift: 'Pagi',
    status: 'active'
  })

  const [customResetPass, setCustomResetPass] = useState('')

  // ── Load Users List ──────────────────────────────────────────
  const fetchUsers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await usersApi.list({ query: searchQuery, role: selectedRole })
      setUsers(response.data?.users || [])
    } catch (err: any) {
      console.error('Failed to load users', err)
      setError(err.response?.data?.error || 'Gagal memuat daftar pengguna. Pastikan Anda terautentikasi sebagai Admin.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()

    // Refresh every 10 seconds to keep online presence up to date
    const interval = setInterval(() => {
      usersApi.list({ query: searchQuery, role: selectedRole })
        .then((res) => setUsers(res.data?.users || []))
        .catch(() => {})
    }, 10000)

    // Listen for real-time WebSocket presence updates
    const handleWsMessage = (e: any) => {
      const data = e.detail
      if (data?.type === 'presence_update' || data?.type === 'user_status_change') {
        usersApi.list({ query: searchQuery, role: selectedRole })
          .then((res) => setUsers(res.data?.users || []))
          .catch(() => {})
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('websocket-message', handleWsMessage)
    }

    return () => {
      clearInterval(interval)
      if (typeof window !== 'undefined') {
        window.removeEventListener('websocket-message', handleWsMessage)
      }
    }
  }, [selectedRole, searchQuery])

  // Search trigger on enter or debounced
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchUsers()
  }

  // ── Handle Create User ───────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.name || !createForm.username || !createForm.email || !createForm.password) {
      alert('Mohon isi semua field bertanda bintang (*).')
      return
    }

    setIsSubmitting(true)
    try {
      await usersApi.create(createForm)
      alert('Pengguna baru berhasil ditambahkan!')
      setCreateModalOpen(false)
      setCreateForm({
        name: '',
        username: '',
        email: '',
        password: '',
        role: 'user',
        shift: 'Pagi',
        status: 'active'
      })
      fetchUsers()
    } catch (err: any) {
      console.error('Failed to create user', err)
      alert(err.response?.data?.error || 'Gagal membuat pengguna baru.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Handle Edit User ─────────────────────────────────────────
  const openEditModal = (user: any) => {
    setSelectedUser(user)
    setEditForm({
      id: user.id,
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      role: user.role || 'user',
      shift: user.shift || 'Pagi',
      status: user.status || 'active'
    })
    setEditModalOpen(true)
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await usersApi.update(editForm.id, {
        name: editForm.name,
        username: editForm.username,
        email: editForm.email,
        role: editForm.role,
        shift: editForm.shift,
        status: editForm.status
      })
      alert('Data pengguna berhasil diperbarui!')
      setEditModalOpen(false)
      fetchUsers()
    } catch (err: any) {
      console.error('Failed to update user', err)
      alert(err.response?.data?.error || 'Gagal memperbarui data pengguna.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Handle Reset Password ────────────────────────────────────
  const openResetModal = (user: any) => {
    setSelectedUser(user)
    setCustomResetPass('')
    setResetResult(null)
    setResetModalOpen(true)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    setIsSubmitting(true)
    try {
      const response = await usersApi.resetPassword(selectedUser.id, customResetPass || undefined)
      setResetResult(response.data)
    } catch (err: any) {
      console.error('Failed to reset password', err)
      alert(err.response?.data?.error || 'Gagal mereset password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Handle Delete User ───────────────────────────────────────
  const handleDeleteUser = async (user: any) => {
    if (user.id === currentUser?.id) {
      alert('Anda tidak dapat menghapus akun Anda sendiri.')
      return
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus akun "${user.name}" (${user.username})?`)) {
      return
    }

    try {
      await usersApi.delete(user.id)
      alert('Pengguna berhasil dihapus.')
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err: any) {
      console.error('Failed to delete user', err)
      alert(err.response?.data?.error || 'Gagal menghapus pengguna.')
    }
  }

  // Calculated stats
  const totalUsers = users.length
  const totalAdmins = users.filter((u) => u.role === 'admin').length
  const totalTechnicians = users.filter((u) => u.role === 'technician').length
  const totalClients = users.filter((u) => u.role === 'user' || u.role === 'client').length

  return (
    <DashboardPageShell title="Manajemen Pengguna" subtitle="Khusus Admin: Kelola akun Admin, Teknisi, dan Client/User (Tambah akun, ubah role, reset password, & kelola akses).">
      
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card-soft p-5 rounded-3xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pengguna</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{totalUsers}</h3>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-xl font-bold">
            👥
          </div>
        </div>

        <div className="glass-card-soft p-5 rounded-3xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Role Admin</p>
            <h3 className="text-2xl font-extrabold text-purple-400 mt-1">{totalAdmins}</h3>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-xl font-bold">
            👑
          </div>
        </div>

        <div className="glass-card-soft p-5 rounded-3xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teknisi Helpdesk</p>
            <h3 className="text-2xl font-extrabold text-amber-400 mt-1">{totalTechnicians}</h3>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl font-bold">
            🛠️
          </div>
        </div>

        <div className="glass-card-soft p-5 rounded-3xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client / User</p>
            <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">{totalClients}</h3>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
            👤
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="glass-card-soft rounded-3xl p-6 border border-white/10">
        
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, username, atau email..."
              className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50 min-w-[240px]"
            />
            <button 
              type="submit"
              className="rounded-2xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 cursor-pointer transition-colors"
            >
              Cari
            </button>
          </form>

          {/* Filter Role & Add Button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-900/80 p-1 rounded-2xl border border-white/10">
              {[
                { id: 'all', label: 'Semua Role' },
                { id: 'admin', label: 'Admin' },
                { id: 'technician', label: 'Teknisi' },
                { id: 'user', label: 'Client / User' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedRole(tab.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${selectedRole === tab.id ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCreateModalOpen(true)}
              className="rounded-2xl bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-bold text-white shadow-md hover:shadow-sky-500/25 transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer"
            >
              <span>➕</span> Tambah Pengguna Baru
            </button>
          </div>

        </div>

        {/* Users Table */}
        {isLoading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-300">Memuat daftar pengguna...</div>
        ) : error ? (
          <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">{error}</div>
        ) : users.length ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80">
            <div className="grid grid-cols-[1.2fr_1.2fr_110px_100px_100px_180px] gap-4 border-b border-white/10 px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Pengguna / Nama</span>
              <span>Username & Email</span>
              <span>Role</span>
              <span>Shift</span>
              <span>Status</span>
              <span className="text-right">Aksi Manajemen</span>
            </div>
            
            <div className="p-2 space-y-1">
              {users.map((u) => (
                <div 
                  key={u.id}
                  className="grid grid-cols-[1.2fr_1.2fr_110px_100px_100px_180px] gap-4 px-4 py-3.5 text-sm text-slate-300 group hover:bg-slate-800/50 transition-colors rounded-2xl items-center"
                >
                  {/* Name & Avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 font-bold text-xs flex items-center justify-center text-white shrink-0 uppercase">
                      {u.name ? u.name.substring(0, 2) : u.username.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate flex items-center gap-1.5">
                        {u.name || u.username}
                        {u.id === currentUser?.id && (
                          <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded-md font-bold">Saya</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 truncate">Terdaftar: {new Date(u.created_at).toLocaleDateString('id-ID')}</p>
                    </div>
                  </div>

                  {/* Username & Email */}
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-200 truncate">@{u.username}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>

                  {/* Role Badge */}
                  <div>
                    {u.role === 'admin' ? (
                      <span className="px-2.5 py-1 text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-xl inline-block">👑 Admin</span>
                    ) : u.role === 'technician' ? (
                      <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-xl inline-block">🛠️ Teknisi</span>
                    ) : (
                      <span className="px-2.5 py-1 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-xl inline-block">👤 Client</span>
                    )}
                  </div>

                  {/* Shift (for Technicians) */}
                  <div>
                    {u.role === 'technician' && u.shift ? (
                      <span className="text-xs text-sky-300 font-medium px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 rounded-lg">{u.shift}</span>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </div>

                  {/* Status Indicator */}
                  {(() => {
                    const isUserOnline = u.is_online || (currentUser && (u.id === currentUser.id || u.username === currentUser.username));
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${isUserOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span className={`text-xs font-medium ${isUserOnline ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                            {isUserOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        {u.status && u.status !== 'active' && (
                          <span className="text-[10px] text-rose-400 font-medium">Akun Non-Aktif</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-1.5">
                    <button 
                      onClick={() => openResetModal(u)} 
                      className="rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer"
                      title="Reset Password Pengguna"
                    >
                      🔑 Pass
                    </button>
                    <button 
                      onClick={() => openEditModal(u)} 
                      className="rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer"
                      title="Edit Akun & Role"
                    >
                      ✏️ Edit
                    </button>
                    {u.id !== currentUser?.id && (
                      <button 
                        onClick={() => handleDeleteUser(u)} 
                        className="rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 px-2 py-1 text-xs font-semibold transition-colors cursor-pointer"
                        title="Hapus Akun Pengguna"
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-slate-400">Tidak ada pengguna yang cocok dengan filter pencarian.</div>
        )}

      </div>

      {/* ==================== MODAL 1: TAMBAH PENGGUNA BARU ==================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl p-6 text-slate-100 space-y-5">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">➕ Tambah Pengguna Baru</h3>
                <p className="text-xs text-slate-400 mt-0.5">Buat akun untuk Admin, Teknisi, atau Client/User.</p>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Nama Lengkap <span className="text-rose-400">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Username <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. budi.s"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Password <span className="text-rose-400">*</span></label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Alamat Email <span className="text-rose-400">*</span></label>
                <input
                  type="email"
                  required
                  placeholder="budi@perusahaan.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Role Pengguna</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="user">Client / User</option>
                    <option value="technician">Teknisi Helpdesk</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                {createForm.role === 'technician' ? (
                  <div>
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Shift Kerja</label>
                    <select
                      value={createForm.shift}
                      onChange={(e) => setCreateForm({ ...createForm, shift: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                    >
                      <option value="Pagi">Shift Pagi</option>
                      <option value="Siang">Shift Siang</option>
                      <option value="Sore">Shift Sore</option>
                      <option value="Malam">Shift Malam</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status Akun</label>
                    <select
                      value={createForm.status}
                      onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                    >
                      <option value="active">Active (Aktif)</option>
                      <option value="inactive">Inactive (Non-aktif)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-bold text-white shadow-md transition-colors"
                >
                  {isSubmitting ? 'Menyimpan...' : '➕ Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: EDIT PENGGUNA ==================== */}
      {editModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl shadow-2xl p-6 text-slate-100 space-y-5">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">✏️ Edit Data Akun</h3>
                <p className="text-xs text-slate-400 mt-0.5">Ubah nama, email, role, atau shift untuk {selectedUser.name || selectedUser.username}.</p>
              </div>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Username</label>
                  <input
                    type="text"
                    required
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Alamat Email</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Role Pengguna</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="user">Client / User</option>
                    <option value="technician">Teknisi</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Shift (Teknisi)</label>
                  <select
                    value={editForm.shift}
                    onChange={(e) => setEditForm({ ...editForm, shift: e.target.value })}
                    disabled={editForm.role !== 'technician'}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50 disabled:opacity-50"
                  >
                    <option value="Pagi">Shift Pagi</option>
                    <option value="Siang">Shift Siang</option>
                    <option value="Sore">Shift Sore</option>
                    <option value="Malam">Shift Malam</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Status Akun</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-white shadow-md transition-colors"
                >
                  {isSubmitting ? 'Memperbarui...' : '💾 Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: RESET PASSWORD ==================== */}
      {resetModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl p-6 text-slate-100 space-y-5">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">🔑 Reset Password Akun</h3>
                <p className="text-xs text-slate-400 mt-0.5">Pengguna: <strong className="text-white">{selectedUser.name || selectedUser.username}</strong> (@{selectedUser.username})</p>
              </div>
              <button onClick={() => setResetModalOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            {resetResult ? (
              <div className="space-y-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                <p className="text-sm font-semibold text-emerald-300">✅ {resetResult.message}</p>
                <div className="space-y-1">
                  <span className="text-xs text-slate-400">Password Baru Akun:</span>
                  <div className="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-white/10 font-mono text-base font-bold text-sky-400 select-all">
                    {resetResult.new_password}
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1">Berikan password di atas kepada pengguna agar dapat login kembali.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors"
                >
                  Selesai
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Password Baru <span className="text-slate-500 font-normal">(Kosongkan untuk otomatis "Helpdesk@2026")</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Helpdesk@2026 atau buat sendiri"
                    value={customResetPass}
                    onChange={(e) => setCustomResetPass(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white font-mono focus:outline-none focus:border-sky-500/50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md transition-colors"
                  >
                    {isSubmitting ? 'Proses...' : '🔑 Reset Password Sekarang'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </DashboardPageShell>
  )
}
