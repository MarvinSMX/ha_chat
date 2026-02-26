# HA Chat – Monorepo (Vue + NestJS)

Unter `addon/ha_chat/ha_chat/` liegt ein Monorepo:

- **frontend/** – Vue 3 + Vite (Chat-UI, OneNote-Karte)
- **backend/** – NestJS (RAG, ChromaDB-Anbindung, OneNote-API, Chunking)
- **Dockerfile** – baut Frontend + Backend, startet Chroma (Python) + NestJS im Container

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
│   │   ├── chat/       # RAG, Chroma HTTP, Azure OpenAI
│   │   └── onenote/    # Status, Notizbuch speichern, Sync (Stub)
│   ├── package.json
│   └── tsconfig.json
├── Dockerfile         # Multi-Stage: frontend build → backend build → Chroma + Node
├── run-nestjs.sh      # Startet Chroma (Port 8000), dann NestJS (Port 8099)
└── config.yaml        # HA Add-on Konfiguration (unverändert)
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

- **Chroma** läuft im Container auf Port 8000 (Persistenz: `/data/chromadb`).
- **NestJS** liest Optionen aus `/data/options.json`, dient die Vue-App und die API unter `/api/*`.
- **Port** für Ingress: 8099 (oder `SUPERVISOR_INGRESS_PORT`).

## Offene Punkte

- **OneNote-Sync** im Backend ist noch Stub (MSAL + Microsoft Graph in Node anbinden, gleiche Logik wie in Python).
- **Chroma HTTP-API**: `chroma.service.ts` nutzt fetch gegen `CHROMA_URL`; ggf. Pfade an die tatsächliche Chroma-API anpassen.
- **execute_action / add_documents**: bei Bedarf in NestJS ergänzen (wie in der Python-Version).
