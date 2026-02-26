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
- **Als Panel in HA:** In `configuration.yaml` ein **panel_custom** mit iframe auf die App setzen, z. B.:
  ```yaml
  panel_custom:
    - name: ha-chat
      sidebar_title: Chat
      sidebar_icon: mdi:chat
      url_path: ha-chat
      embed_iframe: true
      config:
        url: http://homeassistant.local:8765
  ```
  Dann unter **Einstellungen** → **Dashboards** → **Sidebar** das Panel „Chat“ aktivieren.

## API (für Automationen / andere Aufrufer)

- **POST** `/api/chat` – Body: `{"message": "..."}` → Antwort: `{"answer": "...", "sources": [...], "actions": []}`  
- **POST** `/api/sync_onenote` – OneNote-Sync starten (optional, wenn Microsoft-Optionen gesetzt).  
- **POST** `/api/execute_action` – Body: `{"utterance": "..."}` → ruft die HA Conversation API auf (wenn HA URL/Token gesetzt).  
- **POST** `/api/add_documents` – Body: `{"documents": [{ "content", "metadata", optional "embedding" }]}` – Dokumente in ChromaDB einfügen.

## OneNote-Sync

- In den App-Optionen **Microsoft Client-ID**, **Client-Secret** und ggf. **Tenant-ID** eintragen.
- **Notizbuch in der Weboberfläche wählen (empfohlen):**
  - Im Browser `http://<dein-ha>:8765` öffnen.
  - **Oben** auf der Seite siehst du den Bereich **„OneNote – Notizbuch für Sync“**.
  - Auf **„Notizbücher laden“** klicken (Microsoft-Anmeldung muss einmal erfolgt sein). Es erscheinen deine OneNote-Notizbücher.
  - Beim gewünschten Notizbuch auf **„Dieses Notizbuch für Sync verwenden“** klicken – diese Auswahl wird gespeichert und beim nächsten Sync verwendet.
  - **Hinweis:** Siehst du den OneNote-Bereich nicht, Add-on einmal **neu starten** (oder neu bauen) und im Browser **Cache leeren** (Strg+Shift+R bzw. Hard Refresh).
- **Alternativ in den App-Optionen:** OneNote Notizbuch-ID oder Notizbuch-Name eintragen (wird nur genutzt, wenn in der UI nichts gewählt wurde).
- Einmalig **POST** `http://homeassistant.local:8765/api/sync_onenote` auslösen (z. B. Browser, curl oder Automation).  
  Beim ersten Mal erscheint im **App-Log** (Einstellungen → Apps → HA Chat → Logs) eine URL und ein Code – diese URL im Browser öffnen, Code eingeben. Danach speichert die App den Refresh-Token und weitere Syncs laufen ohne erneute Anmeldung.
- Sync wiederholen: z. B. Automation mit Zeitplan, die periodisch `POST .../api/sync_onenote` aufruft.

## Hinweise

- ChromaDB-Daten und (nach erstem Sync) der Microsoft Refresh-Token liegen unter `/data` im Container (persistent).
- **Nur dieses Add-on wird gepflegt.** Custom Integration und separates Frontend-Panel gehören nicht zum Projektumfang.
