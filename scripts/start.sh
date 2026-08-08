#!/bin/bash

# Build and start services
echo "Building Docker images..."
docker-compose build

echo ""
echo "Starting services..."
docker-compose up -d

echo ""
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "Checking service health..."
docker-compose ps

echo ""
echo "Services are ready!"
echo ""
echo "API Health Check: http://localhost:8080/health"
