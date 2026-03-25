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

### Optional: Bearer-Token in der YAML (wie `curl`)

Wenn der Lookup `GET /api/hassio_addon_ingress_path/<slug>` im Browser für manche Benutzer `401` liefert, kannst du – **analog zu `curl -H "Authorization: Bearer …"`** – einen Token in der Card setzen:

```yaml
type: custom:ha-chat-fab
addon_slug: 2954ddb4_ha_chat
ha_bearer_token: DEIN_LONG_LIVED_ACCESS_TOKEN
```

- Gültige Schlüssel (Alias): `ha_bearer_token`, `bearer_token`, `ha_token`
- Optional mit Präfix: `Bearer eyJ…` oder nur `eyJ…`
- Wenn gesetzt, hat dieser Wert **Vorrang** vor dem automatisch ermittelten Session-Token und wird für **Ingress-Lookup und alle Add-on-API-Aufrufe** dieser Card genutzt.

**Sicherheit:** Der Token steht im Klartext in der Lovelace-Konfiguration. Jeder mit Zugriff auf Dashboard-Bearbeitung oder Backups kann ihn lesen. Besser: Integration/HA so konfigurieren, dass Non-Admins den Lookup ohne festen Token nutzen dürfen.

Ohne **direkte Add-on-URL** (siehe nächster Abschnitt) wird der Prefix **ausschließlich dynamisch** über `GET /api/hassio_addon_ingress_path/<addon_slug>` geholt – keine feste `/api/hassio_ingress/...`-URL in YAML.

### Optional: Direkter Host-Port (Ingress umgehen, z. B. wie Zircon3D)

Manche Add-ons berichten, dass **Ingress** erst „warm“ ist, nachdem die Add-on-UI einmal aus HA geöffnet wurde – dann zeigen **iframe** oder API-Aufrufe vorher **401**. Ein Workaround ist, den **vom Supervisor gemappten Port** zu nutzen und die UI/API **direkt** anzusprechen (ohne `/api/hassio_ingress/...`).

Welcher **Host-Port** für das Add-on freigegeben ist, siehst du im **Supervisor** unter der Add-on-Karte (Portzuordnung in `config.yaml` des Add-ons).

In der Card kannst du optional setzen:

```yaml
type: custom:ha-chat-fab
addon_direct_url: http://homeassistant.local:DEIN_HOST_PORT
icon: mdi:chat
```

- Aliase: `addon_direct_url`, `direct_url`, `addon_port_url`
- URL **mit** Schema (`http://` oder `https://`), **ohne** abschließenden Slash
- Wenn gesetzt: **kein** Lookup `hassio_addon_ingress_path`; alle Requests gehen gegen `addon_direct_url` + `/api/...`
- Der Server antwortet mit CORS inkl. **`Authorization`** (für Preflight), damit `fetch` vom Dashboard aus funktioniert

**Hinweise**

- **Mixed Content:** Dashboard über **HTTPS**, Add-on nur **HTTP** auf dem direkten Port → der Browser blockiert oft; dann Ingress-Pfad oder beides über HTTPS/Tunnel lösen.
- **Sicherheit / Nutzer:** Ohne HA-Ingress setzt das Backend keine `x-hass-user-id` o. Ä.; API-Zugriffe laufen dann wie **ein gemeinsamer Nutzer** (`public` im Chat-Store). Nur im vertrauenswürdigen LAN sinnvoll.
- Port in den **Add-on-Optionen** ggf. freigeben und Firewall beachten.

### Texte (Header, FAB, Willkommen)

- `title` – Name im **Popup-Header** und als **Tooltip** / `aria-label` am FAB (Standard: `HA Chat`).
- `welcome_title` – Überschrift im **Empty-State** (optional). Wenn nicht gesetzt: `Willkommen im <title>`.
- `welcome_subtitle` – Zeile darunter (optional). Wenn nicht gesetzt: der bisherige Hinweis zu Vorschlägen.
- **Willkommensbild:** Über den Text erscheint ein **eingebettetes** Waving-Hand (PNG in der JS-Datei – kein separater Request, kein 404 unter `/hacsfiles/…`). Optional: `welcome_image_url: /local/mein-bild.png` o. Ä.

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
- `addon_direct_url` / `direct_url` / `addon_port_url` – direkte Basis-URL zum Add-on (Ingress umgehen)
- `welcome_image_url` – alternatives Bild für den Empty-State (sonst eingebettetes Standardbild)
- `zIndex` – z. B. `100000`

### Hinweis zu `/hassio/ingress/...`

Dieser Supervisor-Pfad bleibt für die **eingebettete Web-UI** des Add-ons gedacht; für **programmatische** Aufrufe von Lovelace aus ist **`/api/hassio_ingress/<token>/...`** der passende Zielpfad.
