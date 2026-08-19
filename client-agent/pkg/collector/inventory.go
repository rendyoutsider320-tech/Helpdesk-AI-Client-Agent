package collector

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

type HardwareInfo struct {
	Hostname     string  `json:"hostname"`
	Manufacturer string  `json:"manufacturer"`
	Model        string  `json:"model"`
	SerialNumber string  `json:"serial_number"`
	CPU          string  `json:"cpu"`
	Cores        int     `json:"cores"`
	RAMTotalGB   float64 `json:"ram_total_gb"`
	OSName       string  `json:"os_name"`
	OSVersion    string  `json:"os_version"`
	IPAddress    string  `json:"ip_address"`
	MACAddress   string  `json:"mac_address"`
	DNSServers   string  `json:"dns_servers"`
	IPLan        string  `json:"ip_lan"`
	IPWifi       string  `json:"ip_wifi"`
}

type SoftwareInfo struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Publisher string `json:"publisher"`
}

type USBDeviceInfo struct {
	Name         string `json:"name"`
	DeviceID     string `json:"device_id"`
	VendorID     string `json:"vendor_id"`
	ProductID    string `json:"product_id"`
	SerialNumber string `json:"serial_number"`
	Class        string `json:"class"`
	Status       string `json:"status"`
}

// CollectInventory gathers hardware, software, and connected USB device details.
func CollectInventory() (HardwareInfo, []SoftwareInfo, []USBDeviceInfo) {
	hw := HardwareInfo{
		Hostname:  getHostname(),
		OSName:    runtime.GOOS,
		OSVersion: "unknown",
		Cores:     runtime.NumCPU(),
	}

	switch runtime.GOOS {
	case "windows":
		fillWindowsInventory(&hw)
	case "linux":
		fillLinuxInventory(&hw)
	}

	sw := collectSoftware()
	usb := collectUSBDevices()

	return hw, sw, usb
}

func getHostname() string {
	h, _ := os.Hostname()
	return h
}

func isGenericSerial(s string) bool {
	sLower := strings.ToLower(strings.TrimSpace(s))
	return sLower == "" || sLower == "0" || sLower == "none" ||
		strings.Contains(sLower, "to be filled") ||
		strings.Contains(sLower, "default string") ||
		strings.Contains(sLower, "system serial number") ||
		strings.Contains(sLower, "o.e.m")
}

