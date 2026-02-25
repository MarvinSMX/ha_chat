# HA Chat (OneNote RAG) – als Home Assistant App (Add-on)

Diese **App** läuft als eigenständiges Add-on im Home Assistant Supervisor (keine Custom Integration). Sie bietet RAG über OneNote (ChromaDB + Azure OpenAI) und eine Chat-UI.

Vorgehen nach dem [Tutorial „Making your first app“](https://developers.home-assistant.io/docs/apps/tutorial/).

## Schritt 1: App ins Add-on-Verzeichnis legen

1. Samba oder SSH Add-on in Home Assistant starten.
2. Den Ordner **`ha_chat`** aus diesem Repo (unter `addon/ha_chat/`) in das Add-on-Verzeichnis deines Home Assistant kopieren:
   - **Samba:** Der Share heißt meist „addons“ – dort einen Ordner `ha_chat` anlegen und den Inhalt von `addon/ha_chat/` hineinkopieren.
   - **SSH:** z. B. `/addon/ha_chat` oder das von deiner Installation vorgegebene Add-on-Verzeichnis verwenden.

Struktur auf dem Zielsystem:

```
addons/
  ha_chat/
    Dockerfile
    config.yaml
    run.sh
    requirements.txt
    server.py
    chromadb_helper.py
    azure_openai.py
    onenote_sync.py
    www/
      index.html
      ha-chat-panel.js
```

## Schritt 2: App in Home Assistant einrichten

1. **Einstellungen** → **Apps** → **App-Store** (unten rechts).
2. Drei-Punkte-Menü → **Nach Updates suchen**.
3. Unter **Lokale Apps** sollte **HA Chat (OneNote RAG)** erscheinen.
4. App **installieren** und **starten**.
5. App **konfigurieren** (Zahnrad):  
   - **Azure Endpoint**, **Azure API-Schlüssel**, **Embedding-Deployment**, **Chat-Deployment** (Pflicht).  
   - Optional: **Microsoft Client-ID**, **Client-Secret**, **Tenant-ID** (für OneNote-Sync).  
   - Optional: **HA URL**, **HA Token** (für „Aktion ausführen“ / Conversation API).  
6. **Speichern** und App ggf. neu starten.

## Schritt 3: Chat nutzen

- **Im Browser:** `http://homeassistant.local:8765` (oder deine HA-Host-Adresse mit Port **8765**) öffnen – dort läuft die Chat-UI der App.
- **Als Sidebar-Panel in HA:**  
  Wenn du die Oberfläche weiter in HA haben willst, kannst du ein **panel_custom** mit einer iframe-URL auf die App setzen, z. B.  
  `url: http://homeassistant.local:8765`  
  (Details siehe [frontend/README.md](../frontend/README.md).)

## API (für Automationen / andere Aufrufer)

- **POST** `/api/chat` – Body: `{"message": "..."}` → Antwort: `{"answer": "...", "sources": [...], "actions": []}`  
- **POST** `/api/sync_onenote` – OneNote-Sync starten (optional, wenn Microsoft-Optionen gesetzt).  
- **POST** `/api/execute_action` – Body: `{"utterance": "..."}` → ruft die HA Conversation API auf (wenn HA URL/Token gesetzt).  
- **POST** `/api/add_documents` – Body: `{"documents": [{ "content", "metadata", optional "embedding" }]}` – Dokumente in ChromaDB einfügen.

## OneNote-Sync

- In den App-Optionen **Microsoft Client-ID**, **Client-Secret** und ggf. **Tenant-ID** eintragen.
- Einmalig **POST** `http://homeassistant.local:8765/api/sync_onenote` auslösen (z. B. Browser, curl oder Automation).  
  Beim ersten Mal erscheint im **App-Log** (Einstellungen → Apps → HA Chat → Logs) eine URL und ein Code – diese URL im Browser öffnen, Code eingeben. Danach speichert die App den Refresh-Token und weitere Syncs laufen ohne erneute Anmeldung.
- Sync wiederholen: z. B. Automation mit Zeitplan, die periodisch `POST .../api/sync_onenote` aufruft.

## Hinweise

- ChromaDB-Daten und (nach erstem Sync) der Microsoft Refresh-Token liegen unter `/data` im Container (persistent).
- Die **Integration** unter `custom_components/ha_chat/` wird von dieser App **nicht** genutzt; du kannst sie entfernen, wenn du nur die App verwenden willst.
