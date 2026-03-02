/**
 * Minimaler Server für HA Chat Add-on: statische Dateien (www/) + Proxy zu N8N Inference-Webhook.
 * Kein Backend (OneNote, Embedding etc.) – alles in N8N.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// HTTPS-Aufrufe zu N8N: Zertifikatsprüfung überspringen (z. B. selbstsigniert / lokales N8N)
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('[HA Chat] NODE_TLS_REJECT_UNAUTHORIZED=0 (SSL-Verifikation für Webhook deaktiviert)');
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const OPTIONS_PATH = path.join(DATA_DIR, 'options.json');
const WWW_DIR = path.join(__dirname, 'www');
const PORT = parseInt(process.env.SUPERVISOR_INGRESS_PORT || process.env.PORT || '8099', 10);

const DEFAULT_SUGGESTIONS = [
  'Was kann ich dich fragen?',
  'Welche Lichter sind gerade an?',
  'Zeig mir den Status der Heizung',
  'Welche Geräte sind aktiv?',
];

function getOptions() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf-8');
    const opts = JSON.parse(raw);
    const suggestions = Array.isArray(opts.prompt_suggestions) && opts.prompt_suggestions.length
      ? opts.prompt_suggestions.map(String).filter(Boolean)
      : DEFAULT_SUGGESTIONS;
    return {
      n8n_inference_webhook_url: (opts.n8n_inference_webhook_url || '').trim().replace(/\/$/, ''),
      ha_url:                    (opts.ha_url                    || '').trim().replace(/\/$/, ''),
      ha_token:                  (opts.ha_token                  || '').trim(),
      graph_tenant_id:           (opts.graph_tenant_id           || '').trim(),
      graph_client_id:           (opts.graph_client_id           || '').trim(),
      graph_client_secret:       (opts.graph_client_secret       || '').trim(),
      prompt_suggestions: suggestions,
    };
  } catch (e) {
    if (e.code !== 'ENOENT') console.log('[HA Chat] options.json:', e.message);
  }
  return {
    n8n_inference_webhook_url: (process.env.N8N_INFERENCE_WEBHOOK_URL || '').trim().replace(/\/$/, ''),
    ha_url:                    (process.env.HA_URL                    || '').trim().replace(/\/$/, ''),
    ha_token:                  (process.env.HA_TOKEN                  || '').trim(),
    graph_tenant_id:           (process.env.GRAPH_TENANT_ID           || '').trim(),
    graph_client_id:           (process.env.GRAPH_CLIENT_ID           || '').trim(),
    graph_client_secret:       (process.env.GRAPH_CLIENT_SECRET       || '').trim(),
    prompt_suggestions: DEFAULT_SUGGESTIONS,
  };
}

/* ── MS Graph (Delegated – Authorization Code Flow) ─────────────────── */
const GRAPH_TOKENS_PATH = path.join(DATA_DIR, 'graph_tokens.json');
const GRAPH_STATE_PATH  = path.join(DATA_DIR, 'graph_state.json');
const GRAPH_SCOPE = 'https://graph.microsoft.com/Notes.Read.All offline_access';

function loadGraphTokens() {
  try { return JSON.parse(fs.readFileSync(GRAPH_TOKENS_PATH, 'utf-8')); } catch (_) { return null; }
}
function saveGraphTokens(t) {
  fs.writeFileSync(GRAPH_TOKENS_PATH, JSON.stringify(t), 'utf-8');
}
function saveGraphState(s) {
  fs.writeFileSync(GRAPH_STATE_PATH, JSON.stringify({ state: s, ts: Date.now() }), 'utf-8');
}
function loadGraphState() {
  try { return JSON.parse(fs.readFileSync(GRAPH_STATE_PATH, 'utf-8')); } catch (_) { return null; }
}