func fillWindowsInventory(hw *HardwareInfo) {
	// 1. Manufacturer & Model (ComputerSystem -> BaseBoard fallback)
	out, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model | ConvertTo-Json").Output()
	var cs map[string]interface{}
	_ = json.Unmarshal(out, &cs)
	if cs["Manufacturer"] != nil {
		hw.Manufacturer = strings.TrimSpace(cs["Manufacturer"].(string))
	}
	if cs["Model"] != nil {
		hw.Model = strings.TrimSpace(cs["Model"].(string))
	}

	if isGenericSerial(hw.Manufacturer) || hw.Manufacturer == "" {
		outWmi, _ := exec.Command("wmic", "baseboard", "get", "Manufacturer").Output()
		for _, line := range strings.Split(string(outWmi), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line != "Manufacturer" && !isGenericSerial(line) {
				hw.Manufacturer = line
				break
			}
		}
	}

	if isGenericSerial(hw.Model) || hw.Model == "" {
		outWmi, _ := exec.Command("wmic", "baseboard", "get", "Product").Output()
		for _, line := range strings.Split(string(outWmi), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line != "Product" && !isGenericSerial(line) {
				hw.Model = line
				break
			}
		}
	}

	// 2. Deep Serial Number (BIOS -> BaseBoard -> CSProduct UUID)
	serial := ""
	outWmiBios, _ := exec.Command("wmic", "bios", "get", "serialnumber").Output()
	for _, line := range strings.Split(string(outWmiBios), "\n") {
		line = strings.TrimSpace(line)
		if line != "" && line != "SerialNumber" && !isGenericSerial(line) {
			serial = line
			break
		}
	}
	if serial == "" {
		outWmiBb, _ := exec.Command("wmic", "baseboard", "get", "serialnumber").Output()
		for _, line := range strings.Split(string(outWmiBb), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line != "SerialNumber" && !isGenericSerial(line) {
				serial = line
				break
			}
		}
	}
	if serial == "" {
		outWmiCs, _ := exec.Command("wmic", "csproduct", "get", "IdentifyingNumber").Output()
		for _, line := range strings.Split(string(outWmiCs), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line != "IdentifyingNumber" && !isGenericSerial(line) {
				serial = line
				break
			}
		}
	}
	if serial == "" {
		outPsSer, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "(Get-CimInstance Win32_Bios).SerialNumber").Output()
		psSer := strings.TrimSpace(string(outPsSer))
		if !isGenericSerial(psSer) {
			serial = psSer
		}
	}
	if serial == "" {
		outWmiUuid, _ := exec.Command("wmic", "csproduct", "get", "UUID").Output()
		for _, line := range strings.Split(string(outWmiUuid), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && line != "UUID" {
				serial = line
				break
			}
		}
	}
	hw.SerialNumber = serial

	// 3. CPU Friendly Name (wmic / CIM)
	cpuName := ""
	outWmi, _ := exec.Command("wmic", "cpu", "get", "name").Output()
	lines := strings.Split(string(outWmi), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && line != "Name" {
			cpuName = line
			break
		}
	}
	if cpuName == "" {
		outPs, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "(Get-CimInstance Win32_Processor).Name").Output()
		cpuName = strings.TrimSpace(string(outPs))
	}
	if cpuName == "" || strings.HasPrefix(cpuName, "AMD64 Family") || strings.HasPrefix(cpuName, "Intel64 Family") {
		if cpuEnv := os.Getenv("PROCESSOR_IDENTIFIER"); cpuEnv != "" && !strings.HasPrefix(cpuEnv, "AMD64 Family") && !strings.HasPrefix(cpuEnv, "Intel64 Family") {
			cpuName = cpuEnv
		}
	}
	hw.CPU = cpuName

	// 4. RAM Total GB (Sum of all Physical RAM Sticks)
	var totalRamGB float64
	psRamCmd := `[Math]::Round(((Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum).Sum / 1GB), 2)`
	outPsRam, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psRamCmd).Output()
	totalRamGB, _ = strconv.ParseFloat(strings.TrimSpace(string(outPsRam)), 64)

	if totalRamGB == 0 {
		outWmiMem, _ := exec.Command("wmic", "memorychip", "get", "capacity").Output()
		linesMem := strings.Split(string(outWmiMem), "\n")
		var totalBytes float64
		for _, line := range linesMem {
			line = strings.TrimSpace(line)
			if bytesVal, err := strconv.ParseFloat(line, 64); err == nil && bytesVal > 0 {
				totalBytes += bytesVal
			}
		}
		if totalBytes > 0 {
			totalRamGB = totalBytes / (1024.0 * 1024.0 * 1024.0)
		}
	}

	if totalRamGB == 0 {
		outWmiCS, _ := exec.Command("wmic", "computersystem", "get", "TotalPhysicalMemory").Output()
		linesCS := strings.Split(string(outWmiCS), "\n")
		for _, line := range linesCS {
			line = strings.TrimSpace(line)
			if bytesVal, err := strconv.ParseFloat(line, 64); err == nil && bytesVal > 0 {
				totalRamGB = bytesVal / (1024.0 * 1024.0 * 1024.0)
				break
			}
		}
	}
	hw.RAMTotalGB = totalRamGB

	// 5. Deep OS Name & Version (Registry + CIM + WMIC)
	psOSCmd := `$reg = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'; ` +
		`$name = $reg.ProductName; ` +
		`$dispVer = $reg.DisplayVersion; if (-not $dispVer) { $dispVer = $reg.ReleaseId }; ` +
		`$build = $reg.CurrentBuildNumber; if (-not $build) { $build = $reg.CurrentBuild }; ` +
		`if ([int]$build -ge 22000 -and $name -like "*Windows 10*") { $name = $name -replace "Windows 10", "Windows 11" }; ` +
		`$ubr = $reg.UBR; ` +
		`$arch = (Get-CimInstance Win32_OperatingSystem).OSArchitecture; ` +
		`@{ ProductName = "$name"; DisplayVersion = "$dispVer"; Build = "$build"; UBR = "$ubr"; Architecture = "$arch" } | ConvertTo-Json`

	outOS, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psOSCmd).Output()
	var osInfo map[string]interface{}
	if json.Unmarshal(outOS, &osInfo) == nil {
		prodName, _ := osInfo["ProductName"].(string)
		dispVer, _ := osInfo["DisplayVersion"].(string)
		build, _ := osInfo["Build"].(string)
		ubr, _ := osInfo["UBR"].(string)
		arch, _ := osInfo["Architecture"].(string)

		buildNum, _ := strconv.Atoi(build)
		if buildNum >= 22000 && strings.Contains(prodName, "Windows 10") {
			prodName = strings.Replace(prodName, "Windows 10", "Windows 11", 1)
		}

		if prodName != "" {
			osFull := prodName
			if dispVer != "" {
				osFull += " " + dispVer
			}
			hw.OSName = strings.TrimSpace(osFull)
		}

		verFull := ""
		if build != "" {
			verFull = build
			if ubr != "" && ubr != "0" {
				verFull += "." + ubr
			}
		}
		if arch != "" {
			if verFull != "" {
				verFull += " (" + arch + ")"
			} else {
				verFull = arch
			}
		}
		if verFull != "" {
			hw.OSVersion = strings.TrimSpace(verFull)
		}
	}

	if hw.OSName == "" || hw.OSName == "windows" {
		outWmiOS, _ := exec.Command("wmic", "os", "get", "Caption,Version,OSArchitecture", "/format:csv").Output()
		linesOS := strings.Split(string(outWmiOS), "\n")
		for _, line := range linesOS {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "Node") {
				parts := strings.Split(line, ",")
				if len(parts) >= 4 {
					osName := strings.TrimSpace(parts[1])
					verStr := strings.TrimSpace(parts[3])
					// Check build number from version string (e.g. 10.0.22000)
					if strings.Contains(osName, "Windows 10") {
						vParts := strings.Split(verStr, ".")
						if len(vParts) >= 3 {
							if bNum, _ := strconv.Atoi(vParts[2]); bNum >= 22000 {
								osName = strings.Replace(osName, "Windows 10", "Windows 11", 1)
							}
						}
					}
					hw.OSName = osName
					hw.OSVersion = fmt.Sprintf("%s (%s)", verStr, strings.TrimSpace(parts[2]))
				}
			}
		}
	}

	if strings.Contains(hw.OSName, "Windows 10") && strings.Contains(hw.OSVersion, "26200") {
		hw.OSName = strings.Replace(hw.OSName, "Windows 10", "Windows 11", 1)
	}

	// 6. Network IP, MAC, DNS, LAN/WiFi
	fillWindowsNetwork(hw)
}

