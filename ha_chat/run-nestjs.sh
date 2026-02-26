#!/bin/sh
set -e
CHROMA_PATH="${CHROMADB_PATH:-/data/chromadb}"
mkdir -p "$CHROMA_PATH"
echo "Starte Chroma unter $CHROMA_PATH auf Port 8000 …"
chroma run --path "$CHROMA_PATH" --host 0.0.0.0 --port 8000 &
CHROMA_PID=$!
sleep 3
echo "Starte NestJS auf Port ${SUPERVISOR_INGRESS_PORT:-8099} …"
cd /app/backend
exec node dist/main.js
