package messaging

import (
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/nats-io/nats.go"
)

var globalConn *nats.Conn

// InitNATS initializes global NATS connection
func InitNATS() error {
	url := os.Getenv("NATS_URL")
	if url == "" {
		url = nats.DefaultURL
	}

	user := os.Getenv("NATS_USER")
	pass := os.Getenv("NATS_PASSWORD")

	var opts []nats.Option
	if user != "" && pass != "" {
		opts = append(opts, nats.UserInfo(user, pass))
	}
	// Enable infinite reconnection attempts and set wait interval to 5 seconds
	opts = append(opts, nats.MaxReconnects(-1))
	opts = append(opts, nats.ReconnectWait(5 * time.Second))

	nc, err := nats.Connect(url, opts...)
	if err != nil {
		return err
	}
	globalConn = nc
	log.Printf("NATS connected to %s (Auth: %v)", url, user != "")
	return nil
}

// Publish sends data to NATS topic
func Publish(subject string, data interface{}) error {
	if globalConn == nil {
		if err := InitNATS(); err != nil {
			return err
		}
	}
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return globalConn.Publish(subject, payload)
}

// StartSubscriber connects to NATS and subscribes to agent command subject.
func StartSubscriber(subject string, handler func([]byte)) error {
	if globalConn == nil {
		if err := InitNATS(); err != nil {
			return err
		}
	}
	// subscribe
	_, err := globalConn.Subscribe(subject, func(m *nats.Msg) {
		log.Printf("nats msg on %s", subject)
		handler(m.Data)
	})
	if err != nil {
		return err
	}
	log.Printf("subscribed to NATS %s", subject)
	return nil
}

// helper to decode payload
func DecodePayload(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

// CloseNATS closes the global connection if open
func CloseNATS() {
	if globalConn != nil {
		globalConn.Close()
		globalConn = nil
	}
}
