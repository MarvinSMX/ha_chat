# Tasks

## Aktuelle Aufgabe

- [x] Empty-State-Logo auf Grayscale umgestellt und visuell abgedunkelt
- [x] `.svg` Content-Type im Server ergänzt (Fix für leere Image-Response)
- [x] Sidebar-Styling auf Home Assistant Drawer/Sidebar-Look umgestellt (nicht floating)
- [x] Sidebar: „Neuer Chat“ als oberstes Listen-Item, Header: Graph-Status+Sync, Collapse rechts
- [x] Main-Header: Sync/Graph entfernt; Sidebar: Status+Sync nur bei Expand sichtbar
- [x] Sidebar Collapse: Sidebar komplett ausblenden, Expand-Button außerhalb
- [x] Empty-State: HA Logo zentriert (h/v) ohne Text
- [x] Sidebar-Headerhöhe auf HA-Originalmaß (56px) angepasst
- [x] Chat-Sidebar: unnötige Meta-Infos entfernt (Nachrichten/Datum)
- [x] Chat-Löschen ergänzt (Frontend + Backend DELETE Endpoint)
- [x] HA Auth: Chats an eingeloggten HA-User gebunden (Ingress-Header, serverseitiges Scoping, Migration von `chats.json`)
- [x] UI: HA-User im Sidebar-Header, Graph+Sync zurück in Main (links), Delete nur bei Hover
- [x] Chatliste: Delete absolut positioniert (volle Breite ohne Hover), /api/me Debug für Ingress-Header
- [x] Ingress-Fix: Server normalisiert /api/hassio_ingress/<token>/… damit /api/* Endpoints funktionieren
- [x] Sidebar default ausgeblendet (Expand-Button sichtbar)
- [x] HACS Frontend Resource: Dashboard Overlay Chat-FAB (unten rechts)
- [x] HACS: FAB als Lovelace platzierbare Custom Card (pro Dashboard/View)
- [x] HACS Fix: `ha-chat-fab.js` im Repo-Root + `content_in_root: true`
- [x] Popup-Container-Rundung wie Chat-Bubbles (unten rechts kleiner)
- [x] Popup exakt unten rechts (FAB-Position) + Card belegt keinen Dashboard-Platz
- [x] Popup API-Base robust auf funktionierenden Ingress-Pfad (`/hassio/ingress/ha_chat`) umgestellt
- [x] Popup robust gemacht: kein `POST /api/chats` mehr (405 vermeiden), bessere Fehlertexte mit URL/Status
- [x] FAB: API-Basis explizit getrennt (`api_base`) und fest auf Ingress-API-Pfad priorisiert
- [x] Bestehende Frontend- und Backend-Chatlogik analysiert (`ha_chat/www/ha-chat-panel.js`, `ha_chat/server.js`)
- [x] Empty-State mit zentriertem `logo.svg` im Chatbereich umgesetzt
- [x] Rechte Sidebar mit Chatliste und Button `+ Neuer Chat` in der UI ergänzt
- [x] Backend-Logik für mehrere Chats implementiert (persistente Chatliste + Detail-Endpoint)
- [x] Chat-Sende- und Action-Requests auf `chat_id` erweitert
- [x] Verifikation (Syntax-Checks mit `node --check`) durchgeführt

- [x] HACS FAB: Popup nutzt iframe zur echten Chat-App (`href` = Panel/Ingress-URL); fetch-basierter API-Pfad von Lovelace entfernt (405/HTML-Problem)
- [x] README_HACS: Ingress/fetch-Limitierung dokumentiert; Konfiguration auf `href` + optional `zIndex` vereinfacht
- [x] HACS FAB (ohne iframe): API-Basis per `GET /api/hassio_addon_ingress_path/<addon_slug>` (Integration „Expose Add-on Ingress Path“) oder manuell `ingress_api_base`; Chat per fetch unter `/api/hassio_ingress/<token>/api/*`
- [x] README_HACS: auf Ingress-Path-Integration + YAML angepasst
- [x] FAB-Popup vereinfacht: keine Chat-Auswahl, kein Löschen im Popup; beim Öffnen immer neuer Chat
- [x] README_HACS: Popup-Verhalten (immer neuer Chat, keine Auswahl/Löschen) dokumentiert
- [x] FAB-Popup UI: Header ohne Border, Composer ohne obere Border
- [x] FAB-Popup UX: Klick außerhalb schließt Popup (mousedown/touchstart)
- [x] FAB-Popup: Outside-Close über Vollflächen-Backdrop unter dem Popup (ersetzt document-Listener; zuverlässig bei HA Shadow-DOM)
- [x] FAB: `title`, `welcome_title`, `welcome_subtitle` per Lovelace-YAML; README_HACS ergänzt
- [x] FAB-Popup Empty-State: Willkommens-Screen + Suggestion-Chips wie in der App (bei leerem Chat)
- [x] FAB: Ingress-Lookup nutzt automatisch User-Access-Token (`Authorization: Bearer`) aus HA-Card-Context, falls verfügbar

- [x] FAB-Fallback-Fix: Bei 401/403 wird ingress_api_base jetzt wirklich Ã¼bersprungen und dynamischer Lookup erzwungen

- [x] FAB-API-Calls senden jetzt ebenfalls User-Authorization: Bearer (nicht nur Ingress-Lookup)

- [x] FAB: optionales `ha_bearer_token` / `bearer_token` / `ha_token` in YAML (Priorität vor Session-Token; wie curl); README-Hinweis Sicherheit
- [x] FAB: feste YAML-Ingress-URL entfernt; Prefix wird jetzt immer per `/api/hassio_addon_ingress_path/<slug>` geholt
- [x] FAB: optional `addon_direct_url` (Direktport wie Zircon3D-Workaround); Server CORS `Authorization` für Preflight
- [x] Add-on `config.yaml`: Port-Mapping korrigiert (`8099/tcp: 8765` = App im Container 8099, erreichbar am Host unter **8765**)
- [x] FAB Empty-State: Willkommens-Hand als **Data-URI** in `ha-chat-fab.js` (HACS liefert nur die JS-Datei → kein 404 für `hand.png`); optional `welcome_image_url`
- [x] FAB: `welcome_image_url` auf `/hacsfiles/.../hand.png` wird ignoriert (404-Schutz); README: Cache-Buster + HACS neu laden; customCards **build 3**
- [x] FAB: Backdrop beim geöffneten Popup leicht abgedunkelt (`rgba(0,0,0,0.32)`)
- [x] Add-on: MCP Streamable HTTP unter `/api/mcp` (gleicher Port wie UI/Host-Port); `@modelcontextprotocol/sdk`; `mcp_bearer_token` + Allowlists; Dockerfile `npm ci`
- [x] FAB-Popup minimal vergrößert (Breite/Höhe leicht erhöht)
- [x] App Empty-State: Prompt-Suggestions zentriert direkt unter dem HA-Logo positioniert
- [x] MCP `list_entities`: ohne `limit` jetzt alle Entities; zusätzlich `total/returned/has_more` + optional `offset` für Paging
- [x] MCP `search_entities`: gezielte Suche nach `query` (friendly_name/entity_id) + optionale Filter `domain`/`state`
- [x] Add-on-Settings: `system_prompt` (mit Default vorbelegt) + Weitergabe an N8N (`system_prompt`, `area_scope`)
- [x] FAB: `area_scope`/`ha_area`/`area`/`room` konfigurierbar, wird an `/api/chat` und `/api/execute_action` weitergegeben
- [x] MCP: Native HA-Area-Filter über `mcp_area_allowlist` + optionales `area` in Tools (`list/search/get/call_service`)
- [x] MCP: fester URL-Scope (`/api/mcp?scope=...`) erzwingt Bereich serverseitig; Tool-`area` kann ihn nicht überschreiben
- [x] MCP-Registryzugriff auf WebSocket-only umgestellt (`config/entity_registry/list`, `config/area_registry/list`)
- [x] FAB Composer auf ChatGPT-ähnliches MessageInput-Design umgestellt (Textarea + Action-Row)
- [x] FAB Voice Commands: Web Speech API Transcription (Mic-Button) integriert
- [x] FAB Composer Breiten-/Overflow-Fix: kein Rechts-Clip bei schmalen Popup-Breiten
- [x] FAB Popup-Rundungen an Message-Input angeglichen; unten rechts weicher (10px statt 4px)
- [x] FAB PromptInputActions reduziert: nur Mikrofon + Senden (kein Plus, Search, Tools)
- [x] FAB nochmals verschmälert (380px max) + CSS-Schutz: nur `#fab-voice` in Action-Row sichtbar
- [x] Korrektur: Popup-Breite wiederhergestellt; nur Prompt-Input schmaler/zentriert gegen Rechts-Clip

## Nachfolgende Schritte

- [ ] Optional: Verbesserte mobile Darstellung der rechten Sidebar (Overlay/Collapse)
- [ ] Optional: Fehleranzeige im FAB-Popup weiter verfeinern (mehr Kontext bei 401/403/404)