async function getGraphToken() {
  const opts = getOptions();
  if (!opts.graph_tenant_id || !opts.graph_client_id) return null;

  let tokens = loadGraphTokens();
  if (!tokens) return null;

  /* Access-Token noch gültig? */
  if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  /* Refresh */
  if (!tokens.refresh_token) { console.log('[HA Chat] Graph: kein Refresh-Token – bitte erneut einloggen'); return null; }
  const tokenUrl = 'https://login.microsoftonline.com/' + opts.graph_tenant_id + '/oauth2/v2.0/token';
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     opts.graph_client_id,
    client_secret: opts.graph_client_secret || '',
    refresh_token: tokens.refresh_token,
    scope:         GRAPH_SCOPE,
  });
  const r = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.access_token) {
    console.log('[HA Chat] Graph Refresh fehlgeschlagen:', JSON.stringify(data));
    return null;
  }
  tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at:    Date.now() + (data.expires_in || 3600) * 1000,
  };
  saveGraphTokens(tokens);
  console.log('[HA Chat] Graph Access-Token per Refresh erneuert');
  return tokens.access_token;
}

function buildAuthUrl(opts, redirectUri, state) {
  const params = new URLSearchParams({
    client_id:     opts.graph_client_id,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         GRAPH_SCOPE,
    state:         state,
    response_mode: 'query',
  });
  return 'https://login.microsoftonline.com/' + opts.graph_tenant_id + '/oauth2/v2.0/authorize?' + params.toString();
}

async function exchangeCodeForTokens(opts, code, redirectUri) {
  const tokenUrl = 'https://login.microsoftonline.com/' + opts.graph_tenant_id + '/oauth2/v2.0/token';
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     opts.graph_client_id,
    client_secret: opts.graph_client_secret || '',
    code,
    redirect_uri:  redirectUri,
    scope:         GRAPH_SCOPE,
  });
  const r = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  return r.json().catch(() => ({}));
}

