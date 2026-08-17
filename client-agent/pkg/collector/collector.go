package collector

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// CollectTelemetry returns a telemetry snapshot.
func CollectTelemetry() map[string]interface{} {
	telemetry := map[string]interface{}{
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
		"os":          runtime.GOOS,
		"arch":        runtime.GOARCH,
		"active_user": getActiveUser(),
	}

	switch runtime.GOOS {
	case "windows":
		telemetry["cpu_percent"] = getWindowsCPU()
		telemetry["mem_percent"] = getWindowsMemory()
		telemetry["disk_usage"] = getWindowsDiskUsage()
		telemetry["cpu_temp"] = getWindowsTemperature()
		telemetry["disks"] = getWindowsDisksDetail()
		telemetry["services"] = getWindowsServices()
		telemetry["printers"] = getWindowsPrinters()
		telemetry["network"] = getWindowsNetwork()
		telemetry["erp_connectivity"] = checkERPConnectivity()
		telemetry["recent_events"] = getWindowsEventLogs()
		telemetry["apps"] = checkAppStatus()
	case "linux":
		telemetry["cpu_percent"] = getLinuxCPU()
		telemetry["mem_percent"] = getLinuxMemory()
		telemetry["disk_usage"] = getLinuxDiskUsage()
		telemetry["cpu_temp"] = getLinuxTemperature()
		telemetry["disks"] = getLinuxDisksDetail()
		telemetry["services"] = getLinuxServices()
		telemetry["printers"] = getLinuxPrinters()
		telemetry["network"] = getLinuxNetwork()
		telemetry["erp_connectivity"] = checkLinuxERPConnectivity()
		telemetry["recent_events"] = getLinuxEventLogs()
		telemetry["apps"] = checkLinuxAppStatus()
	default:
		// Mock for other OS for now
		telemetry["cpu_percent"] = 0
		telemetry["mem_percent"] = 0
		telemetry["disk_usage"] = 0
	}

	rustdeskInfo := GetRustDeskInfo()
	telemetry["rustdesk_id"] = rustdeskInfo.ID
	telemetry["rustdesk_status"] = rustdeskInfo.Status

	anydeskInfo := GetAnyDeskInfo()
	telemetry["anydesk_id"] = anydeskInfo.ID
	telemetry["anydesk_status"] = anydeskInfo.Status

	return telemetry
}

func getWindowsCPU() float64 {
	out, err := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average").Output()
	if err == nil {
		val, parseErr := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		if parseErr == nil && val >= 0 {
			return val
		}
	}

	outWmi, errWmi := exec.Command("wmic", "cpu", "get", "LoadPercentage").Output()
	if errWmi == nil {
		for _, line := range strings.Split(string(outWmi), "\n") {
			line = strings.TrimSpace(line)
			if val, parseErr := strconv.ParseFloat(line, 64); parseErr == nil {
				return val
			}
		}
	}
	return 0
}

func getWindowsMemory() float64 {
	cmd := `[Math]::Round(((Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize - (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory) / (Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize * 100, 2)`
	out, err := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd).Output()
	if err == nil {
		val, parseErr := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		if parseErr == nil && val > 0 {
			return val
		}
	}

	outFree, errF := exec.Command("wmic", "os", "get", "FreePhysicalMemory,TotalVisibleMemorySize", "/format:csv").Output()
	if errF == nil {
		lines := strings.Split(string(outFree), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "Node") {
				parts := strings.Split(line, ",")
				if len(parts) >= 3 {
					free, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
					total, _ := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
					if total > 0 {
						return (total - free) / total * 100.0
					}
				}
			}
		}
	}
	return 0
}

func getWindowsTemperature() float64 {
	// Try to get CPU temp via WMI (MsAcpi_ThermalZoneTemperature)
	// Note: Returns Kelvin * 10. Convert to Celsius.
	cmd := "(Get-CimInstance -Namespace root/wmi -ClassName MsAcpi_ThermalZoneTemperature).CurrentTemperature / 10 - 273.15"
	out, err := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
	if err != nil {
		return 0
	}
	val, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if val < 0 {
		return 0
	} // Handle empty/error values
	return val
}

func getWindowsDisksDetail() []map[string]interface{} {
	cmd := "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID, @{Name='FreeGB';Expression={[math]::Round($_.FreeSpace / 1GB, 2)}}, @{Name='SizeGB';Expression={[math]::Round($_.Size / 1GB, 2)}} | ConvertTo-Json"
	out, err := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
	if err != nil {
		return nil
	}
	return []map[string]interface{}{{"raw": string(out)}}
}

