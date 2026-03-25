## HACS Frontend: HA Chat FAB (Lovelace Card)

Dieses Repo enthält zusätzlich eine HACS-Frontend-Resource als **Lovelace Custom Card**. Du platzierst die Card in einem Dashboard/View – dann wird dort unten rechts ein schwebendes Chat-Icon eingeblendet.

### Warum kein `fetch()` zum Ingress?

Von der normalen HA-Oberfläche (Lovelace) führen Requests zu `/hassio/ingress/<slug>/api/...` oft **nicht** zum Add-on: Antwort kann die **HA-Shell (HTML)** sein, **POST** kann **405 Method Not Allowed** liefern. Das ist eine Eigenschaft des Ingress-/Proxy-Pfads für Seitenkontexte außerhalb der eingebetteten App.

Diese Card öffnet deshalb ein **Popup mit `<iframe>`**, dessen `src` dieselbe URL ist wie beim direkten Öffnen der Chat-App (z. B. `/app/<slug>_ha_chat`). Darin laufen Skripte und API-Aufrufe wie in der Vollansicht.

### Installation (HACS)

- In HACS: **Frontend** → **Custom repositories** → dieses Git-Repo hinzufügen (Kategorie **Frontend**).
- Resource hinzufügen: **Einstellungen → Dashboards → Ressourcen**
  - URL: `/hacsfiles/<dein-repo-name>/ha-chat-fab.js`
  - Typ: `JavaScript Module`

### Nutzung (pro Dashboard/View)

Füge in dem gewünschten Dashboard/View eine **Manuelle Karte** hinzu:

```yaml
type: custom:ha-chat-fab
href: /app/2954ddb4_ha_chat
icon: mdi:chat
```

`href` muss die **funktionierende App-URL** deiner Installation sein (wie in der Seitenleiste unter Add-ons → HA Chat → „Im Web öffnen“ oder der Panel-Pfad mit Repo-Slug).

Die Card selbst ist unsichtbar, sie aktiviert nur den FAB für genau diesen View.  
Beim Klick öffnet sich ein **Popup unten rechts** (kein Seitenwechsel) mit der eingebetteten Chat-App.

### Konfiguration (optional)

```yaml
type: custom:ha-chat-fab
href: /hassio/ingress/ha_chat
icon: mdi:chat
zIndex: 100000
```

Falls bei dir nur der Ingress-Pfad stabil ist, kannst du ihn als `href` setzen – wichtig ist, dass dieselbe URL im Browser auch die Chat-UI lädt (nicht nur für `fetch` von Lovelace).
