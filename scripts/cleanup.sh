#!/bin/bash

# Stop and remove containers
echo "Stopping services..."
docker-compose down -v

echo "Services stopped and data cleaned up."
