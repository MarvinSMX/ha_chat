# Monorepo: Vue Frontend + NestJS Backend für HA Add-on (RAG in N8N)
FROM node:20-bookworm AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN node node_modules/@nestjs/cli/bin/nest.js build
RUN npm prune --production

# Final: nur Node – Frontend + API (OneNote/Graph, N8N-Webhooks)
FROM node:20-bookworm
WORKDIR /app/backend
COPY --from=backend /app/backend/package*.json ./
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV FRONTEND_DIST=/app/frontend/dist
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=512
EXPOSE 8099
CMD ["/run.sh"]