func getWindowsServices() []map[string]interface{} {
	// Monitor important services
	cmd := "Get-CimInstance Win32_Service -Filter \"Name IN ('Spooler', 'wuauserv')\" | Select-Object Name, State, Status | ConvertTo-Json"
	out, _ := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
	return []map[string]interface{}{{"raw": string(out)}}
}

func getWindowsPrinters() []map[string]interface{} {
	// Monitor HP and Epson printers
	cmd := "Get-CimInstance Win32_Printer | Where-Object { $_.Name -match 'HP|Epson' } | Select-Object Name, PrinterStatus, WorkOffline | ConvertTo-Json"
	out, _ := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
	return []map[string]interface{}{{"raw": string(out)}}
}

func getWindowsNetwork() map[string]interface{} {
	// Get network statistics
	cmdStats := "Get-NetAdapterStatistics | Select-Object Name, ReceivedBytes, SentBytes | ConvertTo-Json"
	outStats, _ := exec.Command("powershell", "-NoProfile", "-Command", cmdStats).Output()

	// Get IP addresses and DNS configurations
	cmdConfig := "Get-CimInstance Win32_NetworkAdapterConfiguration -Filter \"IPEnabled=True\" | Select-Object Description, IPAddress, DNSServerSearchOrder | ConvertTo-Json"
	outConfig, _ := exec.Command("powershell", "-NoProfile", "-Command", cmdConfig).Output()

	// Parse JSON outputs to maps for a cleaner telemetry payload
	var statsList []interface{}
	if len(outStats) > 0 {
		trimmed := strings.TrimSpace(string(outStats))
		if strings.HasPrefix(trimmed, "[") {
			_ = json.Unmarshal(outStats, &statsList)
		} else if strings.HasPrefix(trimmed, "{") {
			var statsObj map[string]interface{}
			if json.Unmarshal(outStats, &statsObj) == nil {
				statsList = append(statsList, statsObj)
			}
		}
	}

	// Since outConfig can be a single object or an array, we handle both
	var configData interface{}
	if len(outConfig) > 0 {
		if outConfig[0] == '[' {
			var configList []interface{}
			_ = json.Unmarshal(outConfig, &configList)
			configData = configList
		} else {
			var configObj map[string]interface{}
			_ = json.Unmarshal(outConfig, &configObj)
			configData = configObj
		}
	}

	return map[string]interface{}{
		"statistics":    statsList,
		"configuration": configData,
	}
}

func checkERPConnectivity() []map[string]interface{} {
	urls := []string{
		"http://cos.sams.id",
		"http://sales.sams.id",
		"http://absensi.sams.id",
		"http://karyawan.sams.id",
	}
	results := []map[string]interface{}{}
	for _, url := range urls {
		cmd := fmt.Sprintf("(Invoke-WebRequest -Uri %s -Method Head -TimeoutSec 2).StatusCode", url)
		out, err := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
		status := "UP"
		if err != nil {
			status = "DOWN"
		}
		results = append(results, map[string]interface{}{
			"url":    url,
			"status": status,
			"code":   strings.TrimSpace(string(out)),
		})
	}
	return results
}

func getWindowsEventLogs() []map[string]interface{} {
	// Get last 5 System errors
	cmd := "Get-WinEvent -LogName System -MaxEvents 5 | Where-Object { $_.LevelDisplayName -eq 'Error' } | Select-Object TimeCreated, Message | ConvertTo-Json"
	out, _ := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
	return []map[string]interface{}{{"raw": string(out)}}
}

