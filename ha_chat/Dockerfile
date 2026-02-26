# Monorepo: Vue Frontend + NestJS Backend für HA Add-on
FROM node:20-bookworm AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
RUN npm run build

# Final: Backend + Frontend + Chroma (Python) für Vektorspeicher
FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/* \
  && pip install --break-system-packages --no-cache-dir chromadb

WORKDIR /app/backend
COPY --from=backend /app/backend/package*.json ./
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY run-nestjs.sh /run.sh
RUN chmod +x /run.sh

ENV FRONTEND_DIST=/app/frontend/dist
ENV CHROMA_URL=http://127.0.0.1:8000
ENV NODE_ENV=production
EXPOSE 8099
CMD ["/run.sh"]
