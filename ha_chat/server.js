/**
 * Minimaler Server für HA Chat Add-on: statische Dateien (www/) + Proxy zu externem Backend-Service.
 * Optional weiterhin AI-SDK lokal im Add-on.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { handleMcpHttp } = require('./mcp-handler.js');

// HTTPS-Aufrufe zu externen Webhooks: Zertifikatsprüfung überspringen (z. B. selbstsigniert)
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('[HA Chat] NODE_TLS_REJECT_UNAUTHORIZED=0 (SSL-Verifikation für Webhook deaktiviert)');
}

const DATA_DIR   = process.env.DATA_DIR || '/data';
const OPTIONS_PATH = path.join(DATA_DIR, 'options.json');
const WWW_DIR    = path.join(__dirname, 'www');
const PORT       = parseInt(process.env.SUPERVISOR_INGRESS_PORT || process.env.PORT || '8099', 10);
const CHATS_PATH = path.join(DATA_DIR, 'chats.json');

const DEFAULT_SUGGESTIONS = [
  'Was kann ich dich fragen?',
  'Welche Lichter sind gerade an?',
  'Zeig mir den Status der Heizung',
  'Welche Geräte sind aktiv?',
];
const DEFAULT_SYSTEM_PROMPT =
  'Du bist ein hilfreicher Home-Assistant-Assistent. Antworte knapp und präzise auf Deutsch. ' +
  'Nutze verfügbare Tools nur wenn nötig und beachte Bereichs-/Raumbeschränkungen.';

function getOptions() {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf-8');
    const opts = JSON.parse(raw);
    const suggestions = Array.isArray(opts.prompt_suggestions) && opts.prompt_suggestions.length
      ? opts.prompt_suggestions.map(String).filter(Boolean)
      : DEFAULT_SUGGESTIONS;
    const systemPrompt = (typeof opts.system_prompt === 'string' ? opts.system_prompt.trim() : '') || DEFAULT_SYSTEM_PROMPT;
    return {
      backend_inference_webhook_url: (opts.backend_inference_webhook_url || '').trim().replace(/\/$/, ''),
      backend_enabled:               opts.backend_enabled !== false,
      backend_sync_webhook_url:      (opts.backend_sync_webhook_url || '').trim().replace(/\/$/, ''),
      agent_backend:             (opts.agent_backend || 'backend').trim().toLowerCase(),
      ha_url:                    (opts.ha_url                    || '').trim().replace(/\/$/, ''),
      ha_token:                  (opts.ha_token                  || '').trim(),
      prompt_suggestions: suggestions,
      system_prompt:             systemPrompt,
      area_scope:                (opts.area_scope || '').trim(),
      mcp_enabled:               opts.mcp_enabled !== false,
      mcp_bearer_token:          (opts.mcp_bearer_token          || '').trim(),
      mcp_entity_allowlist:      (opts.mcp_entity_allowlist      || '').trim(),
      mcp_domain_allowlist:      (opts.mcp_domain_allowlist      || '').trim(),
      mcp_area_allowlist:        (opts.mcp_area_allowlist        || '').trim(),
      mcp_search_embeddings_top_k:   Number.isFinite(Number(opts.mcp_search_embeddings_top_k))
        ? Number(opts.mcp_search_embeddings_top_k)
        : 200,
      mcp_search_faiss_enabled: opts.mcp_search_faiss_enabled !== false,
      mcp_search_faiss_index_dir: (opts.mcp_search_faiss_index_dir || '').trim() || path.join(DATA_DIR, 'mcp-faiss'),
      azure_openai_endpoint:         (opts.azure_openai_endpoint || '').trim().replace(/\/$/, ''),
      azure_openai_api_key:          (opts.azure_openai_api_key || '').trim(),
      azure_openai_embedding_deployment: (opts.azure_openai_embedding_deployment || '').trim(),
      azure_openai_api_version:      (opts.azure_openai_api_version || '').trim() || '2024-02-15-preview',
    };
  } catch (e) {
    if (e.code !== 'ENOENT') console.log('[HA Chat] options.json:', e.message);
  }
  return {
    backend_inference_webhook_url: (process.env.BACKEND_INFERENCE_WEBHOOK_URL || '').trim().replace(/\/$/, ''),
    backend_enabled:               process.env.BACKEND_ENABLED !== '0' && process.env.BACKEND_ENABLED !== 'false',
    backend_sync_webhook_url:      (process.env.BACKEND_SYNC_WEBHOOK_URL || '').trim().replace(/\/$/, ''),
    agent_backend:             (process.env.AGENT_BACKEND || 'backend').trim().toLowerCase(),
    ha_url:                    (process.env.HA_URL                    || '').trim().replace(/\/$/, ''),
    ha_token:                  (process.env.HA_TOKEN                  || '').trim(),
    prompt_suggestions: DEFAULT_SUGGESTIONS,
    system_prompt:             (process.env.SYSTEM_PROMPT             || '').trim() || DEFAULT_SYSTEM_PROMPT,
    area_scope:                (process.env.AREA_SCOPE || '').trim(),
    mcp_enabled:               process.env.MCP_ENABLED !== '0' && process.env.MCP_ENABLED !== 'false',
    mcp_bearer_token:          (process.env.MCP_BEARER_TOKEN          || '').trim(),
    mcp_entity_allowlist:      (process.env.MCP_ENTITY_ALLOWLIST      || '').trim(),
    mcp_domain_allowlist:      (process.env.MCP_DOMAIN_ALLOWLIST      || '').trim(),
    mcp_area_allowlist:        (process.env.MCP_AREA_ALLOWLIST        || '').trim(),
    mcp_search_embeddings_top_k: Number(process.env.MCP_SEARCH_EMBEDDINGS_TOP_K || 200),
    mcp_search_faiss_enabled:
      process.env.MCP_SEARCH_FAISS_ENABLED !== '0' && process.env.MCP_SEARCH_FAISS_ENABLED !== 'false',
    mcp_search_faiss_index_dir: (process.env.MCP_SEARCH_FAISS_INDEX_DIR || '').trim() || path.join(DATA_DIR, 'mcp-faiss'),
    azure_openai_endpoint: (process.env.AZURE_OPENAI_ENDPOINT || '').trim().replace(/\/$/, ''),
    azure_openai_api_key: (process.env.AZURE_OPENAI_API_KEY || '').trim(),
    azure_openai_embedding_deployment: (process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || '').trim(),
    azure_openai_api_version: (process.env.AZURE_OPENAI_API_VERSION || '').trim() || '2024-02-15-preview',
  };
}

function getInferenceUrl() {
  return getOptions().backend_inference_webhook_url;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function getHaUserId(req) {
  const h = (req && req.headers) || {};
  const raw =
    h['x-remote-user-id'] ||
    h['x-hass-user-id'] ||
    h['x-homeassistant-user-id'] ||
    h['x-ha-user-id'] ||
    h['x-hass-user'] ||
    '';
  const userId = String(raw || '').trim();
  return userId || 'public';
}

function getHaUserInfo(req) {
  const h = (req && req.headers) || {};
  const id = String(h['x-remote-user-id'] || '').trim() || getHaUserId(req);
  const name = String(h['x-remote-user-name'] || '').trim();
  const displayName = String(h['x-remote-user-display-name'] || '').trim();
  return { id: id || 'public', name, display_name: displayName };
}

function loadChatsStore() {
  try {
    const raw = fs.readFileSync(CHATS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // New format: { users: { [userId]: { chats: [...] } } }
    if (parsed && parsed.users && typeof parsed.users === 'object') return parsed;
    // Legacy format: { chats: [...] } -> migrate to public user
    if (parsed && Array.isArray(parsed.chats)) return { users: { public: { chats: parsed.chats } } };
  } catch (_) {}
  return { users: { public: { chats: [] } } };
}

function saveChatsStore(store) {
  fs.writeFileSync(CHATS_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function ensureUserBucket(store, userId) {
  if (!store.users || typeof store.users !== 'object') store.users = {};
  if (!store.users[userId]) store.users[userId] = { chats: [] };
  if (!Array.isArray(store.users[userId].chats)) store.users[userId].chats = [];
}

function findChat(store, userId, chatId) {
  ensureUserBucket(store, userId);
  return store.users[userId].chats.find((c) => c.id === chatId);
}

function createChat(userId, title) {
  const now = Date.now();
  const chat = {
    id: 'chat-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    title: (title || 'Neuer Chat').toString().trim().slice(0, 80) || 'Neuer Chat',
    created_at: now,
    updated_at: now,
    messages: [],
  };
  const store = loadChatsStore();
  ensureUserBucket(store, userId);
  store.users[userId].chats.unshift(chat);
  saveChatsStore(store);
  return chat;
}

function appendMessage(userId, chatId, role, content, extra) {
  const store = loadChatsStore();
  const chat = findChat(store, userId, chatId);
  if (!chat) return null;
  chat.messages.push({
    role,
    content: String(content || ''),
    sources: Array.isArray(extra && extra.sources) ? extra.sources : [],
    actions: Array.isArray(extra && extra.actions) ? extra.actions : [],
    created_at: Date.now(),
  });
  chat.updated_at = Date.now();
  if (role === 'user' && chat.messages.length <= 2) {
    const clean = String(content || '').trim().replace(/\s+/g, ' ');
    if (clean) chat.title = clean.slice(0, 60);
  }
  saveChatsStore(store);
  return chat;
}

async function callBackendWebhook(webhookUrl, body, logLabel) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  console.log('[HA Chat] ' + logLabel + ' → POST ' + webhookUrl + ' body=' + bodyStr);
  const r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });
  const text = await r.text();
  console.log('[HA Chat] ' + logLabel + ' ← ' + r.status + ' ' + r.statusText + ' len=' + (text ? text.length : 0));
  if (!r.ok) {
    console.log('[HA Chat] ' + logLabel + ' Fehler-Body: ' + (text ? text.slice(0, 500) : '(leer)'));
  } else if (text) {
    const preview = text.length > 300 ? text.slice(0, 300) + '…' : text;
    console.log('[HA Chat] ' + logLabel + ' Body: ' + preview);
  }
  let data = {};
  try {
    data = JSON.parse(text || '{}');
    if (data.answer === undefined && data.response !== undefined) data.answer = data.response;
  } catch (_) {}
  return { ok: r.ok, status: r.status, text: text || '{}', data };
}


const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '', true);
  const rawPathname = parsed.pathname || '/';
  function normalizeIngressPath(p) {
    if (!p) return '/';
    // HA Ingress typical: /api/hassio_ingress/<token>/<rest>
    if (p.startsWith('/api/hassio_ingress/')) {
      const parts = p.split('/'); // ["", "api", "hassio_ingress", "<token>", ...rest]
      if (parts.length <= 4) return '/';
      return '/' + parts.slice(4).join('/');
    }
    // Older/alternate ingress prefixes
    if (p.startsWith('/api/ingress/')) {
      const parts = p.split('/');
      if (parts.length <= 4) return '/';
      return '/' + parts.slice(4).join('/');
    }
    if (p.startsWith('/api/supervisor_ingress/')) {
      const parts = p.split('/');
      if (parts.length <= 4) return '/';
      return '/' + parts.slice(4).join('/');
    }
    return p;
  }
  const pathname = (normalizeIngressPath(rawPathname) || '/').replace(/\/$/, '') || '/';

  const isMcpPath = pathname === '/api/mcp' || pathname.startsWith('/api/mcp/');

  // CORS: Ingress + optional direkter Host-Port (Lovelace fetch cross-origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    const mcpHeaders = 'Content-Type, Authorization, Accept, Mcp-Session-Id, mcp-session-id, mcp-protocol-version';
    res.setHeader('Access-Control-Allow-Headers', isMcpPath ? mcpHeaders : 'Content-Type, Authorization');
    res.writeHead(204);
    res.end();
    return;
  }

  // MCP (Streamable HTTP) – gleicher Port wie UI / Host-Port-Mapping
  if (isMcpPath && (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE')) {
    let parsedBody;
    if (req.method === 'POST') {
      const raw = await collectBody(req);
      parsedBody = raw;
    }
    try {
      await handleMcpHttp(req, res, getOptions(), parsedBody);
    } catch (e) {
      console.error('[HA Chat] MCP Außenfehler:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      }
    }
    return;
  }

  // Config für Frontend
  if (pathname === '/config.json' && req.method === 'GET') {
    const opts = getOptions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      backend_enabled: opts.backend_enabled,
      agent_backend: opts.agent_backend,
      backend_inference_webhook_url: opts.backend_inference_webhook_url,
      sync_enabled: !!opts.backend_sync_webhook_url,
      prompt_suggestions: opts.prompt_suggestions,
      system_prompt: opts.system_prompt,
      area_scope: opts.area_scope || '',
    }));
    return;
  }

  // Aktueller HA User (Ingress Header)
  if (pathname === '/api/me' && req.method === 'GET') {
    const me = getHaUserInfo(req);
    const debug = parsed.query && String(parsed.query.debug || '').trim() === '1';
    const h = (req && req.headers) || {};
    const ingressHeaders = debug ? {
      'x-remote-user-id': h['x-remote-user-id'],
      'x-remote-user-name': h['x-remote-user-name'],
      'x-remote-user-display-name': h['x-remote-user-display-name'],
      'x-hass-user-id': h['x-hass-user-id'],
      'x-homeassistant-user-id': h['x-homeassistant-user-id'],
      'x-ha-user-id': h['x-ha-user-id'],
      'x-hass-user': h['x-hass-user'],
      'x-hass-is-admin': h['x-hass-is-admin'],
      'x-ingress-path': h['x-ingress-path'],
      'x-forwarded-for': h['x-forwarded-for'],
      'x-forwarded-proto': h['x-forwarded-proto'],
      host: h['host'],
    } : undefined;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(debug ? { me, headers: ingressHeaders } : { me }));
    return;
  }

  // Chats: Liste
  if (pathname === '/api/chats' && req.method === 'GET') {
    const userId = getHaUserId(req);
    const store = loadChatsStore();
    ensureUserBucket(store, userId);
    const chats = store.users[userId].chats
      .slice()
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
      .map((c) => ({
        id: c.id,
        title: c.title || 'Neuer Chat',
        created_at: c.created_at || 0,
        updated_at: c.updated_at || 0,
        message_count: Array.isArray(c.messages) ? c.messages.length : 0,
      }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ chats }));
    return;
  }

  // Chats: Neu
  if (pathname === '/api/chats' && req.method === 'POST') {
    const userId = getHaUserId(req);
    const body = await collectBody(req);
    let data = {};
    try { data = JSON.parse(body || '{}'); } catch (_) {}
    const chat = createChat(userId, data.title);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ chat }));
    return;
  }

  // Chats: Details
  if (pathname.startsWith('/api/chats/') && req.method === 'GET') {
    const userId = getHaUserId(req);
    const chatId = decodeURIComponent(pathname.slice('/api/chats/'.length));
    const store = loadChatsStore();
    const chat = findChat(store, userId, chatId);
    if (!chat) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat nicht gefunden' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ chat }));
    return;
  }

  // Chats: Löschen
  if (pathname.startsWith('/api/chats/') && req.method === 'DELETE') {
    const userId = getHaUserId(req);
    const chatId = decodeURIComponent(pathname.slice('/api/chats/'.length));
    const store = loadChatsStore();
    ensureUserBucket(store, userId);
    const before = store.users[userId].chats.length;
    store.users[userId].chats = store.users[userId].chats.filter((c) => c.id !== chatId);
    if (store.users[userId].chats.length === before) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat nicht gefunden' }));
      return;
    }
    saveChatsStore(store);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, chat_id: chatId }));
    return;
  }

  // Manueller Doku-Sync
  if (pathname === '/api/sync' && req.method === 'POST') {
    const opts = getOptions();
    if (!opts.backend_sync_webhook_url) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'backend_sync_webhook_url nicht konfiguriert' }));
      return;
    }
    console.log('[HA Chat] sync → POST ' + opts.backend_sync_webhook_url);
    fetch(opts.backend_sync_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual', ts: Date.now() }),
    })
      .then(r => r.text().then(t => ({ ok: r.ok, status: r.status, t })))
      .then(({ ok, status, t }) => {
        console.log('[HA Chat] sync ← ' + status + (t ? ' ' + t.slice(0, 100) : ''));
        res.writeHead(ok ? 200 : status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok, status }));
      })
      .catch(e => {
        console.log('[HA Chat] sync Fehler:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });
    return;
  }

  // Proxy: Chat
  if (pathname === '/api/chat' && req.method === 'POST') {
    const userId = getHaUserId(req);
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
    let chatId = data.chat_id ? String(data.chat_id) : '';
    if (!chatId) {
      const chat = createChat(userId);
      chatId = chat.id;
    }
    const sessionId = chatId || (data.session_id ? String(data.session_id) : '');
    appendMessage(userId, chatId, 'user', message);
    const opts = getOptions();
    const fromBody = typeof data.area_scope === 'string' ? data.area_scope.trim() : '';
    const areaScope = fromBody || (opts.area_scope || '').trim();
    const reqSystemPrompt = typeof data.system_prompt === 'string' ? data.system_prompt.trim() : '';
    const payload = {
      message,
      session_id: sessionId,
      system_prompt: reqSystemPrompt || opts.system_prompt || DEFAULT_SYSTEM_PROMPT,
      area_scope: areaScope,
    };
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
      console.log('[HA Chat] chat: Webhook-URL fehlt (options.json oder BACKEND_INFERENCE_WEBHOOK_URL prüfen)');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend Inference-Webhook-URL fehlt (Add-on konfigurieren)' }));
      return;
    }
    try {
      const backend = await callBackendWebhook(inferenceUrl, payload, 'chat');
      const answer = backend.data && typeof backend.data.answer === 'string' ? backend.data.answer : '';
      appendMessage(userId, chatId, 'assistant', answer, {
        sources: backend.data && backend.data.sources,
        actions: backend.data && backend.data.actions,
      });
      res.writeHead(backend.ok ? 200 : backend.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.assign({}, backend.data || {}, { chat_id: chatId })));
    } catch (e) {
      console.log('[HA Chat] chat Exception: ' + (e.message || String(e)));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e), chat_id: chatId }));
    }
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
    const userId = getHaUserId(req);
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
    let chatId = data.chat_id ? String(data.chat_id) : '';
    if (!chatId) {
      const chat = createChat(userId);
      chatId = chat.id;
    }
    const sessionId = chatId || (data.session_id ? String(data.session_id) : '');
    appendMessage(userId, chatId, 'user', utterance);
    const opts = getOptions();
    const fromBodyA = typeof data.area_scope === 'string' ? data.area_scope.trim() : '';
    const areaScope = fromBodyA || (opts.area_scope || '').trim();
    const reqSystemPrompt = typeof data.system_prompt === 'string' ? data.system_prompt.trim() : '';
    const actionPayload = {
      message: utterance,
      session_id: sessionId,
      system_prompt: reqSystemPrompt || opts.system_prompt || DEFAULT_SYSTEM_PROMPT,
      area_scope: areaScope,
    };
    const inferenceUrl = getInferenceUrl();
    if (!inferenceUrl) {
      console.log('[HA Chat] execute_action: Webhook-URL fehlt');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend Inference-Webhook-URL fehlt (Add-on konfigurieren)' }));
      return;
    }
    try {
      const backend = await callBackendWebhook(inferenceUrl, actionPayload, 'action');
      const answer = backend.data && (backend.data.answer != null ? backend.data.answer : backend.data.response);
      appendMessage(userId, chatId, 'assistant', answer || '', {
        sources: backend.data && backend.data.sources,
        actions: backend.data && backend.data.actions,
      });
      res.writeHead(backend.ok ? 200 : backend.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.assign({}, backend.data || {}, { chat_id: chatId })));
    } catch (e) {
      console.log('[HA Chat] action Exception: ' + (e.message || String(e)));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || String(e), chat_id: chatId }));
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
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.writeHead(200);
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const inferenceUrl = getInferenceUrl();
  const o = getOptions();
  console.log('HA Chat (Frontend + Backend Proxy + MCP) auf http://0.0.0.0:' + PORT);
  console.log('[HA Chat] Backend Inference-Webhook: ' + (inferenceUrl ? 'gesetzt (' + inferenceUrl.split('/')[0] + '//' + (inferenceUrl.split('/')[2] || '') + '/…)' : 'nicht konfiguriert'));
  if (o.mcp_enabled && o.mcp_bearer_token) {
    console.log('[HA Chat] MCP Streamable HTTP: /api/mcp (Bearer mcp_bearer_token; stateless)');
  } else if (o.mcp_enabled) {
    console.log('[HA Chat] MCP: mcp_bearer_token setzen, sonst Endpoint deaktiviert (503).');
  } else {
    console.log('[HA Chat] MCP: aus (mcp_enabled: false)');
  }
});
