package main

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/helpdesk-ai/client-agent/pkg/collector"
	"github.com/helpdesk-ai/client-agent/pkg/exec"
	"github.com/helpdesk-ai/client-agent/pkg/messaging"
)

const defaultControllerEnrollURL = "http://10.20.0.46:8085/enroll"

func loadEnvFile() {
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	envPath := filepath.Join(filepath.Dir(exePath), ".env")
	if _, err := os.Stat(envPath); os.IsNotExist(err) {
		// Fallback to active directory
		envPath = ".env"
		if _, err := os.Stat(envPath); os.IsNotExist(err) {
			return
		}
	}
	content, err := ioutil.ReadFile(envPath)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			// Strip quotes if present
			if strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"") {
				val = val[1 : len(val)-1]
			} else if strings.HasPrefix(val, "'") && strings.HasSuffix(val, "'") {
				val = val[1 : len(val)-1]
			}
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}
}

func main() {
	// Change working directory to executable directory to resolve relative paths
	// unless running in development (go run) where the executable is in a temp folder
	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		if !strings.Contains(dir, "go-build") && !strings.Contains(strings.ToLower(dir), "appdata\\local\\temp") {
			_ = os.Chdir(dir)
		}
	}

	if isWindowsService() {
		// Log to file since stdout/stderr are closed for services
		logFile, err := os.OpenFile("agent-service.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err == nil {
			log.SetOutput(logFile)
		}
	}

	loadEnvFile()

	if handleServiceFlags() {
		return
	}

	if isWindowsService() {
		runService(serviceName)
		return
	}

	// Interactive Mode
	stopChan := make(chan struct{})
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go runAgentLogic(stopChan)

	<-sigChan
	close(stopChan)
	// Give a second to log shutdown and close NATS
	time.Sleep(1 * time.Second)
}

