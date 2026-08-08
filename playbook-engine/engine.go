package main

import (
    "bytes"
    "crypto/rand"
    "crypto/tls"
    "crypto/x509"
    "encoding/json"
    "encoding/pem"
    "fmt"
    "io/ioutil"
    "log"
    "math/big"
    "net/http"
    "os"
    "time"

    "gopkg.in/yaml.v3"
    "github.com/nats-io/nats.go"
)

var natsConn *nats.Conn

type Step struct {
    Name   string                 `yaml:"name"`
    Action string                 `yaml:"action"`
    Args   map[string]interface{} `yaml:"args"`
}

type Playbook struct {
    ID          string `yaml:"id"`
    Description string `yaml:"description"`
    Steps       []Step `yaml:"steps"`
}

// callAgentGET calls agent telemetry endpoint over TLS using optional client certs
func callAgentGET(url string, clientCert, clientKey, caCert string) ([]byte, error) {
    tlsCfg := &tls.Config{InsecureSkipVerify: true}
    // try load certs if present
    if clientCert != "" && clientKey != "" {
        cert, err := tls.LoadX509KeyPair(clientCert, clientKey)
        if err == nil {
            tlsCfg.Certificates = []tls.Certificate{cert}
        }
    }
    if caCert != "" {
        ca, err := ioutil.ReadFile(caCert)
        if err == nil {
            pool := x509.NewCertPool()
            pool.AppendCertsFromPEM(ca)
            tlsCfg.RootCAs = pool
            tlsCfg.InsecureSkipVerify = false
        }
    }

    tr := &http.Transport{TLSClientConfig: tlsCfg}
    client := &http.Client{Transport: tr, Timeout: 15 * time.Second}
    resp, err := client.Get(url)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    return ioutil.ReadAll(resp.Body)
}

// callAgentPOST posts JSON to agent
func callAgentPOST(url string, payload interface{}, clientCert, clientKey, caCert string) ([]byte, error) {
    data, _ := json.Marshal(payload)
    tlsCfg := &tls.Config{InsecureSkipVerify: true}
    if clientCert != "" && clientKey != "" {
        cert, err := tls.LoadX509KeyPair(clientCert, clientKey)
        if err == nil {
            tlsCfg.Certificates = []tls.Certificate{cert}
        }
    }
    if caCert != "" {
        ca, err := ioutil.ReadFile(caCert)
        if err == nil {
            pool := x509.NewCertPool()
            pool.AppendCertsFromPEM(ca)
            tlsCfg.RootCAs = pool
            tlsCfg.InsecureSkipVerify = false
        }
    }
    tr := &http.Transport{TLSClientConfig: tlsCfg}
    client := &http.Client{Transport: tr, Timeout: 30 * time.Second}
    resp, err := client.Post(url, "application/json", bytes.NewReader(data))
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    return ioutil.ReadAll(resp.Body)
}

