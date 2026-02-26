#!/bin/sh
set -e
# Geringerer Heap für leichten Speicherverbrauch. Bei OOM beim Sync: mehr RAM für Add-on oder NODE_OPTIONS erhöhen.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"

echo "Starte App (Frontend + API für OneNote/Graph + N8N-Webhooks) auf Port ${SUPERVISOR_INGRESS_PORT:-8099} …"
cd /app/backend
exec node dist/main.js