func runAgentLogic(stopChan chan struct{}) {
	log.Println("Helpdesk Client Agent starting")

	// Initialize NATS connection
	if err := messaging.InitNATS(); err != nil {
		log.Printf("warning: NATS init failed: %v (will retry)", err)
	}

	if err := maybeEnrollAgent(); err != nil {
		log.Printf("enrollment warning: %v", err)
	}

	// Get agent ID (hostname)
	agentID, _ := os.Hostname()
	if agentID == "" {
		agentID = "agent-default"
	}

	// Self-Registration in Registry
	go func() {
		rustdeskInfo := collector.GetRustDeskInfo()
		anydeskInfo := collector.GetAnyDeskInfo()
		regData := map[string]interface{}{
			"hostname":        agentID,
			"agent_version":   "2.0.0-enterprise",
			"os":              runtime.GOOS,
			"ip_address":      getLocalIP(), // Real local IP
			"rustdesk_id":     rustdeskInfo.ID,
			"rustdesk_status": rustdeskInfo.Status,
			"anydesk_id":      anydeskInfo.ID,
			"anydesk_status":  anydeskInfo.Status,
			"type":            "registration",
		}
		if err := messaging.Publish("agent.register", regData); err != nil {
			log.Printf("registration error: %v", err)
		} else {
			log.Printf("sent registration request for %s (RustDesk ID: %s, AnyDesk ID: %s)", agentID, rustdeskInfo.ID, anydeskInfo.ID)
		}
	}()

	// Publish Inventory on startup and periodically (every 5 minutes)
	go func() {
		publishInventory := func() {
			hw, sw, usb := collector.CollectInventory()
			inventory := map[string]interface{}{
				"agent_id":    agentID,
				"hardware":    hw,
				"software":    sw,
				"usb_devices": usb,
				"type":        "inventory",
			}
			subject := fmt.Sprintf("inventory.%s", agentID)
			if err := messaging.Publish(subject, inventory); err != nil {
				log.Printf("inventory publish error: %v", err)
			} else {
				log.Printf("published inventory to %s", subject)
			}
		}

		// Initial publish
		publishInventory()

		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				publishInventory()
			case <-stopChan:
				return
			}
		}
	}()

	// Monitor network and USB device changes (Instant publish on USB plug/unplug)
	go func() {
		var lastLan, lastWifi, lastUSBSig string
		initHw := collector.HardwareInfo{}
		collector.FillNetworkInfo(&initHw)
		lastLan = initHw.IPLan
		lastWifi = initHw.IPWifi
		
		_, _, initUSB := collector.CollectInventory()
		getUSBSig := func(usbList []collector.USBDeviceInfo) string {
			sig := ""
			for _, u := range usbList {
				sig += u.Name + "|" + u.DeviceID + ";"
			}
			return sig
		}
		lastUSBSig = getUSBSig(initUSB)

		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				currentHw := collector.HardwareInfo{}
				collector.FillNetworkInfo(&currentHw)
				
				_, _, currentUSB := collector.CollectInventory()
				currentUSBSig := getUSBSig(currentUSB)

				netChanged := currentHw.IPLan != lastLan || currentHw.IPWifi != lastWifi
				usbChanged := currentUSBSig != lastUSBSig

				if netChanged || usbChanged {
					if netChanged {
						log.Printf("Network change detected (LAN: %s -> %s). Publishing inventory...", lastLan, currentHw.IPLan)
						lastLan = currentHw.IPLan
						lastWifi = currentHw.IPWifi
					}
					if usbChanged {
						log.Printf("USB Device change detected (plugged/unplugged). Publishing inventory...")
						lastUSBSig = currentUSBSig
					}
					
					hw, sw, usb := collector.CollectInventory()
					inventory := map[string]interface{}{
						"agent_id":    agentID,
						"hardware":    hw,
						"software":    sw,
						"usb_devices": usb,
						"type":        "inventory",
					}
					subject := fmt.Sprintf("inventory.%s", agentID)
					if err := messaging.Publish(subject, inventory); err != nil {
						log.Printf("inventory publish error: %v", err)
					} else {
						log.Printf("published inventory update to %s", subject)
					}
				}
			case <-stopChan:
				return
			}
		}
	}()

	// Start telemetry server in background
	go func() {
		if err := startServer(); err != nil {
			log.Printf("server error: %v", err)
		}
	}()

	// Start NATS subscriber for unique agent commands
	go func() {
		subject := "agent.cmd." + agentID
		log.Printf("Agent subscribing to NATS subject: %s", subject)
		_ = messaging.StartSubscriber(subject, func(data []byte) {
			var req struct {
				ActionType string `json:"action_type"`
				Command    string `json:"command"`
				Signature  string `json:"signature"`
			}
			if err := json.Unmarshal(data, &req); err != nil {
				log.Printf("nats: invalid payload: %v", err)
				return
			}

			if req.Signature == "" {
				log.Printf("CRITICAL SECURITY WARNING: Unsigned command received over NATS for action %s. Rejecting execution!", req.ActionType)
				return
			}

			if err := verifyCommand(req.Command, req.Signature); err != nil {
				log.Printf("CRITICAL SECURITY WARNING: RSA Signature check failed for command %s (error: %v). Rejecting execution!", req.Command, err)
				return
			}

			log.Printf("Executing remote action: %s (signature verified)", req.ActionType)
			res, err := exec.RunCommand(req.Command)
			if err != nil {
				log.Printf("action execution error: %v", err)
			} else {
				log.Printf("action result: %s", res)
			}
		})
	}()

	// Main telemetry loop: collect and publish to NATS every 5 seconds for instant real-time updates
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			telemetry := collector.CollectTelemetry()
			telemetry["agent_id"] = agentID
			telemetry["timestamp"] = time.Now().Unix()
			telemetry["ip_address"] = getLocalIP() // Include real local IP

			subject := fmt.Sprintf("telemetry.%s", agentID)
			if err := messaging.Publish(subject, telemetry); err != nil {
				log.Printf("telemetry publish error: %v", err)
			} else {
				log.Printf("published telemetry to %s", subject)
			}
		case <-stopChan:
			log.Println("Stopping Helpdesk Client Agent")
			messaging.CloseNATS()
			return
		}
	}
}