func isVirtualAdapter(name, desc string) bool {
	combined := strings.ToLower(name + " " + desc)
	virtualKeywords := []string{
		"vmware", "virtualbox", "vbox", "hyper-v", "vethernet", "virtual",
		"tap-", "tun-", "wsl", "vpn", "zerotier", "tailscale", "hamachi",
		"bluetooth", "loopback", "host-only", "pseudo", "npcap", "pcap",
	}
	for _, kw := range virtualKeywords {
		if strings.Contains(combined, kw) {
			return true
		}
	}
	return false
}

func fillWindowsNetwork(hw *HardwareInfo) {
	// 1. Fast Native Go Interface Inspection (0ms latency, zero delay for Wi-Fi & LAN IPs)
	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}

			nameLower := strings.ToLower(iface.Name)
			if isVirtualAdapter(nameLower, "") {
				continue
			}

			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}

			for _, addr := range addrs {
				ipnet, ok := addr.(*net.IPNet)
				if !ok || ipnet.IP.IsLoopback() {
					continue
				}

				ip4 := ipnet.IP.To4()
				if ip4 == nil {
					continue
				}

				ipStr := ip4.String()
				if strings.HasPrefix(ipStr, "169.254.") || strings.HasPrefix(ipStr, "127.") {
					continue
				}

				if strings.Contains(nameLower, "wi-fi") || strings.Contains(nameLower, "wifi") || strings.Contains(nameLower, "wlan") || strings.Contains(nameLower, "wireless") {
					if hw.IPWifi == "" {
						hw.IPWifi = ipStr
					}
				} else {
					if hw.IPLan == "" {
						hw.IPLan = ipStr
					}
				}

				if hw.IPAddress == "" {
					hw.IPAddress = ipStr
					hw.MACAddress = iface.HardwareAddr.String()
				}
			}
		}
	}

	if hw.IPAddress != "" {
		return
	}

	psCmd := `$result = @{ ip_lan = ""; ip_wifi = ""; ip_address = ""; mac_address = ""; dns_servers = "" }; ` +
		`$configs = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPAddress -ne $null -and $_.IPEnabled -eq $true }; ` +
		`$dns = ""; ` +
		`foreach ($c in $configs) { ` +
		`    $a = Get-CimInstance Win32_NetworkAdapter -Filter "InterfaceIndex=$($c.InterfaceIndex)"; ` +
		`    if ($a -and $a.NetConnectionStatus -eq 2) { ` +
		`        $desc = if ($a.Description) { $a.Description.ToLower() } else { "" }; ` +
		`        $name = if ($a.Name) { $a.Name.ToLower() } else { "" }; ` +
		`        $connId = if ($a.NetConnectionID) { $a.NetConnectionID.ToLower() } else { "" }; ` +
		`        if ($desc -like "*vmware*" -or $desc -like "*virtualbox*" -or $desc -like "*hyper-v*" -or $desc -like "*vethernet*" -or $desc -like "*virtual*" -or $desc -like "*tap-*" -or $desc -like "*vpn*" -or $desc -like "*zerotier*" -or $desc -like "*tailscale*" -or $desc -like "*bluetooth*" -or $connId -like "*vmnet*" -or $connId -like "*vbox*") { continue; } ` +
		`        $ip = $c.IPAddress | Where-Object { $_ -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' -and $_ -ne '127.0.0.1' -and $_ -notlike '169.254.*' -and $_ -notlike '192.168.192.*' } | Select-Object -First 1; ` +
		`        if ($ip) { ` +
		`            if ($connId -like "*wi-fi*" -or $connId -like "*wireless*" -or $desc -like "*wireless*" -or $desc -like "*wi-fi*") { ` +
		`                if (-not $result.ip_wifi) { $result.ip_wifi = $ip } ` +
		`            } else { ` +
		`                if (-not $result.ip_lan) { $result.ip_lan = $ip } ` +
		`            } ` +
		`            if (-not $result.ip_address) { ` +
		`                $result.ip_address = $ip; ` +
		`                $result.mac_address = $a.MACAddress; ` +
		`            } ` +
		`            if ($c.DNSServerSearchOrder) { ` +
		`                $dns = $c.DNSServerSearchOrder -join ", "; ` +
		`            } ` +
		`        } ` +
		`    } ` +
		`}; ` +
		`$result.dns_servers = $dns; ` +
		`$result | ConvertTo-Json`

	outNet, err := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCmd).Output()
	if err == nil {
		var netCfg struct {
			IPAddress  string `json:"ip_address"`
			MACAddress string `json:"mac_address"`
			DNSServers string `json:"dns_servers"`
			IPLan      string `json:"ip_lan"`
			IPWifi     string `json:"ip_wifi"`
		}
		if json.Unmarshal(outNet, &netCfg) == nil {
			hw.IPAddress = netCfg.IPAddress
			hw.MACAddress = netCfg.MACAddress
			hw.DNSServers = netCfg.DNSServers
			hw.IPLan = netCfg.IPLan
			hw.IPWifi = netCfg.IPWifi
		}
	}

	// Go native net.Interfaces() fallback filtering out virtual adapters
	if hw.IPAddress == "" || (hw.IPLan == "" && hw.IPWifi == "") {
		interfaces, err := net.Interfaces()
		if err == nil {
			for _, iface := range interfaces {
				name := strings.ToLower(iface.Name)
				if (iface.Flags&net.FlagLoopback) != 0 || (iface.Flags&net.FlagUp) == 0 || isVirtualAdapter(name, "") {
					continue
				}
				addrs, err := iface.Addrs()
				if err != nil {
					continue
				}
				for _, addr := range addrs {
					var ip net.IP
					switch v := addr.(type) {
					case *net.IPNet:
						ip = v.IP
					case *net.IPAddr:
						ip = v.IP
					}
					if ip == nil || ip.IsLoopback() {
						continue
					}
					ip4 := ip.To4()
					if ip4 == nil || strings.HasPrefix(ip4.String(), "169.254.") || strings.HasPrefix(ip4.String(), "192.168.192.") {
						continue
					}

					ipStr := ip4.String()
					isWifi := strings.Contains(name, "wi-fi") || strings.Contains(name, "wireless") || strings.Contains(name, "wlan")

					if isWifi {
						if hw.IPWifi == "" {
							hw.IPWifi = ipStr
						}
					} else {
						if hw.IPLan == "" {
							hw.IPLan = ipStr
						}
					}

					if hw.IPAddress == "" {
						hw.IPAddress = ipStr
						hw.MACAddress = iface.HardwareAddr.String()
					}
				}
			}
		}
	}
}

