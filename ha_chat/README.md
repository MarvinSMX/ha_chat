# HA Chat (N8N)

Add-on: **nur Frontend** + minimaler Proxy zum N8N Inference-Webhook. Embedding, RAG, OneNote-Sync etc. liegen vollständig in N8N.

## Installation

Inhalt von `addon/ha_chat/ha_chat/` ins Add-on-Verzeichnis kopieren (z. B. `addons/ha_chat/`). In Home Assistant: **Einstellungen** → **Add-ons** → **HA Chat (N8N)** installieren und starten.

**Chat-UI:** Über Ingress oder `http://<dein-ha>:8765`.

## Konfiguration

- **N8N Inference-Webhook-URL** – Endpoint für Chat-Anfragen.
- **System Prompt** – Standard-Systemprompt für Chat/Action-Webhook; ist im Add-on-Setting vorausgefüllt und kann dort angepasst werden.
- **HA URL** (optional) – z. B. `http://homeassistant.local:8123`. Nur nötig für Entity-Steuerung (Buttons im Chat).
- **HA Token** (optional) – Long-Lived Access Token von Home Assistant. Unter **Profil** → **Sicherheit** → **Token erstellen**.

## N8N Inference-Webhook

**Request (POST):**
```json
{
  "message": "Nutzerfrage",
  "session_id": "optional",
  "system_prompt": "optional (kommt standardmäßig aus Add-on-Settings)",
  "room_scope": "optional, z. B. C0.09",
  "mcp_bearer_token": "optional, für room-gekoppeltes MCP"
}
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

### MCP (Model Context Protocol) im Add-on

Der Server bietet **Streamable HTTP** (stateless) unter **`/api/mcp`** – **derselbe Port** wie die Web-UI (Ingress oder direkter Host-Port, z. B. `:8765`).

**Authentifizierung:** Entweder global über `Authorization: Bearer <mcp_bearer_token>` oder **raumgebunden** über `mcp_token_room_scopes` (Format je Zeile: `<token>|<raum>`, z. B. `abc123|C0.09`). Ohne konfigurierten Token antwortet der Endpoint mit 503. Das ist **unabhängig** vom Home-Assistant-MCP unter `/api/mcp` auf der HA-Instanz.

**Home Assistant:** Es werden weiterhin **HA URL** und **HA Token** aus der Add-on-Konfiguration verwendet (REST `/api/states`, `/api/services/...`).

**Einschränkung sichtbarer/steuerbarer Entities (pro „Profil“ / pro Client):**

- **mcp_entity_allowlist** – kommagetrennt oder zeilenweise: nur diese `entity_id`-Werte (z. B. `light.wohnzimmer,switch.kueche`).
- **mcp_domain_allowlist** – z. B. `light,switch` – nur Entities dieser Domains.
- **mcp_token_room_scopes** – pro Zeile `<token>|<raum>`; damit sind MCP-Ergebnisse/Service-Aufrufe auf den Raum gefiltert (Match über `entity_id`/`friendly_name`).
- Beide Felder gesetzt: eine Entity muss **beiden** Bedingungen genügen (ID in Liste **und** Domain erlaubt).
- Leer lassen: alles, was das **HA-Token** darf.

**Tools:** `list_entities`, `search_entities`, `get_entity_state`, `call_service` (mit `service_data.entity_id` bei eingeschränktem Zugriff). **Prompt:** `ha_chat_scoped_assistant`.

- `list_entities`: gibt ohne `limit` **alle** erlaubten Entities zurück (`total`, `returned`, `has_more`).
- `search_entities`: gezielte Suche über `query` (Name/Entity-ID), optional `domain`, `state`, plus `limit`/`offset`.

**Client-Beispiel (URL):** `http://<host>:8765/api/mcp` bzw. über Ingress die Add-on-URL + `/api/mcp`. Für Cursor o. Ä. analog zur HA-Doku mit **mcp-proxy** und `--transport=streamablehttp --stateless`, Ziel-URL auf dieses Add-on zeigen und `Authorization: Bearer <mcp_bearer_token>` setzen.

**Abschalten:** **mcp_enabled** auf `false`.

Embedding, Vektorspeicher, LLM – weiterhin in deinem N8N-Workflow.
