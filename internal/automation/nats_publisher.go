package automation

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io/ioutil"
	"log"
	"os"

	"github.com/nats-io/nats.go"
)

var nc *nats.Conn
var privateKey *rsa.PrivateKey

// InitNATS initializes the NATS connection
func InitNATS() error {
	url := os.Getenv("NATS_URL")
	if url == "" {
		url = "nats://nats:4222"
	}

	user := os.Getenv("NATS_USER")
	if user == "" {
		user = "pb-controller"
	}
	pass := os.Getenv("NATS_PASSWORD")
	if pass == "" {
		pass = "controller-pass"
	}

	var err error
	nc, err = nats.Connect(url, nats.UserInfo(user, pass))
	if err != nil {
		return err
	}

	log.Printf("NATS connected successfully to %s as %s", url, user)
	return nil
}

func loadPrivateKey() error {
	keyPath := os.Getenv("PRIVATE_KEY_PATH")
	if keyPath == "" {
		keyPath = "configs/server_private_key.pem"
	}
	
	_ = os.MkdirAll("configs", 0755)

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return err
		}
		privateKey = key

		privBytes := x509.MarshalPKCS1PrivateKey(key)
		privBlock := &pem.Block{
			Type:  "RSA PRIVATE KEY",
			Bytes: privBytes,
		}
		privPEM := pem.EncodeToMemory(privBlock)
		_ = ioutil.WriteFile(keyPath, privPEM, 0600)

		pubBytes := x509.MarshalPKCS1PublicKey(&key.PublicKey)
		pubBlock := &pem.Block{
			Type:  "RSA PUBLIC KEY",
			Bytes: pubBytes,
		}
		pubPEM := pem.EncodeToMemory(pubBlock)
		_ = ioutil.WriteFile("configs/agent_public_key.pem", pubPEM, 0644)
		
		log.Println("Generated new RSA keypair for command signing.")
		return nil
	}

	data, err := ioutil.ReadFile(keyPath)
	if err != nil {
		return err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return errors.New("invalid private key PEM")
	}
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return err
	}
	privateKey = key
	return nil
}

func signCommand(command string) (string, error) {
	if privateKey == nil {
		if err := loadPrivateKey(); err != nil {
			return "", err
		}
	}

	hashed := sha256.Sum256([]byte(command))
	sig, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

// PublishAction sends an automated action job to NATS
func PublishAction(agentID string, actionType string, command string) error {
	if nc == nil {
		if err := InitNATS(); err != nil {
			return err
		}
	}

	sig, err := signCommand(command)
	if err != nil {
		log.Printf("Failed to sign command: %v", err)
		return err
	}

	payload := map[string]interface{}{
		"action_type": actionType,
		"command":     command,
		"target":      agentID,
		"signature":   sig,
	}

	data, _ := json.Marshal(payload)
	subject := "agent.cmd." + agentID

	err = nc.Publish(subject, data)
	if err != nil {
		log.Printf("Failed to publish action to NATS: %v", err)
		return err
	}

	log.Printf("Action published to NATS subject: %s", subject)
	return nil
}

// CloseNATS closes the NATS connection
func CloseNATS() {
	if nc != nil {
		nc.Close()
	}
}