func fillLinuxInventory(hw *HardwareInfo) {
	// OS Name & Version from /etc/os-release
	if osName, osVer := getLinuxOSInfo(); osName != "" {
		hw.OSName = osName
		hw.OSVersion = osVer
	}

	// CPU Model Name
	hw.CPU = getLinuxCPUModel()

	// RAM Total GB
	hw.RAMTotalGB = getLinuxRAMTotal()

	// Serial Number & Manufacturer & Model from /sys/class/dmi/id/
	hw.SerialNumber = getLinuxDMIField("product_serial")
	hw.Manufacturer = getLinuxDMIField("sys_vendor")
	hw.Model = getLinuxDMIField("product_name")

	// Network LAN & WiFi IP/MAC
	fillLinuxNetwork(hw)

	// DNS Servers
	hw.DNSServers = getLinuxDNS()
}

func getLinuxOSInfo() (string, string) {
	name := "Linux"
	version := "unknown"
	data, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return name, version
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			val := strings.Trim(line[len("PRETTY_NAME="):], "\"")
			name = val
		} else if strings.HasPrefix(line, "VERSION_ID=") {
			val := strings.Trim(line[len("VERSION_ID="):], "\"")
			version = val
		}
	}
	return name, version
}

func getLinuxCPUModel() string {
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		return "Unknown CPU"
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.Contains(line, "model name") {
			parts := strings.Split(line, ":")
			if len(parts) >= 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "Unknown CPU"
}

func getLinuxRAMTotal() float64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				valKb, err := strconv.ParseFloat(fields[1], 64)
				if err == nil {
					// Convert kB to GB
					return valKb / (1024.0 * 1024.0)
				}
			}
		}
	}
	return 0
}

