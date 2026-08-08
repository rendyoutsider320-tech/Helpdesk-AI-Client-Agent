package collector

import (
	"bufio"
	"log"
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

	programFiles := os.Getenv("ProgramFiles")
	programFilesX86 := os.Getenv("ProgramFiles(x86)")
	systemDrive := os.Getenv("SystemDrive")
	if systemDrive == "" {
		systemDrive = "C:"
	}

	// 1. Try running CLI command rustdesk.exe --get-id directly from known install paths
	rustdeskExes := []string{
		filepath.Join(programFiles, "RustDesk", "rustdesk.exe"),
		filepath.Join(programFilesX86, "RustDesk", "rustdesk.exe"),
		systemDrive + `\Program Files\RustDesk\rustdesk.exe`,
		systemDrive + `\Program Files (x86)\RustDesk\rustdesk.exe`,
		"rustdesk.exe",
	}

	for _, exe := range rustdeskExes {
		if exe != "" && (fileExists(exe) || exe == "rustdesk.exe") {
			out, err := exec.Command(exe, "--get-id").Output()
			if err == nil {
				cleanOut := strings.TrimSpace(string(out))
				if cleanOut != "" && !strings.Contains(cleanOut, "is not recognized") && !strings.Contains(cleanOut, "Error") && len(cleanOut) >= 6 {
					id = cleanOut
					break
				}
			}
		}
	}

	// 2. Fallback: Search common RustDesk config TOML files on Windows
	if id == "" {
		appData := os.Getenv("APPDATA")
		localAppData := os.Getenv("LOCALAPPDATA")
		programData := os.Getenv("ProgramData")

		var candidatePaths []string

		// 1. Prioritize User Profile configs (C:\Users\*\AppData\...) -> GUI RustDesk ID shown in application
		if userMatches, err := filepath.Glob(systemDrive + `\Users\*\AppData\Roaming\RustDesk\config\RustDesk*.toml`); err == nil {
			candidatePaths = append(candidatePaths, userMatches...)
		}
		if userLocalMatches, err := filepath.Glob(systemDrive + `\Users\*\AppData\Local\RustDesk\config\RustDesk*.toml`); err == nil {
			candidatePaths = append(candidatePaths, userLocalMatches...)
		}
		if appData != "" {
			candidatePaths = append(candidatePaths,
				filepath.Join(appData, "RustDesk", "config", "RustDesk2.toml"),
				filepath.Join(appData, "RustDesk", "config", "RustDesk.toml"),
			)
		}
		if localAppData != "" {
			candidatePaths = append(candidatePaths,
				filepath.Join(localAppData, "RustDesk", "config", "RustDesk2.toml"),
			)
		}

		// 2. System Service Profile fallbacks
		candidatePaths = append(candidatePaths,
			filepath.Join(programData, "RustDesk", "config", "RustDesk2.toml"),
			filepath.Join(programData, "RustDesk", "config", "RustDesk.toml"),
			systemDrive+`\Windows\ServiceProfiles\LocalService\AppData\Roaming\RustDesk\config\RustDesk2.toml`,
			systemDrive+`\Windows\System32\config\systemprofile\AppData\Roaming\RustDesk\config\RustDesk2.toml`,
		)

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

	// 2. Fallback: Search Linux TOML config files across all users and system paths
	if id == "" {
		homeDir, _ := os.UserHomeDir()
		candidatePaths := []string{
			filepath.Join(homeDir, ".config", "rustdesk", "RustDesk2.toml"),
			filepath.Join(homeDir, ".config", "rustdesk", "RustDesk.toml"),
			"/etc/rustdesk/RustDesk2.toml",
			"/root/.config/rustdesk/RustDesk2.toml",
		}

		if linuxMatches, err := filepath.Glob("/home/*/.config/rustdesk/RustDesk*.toml"); err == nil {
			candidatePaths = append(candidatePaths, linuxMatches...)
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

