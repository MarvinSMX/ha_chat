## HACS Frontend: HA Chat FAB (Lovelace Card)

Dieses Repo enthält zusätzlich eine HACS-Frontend-Resource als **Lovelace Custom Card**. Du platzierst die Card in einem Dashboard/View – dann wird dort unten rechts ein schwebendes Chat-Icon eingeblendet.

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
slug: 2954ddb4_ha_chat
icon: mdi:chat
```

Die Card selbst ist unsichtbar, sie aktiviert nur den FAB für genau diesen View.  
Beim Klick öffnet sich ein **Popup unten rechts** (kein Seitenwechsel), das über Ingress die API deines Add-ons nutzt.

### Konfiguration (optional)

Du kannst das Ziel und Position global überschreiben:

```js
type: custom:ha-chat-fab
href: /hassio/ingress/ha_chat
icon: mdi:chat
zIndex: 9999
```