func getLinuxDMIField(field string) string {
	path := filepath.Join("/sys/class/dmi/id", field)
	data, err := os.ReadFile(path)
	if err == nil {
		return strings.TrimSpace(string(data))
	}
	return ""
}

func fillLinuxNetwork(hw *HardwareInfo) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return
	}
	for _, iface := range interfaces {
		name := strings.ToLower(iface.Name)
		if (iface.Flags & net.FlagLoopback) != 0 || (iface.Flags & net.FlagUp) == 0 ||
			strings.HasPrefix(name, "docker") || strings.HasPrefix(name, "veth") || strings.HasPrefix(name, "br-") {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil {
				continue
			}

			ipStr := ip4.String()

			// Categorize as Wifi or LAN
			isWifi := strings.HasPrefix(name, "wl") || strings.Contains(name, "wifi") || strings.Contains(name, "wlan")
			isLan := strings.HasPrefix(name, "en") || strings.HasPrefix(name, "eth") || strings.HasPrefix(name, "ib")

			if isWifi {
				if hw.IPWifi == "" {
					hw.IPWifi = ipStr
				}
			} else if isLan {
				if hw.IPLan == "" {
					hw.IPLan = ipStr
				}
			}

			if hw.IPAddress == "" {
				hw.IPAddress = ipStr
				hw.MACAddress = iface.HardwareAddr.String()
			}
		}
	}

	if hw.IPAddress == "" {
		if hw.IPLan != "" {
			hw.IPAddress = hw.IPLan
		} else if hw.IPWifi != "" {
			hw.IPAddress = hw.IPWifi
		}
	}
}

func getLinuxDNS() string {
	data, err := os.ReadFile("/etc/resolv.conf")
	if err != nil {
		return ""
	}
	var dns []string
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "nameserver ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				dns = append(dns, parts[1])
			}
		}
	}
	return strings.Join(dns, ", ")
}

