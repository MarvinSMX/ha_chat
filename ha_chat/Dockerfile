# Frontend + N8N-Proxy + MCP (Streamable HTTP)
FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY www ./www
COPY server.js mcp-handler.js ./
EXPOSE 8099
CMD ["node", "server.js"]
