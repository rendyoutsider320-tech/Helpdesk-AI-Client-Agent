import { useEffect } from 'react'
import { usePresenceStore } from '@/store'

export const useWebSocket = (userId: string) => {
  const updatePresence = usePresenceStore((state: any) => state.updatePresence)

  useEffect(() => {
    if (!userId) return

    let wsHost = window.location.host
    let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    // If an absolute backend API URL is configured, use its host/port for WebSocket
    const apiUrl = process.env.NEXT_PUBLIC_API_URL
    if (apiUrl && apiUrl.startsWith('http')) {
      try {
        const url = new URL(apiUrl)
        let hostName = url.hostname
        const port = url.port

        // If the backend is set to localhost/127.0.0.1 but the user accessed the page remotely (e.g. over LAN),
        // we rewrite the hostname to target the correct remote server address.
        if ((hostName === 'localhost' || hostName === '127.0.0.1') &&
            window.location.hostname !== 'localhost' &&
            window.location.hostname !== '127.0.0.1') {
          hostName = window.location.hostname
        }

        wsHost = port ? `${hostName}:${port}` : hostName
        protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      } catch (e) {
        console.error('Failed to parse NEXT_PUBLIC_API_URL:', e)
      }
    }

    const wsUrl = `${protocol}//${wsHost}/ws/${userId}`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'presence_update') {
        updatePresence(data.technician_id, data.status, data.shift)
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('websocket-message', { detail: data }))
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        // Reconnect logic here
      }, 3000)
    }

    return () => {
      ws.onerror = null
      ws.onclose = null
      ws.close()
    }
  }, [userId, updatePresence])
}