func collectSoftware() []SoftwareInfo {
	switch runtime.GOOS {
	case "windows":
		psCmd := `$paths = @(` +
			`'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', ` +
			`'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', ` +
			`'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'` +
			`); ` +
			`Get-ItemProperty $paths -ErrorAction SilentlyContinue | ` +
			`Where-Object { $_.DisplayName -and $_.DisplayName.ToString().Trim() -ne '' } | ` +
			`Select-Object @{N='DisplayName';E={$_.DisplayName.ToString().Trim()}}, @{N='DisplayVersion';E={if($_.DisplayVersion){$_.DisplayVersion.ToString()}else{''}}}, @{N='Publisher';E={if($_.Publisher){$_.Publisher.ToString()}else{''}}} | ` +
			`ConvertTo-Json -Compress`

		out, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCmd).Output()

		var list []map[string]interface{}
		if len(out) > 0 {
			trimmed := strings.TrimSpace(string(out))
			if strings.HasPrefix(trimmed, "[") {
				_ = json.Unmarshal(out, &list)
			} else if strings.HasPrefix(trimmed, "{") {
				var item map[string]interface{}
				if json.Unmarshal(out, &item) == nil {
					list = append(list, item)
				}
			}
		}

		softwareMap := make(map[string]SoftwareInfo)
		for _, item := range list {
			name, _ := item["DisplayName"].(string)
			version, _ := item["DisplayVersion"].(string)
			pub, _ := item["Publisher"].(string)
			name = strings.TrimSpace(name)
			if name != "" {
				softwareMap[name] = SoftwareInfo{Name: name, Version: version, Publisher: pub}
			}
		}

		// WMIC fallback if registry scan returned empty
		if len(softwareMap) == 0 {
			outWmi, err := exec.Command("wmic", "product", "get", "Name,Version,Vendor", "/format:csv").Output()
			if err == nil {
				lines := strings.Split(string(outWmi), "\n")
				for _, line := range lines {
					line = strings.TrimSpace(line)
					if line == "" || strings.HasPrefix(line, "Node") {
						continue
					}
					parts := strings.Split(line, ",")
					if len(parts) >= 4 {
						name := strings.TrimSpace(parts[1])
						vendor := strings.TrimSpace(parts[2])
						version := strings.TrimSpace(parts[3])
						if name != "" {
							softwareMap[name] = SoftwareInfo{Name: name, Version: version, Publisher: vendor}
						}
					}
				}
			}
		}

		software := make([]SoftwareInfo, 0, len(softwareMap))
		for _, info := range softwareMap {
			software = append(software, info)
		}
		return software
	case "linux":
		// Get installed software on Debian/Ubuntu systems using dpkg-query
		out, err := exec.Command("dpkg-query", "-W", "-f=${Package}\t${Version}\t${Maintainer}\n").Output()
		if err != nil {
			return nil
		}
		software := make([]SoftwareInfo, 0)
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.Split(line, "\t")
			if len(parts) >= 2 {
				name := parts[0]
				version := parts[1]
				pub := ""
				if len(parts) >= 3 {
					pub = parts[2]
				}
				software = append(software, SoftwareInfo{
					Name:      name,
					Version:   version,
					Publisher: pub,
				})
			}
		}
		return software
	}

	return nil
}

// FillNetworkInfo populates only the network fields of HardwareInfo.
func FillNetworkInfo(hw *HardwareInfo) {
	switch runtime.GOOS {
	case "windows":
		fillWindowsNetwork(hw)
	case "linux":
		fillLinuxNetwork(hw)
	}
}

func collectUSBDevices() []USBDeviceInfo {
	switch runtime.GOOS {
	case "windows":
		return collectWindowsUSB()
	case "linux":
		return collectLinuxUSB()
	}
	return nil
}

func collectWindowsUSB() []USBDeviceInfo {
	psCmd := `$devices = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Present -ne $false -and $_.Name -and ( ` +
		`$_.PNPDeviceID -like 'USB\*' -or ` +
		`$_.PNPDeviceID -like 'USBSTOR\*' -or ` +
		`$_.PNPDeviceID -like 'USBPRINT\*' -or ` +
		`$_.PNPDeviceID -like 'WPD\*' -or ` +
		`$_.PNPDeviceID -like 'HID\VID_*' -or ` +
		`($_.Service -and $_.Service -like '*usb*') ` +
		`) }; ` +
		`$raw = @(); ` +
		`foreach ($d in $devices) { ` +
		`    if (-not $d.Name) { continue; } ` +
		`    $name = $d.Name.ToString().Trim(); ` +
		`    $pnpId = if ($d.PNPDeviceID) { $d.PNPDeviceID.ToString() } else { "" }; ` +
		`    if ($name -like "*Root Hub*" -or $name -like "*Host Controller*" -or $name -like "*Generic USB Hub*" -or $name -like "*Composite Device*" -or $name -like "*PCI Express*" -or $name -like "*Direct Memory Access*" -or $name -like "*HID-compliant*" -or $name -like "*Intel*Bluetooth*" -or $pnpId -like "SWD\*" -or $pnpId -like "ROOT\*") { continue; } ` +
		`    if (($pnpId -like "SCSI\*" -or $pnpId -like "IDE\*" -or $pnpId -like "NVME\*") -and $pnpId -notlike "*USB*") { continue; } ` +
		`    $vid = ""; $pid = ""; ` +
		`    if ($pnpId -match 'VID_([0-9A-Fa-f]{4})') { $vid = $Matches[1] } ` +
		`    if ($pnpId -match 'PID_([0-9A-Fa-f]{4})') { $pid = $Matches[1] } ` +
		`    $pnpClass = if ($d.PNPClass) { $d.PNPClass.ToString() } else { "USB Device" }; ` +
		`    $status = if ($d.Status) { $d.Status.ToString() } else { "OK" }; ` +
		`    $raw += @{ ` +
		`        name = $name; ` +
		`        device_id = $pnpId; ` +
		`        vendor_id = $vid; ` +
		`        product_id = $pid; ` +
		`        serial_number = ""; ` +
		`        class = $pnpClass; ` +
		`        status = $status ` +
		`    }; ` +
		`}; ` +
		`$vidsWithSpecific = @(); ` +
		`foreach ($r in $raw) { ` +
		`    if ($r.name -ne "HID Keyboard Device" -and $r.vendor_id) { ` +
		`        $vidsWithSpecific += ($r.vendor_id + "_" + $r.product_id); ` +
		`    } ` +
		`}; ` +
		`$result = @(); ` +
		`foreach ($r in $raw) { ` +
		`    $key = $r.vendor_id + "_" + $r.product_id; ` +
		`    if ($r.name -eq "HID Keyboard Device" -and $vidsWithSpecific -contains $key) { continue; } ` +
		`    $result += $r; ` +
		`}; ` +
		`$result | ConvertTo-Json -Compress`

	out, _ := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCmd).Output()

	var list []map[string]interface{}
	if len(out) > 0 {
		trimmed := strings.TrimSpace(string(out))
		if strings.HasPrefix(trimmed, "[") {
			_ = json.Unmarshal(out, &list)
		} else if strings.HasPrefix(trimmed, "{") {
			var item map[string]interface{}
			if json.Unmarshal(out, &item) == nil {
				list = append(list, item)
			}
		}
	}

	usbList := make([]USBDeviceInfo, 0)
	for _, item := range list {
		name, _ := item["name"].(string)
		deviceID, _ := item["device_id"].(string)
		vid, _ := item["vendor_id"].(string)
		pid, _ := item["product_id"].(string)
		cls, _ := item["class"].(string)
		status, _ := item["status"].(string)

		if name != "" {
			usbList = append(usbList, USBDeviceInfo{
				Name:      name,
				DeviceID:  deviceID,
				VendorID:  vid,
				ProductID: pid,
				Class:     cls,
				Status:    status,
			})
		}
	}
	return usbList
}

