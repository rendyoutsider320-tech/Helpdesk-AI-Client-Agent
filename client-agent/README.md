Client Agent (endpoint) - Overview
=================================

This folder contains a minimal skeleton for a Client Agent that runs on endpoints (Windows/Linux).

Components:
- `cmd/agent-client/main.go` : simple agent binary skeleton
- `pkg/collector/collector.go` : telemetry collector helper
- `pkg/exec/client.go` : remote execution helper (wrapper around os/exec)
- `configs/Install-Windows-Service.ps1` : PowerShell script to install the agent as a Windows service

This is a starter template — secure hardening, mutual TLS, code signing, and a production installer are required before deployment.