func main() {
    log.Println("Playbook Engine starting")

    // agent TLS cert paths (adjust as needed)
    clientCert := os.Getenv("CLIENT_CERT")
    if clientCert == "" {
        clientCert = "../client-agent/configs/client.pem"
    }
    clientKey := os.Getenv("CLIENT_KEY")
    if clientKey == "" {
        clientKey = "../client-agent/configs/client-key.pem"
    }
    caCert := os.Getenv("CA_CERT")
    if caCert == "" {
        caCert = "../client-agent/configs/ca.pem"
    }

    // Start enrollment server in background
    go func() {
        enrollPort := os.Getenv("ENROLLMENT_PORT")
        if enrollPort == "" {
            enrollPort = "8085"
        }
        enrollToken := os.Getenv("ENROLLMENT_TOKEN")
        caKeyPath := os.Getenv("CA_KEY")
        if caKeyPath == "" {
            caKeyPath = "../client-agent/configs/ca-key.pem"
        }
        caCertPath := os.Getenv("CA_CERT_PATH")
        if caCertPath == "" {
            caCertPath = "../client-agent/configs/ca.pem"
        }
        if err := startEnrollmentServer(enrollPort, enrollToken, caCertPath, caKeyPath); err != nil {
            log.Printf("enrollment server error: %v", err)
        }
    }()

    // Connect to NATS
    var err error
    natsConn, err = natsConnect()
    if err != nil {
        log.Fatalf("failed to connect to NATS: %v", err)
    }
    defer natsConn.Close()
    log.Printf("connected to NATS broker")

    // Create action registry mapping action names to handlers
    handlers := map[string]func(Step) error{
        "collect_telemetry": func(s Step) error {
            url := "https://localhost:8443/telemetry"
            body, err := callAgentGET(url, clientCert, clientKey, caCert)
            if err != nil {
                body, err = callAgentGET("http://localhost:8081/telemetry", "", "", "")
            }
            if err != nil {
                return fmt.Errorf("telemetry error: %w", err)
            }
            log.Printf("telemetry: %s", string(body))
            return nil
        },
        "restart_service": func(s Step) error {
            url := "https://localhost:8443/execute"
            payload := map[string]interface{}{"action": "restart_service", "args": s.Args}
            _, err := callAgentPOST(url, payload, clientCert, clientKey, caCert)
            if err != nil {
                _, err2 := callAgentPOST("http://localhost:8081/execute", payload, "", "", "")
                if err2 != nil {
                    return fmt.Errorf("restart_service error: %v, %v", err, err2)
                }
            }
            // Also publish via NATS for async delivery when broker used
            _ = publishNATS("agents.commands", payload)
            return nil
        },
        "run_diagnostics": func(s Step) error {
            // Use agent tool endpoint to run ping diagnostics
            target, _ := s.Args["target"].(string)
            if target == "" {
                return fmt.Errorf("missing diagnostic target")
            }
            toolPayload := map[string]interface{}{"tool": "ping", "args": map[string]interface{}{"host": target}}
            url := "https://localhost:8443/tool"
            body, err := callAgentPOST(url, toolPayload, clientCert, clientKey, caCert)
            if err != nil {
                body, err = callAgentPOST("http://localhost:8081/tool", toolPayload, "", "", "")
            }
            if err != nil {
                return fmt.Errorf("diagnostics(tool) error: %w", err)
            }
            log.Printf("diagnostics(tool): %s", string(body))
            return nil
        },
        "validate_checks": func(s Step) error {
            if s.Args == nil || len(s.Args) == 0 {
                return fmt.Errorf("no validation checks provided")
            }
            toolPayload := map[string]interface{}{"tool": "echo", "args": map[string]interface{}{"msg": s.Args}}
            url := "https://localhost:8443/tool"
            body, err := callAgentPOST(url, toolPayload, clientCert, clientKey, caCert)
            if err != nil {
                body, err = callAgentPOST("http://localhost:8081/tool", toolPayload, "", "", "")
            }
            if err != nil {
                return fmt.Errorf("validate_checks(tool) error: %w", err)
            }
            log.Printf("validate_checks(tool): %s", string(body))
            return nil
        },
    }

    // Subscribe to playbook trigger events from AI orchestrator
    _, err = natsConn.Subscribe("playbook.trigger", func(m *nats.Msg) {
        var trigger struct {
            AgentID    string `json:"agent_id"`
            PlaybookID string `json:"playbook_id"`
            Timestamp  int64  `json:"timestamp"`
            RuleName   string `json:"rule_name"`
        }
        if err := json.Unmarshal(m.Data, &trigger); err != nil {
            log.Printf("decode playbook trigger error: %v", err)
            return
        }

        log.Printf("[PLAYBOOK TRIGGER] %s for agent %s (rule: %s)", trigger.PlaybookID, trigger.AgentID, trigger.RuleName)

        // Load and execute playbook (hardcoded for now, could load from disk/db)
        pb := loadPlaybookByID(trigger.PlaybookID)
        if pb == nil {
            log.Printf("playbook not found: %s", trigger.PlaybookID)
            return
        }

        // Execute playbook steps
        for i, s := range pb.Steps {
            log.Printf("[%s] %d. %s (%s)", trigger.PlaybookID, i+1, s.Name, s.Action)
            if h, ok := handlers[s.Action]; ok {
                if err := h(s); err != nil {
                    log.Printf("[%s] step error: %v", trigger.PlaybookID, err)
                }
            } else {
                log.Printf("[%s] unknown action: %s", trigger.PlaybookID, s.Action)
            }
            time.Sleep(500 * time.Millisecond)
        }
    })
    if err != nil {
        log.Fatalf("subscribe error: %v", err)
    }

    log.Println("Playbook Engine ready - subscribed to playbook.trigger")

    // Also try to load and execute sample playbook on startup (for testing)
    go func() {
        time.Sleep(2 * time.Second)
        data, err := ioutil.ReadFile("playbooks/sample_playbook.yaml")
        if err != nil {
            log.Printf("sample playbook not available: %v", err)
            return
        }
        var pb Playbook
        if err := yaml.Unmarshal(data, &pb); err != nil {
            log.Printf("parse playbook error: %v", err)
            return
        }
        log.Printf("executing sample playbook: %s", pb.ID)
        for i, s := range pb.Steps {
            log.Printf("%d. %s (%s)", i+1, s.Name, s.Action)
            if h, ok := handlers[s.Action]; ok {
                if err := h(s); err != nil {
                    log.Printf("step error: %v", err)
                }
            }
            time.Sleep(500 * time.Millisecond)
        }
    }()

    // Keep running
    select {}
}

