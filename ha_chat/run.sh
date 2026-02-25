#!/bin/sh
set -e
echo "HA Chat (OneNote RAG) startet..."
cd /app
exec python3 -m server