func getBrowserURLsFromSQLite(dbPath string, isFirefox bool) []string {
	if dbPath == "" {
		return nil
	}
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil
	}

	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("h_browser_%d_%d.tmp", os.Getpid(), time.Now().UnixNano()))

	copyErr := func() error {
		in, err := os.Open(dbPath)
		if err != nil {
			return err
		}
		defer in.Close()

		out, err := os.Create(tmpFile)
		if err != nil {
			return err
		}
		defer out.Close()

		_, err = io.Copy(out, in)
		return err
	}()

	if copyErr != nil {
		cmd := exec.Command("cmd", "/c", "copy", "/y", fmt.Sprintf("%q", dbPath), fmt.Sprintf("%q", tmpFile))
		_ = cmd.Run()
	}

	defer os.Remove(tmpFile)

	db, err := sql.Open("sqlite", tmpFile)
	if err != nil {
		return nil
	}
	defer db.Close()

	var query string
	if isFirefox {
		query = "SELECT url, COALESCE(title, url), visit_date FROM moz_places JOIN moz_historyvisits ON moz_places.id = moz_historyvisits.place_id WHERE url LIKE 'http%' ORDER BY visit_date DESC LIMIT 5"
	} else {
		query = "SELECT url, COALESCE(title, url), last_visit_time FROM urls WHERE url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT 5"
	}

	rows, err := db.Query(query)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var results []string
	seen := make(map[string]bool)

	for rows.Next() {
		var u, title string
		var timestamp int64
		if err := rows.Scan(&u, &title, &timestamp); err == nil {
			if u != "" && !seen[u] {
				if strings.Contains(u, "google.com/chrome") || strings.Contains(u, "mozilla.org") || strings.Contains(u, "microsoft.com") || strings.Contains(u, "schema.org") || strings.Contains(u, "gstatic.com") || strings.Contains(u, "googleapis.com") || strings.Contains(u, "doubleclick.net") {
					continue
				}
				seen[u] = true
				cleanTitle := strings.TrimSpace(title)
				if cleanTitle == "" {
					cleanTitle = u
				}
				if strings.Contains(u, "portainer") {
					cleanTitle = "Portainer"
				} else if strings.Contains(u, "mikrotik") {
					cleanTitle = "Mikrotik Manager"
				} else if strings.Contains(u, "netmaker") {
					cleanTitle = "Netmaker"
				} else if strings.Contains(u, "web.whatsapp") {
					cleanTitle = "WhatsApp Web"
				} else if strings.Contains(u, "youtube") {
					cleanTitle = "YouTube"
				} else if strings.Contains(u, "zabbix") {
					cleanTitle = "Zabbix Dashboard"
				}
				results = append(results, fmt.Sprintf("%s (%s)", cleanTitle, u))
			}
		}
	}
	return results
}

func extractBrowserURLsWindows(appName string) string {
	pName := strings.ToLower(appName)
	isBrowser := false
	browsers := []string{"chrome", "firefox", "msedge", "edge", "brave", "opera", "operagx", "vivaldi", "chromium", "tor", "waterfox", "palemoon", "arc", "safari"}
	for _, b := range browsers {
		if strings.Contains(pName, b) {
			isBrowser = true
			break
		}
	}
	if !isBrowser {
		return ""
	}

	userProfile := os.Getenv("USERPROFILE")
	localAppData := os.Getenv("LOCALAPPDATA")
	appData := os.Getenv("APPDATA")

	userDirs := []string{userProfile}
	if sysDrive := os.Getenv("SystemDrive"); sysDrive != "" {
		usersParent := filepath.Join(sysDrive+"\\", "Users")
		if entries, err := os.ReadDir(usersParent); err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					name := entry.Name()
					if name != "Public" && name != "Default" && name != "All Users" && name != "desktop.ini" {
						userDirs = append(userDirs, filepath.Join(usersParent, name))
					}
				}
			}
		}
	}

	var candidates []string
	isFirefox := strings.Contains(pName, "firefox") || strings.Contains(pName, "waterfox") || strings.Contains(pName, "palemoon")

	for _, uDir := range userDirs {
		uLocal := filepath.Join(uDir, "AppData", "Local")
		uApp := filepath.Join(uDir, "AppData", "Roaming")
		if localAppData != "" && uDir == userProfile {
			uLocal = localAppData
		}
		if appData != "" && uDir == userProfile {
			uApp = appData
		}

		if strings.Contains(pName, "chrome") || strings.Contains(pName, "chromium") {
			candidates = append(candidates, filepath.Join(uLocal, "Google", "Chrome", "User Data", "Default", "History"))
			if profiles, err := filepath.Glob(filepath.Join(uLocal, "Google", "Chrome", "User Data", "Profile *", "History")); err == nil {
				candidates = append(candidates, profiles...)
			}
		}
		if strings.Contains(pName, "edge") || strings.Contains(pName, "msedge") {
			candidates = append(candidates, filepath.Join(uLocal, "Microsoft", "Edge", "User Data", "Default", "History"))
		}
		if strings.Contains(pName, "brave") {
			candidates = append(candidates, filepath.Join(uLocal, "BraveSoftware", "Brave-Browser", "User Data", "Default", "History"))
		}
		if strings.Contains(pName, "vivaldi") {
			candidates = append(candidates, filepath.Join(uLocal, "Vivaldi", "User Data", "Default", "History"))
		}
		if strings.Contains(pName, "opera") {
			candidates = append(candidates, filepath.Join(uApp, "Opera Software", "Opera Stable", "History"))
		}
		if isFirefox {
			if ffProfiles, err := filepath.Glob(filepath.Join(uApp, "Mozilla", "Firefox", "Profiles", "*", "places.sqlite")); err == nil {
				candidates = append(candidates, ffProfiles...)
			}
		}
	}

	var allURLs []string
	seen := make(map[string]bool)

	for _, path := range candidates {
		urls := getBrowserURLsFromSQLite(path, isFirefox)
		for _, u := range urls {
			if !seen[u] {
				seen[u] = true
				allURLs = append(allURLs, u)
			}
		}
		if len(allURLs) >= 5 {
			break
		}
	}

	if len(allURLs) == 0 {
		return ""
	}
	if len(allURLs) > 5 {
		allURLs = allURLs[:5]
	}

	return strings.Join(allURLs, " ;; ")
}

