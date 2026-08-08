<#
Simple PowerShell script to create a Windows service for the agent using sc.exe.
This is a minimal installer for development/demo only.
Production must use signed binaries, secure distribution, mutual TLS, and a proper installer.
#>

param(
    [string]$ExePath = "C:\\opt\\helpdesk-agent\\agent-client.exe",
    [string]$ServiceName = "HelpdeskAgent",
    [string]$DisplayName = "Helpdesk Client Agent"
)

if (-not (Test-Path $ExePath)) {
    Write-Error "Executable not found: $ExePath"
    exit 1
}

Write-Output "Creating service $ServiceName pointing to $ExePath"
sc.exe create $ServiceName binPath= "`"$ExePath`"" DisplayName= "$DisplayName" start= auto
sc.exe description $ServiceName "Helpdesk Client Agent - telemetry and remote execution client"

Write-Output "Service created. Configure certificate store, firewall rules, and service account as needed."
