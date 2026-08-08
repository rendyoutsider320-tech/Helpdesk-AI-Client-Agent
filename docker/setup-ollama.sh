#!/bin/bash
# Script to auto-pull required AI models for Agentic AI Helpdesk
# Make sure your Ollama container is running before executing this.

OLLAMA_CONTAINER="helpdesk-ollama"

# Models
LLM_MODEL=${1:-qwen2.5}
EMBEDDING_MODEL=${2:-bge-m3}

echo "Starting Ollama Model Setup..."

echo "1/2: Pulling LLM Model ($LLM_MODEL)..."
docker exec -it $OLLAMA_CONTAINER ollama pull $LLM_MODEL
if [ $? -eq 0 ]; then
    echo "✅ Successfully pulled $LLM_MODEL"
else
    echo "❌ Failed to pull $LLM_MODEL. Please check your docker connection."
fi

echo "2/2: Pulling Embedding Model ($EMBEDDING_MODEL)..."
docker exec -it $OLLAMA_CONTAINER ollama pull $EMBEDDING_MODEL
if [ $? -eq 0 ]; then
    echo "✅ Successfully pulled $EMBEDDING_MODEL"
else
    echo "❌ Failed to pull $EMBEDDING_MODEL. Please check your docker connection."
fi

echo "Setup Complete! Your AI subsystem is ready."
