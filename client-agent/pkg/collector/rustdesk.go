package collector

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// RustDeskInfo holds RustDesk telemetry info
type RustDeskInfo struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// GetRustDeskInfo detects RustDesk ID and service status on the current host.
func GetRustDeskInfo() RustDeskInfo {
	id := ""
	status := "not_installed"

	switch runtime.GOOS {
	case "windows":
		id, status = getWindowsRustDesk()
	case "linux":
		id, status = getLinuxRustDesk()
	}

	return RustDeskInfo{
		ID:     id,
		Status: status,
	}
}

func getWindowsRustDesk() (string, string) {
	id := ""

	// 1. Try running CLI command rustdesk --get-id
	out, err := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "rustdesk --get-id").Output()
	if err == nil {
		cleanOut := strings.TrimSpace(string(out))
		if cleanOut != "" && !strings.Contains(cleanOut, "is not recognized") && !strings.Contains(cleanOut, "Error") {
			id = cleanOut
		}
	}

	// 2. Fallback: Search common RustDesk config TOML files on Windows
	if id == "" {
		appData := os.Getenv("APPDATA")
		localAppData := os.Getenv("LOCALAPPDATA")
		programData := os.Getenv("ProgramData")
		systemDrive := os.Getenv("SystemDrive")
		if systemDrive == "" {
			systemDrive = "C:"
		}

		candidatePaths := []string{
			filepath.Join(appData, "RustDesk", "config", "RustDesk2.toml"),
			filepath.Join(appData, "RustDesk", "config", "RustDesk.toml"),
			filepath.Join(localAppData, "RustDesk", "config", "RustDesk2.toml"),
			filepath.Join(programData, "RustDesk", "config", "RustDesk2.toml"),
			filepath.Join(programData, "RustDesk", "config", "RustDesk.toml"),
			systemDrive + `\Windows\ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk2.toml`,
		}

		for _, p := range candidatePaths {
			if fileExists(p) {
				foundID := extractRustDeskIDFromTOML(p)
				if foundID != "" {
					id = foundID
					break
				}
			}
		}
	}

	if id == "" {
		return "", "not_installed"
	}

	// Check if RustDesk process or service is running
	status := "offline"
	outProc, errProc := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Get-Process -Name RustDesk -ErrorAction SilentlyContinue").Output()
	if errProc == nil && strings.TrimSpace(string(outProc)) != "" {
		status = "online"
	} else {
		// If ID is found, set status to installed/offline
		status = "installed"
	}

	return id, status
}

func getLinuxRustDesk() (string, string) {
	id := ""

	// 1. Try running rustdesk --get-id
	out, err := exec.Command("rustdesk", "--get-id").Output()
	if err == nil {
		cleanOut := strings.TrimSpace(string(out))
		if cleanOut != "" && !strings.Contains(cleanOut, "not found") {
			id = cleanOut
		}
	}

	// 2. Fallback: Search Linux TOML config files
	if id == "" {
		homeDir, _ := os.UserHomeDir()
		candidatePaths := []string{
			filepath.Join(homeDir, ".config", "rustdesk", "RustDesk2.toml"),
			filepath.Join(homeDir, ".config", "rustdesk", "RustDesk.toml"),
			"/etc/rustdesk/RustDesk2.toml",
			"/root/.config/rustdesk/RustDesk2.toml",
		}

		for _, p := range candidatePaths {
			if fileExists(p) {
				foundID := extractRustDeskIDFromTOML(p)
				if foundID != "" {
					id = foundID
					break
				}
			}
		}
	}

	if id == "" {
		return "", "not_installed"
	}

	// Check if process is running
	status := "installed"
	outProc, errProc := exec.Command("pgrep", "-f", "rustdesk").Output()
	if errProc == nil && strings.TrimSpace(string(outProc)) != "" {
		status = "online"
	}

	return id, status
}

func extractRustDeskIDFromTOML(filePath string) string {
	f, err := os.Open(filePath)
	if err != nil {
		return ""
	}
	defer f.Close()

	// Regex matching: id = '123456789' or id = "123456789"
	re := regexp.MustCompile(`(?i)^\s*id\s*=\s*['"]?([0-9a-zA-Z_\-]+)['"]?`)

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		matches := re.FindStringSubmatch(line)
		if len(matches) > 1 {
			return matches[1]
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("rustdesk collector: error scanning TOML config %s: %v", filePath, err)
	}
	return ""
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

