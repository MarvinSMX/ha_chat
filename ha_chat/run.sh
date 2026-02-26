#!/bin/sh
set -e
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"

echo "Starte App (Frontend + API für OneNote/Graph + N8N-Webhooks) auf Port ${SUPERVISOR_INGRESS_PORT:-8099} …"
cd /app/backend
exec node dist/main.js
