# install.ps1 untuk PC Client
$ErrorActionPreference = "Stop"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -File `"$PSCommandPath`"" -Verb RunAs
    Exit
}

# Hentikan service lama jika ada
$service = Get-Service -Name "HelpdeskAgent" -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq "Running") { Stop-Service -Name "HelpdeskAgent" -Force }
    Start-Process -FilePath ".\agent-client.exe" -ArgumentList "--uninstall" -Verb RunAs -Wait
}

# Daftarkan service baru & jalankan
Start-Process -FilePath ".\agent-client.exe" -ArgumentList "--install" -Verb RunAs -Wait
Start-Service -Name "HelpdeskAgent"
Write-Host "✅ Agen berhasil dipasang dan berjalan di latar belakang!" -ForegroundColor Green