// loadPlaybookByID returns a predefined playbook by ID (in real system, would query database)
func loadPlaybookByID(id string) *Playbook {
    // Define some sample playbooks
    playbooks := map[string]*Playbook{
        "diag-high-cpu": {
            ID:          "diag-high-cpu",
            Description: "Diagnose high CPU usage",
            Steps: []Step{
                {Name: "Collect Telemetry", Action: "collect_telemetry", Args: nil},
                {Name: "Run Diagnostics", Action: "run_diagnostics", Args: map[string]interface{}{"target": "localhost"}},
            },
        },
        "diag-high-memory": {
            ID:          "diag-high-memory",
            Description: "Diagnose high memory usage",
            Steps: []Step{
                {Name: "Collect Telemetry", Action: "collect_telemetry", Args: nil},
                {Name: "Validate Checks", Action: "validate_checks", Args: map[string]interface{}{"check": "memory_health"}},
            },
        },
        "diag-low-disk": {
            ID:          "diag-low-disk",
            Description: "Diagnose low disk space",
            Steps: []Step{
                {Name: "Collect Telemetry", Action: "collect_telemetry", Args: nil},
                {Name: "Run Diagnostics", Action: "run_diagnostics", Args: map[string]interface{}{"target": "localhost"}},
            },
        },
    }
    return playbooks[id]
}

// publishNATS publishes a payload to the given subject (best-effort)
func publishNATS(subject string, payload interface{}) error {
    if natsConn != nil && natsConn.IsConnected() {
        b, _ := json.Marshal(payload)
        return natsConn.Publish(subject, b)
    }
    nc, err := natsConnect()
    if err != nil {
        return err
    }
    defer nc.Close()
    b, _ := json.Marshal(payload)
    return nc.Publish(subject, b)
}