func checkAppStatus() []map[string]interface{} {
	psCmd := `$ignore = @('system', 'idle', 'svchost', 'csrss', 'wininit', 'services', 'lsass', 'smss', 'fontdrvhost', 'memory compression', 'registry', 'dwma', 'dwm', 'sihost', 'ctfmon', 'taskhostw', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'applicationframehost', 'conhost', 'textinputhost', 'msedgewebview2', 'smartscreen', 'securityhealthservice', 'wmiadap', 'wmiprvse', 'spoolsv', 'searchindexer', 'backgroundtaskhost', 'compil32', 'consent', 'audiodg'); $p1 = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -gt 0 -and ($_.MainWindowTitle -or $_.WorkingSet64 -gt 6MB) -and $ignore -notcontains $_.ProcessName.ToLower() }; $dict1 = @{}; foreach ($x in $p1) { $dict1[$x.Id] = $x.CPU }; Start-Sleep -Milliseconds 150; $p2 = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -gt 0 -and ($_.MainWindowTitle -or $_.WorkingSet64 -gt 6MB) -and $ignore -notcontains $_.ProcessName.ToLower() }; $allWindowProcs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }; $groups = $p2 | Group-Object ProcessName; $cores = [Environment]::ProcessorCount; if ($cores -lt 1) { $cores = 1 }; $results = @(); foreach ($g in $groups) { $pName = $g.Name.ToLower(); $ramMB = [math]::Round(($g.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1); $sumDelta = 0; foreach ($proc in $g.Group) { if ($dict1.ContainsKey($proc.Id) -and $proc.CPU -ge $dict1[$proc.Id]) { $sumDelta += ($proc.CPU - $dict1[$proc.Id]) } }; $cpu = [math]::Round(($sumDelta / (0.15 * $cores)) * 100, 1); if ($cpu -gt 99.9) { $cpu = 99.9 }; $count = $g.Count; $rawTitles = @(($allWindowProcs | Where-Object { $_.ProcessName.ToLower() -eq $pName } | Select-Object -ExpandProperty MainWindowTitle -Unique)); if ($rawTitles.Count -eq 0) { $rawTitles = @(($g.Group | Where-Object {$_.MainWindowTitle} | Select-Object -ExpandProperty MainWindowTitle -Unique)) }; $cleanTitles = @(); foreach ($t in $rawTitles) { if ($t) { $c = $t -replace '\s*[\-\—]\s*Mozilla Firefox$', '' -replace '\s*[\-\—]\s*Google Chrome$', '' -replace '\s*[\-\—]\s*Microsoft Edge$', '' -replace '\s*[\-\—]\s*Brave$', '' -replace '\s*[\-\—]\s*Opera$', '' -replace '\s*[\-\—]\s*Vivaldi$', ''; $c = $c.Trim(); if ($c -and $c -ne 'Firefox' -and $c -ne 'Mozilla Firefox' -and $c -ne 'Chrome' -and $c -ne 'Google Chrome' -and $c -ne 'Edge' -and $c -ne 'Brave' -and $c -ne 'Opera') { $cleanTitles += $c } } }; $titles = ($cleanTitles | Select-Object -Unique) -join ' ;; '; $ramStr = if ($ramMB -ge 1024) { "$([math]::Round($ramMB/1024, 2)) GB" } else { "$ramMB MB" }; $details = "RAM: $ramStr | CPU: $cpu% | Proc: $count"; if ($titles) { if ($pName -match 'terminal|powershell|cmd') { $details += " | CWD: $titles" } elseif ($pName -match 'antigravity|code') { $details += " | Workspace: $titles" } else { $details += " | Window: $titles" } }; $results += [PSCustomObject]@{ name = $pName; status = "RUNNING"; details = $details; ram = $ramMB }; }; $results | Sort-Object ram -Descending | Select-Object -First 25 | ConvertTo-Json -Compress`
	out, err := exec.Command("powershell", "-NoProfile", "-Command", psCmd).Output()
	results := []map[string]interface{}{}
	if err == nil && len(out) > 0 {
		var psItems []struct {
			Name    string  `json:"name"`
			Status  string  `json:"status"`
			Details string  `json:"details"`
			RAM     float64 `json:"ram"`
		}
		if json.Unmarshal(out, &psItems) == nil {
			for _, item := range psItems {
				details := item.Details
				pName := strings.ToLower(item.Name)
				// Native Go SQLite URL extraction for browsers if missing
				if !strings.Contains(details, "URLs:") {
					urlsStr := extractBrowserURLsWindows(pName)
					if urlsStr != "" {
						details += " | URLs: " + urlsStr
					}
				}
				results = append(results, map[string]interface{}{
					"name":    item.Name,
					"status":  item.Status,
					"details": details,
				})
			}
		}
	}
	return results
}

