#!/bin/sh
# Controller-side: sign an agent CSR using CA (place CSR in arg1). Output cert files.
set -e
CSR_FILE="$1"
if [ -z "$CSR_FILE" ]; then
  echo "Usage: $0 <agent.csr>"
  exit 2
fi
CA_KEY="client-agent/configs/ca-key.pem"
CA_CERT="client-agent/configs/ca.pem"
OUTDIR="client-agent/configs"
if [ ! -d "$OUTDIR" ]; then
  mkdir -p "$OUTDIR"
fi
openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial -out "$OUTDIR/agent.pem" -days 365 -sha256
echo "Signed agent cert -> $OUTDIR/agent.pem"
