# HA Chat (N8N)

Add-on: **nur Frontend** + minimaler Proxy zum N8N Inference-Webhook. Embedding, RAG, OneNote-Sync etc. liegen vollständig in N8N.

## Installation

Inhalt von `addon/ha_chat/ha_chat/` ins Add-on-Verzeichnis kopieren (z. B. `addons/ha_chat/`). In Home Assistant: **Einstellungen** → **Add-ons** → **HA Chat (N8N)** installieren und starten.

**Chat-UI:** Über Ingress oder `http://<dein-ha>:8765`.

## Konfiguration

- **N8N Inference-Webhook-URL** – Endpoint für Chat-Anfragen.
- **HA URL** (optional) – z. B. `http://homeassistant.local:8123`. Nur nötig für Entity-Steuerung (Buttons im Chat).
- **HA Token** (optional) – Long-Lived Access Token von Home Assistant. Unter **Profil** → **Sicherheit** → **Token erstellen**.

## N8N Inference-Webhook

**Request (POST):**
```json
{ "message": "Nutzerfrage" }
```

**Erwartete Antwort (JSON):**
```json
{
  "answer": "Antworttext. Quellen: [Quelle 1](https://…). Steuerung: [entity:light.wohnzimmer:turn_on:Licht an]",
  "sources": [
    { "title": "Quelle 1", "url": "https://…", "score": 0.92 }
  ],
  "actions": [
    { "label": "Aktion ausführen", "utterance": "Befehl für Folgenachricht" }
  ],
  "entity_actions": [
    { "entity_id": "light.wohnzimmer", "action": "turn_on", "label": "Licht an" }
  ]
}
```

- **answer**: Text; darin werden `[Text](URL)` als klickbare Link-Badges und **Entity-Buttons** gerendert (siehe unten).
- **sources**: Optionale Quellen-Links.
- **actions**: Buttons; Klick sendet `utterance` erneut an den Webhook.
- **entity_actions**: Buttons, die beim Klick die Entity **umschalten** (toggle). Erfordert **HA URL** und **HA Token**.

### Entity-Buttons im Text (In-Text-Steuerung)

Im Feld **answer** kann N8N folgende Syntax ausgeben; sie wird als klickbarer Badge-Button gerendert:

- **Format:** `[entity:<entity_id>:<action>:<label>]` – **action** wird ignoriert, beim Klick wird immer **toggle** aufgerufen.
- **Beispiel:** `[entity:light.buero:turn_on:Büro]` → Ein Button „Büro“; Klick schaltet die Entity um (an ↔ aus).

Der Add-on-Server leitet den Aufruf an die Home-Assistant-API weiter (Endpoint `/api/ha_call`).

**State-Anzeige:** Wenn **HA URL** und **HA Token** gesetzt sind, fragt die App den aktuellen State jeder Entity ab (`/api/ha_entity_state`). Entity-Buttons werden dann mit **MDI-Icon** (vor dem Text) und **Farbe** dargestellt: **an** (z. B. on, open) = Primary-Farbe (#009AC7), **aus** (off, closed) = grau.

### MCP (Model Context Protocol) und N8N

**Kann ein MCP-Server in der App laufen und HA-Entitäten bereitstellen?**

- **Ja, möglich:** Ein MCP-Server könnte im gleichen Add-on (oder als separates Add-on) laufen und über die HA-REST-API (mit `ha_url` + `ha_token`) Entitäten auflisten und Services aufrufen. N8N (oder ein LLM-Node mit MCP-Client) könnte sich zu diesem MCP-Server verbinden und so z. B. „alle Lichter“ abfragen oder „light.living_room einschalten“ ausführen.
- **Aktuell nicht enthalten:** Dieses Add-on enthält keinen MCP-Server. Du kannst einen eigenen MCP-Server (z. B. in Node oder Python) betreiben, der die HA-API anbindet, und N8N als MCP-Client darauf zugreifen lassen. Die Add-on-Optionen **HA URL** und **HA Token** könnten dann auch vom MCP-Server gelesen werden (z. B. aus derselben `options.json` oder Umgebungsvariablen).

Embedding, Vektorspeicher, LLM – alles in deinem N8N-Workflow.