func natsConnect() (*nats.Conn, error) {
    url := os.Getenv("NATS_URL")
    if url == "" {
        url = nats.DefaultURL
    }
    opts := []nats.Option{nats.Name("helpdesk-playbook-engine"), nats.Timeout(5 * time.Second)}
    if token := os.Getenv("NATS_TOKEN"); token != "" {
        opts = append(opts, nats.Token(token))
    }
    if user := os.Getenv("NATS_USER"); user != "" {
        opts = append(opts, nats.UserInfo(user, os.Getenv("NATS_PASSWORD")))
    }
    clientCert := os.Getenv("NATS_CLIENT_CERT")
    clientKey := os.Getenv("NATS_CLIENT_KEY")
    caCert := os.Getenv("NATS_CA_CERT")
    if clientCert != "" && clientKey != "" && caCert != "" {
        tlsCfg := &tls.Config{InsecureSkipVerify: true}
        cert, err := tls.LoadX509KeyPair(clientCert, clientKey)
        if err != nil {
            return nil, err
        }
        tlsCfg.Certificates = []tls.Certificate{cert}
        ca, err := ioutil.ReadFile(caCert)
        if err != nil {
            return nil, err
        }
        pool := x509.NewCertPool()
        if !pool.AppendCertsFromPEM(ca) {
            return nil, fmt.Errorf("failed to append NATS CA cert")
        }
        tlsCfg.RootCAs = pool
        tlsCfg.InsecureSkipVerify = false
        opts = append(opts, nats.Secure(tlsCfg))
    }
    if os.Getenv("NATS_ALLOW_INSECURE") == "true" {
        opts = append(opts, nats.Secure(&tls.Config{InsecureSkipVerify: true}))
    }
    return nats.Connect(url, opts...)
}

func startEnrollmentServer(port, token, caCertPath, caKeyPath string) error {
    mux := http.NewServeMux()
    mux.HandleFunc("/enroll", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
            return
        }
        var req struct {
            AgentID string `json:"agent_id"`
            Type    string `json:"type"`
            CSR     string `json:"csr"`
            Token   string `json:"token"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "invalid request", http.StatusBadRequest)
            return
        }
        if token != "" && req.Token != token {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        if req.Type != "server" && req.Type != "client" {
            http.Error(w, "unsupported enroll type", http.StatusBadRequest)
            return
        }
        certPEM, err := signCSR([]byte(req.CSR), caCertPath, caKeyPath, req.AgentID)
        if err != nil {
            http.Error(w, "sign error: "+err.Error(), http.StatusInternalServerError)
            return
        }
        _ = json.NewEncoder(w).Encode(map[string]string{"cert": string(certPEM)})
    })
    addr := fmt.Sprintf(":%s", port)
    log.Printf("starting enrollment server on %s", addr)
    return http.ListenAndServe(addr, mux)
}

func signCSR(csrPEM []byte, caCertPath, caKeyPath, agentID string) ([]byte, error) {
    caCertPEM, err := ioutil.ReadFile(caCertPath)
    if err != nil {
        return nil, err
    }
    caKeyPEM, err := ioutil.ReadFile(caKeyPath)
    if err != nil {
        return nil, err
    }
    caBlock, _ := pem.Decode(caCertPEM)
    if caBlock == nil {
        return nil, fmt.Errorf("malformed CA cert")
    }
    caCert, err := x509.ParseCertificate(caBlock.Bytes)
    if err != nil {
        return nil, err
    }
    keyBlock, _ := pem.Decode(caKeyPEM)
    if keyBlock == nil {
        return nil, fmt.Errorf("malformed CA key")
    }
    caKey, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
    if err != nil {
        return nil, err
    }
    csrBlock, _ := pem.Decode(csrPEM)
    if csrBlock == nil {
        return nil, fmt.Errorf("malformed CSR")
    }
    csr, err := x509.ParseCertificateRequest(csrBlock.Bytes)
    if err != nil {
        return nil, err
    }
    if err := csr.CheckSignature(); err != nil {
        return nil, err
    }
    serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
    if err != nil {
        return nil, err
    }
    template := x509.Certificate{
        SerialNumber: serial,
        Subject:      csr.Subject,
        NotBefore:    time.Now().Add(-time.Minute),
        NotAfter:     time.Now().Add(365 * 24 * time.Hour),
        KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
        ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
        DNSNames:     csr.DNSNames,
        IPAddresses:  csr.IPAddresses,
    }
    certDER, err := x509.CreateCertificate(rand.Reader, &template, caCert, csr.PublicKey, caKey)
    if err != nil {
        return nil, err
    }
    return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}), nil
}