func collectLinuxUSB() []USBDeviceInfo {
	usbList := make([]USBDeviceInfo, 0)
	seenKeys := make(map[string]bool)

	getClassString := func(classCode string, name string) string {
		cls := strings.TrimLeft(strings.ToLower(classCode), "0x")
		switch cls {
		case "7", "07":
			return "Printer"
		case "8", "08":
			return "Mass Storage"
		case "3", "03":
			return "Human Interface Device"
		case "2", "02", "a", "0a":
			return "Communications / Serial"
		case "e", "0e", "6", "06":
			return "Imaging / Camera"
		case "e0":
			return "Bluetooth"
		}
		nameLower := strings.ToLower(name)
		if strings.Contains(nameLower, "printer") || strings.Contains(nameLower, "epson") || strings.Contains(nameLower, "pos") || strings.Contains(nameLower, "thermal") {
			return "Printer"
		}
		if strings.Contains(nameLower, "storage") || strings.Contains(nameLower, "flash") || strings.Contains(nameLower, "disk") || strings.Contains(nameLower, "drive") {
			return "Mass Storage"
		}
		if strings.Contains(nameLower, "mouse") || strings.Contains(nameLower, "keyboard") || strings.Contains(nameLower, "barcode") || strings.Contains(nameLower, "scanner") {
			return "Human Interface Device"
		}
		return "USB Device"
	}

	// 1. Scan /sys/bus/usb/devices
	devicesDir := "/sys/bus/usb/devices"
	if files, err := os.ReadDir(devicesDir); err == nil {
		for _, file := range files {
			fname := file.Name()
			if strings.Contains(fname, ":") || strings.HasPrefix(fname, "usb") {
				continue
			}

			devPath := filepath.Join(devicesDir, fname)

			vid := ""
			if vData, errV := os.ReadFile(filepath.Join(devPath, "idVendor")); errV == nil {
				vid = strings.TrimSpace(string(vData))
			}

			pid := ""
			if pData, errP := os.ReadFile(filepath.Join(devPath, "idProduct")); errP == nil {
				pid = strings.TrimSpace(string(pData))
			}

			if vid == "1d6b" {
				continue
			}

			manufacturer := ""
			if mData, errM := os.ReadFile(filepath.Join(devPath, "manufacturer")); errM == nil {
				manufacturer = strings.TrimSpace(string(mData))
			}

			productName := ""
			if pData, errProd := os.ReadFile(filepath.Join(devPath, "product")); errProd == nil {
				productName = strings.TrimSpace(string(pData))
			}

			if strings.Contains(productName, "Root Hub") || strings.Contains(productName, "Host Controller") || strings.Contains(manufacturer, "Linux Foundation") {
				continue
			}

			serial := ""
			if sData, errS := os.ReadFile(filepath.Join(devPath, "serial")); errS == nil {
				serial = strings.TrimSpace(string(sData))
			}

			classCode := ""
			if cData, errC := os.ReadFile(filepath.Join(devPath, "bDeviceClass")); errC == nil {
				classCode = strings.TrimSpace(string(cData))
			}
			if classCode == "" || classCode == "00" {
				if ifcData, errI := os.ReadFile(filepath.Join(devPath, fname+":1.0", "bInterfaceClass")); errI == nil {
					classCode = strings.TrimSpace(string(ifcData))
				}
			}

			fullName := productName
			if fullName == "" {
				if manufacturer != "" {
					fullName = manufacturer + " USB Device"
				} else if vid != "" && pid != "" {
					fullName = fmt.Sprintf("USB Device (VID:%s / PID:%s)", vid, pid)
				}
			} else if manufacturer != "" && !strings.HasPrefix(productName, manufacturer) {
				fullName = manufacturer + " " + productName
			}

			if fullName != "" {
				key := strings.ToLower(vid) + ":" + strings.ToLower(pid) + ":" + strings.ToLower(fullName)
				seenKeys[key] = true
				devClass := getClassString(classCode, fullName)
				usbList = append(usbList, USBDeviceInfo{
					Name:         fullName,
					DeviceID:     fmt.Sprintf("USB\\VID_%s&PID_%s\\%s", strings.ToUpper(vid), strings.ToUpper(pid), fname),
					VendorID:     strings.ToUpper(vid),
					ProductID:    strings.ToUpper(pid),
					SerialNumber: serial,
					Class:        devClass,
					Status:       "OK",
				})
			}
		}
	}

	// 2. Parse lsusb output for devices that might be missing or to enrich names
	if out, errCmd := exec.Command("lsusb").Output(); errCmd == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.Contains(line, "1d6b:") || strings.Contains(line, "root hub") {
				continue
			}
			parts := strings.SplitN(line, " ID ", 2)
			if len(parts) == 2 {
				idAndName := strings.SplitN(parts[1], " ", 2)
				vidPid := strings.Split(idAndName[0], ":")
				if len(vidPid) == 2 {
					vid, pid := strings.ToLower(vidPid[0]), strings.ToLower(vidPid[1])
					name := ""
					if len(idAndName) == 2 {
						name = strings.TrimSpace(idAndName[1])
					}
					if name == "" {
						continue
					}
					key := vid + ":" + pid + ":" + strings.ToLower(name)
					matched := false
					for idx, existing := range usbList {
						if strings.EqualFold(existing.VendorID, vid) && strings.EqualFold(existing.ProductID, pid) {
							if strings.HasPrefix(existing.Name, "USB Device") || existing.Name == "" {
								usbList[idx].Name = name
							}
							matched = true
							break
						}
					}
					if !matched && !seenKeys[key] {
						seenKeys[key] = true
						devClass := getClassString("", name)
						usbList = append(usbList, USBDeviceInfo{
							Name:      name,
							DeviceID:  fmt.Sprintf("USB\\VID_%s&PID_%s", strings.ToUpper(vid), strings.ToUpper(pid)),
							VendorID:  strings.ToUpper(vid),
							ProductID: strings.ToUpper(pid),
							Class:     devClass,
							Status:    "OK",
						})
					}
				}
			}
		}
	}

	// 3. Scan Linux Printers / CUPS for USB Printers
	if out, errLp := exec.Command("lpstat", "-v").Output(); errLp == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if strings.Contains(line, "usb://") || strings.Contains(line, "usblp") {
				parts := strings.SplitN(line, "device for ", 2)
				if len(parts) == 2 {
					pInfo := strings.SplitN(parts[1], ": ", 2)
					printerName := strings.TrimSpace(pInfo[0])
					printerURI := ""
					if len(pInfo) == 2 {
						printerURI = strings.TrimSpace(pInfo[1])
					}
					
					displayName := strings.ReplaceAll(printerName, "_", " ")
					key := "printer:" + strings.ToLower(displayName)
					if !seenKeys[key] {
						seenKeys[key] = true
						usbList = append(usbList, USBDeviceInfo{
							Name:      displayName,
							DeviceID:  printerURI,
							VendorID:  "USBPRINT",
							ProductID: printerName,
							Class:     "SoftwareDevice",
							Status:    "OK",
						})
					}
				}
			}
		}
	}

	return usbList
}