function getInferenceUrl() {
  return getOptions().n8n_inference_webhook_url;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function proxyToN8n(webhookUrl, body, res, logLabel) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  console.log('[HA Chat] ' + logLabel + ' → POST ' + webhookUrl + ' body=' + bodyStr);
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  })
    .then((r) => {
      return r.text().then((text) => {
        console.log('[HA Chat] ' + logLabel + ' ← ' + r.status + ' ' + r.statusText + ' len=' + (text ? text.length : 0));
        if (!r.ok) {
          console.log('[HA Chat] ' + logLabel + ' Fehler-Body: ' + (text ? text.slice(0, 500) : '(leer)'));
        } else if (text) {
          const preview = text.length > 300 ? text.slice(0, 300) + '…' : text;
          console.log('[HA Chat] ' + logLabel + ' Body: ' + preview);
        }
        return { ok: r.ok, status: r.status, text };
      });
    })
    .then(({ ok, status, text }) => {
      let out = text || '{}';
      try {
        const data = JSON.parse(out);
        if (data.answer === undefined && data.response !== undefined) {
          data.answer = data.response;
          out = JSON.stringify(data);
          console.log('[HA Chat] ' + logLabel + ' Antwort verwendet "response" als "answer"');
        }
      } catch (_) {}
      res.writeHead(ok ? 200 : status, { 'Content-Type': 'application/json' });
      res.end(out);
    })
    .catch((e) => {
      console.log('[HA Chat] ' + logLabel + ' Exception: ' + (e.message || String(e)));
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

  // Config für Frontend
  if (pathname === '/config.json' && req.method === 'GET') {
    const opts = getOptions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      n8n_inference_webhook_url: opts.n8n_inference_webhook_url,
      prompt_suggestions: opts.prompt_suggestions,
    }));
    return;
  }

  // Proxy: Chat
  if (pathname === '/api/chat' && req.method === 'POST') {
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
      console.log('[HA Chat] chat: Webhook-URL fehlt (options.json oder N8N_INFERENCE_WEBHOOK_URL prüfen)');
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
    const payload = { message };
    if (data.session_id) payload.session_id = String(data.session_id);
    proxyToN8n(inferenceUrl, payload, res, 'chat');
    return;
  }

  // Home Assistant: Entity-State abfragen (für Anzeige on/off, Icon)
  if (pathname === '/api/ha_entity_state' && req.method === 'GET') {
    const opts = getOptions();
    const entityId = (parsed.query && parsed.query.entity_id) ? String(parsed.query.entity_id).trim() : '';
    if (!opts.ha_url || !opts.ha_token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'HA URL oder Token fehlt' }));
      return;
    }
    if (!entityId || !/^[a-z_]+\.[a-z0-9_.-]+$/i.test(entityId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'entity_id ungültig' }));
      return;
    }
    const urlHa = opts.ha_url + '/api/states/' + encodeURIComponent(entityId);
    fetch(urlHa, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + opts.ha_token },
    })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (!data || data.entity_id === undefined) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ state: 'unknown', icon: 'mdi:help-circle', friendly_name: entityId }));
          return;
        }
        const att = data.attributes || {};
        const domain = (data.entity_id || '').split('.')[0];
        const defaultIcons = { light: 'mdi:lightbulb', switch: 'mdi:flash', cover: 'mdi:blinds', fan: 'mdi:fan', climate: 'mdi:thermostat', lock: 'mdi:lock', media_player: 'mdi:cast' };
        const icon = att.icon || defaultIcons[domain] || 'mdi:circle-outline';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          state: data.state || 'unknown',
          icon: icon,
          friendly_name: att.friendly_name || data.entity_id,
        }));
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      });
    return;
  }

  // Home Assistant: Service-Aufruf (für Entity-Buttons im Chat)
  if (pathname === '/api/ha_call' && req.method === 'POST') {
    const opts = getOptions();
    if (!opts.ha_url || !opts.ha_token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'HA URL oder Token fehlt (Add-on konfigurieren)' }));
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
    const entityId = (data.entity_id || '').trim();
    const action = (data.action || '').trim();
    if (!entityId || !/^[a-z_]+\.[a-z0-9_]+$/i.test(entityId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'entity_id ungültig' }));
      return;
    }
    if (!action || !/^[a-z0-9_]+$/i.test(action)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'action/service ungültig oder leer' }));
      return;
    }
    const domain = entityId.split('.')[0];
    const urlHa = opts.ha_url + '/api/services/' + domain + '/' + action;
    console.log('[HA Chat] ha_call ' + entityId + ' → ' + action);
    fetch(urlHa, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + opts.ha_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: entityId }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((json) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json || {}));
      })
      .catch((e) => {
        console.log('[HA Chat] ha_call Fehler: ' + (e.message || String(e)));
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      });
    return;
  }

  // Proxy: Aktion (gleicher Webhook, Nachricht = Utterance)
  if (pathname === '/api/execute_action' && req.method === 'POST') {
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
      console.log('[HA Chat] execute_action: Webhook-URL fehlt');
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
    const actionPayload = { message: utterance };
    if (data.session_id) actionPayload.session_id = String(data.session_id);
    proxyToN8n(inferenceUrl, actionPayload, res, 'action');
    return;
  }

  // Graph Auth-Status
  if (pathname === '/api/graph_status' && req.method === 'GET') {
    const opts    = getOptions();
    const tokens  = loadGraphTokens();
    const configured    = !!(opts.graph_tenant_id && opts.graph_client_id);
    const authenticated = !!(tokens && tokens.refresh_token);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured, authenticated, expires_at: tokens ? tokens.expires_at : null }));
    return;
  }

  // Graph OAuth Login starten
  if (pathname === '/api/graph_auth' && req.method === 'GET') {
    const opts = getOptions();
    if (!opts.graph_tenant_id || !opts.graph_client_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'graph_tenant_id und graph_client_id müssen konfiguriert sein' }));
      return;
    }
    const proto      = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host       = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const basePath   = (req.headers['x-ingress-path'] || '').replace(/\/$/, '');
    const redirectUri = proto + '://' + host + basePath + '/api/graph_callback';
    const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    saveGraphState(state);
    console.log('[HA Chat] graph_auth → redirect_uri=' + redirectUri);
    res.writeHead(302, { Location: buildAuthUrl(opts, redirectUri, state) });
    res.end();
    return;
  }

  // Graph OAuth Callback
  if (pathname === '/api/graph_callback' && req.method === 'GET') {
    const opts  = getOptions();
    const code  = parsed.query.code  || '';
    const state = parsed.query.state || '';
    const storedState = loadGraphState();
    const htmlClose = (title, body) =>
      '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;'
      + 'height:100vh;margin:0;background:#111;color:#eee;text-align:center}</style></head>'
      + '<body><div><h2>' + title + '</h2><p>' + body + '</p></div></body></html>';

    if (!code) {
      const errDesc = parsed.query.error_description || parsed.query.error || 'unbekannt';
      console.log('[HA Chat] graph_callback Fehler:', errDesc);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlClose('Fehler beim Login', errDesc + '<br><br><button onclick="window.close()">Schließen</button>'));
      return;
    }
    if (!storedState || storedState.state !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlClose('Ungültiger State', 'Bitte Login erneut starten.<br><br><button onclick="window.close()">Schließen</button>'));
      return;
    }
    const proto       = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const host        = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const basePath    = (req.headers['x-ingress-path'] || '').replace(/\/$/, '');
    const redirectUri = proto + '://' + host + basePath + '/api/graph_callback';
    const tokenData = await exchangeCodeForTokens(opts, code, redirectUri);
    if (!tokenData.access_token) {
      console.log('[HA Chat] graph_callback Token-Exchange Fehler:', JSON.stringify(tokenData));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlClose('Token-Exchange fehlgeschlagen', (tokenData.error_description || tokenData.error || 'unbekannt') + '<br><br><button onclick="window.close()">Schließen</button>'));
      return;
    }
    saveGraphTokens({
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at:    Date.now() + (tokenData.expires_in || 3600) * 1000,
    });
    console.log('[HA Chat] graph_callback: Tokens gespeichert, Login erfolgreich');
    /* Popup schließt sich selbst; Chat-Seite pollt /api/graph_status */
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlClose('✓ Login erfolgreich', 'Microsoft Graph verbunden. Dieses Fenster schließt sich automatisch…'
      + '<script>setTimeout(function(){window.close();},1500);</script>'));
    return;
  }

  // Proxy: Bild via MS Graph Token abrufen
  if (pathname === '/api/proxy_image' && req.method === 'GET') {
    const imageUrl = (parsed.query && parsed.query.url) ? String(parsed.query.url).trim() : '';
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'url fehlt oder ungültig' }));
      return;
    }
    try {
      const token = await getGraphToken();
      if (!token) {
        console.log('[HA Chat] proxy_image: kein Token verfügbar (Credentials prüfen)');
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Kein Graph-Token (Credentials konfiguriert?)' }));
        return;
      }
      console.log('[HA Chat] proxy_image → GET ' + imageUrl.slice(0, 120));
      const imgRes = await fetch(imageUrl, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!imgRes.ok) {
        const errBody = await imgRes.text().catch(() => '');
        console.log('[HA Chat] proxy_image ' + imgRes.status + ' für ' + imageUrl.slice(0, 80));
        console.log('[HA Chat] proxy_image Graph-Fehler:', errBody.slice(0, 500));
        res.writeHead(imgRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'HTTP ' + imgRes.status, detail: errBody.slice(0, 300) }));
        return;
      }
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      const buf = await imgRes.arrayBuffer();
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' });
      res.end(Buffer.from(buf));
    } catch (e) {
      console.log('[HA Chat] proxy_image Fehler:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
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
  const inferenceUrl = getInferenceUrl();
  console.log('HA Chat (Frontend + N8N Proxy) auf http://0.0.0.0:' + PORT);
  console.log('[HA Chat] N8N Inference-Webhook: ' + (inferenceUrl ? 'gesetzt (' + inferenceUrl.split('/')[0] + '//' + (inferenceUrl.split('/')[2] || '') + '/…)' : 'nicht konfiguriert'));
});
