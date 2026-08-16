package collector

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// AnyDeskInfo holds AnyDesk telemetry info
type AnyDeskInfo struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// GetAnyDeskInfo detects AnyDesk ID and status on the current host (Windows or Linux)
func GetAnyDeskInfo() AnyDeskInfo {
	id := ""
	status := "not_installed"

	switch runtime.GOOS {
	case "windows":
		id, status = getWindowsAnyDesk()
	case "linux":
		id, status = getLinuxAnyDesk()
	}

	return AnyDeskInfo{
		ID:     id,
		Status: status,
	}
}

func getWindowsAnyDesk() (string, string) {
	id := ""
	status := "not_installed"

	programFiles := os.Getenv("ProgramFiles")
	programFilesX86 := os.Getenv("ProgramFiles(x86)")
	systemDrive := os.Getenv("SystemDrive")
	if systemDrive == "" {
		systemDrive = "C:"
	}
	programData := os.Getenv("ProgramData")

	// 1. Try reading system.conf from ProgramData
	if programData != "" {
		sysConf := filepath.Join(programData, "AnyDesk", "system.conf")
		if fileExists(sysConf) {
			status = "installed"
			id = parseAnyDeskConfFile(sysConf)
		}
	}

	// 2. Try CLI `anydesk.exe --get-id` if ID not found yet
	if id == "" {
		anydeskExes := []string{
			filepath.Join(programFiles, "AnyDesk", "anydesk.exe"),
			filepath.Join(programFilesX86, "AnyDesk", "anydesk.exe"),
			systemDrive + `\Program Files\AnyDesk\anydesk.exe`,
			systemDrive + `\Program Files (x86)\AnyDesk\anydesk.exe`,
			"anydesk.exe",
		}

		for _, exe := range anydeskExes {
			if exe != "" && (fileExists(exe) || exe == "anydesk.exe") {
				status = "installed"
				out, err := exec.Command(exe, "--get-id").Output()
				if err == nil {
					cleanOut := strings.TrimSpace(string(out))
					if cleanOut != "" && !strings.Contains(cleanOut, "is not recognized") && !strings.Contains(cleanOut, "Error") && len(cleanOut) >= 7 {
						id = cleanOut
						break
					}
				}
			}
		}
	}

	// 3. Fallback: Scan user AppData & User Profiles
	if id == "" {
		usersDir := systemDrive + `\Users`
		if entries, err := os.ReadDir(usersDir); err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					uName := entry.Name()
					if uName == "Public" || uName == "Default" || uName == "All Users" {
						continue
					}
					candidates := []string{
						filepath.Join(usersDir, uName, "AppData", "Roaming", "AnyDesk", "system.conf"),
						filepath.Join(usersDir, uName, "AppData", "Roaming", "AnyDesk", "user.conf"),
					}
					for _, cPath := range candidates {
						if fileExists(cPath) {
							if status == "not_installed" {
								status = "installed"
							}
							foundID := parseAnyDeskConfFile(cPath)
							if foundID != "" {
								id = foundID
								break
							}
						}
					}
					if id != "" {
						break
					}
				}
			}
		}
	}

	if id != "" {
		status = "online"
	}

	return id, status
}

func getLinuxAnyDesk() (string, string) {
	id := ""
	status := "not_installed"

	// 1. Check system config files
	sysConfigs := []string{
		"/etc/anydesk/system.conf",
		"/var/lib/anydesk/system.conf",
	}

	for _, conf := range sysConfigs {
		if fileExists(conf) {
			status = "installed"
			id = parseAnyDeskConfFile(conf)
			if id != "" {
				break
			}
		}
	}

	// 2. Try CLI `anydesk --get-id`
	if id == "" {
		if _, err := exec.LookPath("anydesk"); err == nil {
			status = "installed"
			out, err := exec.Command("anydesk", "--get-id").Output()
			if err == nil {
				cleanOut := strings.TrimSpace(string(out))
				if cleanOut != "" && !strings.Contains(cleanOut, "Error") && len(cleanOut) >= 7 {
					id = cleanOut
				}
			}
		}
	}

	// 3. Fallback: User home directory ~/.anydesk/
	if id == "" {
		homeDir, err := os.UserHomeDir()
		if err == nil {
			userConfigs := []string{
				filepath.Join(homeDir, ".anydesk", "system.conf"),
				filepath.Join(homeDir, ".anydesk", "user.conf"),
			}
			for _, conf := range userConfigs {
				if fileExists(conf) {
					if status == "not_installed" {
						status = "installed"
					}
					foundID := parseAnyDeskConfFile(conf)
					if foundID != "" {
						id = foundID
						break
					}
				}
			}
		}
	}

	if id != "" {
		status = "online"
	}

	return id, status
}

// Helper to parse ad.anynet.id or ad.anydesk.id from AnyDesk conf file
func parseAnyDeskConfFile(filePath string) string {
	f, err := os.Open(filePath)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		prefixes := []string{"ad.anynet.id=", "ad.anydesk.id=", "ad.anydesk.alias="}
		for _, prefix := range prefixes {
			if strings.HasPrefix(line, prefix) {
				val := strings.TrimPrefix(line, prefix)
				val = strings.TrimSpace(val)
				if val != "" {
					return val
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return ""
	}
	return ""
}
