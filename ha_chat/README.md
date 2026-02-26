# HA Chat (OneNote RAG)

Add-on: **Frontend** (Vue) + **OneNote/Graph** (Notizbücher, Sync). RAG (Embedding, Vektorspeicher, Inference) läuft in **N8N** über zwei Webhooks.

## Installation

Inhalt von `addon/ha_chat/ha_chat/` ins Add-on-Verzeichnis kopieren (z. B. `addons/ha_chat/`). In Home Assistant: **Einstellungen** → **Apps** → **Nach Updates suchen** → **HA Chat (OneNote RAG)** installieren und starten.

**Chat-UI:** `http://<dein-ha>:8765` oder über Ingress.

## Konfiguration

- **Microsoft Client-ID / Tenant-ID** – für OneNote (Graph API, Device Flow).
- **N8N Ingest-Webhook-URL** – Endpoint, an den der Sync die OneNote-Dokumente sendet (Embedding + Speicher in N8N).
- **N8N Inference-Webhook-URL** – Endpoint für Chat-Anfragen (RAG-Antwort aus N8N).

## N8N-Webhooks

### 1) Ingest (Sync → N8N)

Beim **Sync** (manuell oder beim Start) holt die App OneNote-Inhalte per Graph API, erzeugt Chunks und sendet sie per **POST** an die Ingest-URL.

**Body (Beispiel):**
```json
{
  "documents": [
    {
      "content": "Text des Chunks …",
      "metadata": {
        "pageId": "...",
        "chunkIndex": 0,
        "title": "Seitentitel",
        "section": "Abschnitt",
        "notebook": "Notizbuch",
        "lastModified": "2025-02-26T…",
        "url": "https://…"
      }
    }
  ]
}
```

Im N8N-Workflow: Dokumente empfangen → chunken (falls gewünscht) → embedden → in Vektorspeicher (z. B. Chroma, Qdrant) schreiben.

### 2) Inference (Chat → N8N)

Bei jeder **Chat-Nachricht** sendet die App **POST** an die Inference-URL.

**Request-Body:**
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
  "actions": []
}
```

Im N8N-Workflow: Nachricht empfangen → Query-Embedding → Similarity Search → LLM mit Kontext → Antwort + Quellen zurückgeben.

Ausführliche Anleitung: [README im Add-on-Ordner](../README.md).
