/**
 * Minimaler Server für HA Chat Add-on: statische Dateien (www/) + Proxy zu N8N Inference-Webhook.
 * Kein Backend (OneNote, Embedding etc.) – alles in N8N.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DATA_DIR = process.env.DATA_DIR || '/data';
const OPTIONS_PATH = path.join(DATA_DIR, 'options.json');
const WWW_DIR = path.join(__dirname, 'www');
const PORT = parseInt(process.env.SUPERVISOR_INGRESS_PORT || process.env.PORT || '8099', 10);

function getInferenceUrl() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf-8');
    const opts = JSON.parse(raw);
    const u = (opts.n8n_inference_webhook_url || '').trim();
    if (u) return u.replace(/\/$/, '');
  } catch (_) {}
  const u = (process.env.N8N_INFERENCE_WEBHOOK_URL || '').trim();
  return u ? u.replace(/\/$/, '') : '';
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function proxyToN8n(webhookUrl, body, res) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  })
    .then((r) => r.text())
    .then((text) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(text || '{}');
    })
    .catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e) }));
    });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '', true);
  const pathname = (parsed.pathname || '/').replace(/\/$/, '') || '/';

  // CORS für Ingress
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    res.end();
    return;
  }

  // Config für Frontend (optional)
  if (pathname === '/config.json' && req.method === 'GET') {
    const inferenceUrl = getInferenceUrl();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ n8n_inference_webhook_url: inferenceUrl }));
    return;
  }

  // Proxy: Chat
  if (pathname === '/api/chat' && req.method === 'POST') {
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'N8N Inference-Webhook-URL fehlt (Add-on konfigurieren)' }));
      return;
    }
    const body = await collectBody(req);
    let data;
    try {
      data = JSON.parse(body || '{}');
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ungültiges JSON' }));
      return;
    }
    const message = (data.message || '').trim();
    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'message fehlt' }));
      return;
    }
    proxyToN8n(inferenceUrl, { message }, res);
    return;
  }

  // Proxy: Aktion (gleicher Webhook, Nachricht = Utterance)
  if (pathname === '/api/execute_action' && req.method === 'POST') {
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'N8N Inference-Webhook-URL fehlt (Add-on konfigurieren)' }));
      return;
    }
    const body = await collectBody(req);
    let data;
    try {
      data = JSON.parse(body || '{}');
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ungültiges JSON' }));
      return;
    }
    const utterance = (data.utterance || '').trim();
    proxyToN8n(inferenceUrl, { message: utterance }, res);
    return;
  }

  // Statische Dateien
  let file = pathname === '/' ? '/index.html' : pathname;
  if (file.startsWith('/')) file = file.slice(1);
  const filePath = path.join(WWW_DIR, file);
  if (file.includes('..')) {
    res.writeHead(400);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(500);
      res.end();
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.ico': 'image/x-icon',
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.writeHead(200);
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('HA Chat (Frontend + N8N Proxy) auf http://0.0.0.0:' + PORT);
});
