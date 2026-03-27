# Frontend + N8N-Proxy + MCP (Streamable HTTP)
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/pyenv && /opt/pyenv/bin/pip install --no-cache-dir --upgrade pip && /opt/pyenv/bin/pip install --no-cache-dir faiss-cpu numpy
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY www ./www
COPY search ./search
COPY server.js mcp-handler.js faiss_index.py ./
EXPOSE 8099
CMD ["node", "server.js"]
