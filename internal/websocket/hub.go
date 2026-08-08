package websocket

import (
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/helpdesk-ai/core/internal/db"
)

// Hub maintains active WebSocket connections
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan interface{}
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// Client represents a connected WebSocket client
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	userID string
	send   chan interface{}
	ticker *time.Ticker
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan interface{}, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client registered: %s", client.userID)

			// Update technician presence
			go h.updateTechnicianPresence(client.userID, "online")

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			// Check if this user ID still has other active connections
			stillConnected := false
			for c := range h.clients {
				if c.userID == client.userID {
					stillConnected = true
					break
				}
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: %s", client.userID)

			if !stillConnected {
				// Update technician presence
				go h.updateTechnicianPresence(client.userID, "offline")
			}

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Channel full, skip
				}
			}
			h.mu.RUnlock()
		}
	}
}

// NewClient creates a new WebSocket client
func (h *Hub) NewClient(conn *websocket.Conn, userID string) *Client {
	return &Client{
		hub:    h,
		conn:   conn,
		userID: userID,
		send:   make(chan interface{}, 256),
		ticker: time.NewTicker(30 * time.Second),
	}
}

// Register registers a client with the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// ReadPump reads messages from WebSocket
func (c *Client) ReadPump() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("ReadPump panic recovered: %v", r)
		}
		c.hub.unregister <- c

		if err := c.conn.Close(); err != nil {
			log.Printf("WebSocket close error: %v", err)
		}
	}()

	// Set initial read deadline
	if err := c.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
		log.Printf("SetReadDeadline error: %v", err)
		return
	}

	// Handle pong messages
	c.conn.SetPongHandler(func(string) error {
		if err := c.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
			log.Printf("Pong SetReadDeadline error: %v", err)
			return err
		}

		return nil
	})

	for {
		var msg map[string]interface{}

		// Read JSON message
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			return
		}

		// Handle heartbeat
		if msg["type"] == "heartbeat" {
			select {
			case c.send <- map[string]interface{}{
				"type": "heartbeat_ack",
				"time": time.Now().Unix(),
			}:
			default:
				log.Printf("Heartbeat ACK dropped for user %s", c.userID)
			}

			continue
		}

		// Broadcast message to all clients
		select {
		case c.hub.broadcast <- msg:
		default:
			log.Println("Broadcast channel full, message dropped")
		}
	}
}

// WritePump writes messages to WebSocket
func (c *Client) WritePump() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("WritePump panic recovered: %v", r)
		}
		c.ticker.Stop()

		if err := c.conn.Close(); err != nil {
			log.Printf("WebSocket close error: %v", err)
		}
	}()

	for {
		select {
		case msg, ok := <-c.send:

			if err := c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				log.Printf("SetWriteDeadline error: %v", err)
				return
			}

			if !ok {
				if err := c.conn.WriteMessage(websocket.CloseMessage, []byte{}); err != nil {
					log.Printf("CloseMessage error: %v", err)
				}
				return
			}

			if err := c.conn.WriteJSON(msg); err != nil {
				log.Printf("WriteJSON error: %v", err)
				return
			}

		case <-c.ticker.C:

			if err := c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				log.Printf("Ping SetWriteDeadline error: %v", err)
				return
			}

			if err := c.conn.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				log.Printf("PingMessage error: %v", err)
				return
			}
		}
	}
}

// updateTechnicianPresence updates technician presence status and is_online for all users
func (h *Hub) updateTechnicianPresence(userID, status string) {
	var user db.User
	if db.DB.First(&user, "id = ?", userID).RowsAffected > 0 {
		// Update users.is_online
		isOnline := status != "offline"
		db.DB.Model(&user).Update("is_online", isOnline)

		if user.Role == "technician" {
			presence := &db.TechnicianPresence{}
			db.DB.FirstOrCreate(presence, db.TechnicianPresence{TechnicianID: userID})

			db.DB.Model(presence).Updates(map[string]interface{}{
				"status":         status,
				"last_heartbeat": time.Now(),
				"updated_at":     time.Now(),
			})
			h.BroadcastPresenceUpdate(userID, status)
		}
	}
}

// BroadcastPresenceUpdate broadcasts presence update to all clients
func (h *Hub) BroadcastPresenceUpdate(technicianID, status string) {
	var presence db.TechnicianPresence
	db.DB.Select("shift").Where("technician_id = ?", technicianID).First(&presence)
	h.broadcast <- map[string]interface{}{
		"type":          "presence_update",
		"technician_id": technicianID,
		"status":        status,
		"shift":         presence.Shift,
		"timestamp":     time.Now().Unix(),
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(msg interface{}) {
	select {
	case h.broadcast <- msg:
	default:
		log.Printf("Broadcast message dropped")
	}
}

// IsUserConnected checks if a user is currently connected to WebSocket
func (h *Hub) IsUserConnected(userID string) bool {
	if h == nil {
		return false
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.userID == userID {
			return true
		}
	}
	return false
}
