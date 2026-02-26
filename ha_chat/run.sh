#!/bin/sh
set -e
echo ""
echo "=============================================="
echo "  HA Chat (OneNote RAG) – App wird gestartet"
echo "=============================================="
echo "  Weboberfläche:  http://<dein-host>:8765 (oder über Ingress: Add-on → Öffnen)"
echo ""
echo "  OneNote: Beim ersten Start oder ohne"
echo "  Refresh-Token erscheint im Log der Anmelde-Code"
echo "  (Öffne https://login.microsoft.com/device und"
echo "   gib den angezeigten Code ein)."
echo "=============================================="
echo ""
cd /app
exec python3 -m server