func maybeEnrollAgent() error {
	cfgDir := filepath.Join("..", "configs")
	if err := os.MkdirAll(cfgDir, 0755); err != nil {
		return err
	}

	serverKeyPath := filepath.Join(cfgDir, "server-key.pem")
	serverCertPath := filepath.Join(cfgDir, "server.pem")
	if fileExists(serverKeyPath) && fileExists(serverCertPath) {
		return nil
	}

	host, err := os.Hostname()
	if err != nil {
		host = "agent"
	}
	key, err := loadOrCreatePrivateKey(serverKeyPath)
	if err != nil {
		return fmt.Errorf("load/create key: %w", err)
	}
	csrPEM, err := createCSR("agent-"+host, key)
	if err != nil {
		return fmt.Errorf("create CSR: %w", err)
	}

	enrollURL := os.Getenv("CONTROLLER_ENROLL_URL")
	if enrollURL == "" {
		enrollURL = defaultControllerEnrollURL
	}
	requestBody := map[string]string{
		"agent_id": host,
		"type":     "server",
		"csr":      string(csrPEM),
	}
	if token := os.Getenv("ENROLLMENT_TOKEN"); token != "" {
		requestBody["token"] = token
	}
	body, _ := json.Marshal(requestBody)
	resp, err := http.Post(enrollURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("enroll post failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		respBody, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("enroll failed: %d %s", resp.StatusCode, string(respBody))
	}
	var result struct {
		Cert string `json:"cert"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("decode enroll response: %w", err)
	}
	if result.Cert == "" {
		return fmt.Errorf("controller returned empty cert")
	}
	if err := ioutil.WriteFile(serverCertPath, []byte(result.Cert), 0644); err != nil {
		return fmt.Errorf("write server cert: %w", err)
	}
	log.Printf("enrolled agent and wrote server cert to %s", serverCertPath)
	return nil
}

func createCSR(commonName string, key *rsa.PrivateKey) ([]byte, error) {
	subj := pkix.Name{CommonName: commonName}
	csrTemplate := &x509.CertificateRequest{Subject: subj}
	csrDER, err := x509.CreateCertificateRequest(rand.Reader, csrTemplate, key)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: csrDER}), nil
}

func loadOrCreatePrivateKey(path string) (*rsa.PrivateKey, error) {
	if fileExists(path) {
		data, err := ioutil.ReadFile(path)
		if err != nil {
			return nil, err
		}
		block, _ := pem.Decode(data)
		if block == nil {
			return nil, fmt.Errorf("invalid key pem")
		}
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err == nil {
			return key, nil
		}
		parsedKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		if rsaKey, ok := parsedKey.(*rsa.PrivateKey); ok {
			return rsaKey, nil
		}
		return nil, fmt.Errorf("unsupported private key type")
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	pemData := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	if err := ioutil.WriteFile(path, pemData, 0600); err != nil {
		return nil, err
	}
	return key, nil
}

func getLocalIP() string {
	// Fast interface inspection (0ms latency, works instantly on Windows & Linux)
	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp != 0 && iface.Flags&net.FlagLoopback == 0 {
				addrs, err := iface.Addrs()
				if err == nil {
					for _, addr := range addrs {
						if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
							if ip4 := ipnet.IP.To4(); ip4 != nil {
								// Prioritize LAN IPs (10.x, 192.168.x, 172.16-31.x)
								if ip4[0] == 10 || (ip4[0] == 192 && ip4[1] == 168) || (ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31) {
									return ip4.String()
								}
							}
						}
					}
				}
			}
		}
	}

	// Fallback UDP dial directly to IP address (no DNS lookup delay)
	conn, err := net.Dial("udp", "10.20.0.46:4222")
	if err == nil {
		defer conn.Close()
		if localAddr, ok := conn.LocalAddr().(*net.UDPAddr); ok && localAddr.IP != nil {
			return localAddr.IP.String()
		}
	}

	return "127.0.0.1"
}

var publicKey *rsa.PublicKey

func loadPublicKey() error {
	keyPath := os.Getenv("PUBLIC_KEY_PATH")
	if keyPath == "" {
		keyPath = filepath.Join("..", "configs", "agent_public_key.pem")
		if _, err := os.Stat(keyPath); os.IsNotExist(err) {
			keyPath = "agent_public_key.pem"
		}
	}

	data, err := ioutil.ReadFile(keyPath)
	if err != nil {
		return err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return errors.New("invalid public key PEM")
	}
	
	// Try parsing PKCS#1 public key first
	key, err := x509.ParsePKCS1PublicKey(block.Bytes)
	if err == nil {
		publicKey = key
		return nil
	}
	
	// Fallback to PKIX public key
	parsedKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return err
	}
	rsaKey, ok := parsedKey.(*rsa.PublicKey)
	if !ok {
		return errors.New("not an RSA public key")
	}
	publicKey = rsaKey
	return nil
}

func verifyCommand(command, signature string) error {
	if publicKey == nil {
		if err := loadPublicKey(); err != nil {
			return fmt.Errorf("failed to load public key: %w", err)
		}
	}

	sigBytes, err := base64.StdEncoding.DecodeString(signature)
	if err != nil {
		return fmt.Errorf("invalid base64 signature: %w", err)
	}

	hashed := sha256.Sum256([]byte(command))
	return rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hashed[:], sigBytes)
}
