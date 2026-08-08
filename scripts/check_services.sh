#!/usr/bin/env bash
set -euo pipefail

# Simple host-side health checker for services defined in docker-compose
# Run from repo root: ./scripts/check_services.sh

echo "Checking Docker Compose services..."

# Show containers status
docker compose ps

sleep 1

check_http(){
  local url="$1"
  echo -n "Checking $url ... "
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    echo "OK"
  else
    echo "FAILED"
  fi
}

# API
check_http "http://localhost:8088/health"

# Frontend (Next.js)
check_http "http://localhost:3005/"

# Qdrant
check_http "http://localhost:6333/collections"

# Ollama
check_http "http://localhost:11434/v1/models"

# Postgres (use pg_isready inside container)
echo -n "Checking Postgres (pg_isready) ... "
if docker compose exec -T postgres pg_isready -U helpdesk -d helpdesk_ai >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAILED"
fi

# Redis
echo -n "Checking Redis (PING) ... "
if docker compose exec -T redis redis-cli ping | grep -q PONG >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAILED"
fi

echo "All checks done. For failed items, inspect logs with: docker compose logs -f <service>"
