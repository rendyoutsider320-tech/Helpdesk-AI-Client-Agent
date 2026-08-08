import axios, { AxiosInstance } from 'axios'
import { useAuthStore } from '@/store'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

let apiClient: AxiosInstance

export const initializeApiClient = () => {
  apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 300000, // 5 minutes for AI synthesis and long operations
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Add token to requests
  apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  // Handle token refresh on 401
  apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          try {
            const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
              refresh_token: refreshToken,
            })
            const newToken = response.data.access_token

            // Update token in localStorage and store
            localStorage.setItem('access_token', newToken)
            useAuthStore.getState().setToken(newToken)

            // Set cookie
            document.cookie = `access_token=${newToken}; path=/; secure; samesite=lax`

            return apiClient(error.config)
          } catch {
            // Clear auth on refresh failure
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
            localStorage.removeItem('user')
            document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;'
            useAuthStore.getState().logout()

            // Redirect to login
            if (typeof window !== 'undefined') {
              window.location.href = '/'
            }
          }
        } else {
          // No refresh token, redirect to login
          localStorage.removeItem('access_token')
          localStorage.removeItem('user')
          document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;'
          useAuthStore.getState().logout()

          if (typeof window !== 'undefined') {
            window.location.href = '/'
          }
        }
      }
      return Promise.reject(error)
    }
  )

  return apiClient
}

export const getApiClient = () => {
  if (!apiClient) {
    initializeApiClient()
  }
  return apiClient
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    getApiClient().post('/auth/login', { username, password }),
  register: (name: string, username: string, email: string, password: string, role?: string) =>
    getApiClient().post('/auth/register', { name, username, email, password, role }),
  logout: () => getApiClient().post('/auth/logout'),
}

export const aiApi = {
  chat: (message: string, conversationId?: string) =>
    getApiClient().post('/ai/chat', { message, conversation_id: conversationId }),

  // Streaming chat via SSE - returns URL with token baked in
  streamChat: (message: string, conversationId?: string) => {
    const token = localStorage.getItem('access_token')
    const baseURL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    return { token, url: `${baseURL}/ai/chat/stream`, message, conversationId }
  },

  // Conversation history stored in DB
  listConversations: () => getApiClient().get('/ai/conversations'),
  createConversation: (title?: string) => getApiClient().post('/ai/conversations', { title }),
  getConversation: (id: string) => getApiClient().get(`/ai/conversations/${id}`),
  deleteConversation: (id: string) => getApiClient().delete(`/ai/conversations/${id}`),
  listMessages: (conversationId: string) => getApiClient().get(`/ai/conversations/${conversationId}/messages`),
  addMessage: (conversationId: string, role: string, content: string, attachmentUrl?: string, attachmentType?: string) =>
    getApiClient().post(`/ai/conversations/${conversationId}/messages`, {
      role, content, attachment_url: attachmentUrl, attachment_type: attachmentType
    }),
}

export const profileApi = {
  get: () => getApiClient().get('/profile'),
  update: (data: { name?: string; email?: string; phone?: string; department?: string }) =>
    getApiClient().put('/profile', data),
  updatePassword: (oldPassword: string, newPassword: string) =>
    getApiClient().put('/profile/password', { old_password: oldPassword, new_password: newPassword }),
}

export const kbApi = {
  list: (category?: string) => getApiClient().get('/kb', { params: { category } }),
  get: (id: string) => getApiClient().get(`/kb/${id}`),
  markHelpful: (id: string) => getApiClient().post(`/kb/${id}/helpful`),
  search: (q: string, semantic = false) => getApiClient().get('/kb/search', { params: { q, semantic } }),
}

export const qdrantApi = {
  syncKB: () => getApiClient().post('/qdrant/sync-kb'),
}

