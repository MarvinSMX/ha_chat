# HA Chat – Monorepo (Vue + NestJS)

Unter `addon/ha_chat/ha_chat/`:

- **frontend/** – Vue 3 + Vite (Chat-UI, OneNote-Karte)
- **backend/** – NestJS (statisches Frontend, OneNote/Graph, N8N-Webhook-Client)
- **Dockerfile** – baut Frontend + Backend, startet nur Node (kein Chroma/Python)

## Struktur

```
ha_chat/
├── frontend/          # Vue 3 + Vite
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── components/
│   │       ├── ChatThread.vue
│   │       └── OnenoteCard.vue
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── backend/           # NestJS
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/options.ts
│   │   ├── chat/       # N8nService (Ingest + Inference), ChatController
│   │   ├── onenote/    # MSAL, Graph, Sync → N8N Ingest
│   │   └── util/
│   ├── package.json
│   └── tsconfig.json
├── Dockerfile         # Multi-Stage: frontend build → backend build → nur Node
├── run.sh             # Startet NestJS (Port 8099)
└── config.yaml        # HA Add-on (Microsoft, OneNote, N8N-URLs)
```

## Build (lokal)

```bash
cd addon/ha_chat/ha_chat

# Frontend
cd frontend && npm ci && npm run build && cd ..

# Backend
cd backend && npm ci && npm run build && cd ..

# Docker (für HA)
docker build -t ha-chat .
```

## Laufzeit

- **NestJS** liest Optionen aus `/data/options.json`, dient die Vue-App und `/api/*`.
- **Port:** 8099 (bzw. `SUPERVISOR_INGRESS_PORT`).
- **RAG/Embedding/Inference** laufen in N8N (Ingest- und Inference-Webhook).
