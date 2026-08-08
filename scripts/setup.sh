#!/bin/bash

# Setup script for Helpdesk AI System

set -e

echo "=========================================="
echo "Helpdesk AI System - Setup Script"
echo "=========================================="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✓ Docker is installed"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "⚠ Docker Compose is not installed. Please install Docker Compose."
    exit 1
fi

echo "✓ Docker Compose is installed"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "✓ .env file created"
    echo "⚠ Please update .env with your configuration"
fi

echo ""
echo "=========================================="
echo "Starting services..."
echo "=========================================="
echo ""

# Start services
docker-compose up -d

echo ""
echo "✓ Services started successfully"
echo ""
echo "=========================================="
echo "Service URLs:"
echo "=========================================="
echo ""
echo "API Server:     http://localhost:8080"
echo "Frontend:       http://localhost:3000"
echo "Grafana:        http://localhost:3000/grafana"
echo "Prometheus:     http://localhost:3000/prometheus"
echo "MinIO Console:  http://localhost:3000/minio"
echo "Qdrant:         http://localhost:6333"
echo "PgAdmin:        http://localhost:5050"
echo ""
echo "=========================================="
echo "Demo Credentials:"
echo "=========================================="
echo ""
echo "Admin Account:"
echo "  Username: admin"
echo "  Password: ChangeMe@123"
echo ""
echo "Technician Account:"
echo "  Username: rendy.m"
echo "  Password: ChangeMe@123"
echo ""
echo "=========================================="
echo "Setup complete! 🎉"
echo "=========================================="
