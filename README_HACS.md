## HACS Frontend: HA Chat FAB (Lovelace Card)

Dieses Repo enthält zusätzlich eine HACS-Frontend-Resource als **Lovelace Custom Card**. Du platzierst die Card in einem Dashboard/View – dann wird dort unten rechts ein schwebendes Chat-Icon eingeblendet.

### Ohne iframe: API über den echten Ingress-Pfad

Von Lovelace aus führen Requests zu **`/hassio/ingress/<name>/api/...`** oft **nicht** zum Add-on (HA-HTML, **405** bei POST).

Die Card nutzt stattdessen den Pfad **`/api/hassio_ingress/<token>/api/...`**, den Home Assistant intern für das Add-on verwendet. Den Pfadprefix liefert die HACS-Integration **„Expose Add-on Ingress Path“** über:

`GET /api/hassio_addon_ingress_path/<addon_slug>`

(mit deiner **eingeloggten HA-Session** – gleiche Origin, Cookies; kein Long-Lived Token in der Card nötig).  
Zusätzlich nutzt die Card, wenn verfügbar, automatisch den **aktuellen HA Access-Token des eingeloggten Users** als `Authorization: Bearer ...` für diesen Lookup.

### Installation (HACS)

- Integration **Expose Add-on Ingress Path** installieren, einrichten, Home Assistant neu starten (siehe Anleitung der Integration).
- Dieses Repo in HACS als **Frontend**-Repository hinzufügen.
- Resource: **Einstellungen → Dashboards → Ressourcen**
  - URL: `/hacsfiles/<dein-repo-name>/ha-chat-fab.js`
  - Typ: `JavaScript Module`

### Nutzung (pro Dashboard/View)

```yaml
type: custom:ha-chat-fab
addon_slug: 2954ddb4_ha_chat
icon: mdi:chat
```

`addon_slug` = Add-on-ID wie in der URL/API (z. B. `2954ddb4_ha_chat`).

Die Card ist unsichtbar und aktiviert nur den FAB. Beim Klick öffnet sich ein **Popup** mit Chat (fetch gegen den aufgelösten Ingress-Pfad) – **ohne iframe**.

Im Popup gibt es bewusst **keine Chat-Auswahl** und **keine Löschfunktion**. Bei jedem Öffnen wird automatisch ein **neuer Chat** gestartet.

### Optional: Prefix manuell setzen

Falls der Lookup-Endpoint aus dem Browser nicht erreichbar ist (Rechte), kannst du den von der Integration gelieferten Prefix fest eintragen (wie mit `curl` + Long-Lived Token ermittelt):

```yaml
type: custom:ha-chat-fab
ingress_api_base: /api/hassio_ingress/YLIRqE2IYAmkazvxxf9WN8LgxJ7gqTvfSP4lMacywZE
icon: mdi:chat
```

Hinweis: Der Token kann sich ändern – dann Lookup wieder aktiv lassen oder Prefix aktualisieren.

### Texte (Header, FAB, Willkommen)

- `title` – Name im **Popup-Header** und als **Tooltip** / `aria-label` am FAB (Standard: `HA Chat`).
- `welcome_title` – Überschrift im **Empty-State** (optional). Wenn nicht gesetzt: `Willkommen im <title>`.
- `welcome_subtitle` – Zeile darunter (optional). Wenn nicht gesetzt: der bisherige Hinweis zu Vorschlägen.

```yaml
type: custom:ha-chat-fab
addon_slug: 2954ddb4_ha_chat
title: Support-Bot
welcome_title: Willkommen beim Support
welcome_subtitle: Frag mich zu Geräten, Szenen oder der Dokumentation.
icon: mdi:chat
```

### Weitere Optionen

- `slug` – Alias für `addon_slug` (Abwärtskompatibilität)
- `zIndex` – z. B. `100000`

### Hinweis zu `/hassio/ingress/...`

Dieser Supervisor-Pfad bleibt für die **eingebettete Web-UI** des Add-ons gedacht; für **programmatische** Aufrufe von Lovelace aus ist **`/api/hassio_ingress/<token>/...`** der passende Zielpfad.