// Ticket API
export const ticketApi = {
  list: (page = 1, pageSize = 10, filters = {}) =>
    getApiClient().get('/tickets', { params: { page, page_size: pageSize, ...filters } }),
  create: (title: string, description: string, severity: string, extra: any = {}) =>
    getApiClient().post('/tickets', { title, description, severity, ...extra }),
  get: (id: string) =>
    getApiClient().get(`/tickets/${id}`),
  update: (id: string, data: any) =>
    getApiClient().put(`/tickets/${id}`, data),
  assign: (id: string, technicianId: string) =>
    getApiClient().post(`/tickets/${id}/assign`, { technician_id: technicianId }),
  resolve: (id: string, resolution: string) =>
    getApiClient().post(`/tickets/${id}/resolve`, { resolution }),
  close: (id: string) =>
    getApiClient().post(`/tickets/${id}/close`),
  export: () =>
    getApiClient().get('/tickets/export', { responseType: 'blob' }),
  addComment: (id: string, comment: string, isInternal = false) =>
    getApiClient().post(`/tickets/${id}/comments`, { comment, is_internal: isInternal }),
  analyze: (id: string) =>
    getApiClient().post(`/ai/tickets/${id}/analyze`),
}

export const contentApi = {
  listPosts: (page = 1, pageSize = 10) =>
    getApiClient().get('/content/posts', { params: { page, page_size: pageSize } }),
  createPost: (data: any) =>
    getApiClient().post('/content/posts', data),
  updatePost: (id: string, data: any) =>
    getApiClient().put(`/content/posts/${id}`, data),
  deletePost: (id: string) =>
    getApiClient().delete(`/content/posts/${id}`),
  listPages: (page = 1, pageSize = 10) =>
    getApiClient().get('/content/pages', { params: { page, page_size: pageSize } }),
  createPage: (data: any) =>
    getApiClient().post('/content/pages', data),
  updatePage: (id: string, data: any) =>
    getApiClient().put(`/content/pages/${id}`, data),
  deletePage: (id: string) =>
    getApiClient().delete(`/content/pages/${id}`),
  listMedia: (page = 1, pageSize = 10) =>
    getApiClient().get('/content/media', { params: { page, page_size: pageSize } }),
  deleteMedia: (id: string) =>
    getApiClient().delete(`/content/media/${id}`),
  listComments: (page = 1, pageSize = 10) =>
    getApiClient().get('/content/comments', { params: { page, page_size: pageSize } }),
  approveComment: (id: string) =>
    getApiClient().post(`/content/comments/${id}/approve`),
  deleteComment: (id: string) =>
    getApiClient().delete(`/content/comments/${id}`),
}

// Device API
export const deviceApi = {
  list: () =>
    getApiClient().get('/devices'),
  getMetrics: (id: string) =>
    getApiClient().get(`/devices/${id}/metrics`),
}

// Alert API
export const alertApi = {
  list: () =>
    getApiClient().get('/alerts'),
  resolve: (id: string) =>
    getApiClient().post(`/alerts/${id}/resolve`),
}

// Asset API
export const assetApi = {
  list: () =>
    getApiClient().get('/devices/assets'),
  getSoftware: (id: string) =>
    getApiClient().get(`/devices/assets/${id}/software`),
  getUSB: (id: string) =>
    getApiClient().get(`/devices/assets/${id}/usb`),
  getEvents: (id: string) =>
    getApiClient().get(`/devices/assets/${id}/events`),
  getApps: (id: string) =>
    getApiClient().get(`/devices/assets/${id}/apps`),
}
 
// Approval API
export const approvalApi = {
  list: () =>
    getApiClient().get('/tickets/approvals'),
  approve: (ticketId: string, actionId: string) =>
    getApiClient().post(`/tickets/${ticketId}/approve-action/${actionId}`),
  reject: (ticketId: string, actionId: string) =>
    getApiClient().post(`/tickets/${ticketId}/reject-action/${actionId}`),
}

// Tools API
export const toolsApi = {
  list: () =>
    getApiClient().get('/tools'),
  execute: (toolName: string, input: any) =>
    getApiClient().post(`/tools/${toolName}/execute`, input),
}

export const dashboardApi = {
  stats: () => getApiClient().get('/dashboard/stats'),
  summary: () => getApiClient().get('/dashboard/summary'),
  recentTickets: () => getApiClient().get('/dashboard/recent-tickets'),
  recentAlerts: () => getApiClient().get('/dashboard/recent-alerts'),
  trends: () => getApiClient().get('/dashboard/trends'),
  activityLog: (limit = 20) => getApiClient().get('/dashboard/activity-log', { params: { limit } }),
}

export const eventApi = {
  list: () => getApiClient().get('/events/list'),
}

