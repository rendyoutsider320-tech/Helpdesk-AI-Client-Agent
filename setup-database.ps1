# Database Setup & Verification Script for Windows PowerShell

# Color codes
$GREEN = "`e[32m"
$RED = "`e[31m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

function Write-Status {
    param([string]$Status, [string]$Message, [bool]$Success = $true)
    
    if ($Success) {
        Write-Host "${GREEN}[✓]${RESET} $Status" -ForegroundColor Green
    } else {
        Write-Host "${RED}[✗]${RESET} $Status" -ForegroundColor Red
    }
    if ($Message) {
        Write-Host "    $Message" -ForegroundColor Gray
    }
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "${BLUE}=== $Title ===${RESET}" -ForegroundColor Cyan
}

# Check if Docker is running
Write-Section "Checking Prerequisites"

$docker = docker --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Status "Docker" "Version: $($docker.Trim())" $true
} else {
    Write-Status "Docker" "Not found or not running" $false
    exit 1
}

# Check if in correct directory
Write-Section "Verifying Project Structure"

if (Test-Path ".\docker-compose.yml") {
    Write-Status "docker-compose.yml" "Found" $true
} else {
    Write-Status "docker-compose.yml" "Not found - ensure you're in helpdesk-ai directory" $false
    exit 1
}

if (Test-Path ".\migrations") {
    Write-Status "migrations folder" "Found" $true
} else {
    Write-Status "migrations folder" "Not found" $false
    exit 1
}

# Start Docker services
Write-Section "Starting Docker Services"

Write-Host "${YELLOW}[!]${RESET} Starting containers..." -ForegroundColor Yellow
docker-compose down --remove-orphans 2>$null
docker-compose up -d

Write-Host "Waiting for PostgreSQL to be ready (30 seconds)..."
Start-Sleep -Seconds 30

# Check if services are running
Write-Section "Verifying Services"

$services = @(
    "helpdesk-postgres",
    "helpdesk-redis",
    "helpdesk-api"
)

foreach ($service in $services) {
    $status = docker-compose ps $service | Select-String "Up"
    if ($status) {
        Write-Status "$service" "Running" $true
    } else {
        Write-Status "$service" "Not running" $false
    }
}

# Verify database connection
Write-Section "Testing Database Connectivity"

$dbUser = "helpdesk"
$dbPass = "helpdesk@123"
$dbHost = "localhost"
$dbPort = "5436"
$dbName = "helpdesk_ai"

try {
    $pgConnection = "Server=$dbHost;Port=$dbPort;User Id=$dbUser;Password=$dbPass;Database=$dbName;"
    $pgCheck = docker exec helpdesk-postgres psql -U $dbUser -d $dbName -c "SELECT version();" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "PostgreSQL Connection" "Successfully connected" $true
    } else {
        Write-Status "PostgreSQL Connection" "Failed" $false
    }
} catch {
    Write-Status "PostgreSQL Connection" "Error: $($_.Exception.Message)" $false
}

# Check seed data
Write-Section "Verifying Seed Data"

# Count users
$userCount = docker exec helpdesk-postgres psql -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM users WHERE deleted_at IS NULL;" 2>&1
Write-Status "Users in database" "Count: $($userCount.Trim())" ($userCount -gt 0)

# List technicians
Write-Host ""
Write-Host "Technician Accounts:"
docker exec helpdesk-postgres psql -U $dbUser -d $dbName -c "SELECT username, name, role FROM users WHERE role = 'technician' ORDER BY name;" 2>&1

# Check technician presence
Write-Host ""
Write-Host "Technician Status (Real-time):"
docker exec helpdesk-postgres psql -U $dbUser -d $dbName -c "SELECT u.username, u.name, tp.status FROM users u INNER JOIN technician_presence tp ON u.id = tp.technician_id ORDER BY u.name;" 2>&1

# Verify specific users
Write-Section "Detailed Verification"

$expectedUsers = @(
    @{ username = "admin"; role = "admin" },
    @{ username = "rendy.m"; role = "technician" },
    @{ username = "alif.f"; role = "technician" },
    @{ username = "m.ramadhan"; role = "technician" },
    @{ username = "febryano.b"; role = "technician" },
    @{ username = "user.local"; role = "user" }
)

foreach ($user in $expectedUsers) {
    $exists = docker exec helpdesk-postgres psql -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM users WHERE username = '$($user.username)' AND deleted_at IS NULL;" 2>&1
    $count = $exists.Trim()
    
    if ([int]$count -gt 0) {
        Write-Status "$($user.username)" "Role: $($user.role) ✓" $true
    } else {
        Write-Status "$($user.username)" "Not found ✗" $false
    }
}

# Show next steps
Write-Section "Next Steps"

Write-Host "${BLUE}1. Start Backend API:${RESET}" -ForegroundColor Cyan
Write-Host "   ${YELLOW}go run ./cmd/api/main.go${RESET}"

Write-Host ""
Write-Host "${BLUE}2. Start Frontend (in another terminal):${RESET}" -ForegroundColor Cyan
Write-Host "   ${YELLOW}cd frontend${RESET}"
Write-Host "   ${YELLOW}npm run dev${RESET}"

Write-Host ""
Write-Host "${BLUE}3. Test Login:${RESET}" -ForegroundColor Cyan
Write-Host "   ${YELLOW}Username: rendy.m${RESET}"
Write-Host "   ${YELLOW}Password: ChangeMe@123${RESET}"

Write-Host ""
Write-Host "${BLUE}4. Access Applications:${RESET}" -ForegroundColor Cyan
Write-Host "   Frontend:   http://localhost:3002"
Write-Host "   Backend:    http://localhost:8090/health"
Write-Host "   Grafana:    http://localhost:3000"

Write-Host ""
Write-Status "Database Setup Complete" "All checks passed! Ready to run the application" $true

# Keep showing container status
Write-Section "Docker Container Status"
docker-compose ps
