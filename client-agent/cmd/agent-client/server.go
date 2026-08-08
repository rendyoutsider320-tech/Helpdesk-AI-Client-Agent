package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	stdexec "os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/helpdesk-ai/client-agent/pkg/collector"
	"github.com/helpdesk-ai/client-agent/pkg/exec"
	"github.com/helpdesk-ai/client-agent/pkg/tools"
)

func telemetryHandler(w http.ResponseWriter, r *http.Request) {
	t := collector.CollectTelemetry()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(t)
}

func executeHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Action string                 `json:"action"`
		Args   map[string]interface{} `json:"args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	// Execute with centralized handler (also used by NATS subscriber)
	res, err := handleAction(req.Action, req.Args, r.RemoteAddr, false)
	if err != nil {
		http.Error(w, "action error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write([]byte(res))
}

// handleAction performs allowed actions with safety checks, audit logging, and dry-run support.
func handleAction(action string, args map[string]interface{}, caller string, dryRun bool) (string, error) {
	switch action {
	case "restart_service":
		name, _ := args["service_name"].(string)
		if name == "" {
			return "", fmt.Errorf("missing service_name")
		}
		if !sanitizeServiceName(name) {
			return "", fmt.Errorf("invalid service_name")
		}
		if !isAllowedService(name) {
			return "", fmt.Errorf("service not allowed: %s", name)
		}
		isDryRun := dryRun
		if dryRunVal, ok := args["dry_run"]; ok {
			if b, ok := dryRunVal.(bool); ok && b {
				isDryRun = true
			}
		}
		if isDryRun {
			msg := fmt.Sprintf("dry-run: would restart %s", name)
			writeAudit(action, args, caller, msg)
			return msg, nil
		}
		if !isElevated() {
			writeAudit(action, args, caller, "failed: insufficient privileges")
			return "", fmt.Errorf("insufficient privileges to restart service")
		}

		var out string
		var err error
		if os.PathSeparator == '\\' {
			out, err = exec.RunCommand("sc", "stop", name)
			if err == nil {
				time.Sleep(2 * time.Second)
				out2, err2 := exec.RunCommand("sc", "start", name)
				if err2 == nil {
					out += "\n" + out2
				} else {
					out += "\nstart-error:" + err2.Error()
				}
			}
		} else {
			out, err = exec.RunCommand("systemctl", "restart", name)
			if err != nil {
				out, err = exec.RunCommand("service", name, "restart")
			}
		}
		if err != nil {
			writeAudit(action, args, caller, "error: "+err.Error())
			return "", err
		}
		writeAudit(action, args, caller, out)
		return out, nil
	default:
		return "", fmt.Errorf("action not allowed")
	}
}

func sanitizeServiceName(name string) bool {
	valid := regexp.MustCompile(`^[a-zA-Z0-9_.:-]+$`)
	return valid.MatchString(name)
}

func isAllowedService(name string) bool {
	envList := os.Getenv("ALLOWED_SERVICES")
	allowed := []string{"helpdesk-api", "nginx", "postgres", "redis", "wuauserv", "docker", "sshd", "cron", "agent-client", "Spooler", "LanmanWorkstation", "EventLog"}
	if envList != "" {
		allowed = strings.Split(envList, ",")
	}
	for i := range allowed {
		allowed[i] = strings.TrimSpace(allowed[i])
	}
	sort.Strings(allowed)
	idx := sort.SearchStrings(allowed, name)
	return idx < len(allowed) && allowed[idx] == name
}

func signAuditEntry(entry string) string {
	key := os.Getenv("AUDIT_HMAC_KEY")
	if key == "" {
		return entry
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(entry))
	signature := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s signature=%s", entry, signature)
}

func isElevated() bool {
	// Unix: check EUID
	if os.PathSeparator == '/' {
		if uid := os.Geteuid(); uid == 0 {
			return true
		}
		return false
	}
	// Windows: attempt a privileged command (best-effort)
	cmd := stdexec.Command("net", "session")
	if err := cmd.Run(); err == nil {
		return true
	}
	return false
}

func writeAudit(action string, args map[string]interface{}, caller string, result string) {
	// Ensure audit directory exists
	_ = os.MkdirAll("audit", 0755)
	f, err := os.OpenFile("audit/agent_audit.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("audit write error: %v", err)
		return
	}
	defer f.Close()
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	entry := fmt.Sprintf("%s | action=%s caller=%s args=%v result=%s", ts, action, caller, args, result)
	entry = signAuditEntry(entry)
	entry += "\n"
	if _, err := f.WriteString(entry); err != nil {
		log.Printf("audit write error: %v", err)
	}
}

func startServer() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/telemetry", telemetryHandler)
	mux.HandleFunc("/tool", toolHandler)
	mux.HandleFunc("/execute", executeHandler)

	certDir := filepath.Join("..", "configs")
	serverCert := filepath.Join(certDir, "server.pem")
	serverKey := filepath.Join(certDir, "server-key.pem")
	caCert := filepath.Join(certDir, "ca.pem")

	// If certs present, start TLS server requiring client certs
	if fileExists(serverCert) && fileExists(serverKey) && fileExists(caCert) {
		ca, err := ioutil.ReadFile(caCert)
		if err != nil {
			return err
		}
		caPool := x509.NewCertPool()
		caPool.AppendCertsFromPEM(ca)

		tlsCfg := &tls.Config{
			ClientCAs:  caPool,
			ClientAuth: tls.RequireAndVerifyClientCert,
			MinVersion: tls.VersionTLS12,
		}

		srv := &http.Server{
			Addr:      ":8443",
			Handler:   mux,
			TLSConfig: tlsCfg,
		}
		log.Println("Starting agent HTTPS server on :8443 (mutual TLS)")
		return srv.ListenAndServeTLS(serverCert, serverKey)
	}
	// Fallback: plain HTTP (dev/demo)
	port := os.Getenv("AGENT_PORT")
	if port == "" {
		port = "8082"
	}
	log.Printf("Starting agent HTTP server on :%s (insecure - demo only)", port)
	return http.ListenAndServe(":"+port, mux)
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// toolHandler runs a named tool from the registry with given args
func toolHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Tool string                 `json:"tool"`
		Args map[string]interface{} `json:"args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	t, ok := tools.Get(req.Tool)
	if !ok {
		http.Error(w, "tool not found", http.StatusNotFound)
		return
	}
	res, err := tools.RunWithTimeout(r.Context(), t, req.Args, 20*time.Second)
	if err != nil {
		http.Error(w, "tool error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"result": res})
}
