#!/bin/sh
# Simple OpenSSL-based CA + server + client cert generator (demo only)
set -e
OUTDIR="$(pwd)"
mkdir -p ${OUTDIR}

echo "Generating CA"
openssl genrsa -out ca-key.pem 4096
openssl req -x509 -new -nodes -key ca-key.pem -sha256 -days 3650 -subj "/CN=helpdesk-ca" -out ca.pem

echo "Generating server key"
openssl genrsa -out server-key.pem 2048
openssl req -new -key server-key.pem -subj "/CN=localhost" -out server.csr
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server.pem -days 365 -sha256

echo "Generating client key"
openssl genrsa -out client-key.pem 2048
openssl req -new -key client-key.pem -subj "/CN=playbook-client" -out client.csr
openssl x509 -req -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out client.pem -days 365 -sha256

echo "Generated: ca.pem, server.pem, server-key.pem, client.pem, client-key.pem"
echo "Place them in client-agent/configs and restart services for mutual TLS demo."
