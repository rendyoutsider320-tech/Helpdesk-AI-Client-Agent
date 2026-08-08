//go:build !windows
package main

const serviceName = "HelpdeskAgent"

func runService(name string) {
	// No-op for non-Windows OS
}

func handleServiceFlags() bool {
	return false
}

func isWindowsService() bool {
	return false
}
