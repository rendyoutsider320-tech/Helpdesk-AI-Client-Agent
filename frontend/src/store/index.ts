import { create } from 'zustand'

interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'technician' | 'user'
}

interface AuthStore {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isHydrated: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  logout: () => void
  loadFromStorage: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isHydrated: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),

  setToken: (token) =>
    set({
      accessToken: token,
    }),

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isHydrated: true,
    })
  },

  loadFromStorage: () => {
    try {
      const token = localStorage.getItem('access_token')
      const userStr = localStorage.getItem('user')
      let user = null
      if (userStr && userStr !== 'undefined' && userStr !== 'null') {
        user = JSON.parse(userStr)
      }

      set({
        accessToken: token,
        user,
        isAuthenticated: !!token && !!user,
        isHydrated: true,
      })
    } catch (e) {
      console.error('Failed to parse user from localStorage:', e)
      localStorage.removeItem('user')
      localStorage.removeItem('access_token')
      set({
        accessToken: null,
        user: null,
        isAuthenticated: false,
        isHydrated: true,
      })
    }
  },
}))

// Ticket store
interface Ticket {
  id: string
  ticket_no: string
  title: string
  description: string
  severity: string
  status: string
  created_by: string
  assigned_to?: string
  created_at: string
  updated_at: string
}

interface TicketStore {
  tickets: Ticket[]
  selectedTicket: Ticket | null
  loading: boolean
  error: string | null
  setTickets: (tickets: Ticket[]) => void
  setSelectedTicket: (ticket: Ticket | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useTicketStore = create<TicketStore>((set) => ({
  tickets: [],
  selectedTicket: null,
  loading: false,
  error: null,

  setTickets: (tickets) => set({ tickets }),
  setSelectedTicket: (ticket) => set({ selectedTicket: ticket }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))

// Real-time presence store
interface TechnicianPresence {
  technician_id: string
  status: 'online' | 'offline' | 'busy' | 'idle' | 'on_ticket' | 'on_break'
  shift?: string
}

interface PresenceStore {
  technicianPresences: TechnicianPresence[]
  updatePresence: (technicianId: string, status: TechnicianPresence['status'], shift?: string) => void
  setPresences: (presences: TechnicianPresence[]) => void
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  technicianPresences: [],

  updatePresence: (technicianId, status, shift) =>
    set((state) => {
      const exists = state.technicianPresences.some((p) => p.technician_id === technicianId)
      if (exists) {
        return {
          technicianPresences: state.technicianPresences.map((p) =>
            p.technician_id === technicianId ? { ...p, status, shift } : p
          ),
        }
      }
      return {
        technicianPresences: [...state.technicianPresences, { technician_id: technicianId, status, shift }],
      }
    }),

  setPresences: (presences) => set({ technicianPresences: presences }),
}))

// Layout store for collapsible sidebar
interface LayoutStore {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}))
