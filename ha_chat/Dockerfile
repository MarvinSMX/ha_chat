# Nur Frontend + minimaler Proxy zu N8N (kein Backend, kein OneNote/Embedding)
FROM node:20-bookworm-slim
WORKDIR /app
COPY www ./www
COPY server.js ./
EXPOSE 8099
CMD ["node", "server.js"]
