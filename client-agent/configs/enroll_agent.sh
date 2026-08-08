#!/bin/sh
# Agent-side enrollment: generate key + CSR and optionally post to controller for zero-touch cert issuance.
set -e
OUTDIR="$(pwd)"
mkdir -p "${OUTDIR}"

echo "Generating agent key and CSR"
openssl genrsa -out agent-key.pem 2048
openssl req -new -key agent-key.pem -subj "/CN=agent-$(hostname)" -out agent.csr

if [ -n "$CONTROLLER_ENROLL_URL" ]; then
  echo "Posting CSR to controller at $CONTROLLER_ENROLL_URL"
  if [ -z "$ENROLLMENT_TOKEN" ]; then
    curl -s -X POST "$CONTROLLER_ENROLL_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"agent_id\": \"$(hostname)\", \"type\": \"server\", \"csr\": \"$(awk '{printf "%s\\n", $0}' agent.csr)\"}"
  else
    curl -s -X POST "$CONTROLLER_ENROLL_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"agent_id\": \"$(hostname)\", \"type\": \"server\", \"csr\": \"$(awk '{printf "%s\\n", $0}' agent.csr)\", \"token\": \"$ENROLLMENT_TOKEN\"}"
  fi
  echo
fi

echo "Generated files: agent-key.pem, agent.csr"