func getWindowsDiskUsage() float64 {
	cmd := "Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\" | ForEach-Object { [math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 2) }"
	out, err := exec.Command("powershell", "-NoProfile", "-Command", cmd).Output()
	if err != nil {
		return 0
	}
	val, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return val
}

func getLinuxCPU() float64 {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	lines := strings.Split(string(data), "\n")
	if len(lines) == 0 {
		return 0
	}
	fields := strings.Fields(lines[0])
	if len(fields) < 5 {
		return 0
	}
	var user, nice, system, idle, iowait, irq, softirq float64
	user, _ = strconv.ParseFloat(fields[1], 64)
	nice, _ = strconv.ParseFloat(fields[2], 64)
	system, _ = strconv.ParseFloat(fields[3], 64)
	idle, _ = strconv.ParseFloat(fields[4], 64)
	if len(fields) > 5 {
		iowait, _ = strconv.ParseFloat(fields[5], 64)
	}
	if len(fields) > 6 {
		irq, _ = strconv.ParseFloat(fields[6], 64)
	}
	if len(fields) > 7 {
		softirq, _ = strconv.ParseFloat(fields[7], 64)
	}

	totalIdle := idle + iowait
	totalActive := user + nice + system + irq + softirq
	total := totalIdle + totalActive

	time.Sleep(100 * time.Millisecond)

	data2, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0
	}
	lines2 := strings.Split(string(data2), "\n")
	if len(lines2) == 0 {
		return 0
	}
	fields2 := strings.Fields(lines2[0])
	if len(fields2) < 5 {
		return 0
	}
	var user2, nice2, system2, idle2, iowait2, irq2, softirq2 float64
	user2, _ = strconv.ParseFloat(fields2[1], 64)
	nice2, _ = strconv.ParseFloat(fields2[2], 64)
	system2, _ = strconv.ParseFloat(fields2[3], 64)
	idle2, _ = strconv.ParseFloat(fields2[4], 64)
	if len(fields2) > 5 {
		iowait2, _ = strconv.ParseFloat(fields2[5], 64)
	}
	if len(fields2) > 6 {
		irq2, _ = strconv.ParseFloat(fields2[6], 64)
	}
	if len(fields2) > 7 {
		softirq2, _ = strconv.ParseFloat(fields2[7], 64)
	}

	totalIdle2 := idle2 + iowait2
	totalActive2 := user2 + nice2 + system2 + irq2 + softirq2
	total2 := totalIdle2 + totalActive2

	diffIdle := totalIdle2 - totalIdle
	diffTotal := total2 - total

	if diffTotal == 0 {
		return 0
	}

	return (diffTotal - diffIdle) / diffTotal * 100
}

