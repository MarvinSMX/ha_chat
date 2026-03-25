## HACS Frontend: HA Chat FAB

Dieses Repo enthält zusätzlich eine HACS-Frontend-Resource, die auf Home Assistant Dashboards unten rechts ein schwebendes Chat-Icon einblendet.

### Installation (HACS)

- In HACS: **Frontend** → **Custom repositories** → dieses Git-Repo hinzufügen (Kategorie **Frontend**).
- Resource hinzufügen: **Einstellungen → Dashboards → Ressourcen**
  - URL: `/hacsfiles/ha-chat-fab/ha-chat-fab.js`
  - Typ: `JavaScript Module`

### Konfiguration (optional)

Du kannst das Ziel und Position global überschreiben:

```js
window.haChatFabConfig = {
  href: "/hassio/ingress/ha_chat",
  icon: "mdi:chat",
  bottom: 20,
  right: 20,
  zIndex: 9999
};
```