// Technician API
export const technicianApi = {
  list: () =>
    getApiClient().get('/technicians'),
  listOnline: () =>
    getApiClient().get('/technicians/online'),
  status: () =>
    getApiClient().get('/technicians/status'),
  updateStatus: (status: string) =>
    getApiClient().put('/technicians/status', { status }),
  updateShift: (shift: string) =>
    getApiClient().put('/technicians/shift', { shift }),
}

// Navbar API
export const navbarApi = {
  stats: () =>
    getApiClient().get('/navbar/stats'),
  technicians: () =>
    getApiClient().get('/navbar/technicians'),
}

// Presence API
export const presenceApi = {
  heartbeat: () => getApiClient().post('/presence/heartbeat'),
  getAdminPresence: () => getApiClient().get('/admin/technicians/presence'),
}

// Website Monitor API
export const websiteMonitorApi = {
  list: () => getApiClient().get('/website-monitors'),
  get: (id: string) => getApiClient().get(`/website-monitors/${id}`),
  create: (data: {
    name: string
    url: string
    interval_seconds?: number
    timeout_seconds?: number
    check_type?: string
    description?: string
    tags?: string[]
    check_ssl?: boolean
    follow_redirects?: boolean
    keyword_check?: string
    location?: string
  }) => getApiClient().post('/website-monitors', data),
  update: (id: string, data: any) => getApiClient().put(`/website-monitors/${id}`, data),
  delete: (id: string) => getApiClient().delete(`/website-monitors/${id}`),
  toggle: (id: string) => getApiClient().post(`/website-monitors/${id}/toggle`),
  probeNow: (id: string) => getApiClient().post(`/website-monitors/${id}/probe`),
  getMetrics: (id: string, startTime?: string, endTime?: string, limit?: number) =>
    getApiClient().get(`/website-monitors/${id}/metrics`, {
      params: { start_time: startTime, end_time: endTime, limit }
    }),
  getSSL: (id: string) => getApiClient().get(`/website-monitors/${id}/ssl`),
  getUptime: (id: string) => getApiClient().get(`/website-monitors/${id}/uptime`),
  getIncidents: (id: string) => getApiClient().get(`/website-monitors/${id}/incidents`),
  getAllIncidents: (limit?: number) => getApiClient().get('/website-monitors/all/incidents', { params: { limit } }),
  resolveIncident: (incidentId: string) =>
    getApiClient().post(`/website-monitors/incidents/${incidentId}/resolve`),
  deleteAllIncidents: () => getApiClient().delete('/website-monitors/incidents'),
}

// SRE API
export const sreApi = {
  getDashboard: () => getApiClient().get('/sre/dashboard'),
  getMetrics: () => getApiClient().get('/sre/metrics'),
}

// CMDB API
export const cmdbApi = {
  getTopology: () => getApiClient().get('/cmdb/topology'),
  getImpactAnalysis: (id: string) => getApiClient().get(`/cmdb/impact-analysis/${id}`),
}

// Notification API
export const notificationApi = {
  list: () => getApiClient().get('/notifications'),
  markRead: (id: string) => getApiClient().post(`/notifications/${id}/read`),
  markAllRead: () => getApiClient().post('/notifications/read-all'),
  delete: (id: string) => getApiClient().delete(`/notifications/${id}`),
}

// System API
export const systemApi = {
  status: () => getApiClient().get('/system/status'),
  resetDatabase: () => getApiClient().post('/system/reset-database'),
}

// Search API
export const searchApi = {
  global: (query: string) =>
    getApiClient().get('/search/global', { params: { q: query } }),
}

// Audit Log API (new)
export const auditLogApi = {
  list: (params?: {
    page?: number
    page_size?: number
    action?: string
    resource_type?: string
    user_id?: string
  }) => getApiClient().get('/audit-logs', { params }),
}

// Users Admin API
export const usersApi = {
  list: (params?: { query?: string; role?: string; page?: number; limit?: number }) =>
    getApiClient().get('/admin/users', { params }),
  create: (data: any) => getApiClient().post('/admin/users', data),
  update: (id: string, data: any) => getApiClient().put(`/admin/users/${id}`, data),
  resetPassword: (id: string, newPassword?: string) =>
    getApiClient().put(`/admin/users/${id}/reset-password`, { new_password: newPassword }),
  delete: (id: string) => getApiClient().delete(`/admin/users/${id}`),
}
