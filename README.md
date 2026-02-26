# HA Chat (OneNote RAG) – als Home Assistant App (Add-on)

Diese **App** läuft als eigenständiges Add-on im Home Assistant Supervisor (keine Custom Integration). Sie bietet RAG über OneNote (ChromaDB + Azure OpenAI) und eine Chat-UI.

Vorgehen nach dem [Tutorial „Making your first app“](https://developers.home-assistant.io/docs/apps/tutorial/).

## Schritt 1: App ins Add-on-Verzeichnis legen

1. Samba oder SSH Add-on in Home Assistant starten.
2. Den **Inhalt** des Ordners **`addon/ha_chat/ha_chat/`** (Dockerfile, config.yaml, run.sh, server.py, www/, …) in dein Add-on-Verzeichnis kopieren, sodass die Struktur so aussieht:

Struktur auf dem Zielsystem (`addons/ha_chat/` oder wie dein Add-on-Verzeichnis heißt):

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
    langchain_rag.py
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
- **GET** `/api/onenote_status` – OneNote-Zugriff prüfen, Liste der Notizbücher: `{"success", "message", "notebooks": [{"id", "displayName"}], "configured_notebook_name", ...}`  
- **POST** `/api/onenote_notebook` – Body: `{"notebook_id": "...", "notebook_name": "..."}` – gewähltes Notizbuch für Sync speichern.  
- **POST** `/api/sync_onenote` – OneNote-Sync starten (optional, wenn Microsoft-Optionen gesetzt).  
- **POST** `/api/execute_action` – Body: `{"utterance": "..."}` → ruft die HA Conversation API auf (wenn HA URL/Token gesetzt).  
- **POST** `/api/add_documents` – Body: `{"documents": [{ "content", "metadata", optional "embedding" }]}` – Dokumente in ChromaDB einfügen.

## OneNote-Sync

- In den App-Optionen **Microsoft Client-ID**, **Client-Secret** und ggf. **Tenant-ID** eintragen (Client-Secret aus Azure Portal → App-Registrierung → Zertifikate & Geheimnisse).
- **Sync beim Start:** Beim **Start der App** wird automatisch ein OneNote-Sync ausgeführt. Wenn noch **kein Refresh-Token** vorhanden ist, startet der **Device Flow** – dann erscheinen im **App-Log** (Einstellungen → Apps → HA Chat → Logs) bzw. im Terminal eine klare Meldung und ein **Anmelde-Code**:
  ```
  ============================================================
    HA Chat – OneNote-Anmeldung (Device Flow)
  ============================================================
    Öffne im Browser:  https://login.microsoft.com/device
    Gib folgenden Code ein:  XXXXXXX
    (Gültig ca. 15 Min. – Warte auf deine Anmeldung …)
  ============================================================
  ```
  **Vorgehen:** Diese URL im Browser öffnen, Code eingeben, mit deinem Microsoft-Konto anmelden. Die App wartet bis zu 5 Minuten und speichert danach den Refresh-Token; weitere Syncs laufen ohne erneute Anmeldung.
- **Fehler AADSTS7000218** („client_secret“ fehlt): Stelle sicher, dass in den App-Optionen das **Client-Secret** aus der Azure-App-Registrierung eingetragen ist. Falls der Fehler bleibt: In Azure unter **Authentifizierung** → **Erweiterte Einstellungen** „Öffentliche Clientflows zulassen“ auf **Ja** setzen.
- **Notizbuch in der Weboberfläche wählen (empfohlen):**
  - Im Browser `http://<dein-ha>:8765` öffnen.
  - **Oben** auf der Seite den Bereich **„OneNote – Notizbuch für Sync“** → **„Notizbücher laden“** (nach erfolgter Anmeldung erscheinen deine Notizbücher).
  - Beim gewünschten Notizbuch auf **„Dieses Notizbuch für Sync verwenden“** klicken – die Auswahl wird gespeichert und beim nächsten Sync verwendet.
- **Alternativ in den App-Optionen:** OneNote Notizbuch-ID oder Notizbuch-Name eintragen (wird nur genutzt, wenn in der UI nichts gewählt wurde).
- Sync manuell auslösen: **POST** `http://homeassistant.local:8765/api/sync_onenote` (Browser, curl oder Automation). Sync wiederholen: z. B. Automation mit Zeitplan.

## Hinweise

- ChromaDB-Daten und (nach erstem Sync) der Microsoft Refresh-Token liegen unter `/data` im Container (persistent).
- Beim **Start** der App erscheint im Log ein kurzer Hinweis zur Weboberfläche und zur OneNote-Anmeldung (falls konfiguriert).
- **Nur dieses Add-on wird gepflegt.** Custom Integration und separates Frontend-Panel gehören nicht zum Projektumfang.
