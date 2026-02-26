#!/bin/sh
set -e
# Mehr Heap für Node (OneNote-Sync mit vielen Seiten/Chunks), reduziert OOM-Risiko
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

CHROMA_PATH="${CHROMADB_PATH:-/data/chromadb}"
mkdir -p "$CHROMA_PATH"
echo "Starte Chroma unter $CHROMA_PATH auf Port 8000 …"
chroma run --path "$CHROMA_PATH" --host 0.0.0.0 --port 8000 &
CHROMA_PID=$!
sleep 3
echo "Starte NestJS (Vite-Frontend unter /) auf Port ${SUPERVISOR_INGRESS_PORT:-8099} …"
cd /app/backend
exec node dist/main.js
