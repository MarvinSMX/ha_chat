# HA Chat (N8N)

Add-on: **nur Frontend** + minimaler Proxy zum N8N Inference-Webhook. Embedding, RAG, OneNote-Sync etc. liegen vollständig in N8N.

## Installation

Inhalt von `addon/ha_chat/ha_chat/` ins Add-on-Verzeichnis kopieren (z. B. `addons/ha_chat/`). In Home Assistant: **Einstellungen** → **Add-ons** → **HA Chat (N8N)** installieren und starten.

**Chat-UI:** Über Ingress oder `http://<dein-ha>:8765`.

## Konfiguration

- **N8N Inference-Webhook-URL** – Endpoint für Chat-Anfragen.
- **HA URL** (optional) – z. B. `http://homeassistant.local:8123`. Nur nötig für Entity-Steuerung (Buttons im Chat).
- **HA Token** (optional) – Long-Lived Access Token von Home Assistant. Unter **Profil** → **Sicherheit** → **Token erstellen**.
- **System Prompt** – globaler Standardprompt für N8N (im Add-on vorbelegt mit dem aktuellen Default; kann in den Add-on-Settings überschrieben werden).

## N8N Inference-Webhook

**Request (POST):**
```json
{
  "message": "Nutzerfrage",
  "system_prompt": "…",
  "area_scope": "C0.09"
}
```

- `system_prompt` wird vom Add-on aus den Settings gesetzt (Default vorbelegt) und an N8N weitergegeben.
- `area_scope` kommt optional z. B. aus der FAB-Konfiguration (`area_scope`) und kann von N8N für MCP-Raumsuche genutzt werden.

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

**Authentifizierung:** `Authorization: Bearer <mcp_bearer_token>` (Add-on-Option **mcp_bearer_token** setzen; ohne Token antwortet der Endpoint mit 503). Das ist **unabhängig** vom Home-Assistant-MCP unter `/api/mcp` auf der HA-Instanz.

**Home Assistant:** Es werden weiterhin **HA URL** und **HA Token** aus der Add-on-Konfiguration verwendet (REST `/api/states`, `/api/services/...`).

**Einschränkung sichtbarer/steuerbarer Entities (pro „Profil“ / pro Client):**

- **mcp_entity_allowlist** – kommagetrennt oder zeilenweise: nur diese `entity_id`-Werte (z. B. `light.wohnzimmer,switch.kueche`).
- **mcp_domain_allowlist** – z. B. `light,switch` – nur Entities dieser Domains.
- **mcp_area_allowlist** – nur Native HA Areas (Name oder `area_id`), z. B. `C0.09` oder `8f0d...`.
- Beide Felder gesetzt: eine Entity muss **beiden** Bedingungen genügen (ID in Liste **und** Domain erlaubt).
- Leer lassen: alles, was das **HA-Token** darf.

**Tools:** `list_entities`, `search_entities`, `get_entity_state`, `call_service` (mit `service_data.entity_id` bei eingeschränktem Zugriff). **Prompt:** `ha_chat_scoped_assistant`.

- `list_entities`: gibt ohne `limit` **alle** erlaubten Entities zurück (`total`, `returned`, `has_more`), optional `area`.
- `search_entities`: gezielte Suche über `query` (Name/Entity-ID), optional `domain`, `state`, `area`, plus `limit`/`offset`.
- `get_entity_state` / `call_service`: optionaler `area`-Parameter für zusätzlichen Room-Scope.

**Client-Beispiel (URL):** `http://<host>:8765/api/mcp` bzw. über Ingress die Add-on-URL + `/api/mcp`. Für Cursor o. Ä. analog zur HA-Doku mit **mcp-proxy** und `--transport=streamablehttp --stateless`, Ziel-URL auf dieses Add-on zeigen und `Authorization: Bearer <mcp_bearer_token>` setzen.

**Sicherer Scope per URL (AI kann ihn nicht überschreiben):**

- Du kannst den Bereich fest in der MCP-URL setzen, z. B. `.../api/mcp?scope=C0.09`.
- Wenn `scope` gesetzt ist, wird ein ggf. von der AI übergebenes Tool-Argument `area` **ignoriert**.
- Das reduziert Prompt-Injection-Risiken für Bereichswechsel.

**Abschalten:** **mcp_enabled** auf `false`.

Embedding, Vektorspeicher, LLM – weiterhin in deinem N8N-Workflow.