func getLinuxMemory() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	var total, free, available float64
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			total, _ = strconv.ParseFloat(fields[1], 64)
		case "MemFree:":
			free, _ = strconv.ParseFloat(fields[1], 64)
		case "MemAvailable:":
			available, _ = strconv.ParseFloat(fields[1], 64)
		}
	}
	if total == 0 {
		return 0
	}

	used := total - free
	if available > 0 {
		used = total - available
	}
	return (used / total) * 100
}

func getLinuxDiskUsage() float64 {
	out, err := exec.Command("df", "/").Output()
	if err != nil {
		return 0
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return 0
	}
	fields := strings.Fields(lines[1])
	if len(fields) < 5 {
		return 0
	}
	pctStr := strings.TrimSuffix(fields[4], "%")
	val, _ := strconv.ParseFloat(pctStr, 64)
	return val
}

func getLinuxTemperature() float64 {
	for i := 0; i < 10; i++ {
		path := fmt.Sprintf("/sys/class/thermal/thermal_zone%d/temp", i)
		data, err := os.ReadFile(path)
		if err == nil {
			val, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64)
			if err == nil {
				return val / 1000.0
			}
		}
	}
	return 0
}

func getLinuxDisksDetail() []map[string]interface{} {
	out, err := exec.Command("df", "-h").Output()
	if err != nil {
		return nil
	}
	return []map[string]interface{}{{"raw": string(out)}}
}

func getLinuxServices() []map[string]interface{} {
	out, err := exec.Command("systemctl", "status", "ssh", "cron").Output()
	if err != nil {
		out, _ = exec.Command("systemctl", "list-units", "--type=service", "--state=running", "--limit=10").Output()
	}
	return []map[string]interface{}{{"raw": string(out)}}
}

func getLinuxPrinters() []map[string]interface{} {
	out, err := exec.Command("lpstat", "-p").Output()
	if err != nil {
		return nil
	}
	return []map[string]interface{}{{"raw": string(out)}}
}

func getLinuxNetwork() map[string]interface{} {
	data, err := os.ReadFile("/proc/net/dev")
	var stats string
	if err == nil {
		stats = string(data)
	}

	outAddr, _ := exec.Command("ip", "addr").Output()

	return map[string]interface{}{
		"statistics":    stats,
		"configuration": string(outAddr),
	}
}

func checkLinuxERPConnectivity() []map[string]interface{} {
	urls := []string{
		"http://cos.sams.id",
		"http://sales.sams.id",
		"http://absensi.sams.id",
		"http://karyawan.sams.id",
	}
	results := []map[string]interface{}{}
	client := http.Client{
		Timeout: 2 * time.Second,
	}
	for _, url := range urls {
		resp, err := client.Head(url)
		status := "UP"
		code := "200"
		if err != nil {
			status = "DOWN"
			code = "0"
		} else {
			code = strconv.Itoa(resp.StatusCode)
			resp.Body.Close()
		}
		results = append(results, map[string]interface{}{
			"url":    url,
			"status": status,
			"code":   code,
		})
	}
	return results
}

func getLinuxEventLogs() []map[string]interface{} {
	out, err := exec.Command("journalctl", "-p", "err", "-n", "5", "--no-pager").Output()
	if err != nil {
		return nil
	}
	return []map[string]interface{}{{"raw": string(out)}}
}

