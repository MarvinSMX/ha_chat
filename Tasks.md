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
- [x] Bestehende Frontend- und Backend-Chatlogik analysiert (`ha_chat/www/ha-chat-panel.js`, `ha_chat/server.js`)
- [x] Empty-State mit zentriertem `logo.svg` im Chatbereich umgesetzt
- [x] Rechte Sidebar mit Chatliste und Button `+ Neuer Chat` in der UI ergänzt
- [x] Backend-Logik für mehrere Chats implementiert (persistente Chatliste + Detail-Endpoint)
- [x] Chat-Sende- und Action-Requests auf `chat_id` erweitert
- [x] Verifikation (Syntax-Checks mit `node --check`) durchgeführt

## Nachfolgende Schritte

- [ ] Optional: Chat löschen/umbenennen als weitere Sidebar-Aktionen ergänzen
- [ ] Optional: Verbesserte mobile Darstellung der rechten Sidebar (Overlay/Collapse)
