#!/bin/sh
set -e
echo "Starte HA Chat (Frontend + N8N-Proxy) auf Port ${SUPERVISOR_INGRESS_PORT:-8099} …"
exec node server.js