func checkLinuxAppStatus() []map[string]interface{} {
	pyScript := `import subprocess, re, os, glob, sqlite3, shutil, json

IGNORE_LIST = {'systemd', 'kworker', 'dbus-daemon', 'dbus-session', 'pipewire', 'wireplumber', 'snapd', 'gdm', 'gdm-session-worker', 'polkitd', 'rsyslogd', 'networkmanager', 'avahi-daemon', 'udevd', 'cron', 'sshd-session', 'atd', 'acpid', 'thermald', 'irqbalance', 'upowerd', 'udisksd', 'wpa_supplicant', 'dbus', 'init', 'bash', 'sh', 'sleep', 'ps', 'grep', 'pgrep', 'python3', 'python', 'sudo', 'su', 'containerd', 'dockerd', 'agent-client', 'runc', 'cat', 'ls', 'awk', 'sed', 'cut', 'find'}

apps = {}
try:
    out = subprocess.check_output(['ps', '-e', '-o', 'comm=,pid=,rss=,%cpu=,user='], text=True)
    for line in out.strip().split('\n'):
        parts = line.split()
        if len(parts) >= 5:
            comm = parts[0].strip().lower()
            comm_clean = re.sub(r'[^a-z0-9_-]', '', comm)
            if not comm_clean or comm_clean in IGNORE_LIST or comm_clean.startswith('kworker') or comm_clean.startswith('systemd'):
                continue
            try:
                pid, rss, cpu, user = int(parts[1]), float(parts[2]), float(parts[3]), parts[4]
                if rss > 15360 or user != 'root' or comm_clean in ['docker', 'sshd', 'nginx', 'postgres', 'redis']:
                    if comm_clean not in apps:
                        apps[comm_clean] = {'name': comm_clean, 'pids': [], 'rss': 0.0, 'cpu': 0.0, 'user': user}
                    apps[comm_clean]['pids'].append(pid)
                    apps[comm_clean]['rss'] += rss
                    apps[comm_clean]['cpu'] += cpu
            except: pass
except: pass

home = os.path.expanduser('~')
results = []

for app_name, d in sorted(apps.items(), key=lambda x: x[1]['rss'], reverse=True)[:15]:
    ram_mb = d['rss'] / 1024.0
    ram_str = f"RAM: {ram_mb/1024.0:.2f} GB" if ram_mb >= 1024.0 else f"RAM: {ram_mb:.1f} MB"
    details = f"{ram_str} | CPU: {d['cpu']:.1f}% | Proc: {len(d['pids'])}"

    # Deep URL extraction for browsers
    if any(b in app_name for b in ['chrome', 'brave', 'opera', 'chromium', 'vivaldi', 'edge']):
        urls = []
        paths = glob.glob('/home/*/.config/BraveSoftware/Brave-Browser/**/History', recursive=True) + glob.glob('/home/*/.config/google-chrome/**/History', recursive=True) + glob.glob('/home/*/.config/opera/**/History', recursive=True) + glob.glob(home + '/.config/**/History', recursive=True)
        for p in set(paths):
            try:
                tmp = '/tmp/h_' + str(os.getpid()) + '_' + str(len(urls))
                shutil.copy(p, tmp)
                conn = sqlite3.connect(tmp)
                cur = conn.cursor()
                cur.execute("SELECT url, title, last_visit_time FROM urls WHERE url LIKE 'http%%' ORDER BY last_visit_time DESC LIMIT 5")
                for u, t, lvt in cur.fetchall():
                    if u and not any(x['url'] == u for x in urls):
                        urls.append({'url': u, 'title': t or u, 'lvt': lvt})
                conn.close()
                os.remove(tmp)
            except: pass
        urls.sort(key=lambda x: x['lvt'], reverse=True)
        if urls:
            url_strs = [f"{x['title']} ({x['url']})" for x in urls[:5]]
            details += " | URLs: " + " ;; ".join(url_strs)

    elif 'firefox' in app_name:
        urls = []
        paths = glob.glob('/home/*/.config/mozilla/firefox/**/places.sqlite', recursive=True) + glob.glob('/home/*/.mozilla/firefox/**/places.sqlite', recursive=True)
        for p in set(paths):
            try:
                tmp = '/tmp/ff_' + str(os.getpid()) + '_' + str(len(urls))
                shutil.copy(p, tmp)
                conn = sqlite3.connect(tmp)
                cur = conn.cursor()
                cur.execute("SELECT url, title, visit_date FROM moz_places JOIN moz_historyvisits ON moz_places.id = moz_historyvisits.place_id WHERE url LIKE 'http%%' ORDER BY visit_date DESC LIMIT 5")
                for u, t, vd in cur.fetchall():
                    if u and not any(x['url'] == u for x in urls):
                        urls.append({'url': u, 'title': t or u, 'lvt': vd})
                conn.close()
                os.remove(tmp)
            except: pass
        urls.sort(key=lambda x: x['lvt'], reverse=True)
        if urls:
            url_strs = [f"{x['title']} ({x['url']})" for x in urls[:5]]
            details += " | URLs: " + " ;; ".join(url_strs)

    elif any(t in app_name for t in ['terminal', 'ptyxis', 'alacritty', 'kitty', 'tilix', 'konsole']):
        try:
            cwd = os.readlink(f"/proc/{d['pids'][0]}/cwd")
            details += f" | CWD: {cwd}"
        except: pass

    elif any(i in app_name for i in ['antigravity', 'code', 'vscode', 'sublime', 'idea']):
        try:
            cwd = os.readlink(f"/proc/{d['pids'][0]}/cwd")
            details += f" | Workspace: {cwd}"
        except: pass

    elif app_name == 'docker':
        try:
            c_out = subprocess.check_output(['docker', 'ps', '--format', '{{.Names}}'], text=True).split()
            if c_out:
                c_str = ", ".join(c_out[:5])
                details += f" | Containers ({len(c_out)}): {c_str}"
        except: pass

    results.append({'name': app_name, 'status': 'RUNNING', 'details': details})

print(json.dumps(results))
`
	pyOut, pyErr := exec.Command("python3", "-c", pyScript).Output()
	results := []map[string]interface{}{}
	if pyErr == nil && len(pyOut) > 0 {
		json.Unmarshal(pyOut, &results)
	}
	return results
}

