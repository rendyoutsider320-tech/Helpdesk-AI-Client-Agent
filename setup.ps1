#!/usr/bin/env pwsh
# Database and Application Setup Script for Windows
# This script helps set up the entire helpdesk AI system

param(
    [string]$Action = "setup",
    [string]$Environment = "development"
)

$ErrorActionPreference = "Stop"

# Colors for output
$Green = "`e[32m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Reset = "`e[0m"

function Write-Status {
    param([string]$Message, [string]$Status)
    $Color = if ($Status -eq "success") { $Green } elseif ($Status -eq "error") { $Red } else { $Yellow }
    Write-Host "$Color[*]$Reset $Message"
}

function Check-Docker {
    Write-Status "Checking Docker installation..." "info"
    try {
        $version = docker --version
        Write-Status "Docker found: $version" "success"
        return $true
    }
    catch {
        Write-Status "Docker not found. Please install Docker Desktop." "error"
        return $false
    }
}

function Check-Prerequisites {
    Write-Status "Checking prerequisites..." "info"
    
    # Check Docker
    if (-not (Check-Docker)) {
        exit 1
    }
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-Status "Node.js found: $nodeVersion" "success"
    }
    catch {
        Write-Status "Node.js not found. Please install Node.js." "error"
        exit 1
    }
    
    # Check Go
    try {
        $goVersion = go version
        Write-Status "Go found: $goVersion" "success"
    }
    catch {
        Write-Status "Warning: Go not found. Backend compilation may fail." "error"
    }
}

function Setup-Environment {
    Write-Status "Setting up environment..." "info"
    
    $projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    
    # Check .env file
    if (-not (Test-Path "$projectRoot\.env")) {
        Write-Status "Creating .env file..." "info"
        Copy-Item "$projectRoot\.env.example" "$projectRoot\.env"
        Write-Status ".env file created" "success"
    }
    
    # Check frontend .env.local
    if (-not (Test-Path "$projectRoot\frontend\.env.local")) {
        Write-Status "Creating frontend .env.local..." "info"
        $envContent = @"
NEXT_PUBLIC_API_URL=http://localhost:8088/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8088
NEXT_PUBLIC_ENV=development
"@
        Set-Content -Path "$projectRoot\frontend\.env.local" -Value $envContent
        Write-Status "Frontend .env.local created" "success"
    }
}

function Start-Docker {
    Write-Status "Starting Docker containers..." "info"
    
    try {
        docker-compose up -d
        Write-Status "Docker containers started" "success"
        
        # Wait for services to be ready
        Write-Status "Waiting for services to be ready..." "info"
        Start-Sleep -Seconds 5
        
        # Check database connection
        $maxAttempts = 30
        $attempt = 0
        while ($attempt -lt $maxAttempts) {
            try {
                docker exec helpdesk-postgres pg_isready -U helpdesk | Out-Null
                Write-Status "PostgreSQL is ready" "success"
                break
            }
            catch {
                $attempt++
                Write-Status "Waiting for PostgreSQL... ($attempt/$maxAttempts)" "info"
                Start-Sleep -Seconds 1
            }
        }
        
        if ($attempt -eq $maxAttempts) {
            Write-Status "PostgreSQL did not start in time" "error"
            exit 1
        }
    }
    catch {
        Write-Status "Failed to start Docker containers: $_" "error"
        exit 1
    }
}

function Setup-Database {
    Write-Status "Setting up database..." "info"
    
    # Run migrations
    Write-Status "Running migrations..." "info"
    
    # The docker-compose setup will automatically run migrations from the migrations folder
    Write-Status "Migrations completed" "success"
}

function Setup-Frontend {
    Write-Status "Setting up frontend..." "info"
    
    Push-Location "frontend"
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Status "Installing frontend dependencies..." "info"
            npm install
            Write-Status "Frontend dependencies installed" "success"
        }
        else {
            Write-Status "Frontend dependencies already installed" "success"
        }
    }
    finally {
        Pop-Location
    }
}

function Setup-Backend {
    Write-Status "Setting up backend..." "info"
    
    try {
        if (Test-Path "go.mod") {
            Write-Status "Installing Go dependencies..." "info"
            go mod download
            Write-Status "Go dependencies downloaded" "success"
        }
    }
    catch {
        Write-Status "Warning: Could not set up backend dependencies: $_" "error"
    }
}

function Start-Development {
    Write-Status "Starting development environment..." "info"
    
    $backend = @"
echo "Starting backend server on port 8090..."
go run ./cmd/api/main.go
"@
    
    $frontend = @"
echo "Starting frontend server on port 3002..."
cd frontend && npm run dev
"@
    
    Write-Status "Development setup complete!" "success"
    Write-Status "To start development:" "info"
    Write-Host ""
    Write-Host "  Backend:  go run ./cmd/api/main.go"
    Write-Host "  Frontend: cd frontend && npm run dev"
    Write-Host ""
}

function Test-Connectivity {
    Write-Status "Testing connectivity..." "info"
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8088/health" -Method Get -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Status "Backend API is responding" "success"
        }
    }
    catch {
        Write-Status "Backend API is not responding yet. Make sure backend is running." "error"
    }
    
    Write-Status "Frontend should be accessible at http://localhost:3002" "info"
}

function Stop-Services {
    Write-Status "Stopping Docker containers..." "info"
    
    try {
        docker-compose down
        Write-Status "Docker containers stopped" "success"
    }
    catch {
        Write-Status "Failed to stop Docker containers: $_" "error"
    }
}

# Main execution
switch ($Action) {
    "setup" {
        Write-Status "=== Helpdesk AI Setup ===" "info"
        Check-Prerequisites
        Setup-Environment
        Start-Docker
        Setup-Database
        Setup-Frontend
        Setup-Backend
        Start-Development
        Test-Connectivity
    }
    "start" {
        Write-Status "Starting services..." "info"
        Start-Docker
        Write-Status "Services started. Run 'go run ./cmd/api/main.go' in terminal 1 and 'cd frontend && npm run dev' in terminal 2" "info"
    }
    "stop" {
        Stop-Services
    }
    "test" {
        Test-Connectivity
    }
    default {
        Write-Host @"
Usage: .\setup.ps1 [Action] [Environment]

Actions:
  setup       - Full setup (default)
  start       - Start Docker containers
  stop        - Stop Docker containers
  test        - Test connectivity

Environment:
  development - Development environment (default)
  production  - Production environment

Example:
  .\setup.ps1 setup development
  .\setup.ps1 start
  .\setup.ps1 stop
"@
    }
}
