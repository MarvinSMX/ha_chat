# HA Chat (N8N)

Add-on: **nur Frontend** + minimaler Proxy zum N8N Inference-Webhook. Embedding, RAG, OneNote-Sync etc. liegen vollständig in N8N.

## Installation

Inhalt von `addon/ha_chat/ha_chat/` ins Add-on-Verzeichnis kopieren (z. B. `addons/ha_chat/`). In Home Assistant: **Einstellungen** → **Add-ons** → **HA Chat (N8N)** installieren und starten.

**Chat-UI:** Über Ingress oder `http://<dein-ha>:8765`.

## Konfiguration

- **N8N Inference-Webhook-URL** – Endpoint für Chat-Anfragen. Die App sendet jede Nutzerfrage per POST an diese URL; N8N liefert RAG-Antwort, Quellen und optionale Aktionen.

## N8N Inference-Webhook

**Request (POST):**
```json
{ "message": "Nutzerfrage" }
```

**Erwartete Antwort (JSON):**
```json
{
  "answer": "Antworttext",
  "sources": [
    { "title": "Quelle 1", "url": "https://…", "score": 0.92 }
  ],
  "actions": [
    { "label": "Aktion ausführen", "utterance": "Befehl für Folgenachricht" }
  ]
}
```

Aktionen werden im UI als Buttons angezeigt; Klick sendet `utterance` erneut an denselben Webhook als `message`.

Embedding, Vektorspeicher, LLM – alles in deinem N8N-Workflow.