func getActiveUser() string {
	if runtime.GOOS == "windows" {
		out, err := exec.Command("powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).UserName").Output()
		if err == nil && len(out) > 0 {
			res := strings.TrimSpace(string(out))
			if idx := strings.Index(res, "\\"); idx != -1 {
				res = res[idx+1:]
			}
			if res != "" && !strings.EqualFold(res, "SYSTEM") && !strings.EqualFold(res, "LOCAL SERVICE") && !strings.EqualFold(res, "NETWORK SERVICE") {
				return res
			}
		}
		outQ, errQ := exec.Command("cmd", "/c", "quser").Output()
		if errQ == nil && len(outQ) > 0 {
			lines := strings.Split(string(outQ), "\n")
			for i, line := range lines {
				if i > 0 && strings.TrimSpace(line) != "" {
					fields := strings.Fields(line)
					if len(fields) > 0 {
						u := strings.TrimPrefix(fields[0], ">")
						if u != "" && !strings.EqualFold(u, "SYSTEM") {
							return u
						}
					}
				}
			}
		}
		if u := os.Getenv("USERNAME"); u != "" && !strings.EqualFold(u, "SYSTEM") && !strings.EqualFold(u, "LOCAL SERVICE") {
			return u
		}
	} else if runtime.GOOS == "linux" {
		// 1. Try active GUI process owner (gnome-shell, wayland, Xorg, etc.)
		outCmd1, err1 := exec.Command("sh", "-c", "ps aux 2>/dev/null | grep -E 'gnome-shell|wayland|Xorg|kwin|xfce4-session|cinnamon' | grep -v root | awk '{print $1}' | head -n 1").Output()
		if err1 == nil && len(strings.TrimSpace(string(outCmd1))) > 0 {
			return strings.TrimSpace(string(outCmd1))
		}

		// 2. Try loginctl desktop sessions for interactive non-root user
		outCmd2, err2 := exec.Command("sh", "-c", "loginctl list-sessions --no-legend 2>/dev/null | awk '$3 != \"root\" && $3 != \"\" {print $3}' | head -n 1").Output()
		if err2 == nil && len(strings.TrimSpace(string(outCmd2))) > 0 {
			return strings.TrimSpace(string(outCmd2))
		}

		// 3. Try who / w filtering out root
		outCmd3, err3 := exec.Command("sh", "-c", "who 2>/dev/null | awk '{print $1}' | grep -v 'root' | head -n 1").Output()
		if err3 == nil && len(strings.TrimSpace(string(outCmd3))) > 0 {
			return strings.TrimSpace(string(outCmd3))
		}

		// 4. Try logname if non-root
		outCmd4, err4 := exec.Command("logname").Output()
		if err4 == nil && len(strings.TrimSpace(string(outCmd4))) > 0 && strings.TrimSpace(string(outCmd4)) != "root" {
			return strings.TrimSpace(string(outCmd4))
		}

		// 5. Try checking non-root home directory
		outCmd5, err5 := exec.Command("sh", "-c", "ls -1 /home 2>/dev/null | grep -v lost+found | head -n 1").Output()
		if err5 == nil && len(strings.TrimSpace(string(outCmd5))) > 0 {
			return strings.TrimSpace(string(outCmd5))
		}

		if u := os.Getenv("USER"); u != "" && u != "root" {
			return u
		}
		if u := os.Getenv("LOGNAME"); u != "" && u != "root" {
			return u
		}
	}
	return ""
}
