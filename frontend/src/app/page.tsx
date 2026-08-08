'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AxiosError } from 'axios'
import { useAuthStore } from '@/store'
import { authApi } from '@/lib/api'
import ParticleNetwork from '@/components/ParticleNetwork'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const setUser = useAuthStore((state) => state.setUser)
  const setToken = useAuthStore((state) => state.setToken)

  const [showPassword, setShowPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [registerName, setRegisterName] = useState('')
  const [registerUsername, setRegisterUsername] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerRole, setRegisterRole] = useState('user')
  const [successMessage, setSuccessMessage] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      // Validate input
      if (!username.trim() || !password.trim()) {
        setError('Username and password are required')
        setLoading(false)
        return
      }

      const response = await authApi.login(username, password)
      const data = response.data

      if (!data.access_token || !data.user) {
        setError('Invalid server response')
        return
      }

      localStorage.setItem('access_token', data.access_token)
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token)
      }
      localStorage.setItem('user', JSON.stringify(data.user))

      const isSecure = window.location.protocol === 'https:'
      document.cookie = `access_token=${data.access_token}; path=/; ${isSecure ? 'secure; ' : ''}samesite=lax`

      setToken(data.access_token)
      setUser(data.user)

      const roleRoute = {
        admin: '/dashboard/admin',
        technician: '/dashboard/technician',
        user: '/dashboard/user',
      }

      const redirectUrl = roleRoute[data.user.role as keyof typeof roleRoute] || '/dashboard/user'

      // Wait for state updates to sync before redirecting
      setTimeout(() => {
        router.push(redirectUrl)
      }, 100)
    } catch (err) {
      if (err instanceof AxiosError) {
        const serverMessage = err.response?.data?.error
        const status = err.response?.status ?? 0
        if (serverMessage) {
          setError(serverMessage)
        } else if (status === 401) {
          setError('Invalid username or password')
        } else if (status === 400) {
          setError('Invalid request')
        } else if (status >= 500) {
          setError('Server error. Please try again later')
        } else {
          setError('Unable to connect to authentication service')
        }
      } else if (err instanceof Error) {
        if (err.message.includes('Failed to fetch')) {
          setError('Connection error. Please check your network')
        } else {
          setError('An error occurred. Please try again.')
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      if (!registerName.trim() || !registerUsername.trim() || !registerEmail.trim() || !registerPassword.trim()) {
        setError('Semua field wajib diisi')
        setLoading(false)
        return
      }

      await authApi.register(
        registerName,
        registerUsername,
        registerEmail,
        registerPassword,
        registerRole
      )

      setSuccessMessage('Registrasi berhasil! Silakan masuk dengan akun Anda.')
      setIsRegistering(false)
      setUsername(registerUsername)
      setPassword('')
      
      // Reset registration form
      setRegisterName('')
      setRegisterUsername('')
      setRegisterEmail('')
      setRegisterPassword('')
    } catch (err) {
      if (err instanceof AxiosError) {
        const serverMessage = err.response?.data?.error
        if (serverMessage) {
          setError(serverMessage)
        } else {
          setError('Registrasi gagal. Silakan coba lagi.')
        }
      } else {
        setError('Koneksi gagal. Cek koneksi API backend Anda.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#050b14] relative overflow-hidden">
      {/* Premium High-Tech Backdrop Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ 
          backgroundImage: "url('/bg-login.png')",
          opacity: 0.7,
          filter: "brightness(0.65) contrast(1.1)"
        }} 
      />

      {/* Particle Network Animation Background */}
      <ParticleNetwork />
      
      {/* Glowing Auras */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-cyan-500/10 blur-[130px] animate-pulse-slow" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-indigo-500/10 blur-[130px] animate-pulse-slow" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950/80 border border-cyan-500/30 mb-5 shadow-[0_0_20px_rgba(0,210,255,0.2)]">
            <span className="text-2xl font-bold bg-gradient-to-br from-cyan-400 to-blue-600 bg-clip-text text-transparent">AI</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white mb-2 drop-shadow-[0_0_10px_rgba(0,210,255,0.2)]">Helpdesk AI System</h2>
          <p className="text-cyan-400/80 text-sm font-semibold uppercase tracking-widest">Enterprise Ticketing & Monitoring</p>
        </div>

        <div className="rounded-[32px] border border-cyan-500/30 bg-[#06111e]/85 p-8 shadow-[0_0_40px_rgba(0,210,255,0.15)] backdrop-blur-2xl transition-all duration-500 hover:shadow-[0_0_55px_rgba(0,210,255,0.25)] hover:border-cyan-500/50">
          {successMessage && (
            <div className="mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <p className="text-sm text-emerald-400 text-center font-semibold">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
              <p className="text-sm text-rose-400 text-center font-semibold">{error}</p>
            </div>
          )}

          {!isRegistering ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="input-field"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      className="input-field pr-12"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors p-1"
                      title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 shadow-[0_0_20px_rgba(0,210,255,0.25)] disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Mencoba Masuk...
                  </span>
                ) : 'Sign In to Dashboard'}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleRegister}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="regName" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Nama Lengkap</label>
                  <input
                    id="regName"
                    type="text"
                    required
                    className="input-field"
                    placeholder="Masukkan nama lengkap Anda"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="regUsername" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Username</label>
                  <input
                    id="regUsername"
                    type="text"
                    required
                    className="input-field"
                    placeholder="Pilih username unik"
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="regEmail" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Alamat Email</label>
                  <input
                    id="regEmail"
                    type="email"
                    required
                    className="input-field"
                    placeholder="name@company.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="regPassword" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Password</label>
                  <div className="relative">
                    <input
                      id="regPassword"
                      type={showRegisterPassword ? 'text' : 'password'}
                      required
                      className="input-field pr-12"
                      placeholder="Minimal 8 karakter"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors p-1"
                      title={showRegisterPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showRegisterPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="regRole" className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">Pilih Role</label>
                  <select
                    id="regRole"
                    className="input-field bg-[#06111e] text-white py-3 cursor-pointer"
                    value={registerRole}
                    onChange={(e) => setRegisterRole(e.target.value)}
                  >
                    <option value="user">User / Portal Client</option>
                    <option value="technician">Technician / Teknisi</option>
                    <option value="admin">Administrator / Admin</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 shadow-[0_0_20px_rgba(0,210,255,0.25)] disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Mendaftarkan...
                  </span>
                ) : 'Daftarkan Akun Baru'}
              </button>
            </form>
          )}

          <div className="mt-8 pt-8 border-t border-cyan-500/10 text-center animate-fade-in">
            {!isRegistering ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Demo Credentials</p>
                <div className="grid grid-cols-1 gap-2 text-xs text-slate-400">
                  <div className="flex justify-between px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/40">
                    <span className="font-medium text-slate-400">Admin</span>
                    <span className="text-cyan-400 font-mono font-semibold">admin / ChangeMe@123</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/40">
                    <span className="font-medium text-slate-400">Technician</span>
                    <span className="text-cyan-400 font-mono font-semibold">rendy.m / ChangeMe@123</span>
                  </div>
                </div>
                <p className="mt-6 text-sm text-slate-400">
                  Belum punya akun? <span onClick={() => { setIsRegistering(true); setError(''); setSuccessMessage(''); }} className="text-cyan-400 font-semibold hover:underline hover:text-cyan-300 cursor-pointer transition-colors duration-200">Register di sini</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Sudah punya akun? <span onClick={() => { setIsRegistering(false); setError(''); setSuccessMessage(''); }} className="text-cyan-400 font-semibold hover:underline hover:text-cyan-300 cursor-pointer transition-colors duration-200">Masuk di sini</span>
              </p>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-600 font-medium">
          &copy; 2026 Enterprise Agentic AI Helpdesk. All rights reserved.
        </p>
      </div>
    </div>
  )
}
