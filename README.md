# HA Chat (OneNote RAG) – Add-on

Eigenständiges Add-on: **Frontend (Vue)** + **OneNote/Graph** in der App. RAG (Embedding, Vektorspeicher, Inference) läuft in **N8N** über zwei Webhooks.

Vorgehen nach dem [Tutorial „Making your first app“](https://developers.home-assistant.io/docs/apps/tutorial/).

## Schritt 1: App ins Add-on-Verzeichnis legen

1. Samba oder SSH Add-on in Home Assistant starten.
2. Den **Inhalt** des Ordners **`addon/ha_chat/ha_chat/`** in dein Add-on-Verzeichnis kopieren.

Struktur auf dem Zielsystem (`addons/ha_chat/`):

```
addons/ha_chat/
  Dockerfile
  config.yaml
  run.sh
  backend/
  frontend/
  www/          (optional, Legacy)
  README.md
```

## Schritt 2: App in Home Assistant einrichten

1. **Einstellungen** → **Apps** → **App-Store** → Drei-Punkte-Menü → **Nach Updates suchen**.
2. Unter **Lokale Apps** die App **HA Chat (OneNote RAG)** installieren und starten.
3. App **konfigurieren** (Zahnrad):
   - **Microsoft Client-ID**, **Tenant-ID** (für OneNote-Sync, Device Flow).
   - **N8N Ingest-Webhook-URL** – Endpoint, an den der Sync die OneNote-Dokumente sendet.
   - **N8N Inference-Webhook-URL** – Endpoint für Chat-Anfragen (RAG-Antwort).
   - Optional: **HA URL**, **HA Token** (für spätere Erweiterungen).
4. **Speichern** und App ggf. neu starten.

## Schritt 3: Chat nutzen

- **Weboberfläche:** Add-on-Seite → „Weboberfläche öffnen“ (Ingress) oder `http://<dein-ha>:8765`.
- **Panel in HA:** `panel_custom` mit iframe auf die App-URL (siehe [Add-on-README](ha_chat/README.md)).

## API

- **POST** `/api/chat` – Body: `{"message": "..."}` → Antwort von N8N: `{"answer": "...", "sources": [...], "actions": []}`.
- **GET** `/api/onenote_status` – OneNote-Zugriff prüfen, Notizbücher auflisten.
- **POST** `/api/onenote_notebook` – Body: `{"notebook_id": "...", "notebook_name": "..."}` – Notizbuch für Sync speichern.
- **POST** `/api/sync_onenote` – OneNote-Sync starten (holt Content per Graph, sendet an N8N Ingest-Webhook).

## OneNote-Sync

- MSAL (Device Flow), kein Client-Secret nötig. In Azure: „Öffentliche Clientflows zulassen“ = Ja, Berechtigungen **Notes.Read**, **User.Read**.
- Beim ersten Start erscheint im Log der Anmelde-Code für https://login.microsoft.com/device.
- Token-Cache: `/data/msal_token_cache.json` im Container.

## N8N-Webhooks

Siehe [ha_chat/README.md](ha_chat/README.md) für das genaue Request-/Response-Format von Ingest- und Inference-Webhook.
