/**
 * MCP (Model Context Protocol) über Streamable HTTP – gleicher Port wie die Web-UI / direkter Host-Port.
 * Auth: Authorization: Bearer <mcp_bearer_token>
 * HA-Aufrufe mit ha_url + ha_token; optional Entity-/Domain-Filter.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const WebSocket = require('ws');
const { createEntitySearchService } = require('./search/entity-search.js');
const { createAutomationChangeEngine } = require('./automation/change-engine.js');
const STATES_CACHE_TTL_MS = 2000;
const PENDING_CHANGE_TTL_MS = 15 * 60 * 1000;
const OVERRIDES_PATH = path.join(process.env.DATA_DIR || '/data', 'automation_overrides.json');

function splitList(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildAllowSets(entityRaw, domainRaw) {
  const e = splitList(entityRaw).map((x) => x.toLowerCase());
  const d = splitList(domainRaw).map((x) => x.toLowerCase());
  return {
    entitySet: e.length ? new Set(e) : null,
    domainSet: d.length ? new Set(d) : null,
  };
}

function normalizeKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isEntityAllowed(entityId, entitySet, domainSet) {
  const lid = String(entityId || '').toLowerCase();
  if (!lid || !/^[a-z0-9_]+\.[a-z0-9_.-]+$/i.test(lid)) return false;
  const dom = lid.split('.')[0] || '';
  if (entitySet !== null && !entitySet.has(lid)) return false;
  if (domainSet !== null && !domainSet.has(dom)) return false;
  return true;
}

function collectEntityIdsFromServiceData(data) {
  const out = [];
  if (!data || typeof data !== 'object') return out;
  const add = (v) => {
    if (typeof v === 'string' && v.includes('.')) out.push(v);
  };
  add(data.entity_id);
  if (Array.isArray(data.entity_id)) data.entity_id.forEach(add);
  // Backward-Compatibility: ältere Clients senden ggf. entity_ids.
  if (Array.isArray(data.entity_ids)) data.entity_ids.forEach(add);
  return out;
}

async function assertServiceDataAllowed(serviceData, entitySet, domainSet, areaResolver, requestedAreaRaw) {
  const needsAreaCheck =
    !!(areaResolver && (areaResolver.hasGlobalScope || splitList(requestedAreaRaw).length > 0));
  if (entitySet === null && domainSet === null && !needsAreaCheck) return;
  const ids = collectEntityIdsFromServiceData(serviceData);
  if (ids.length === 0) {
    throw new Error(
      'Zugriff eingeschränkt: service_data muss entity_id enthalten (String oder Array), damit die Freigabe geprüft werden kann.'
    );
  }
  for (const id of ids) {
    if (!isEntityAllowed(id, entitySet, domainSet)) {
      throw new Error('Entity nicht freigegeben für diesen MCP-Endpunkt: ' + id);
    }
    if (areaResolver) {
      const ok = await areaResolver.isEntityAllowedForArea(id, requestedAreaRaw);
      if (!ok) throw new Error('Entity liegt außerhalb der erlaubten HA-Areas: ' + id);
    }
  }
}

function getBearerToken(req) {
  const a = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (typeof a !== 'string') return '';
  const m = /^Bearer\s+(\S+)/i.exec(a.trim());
  return m ? m[1] : '';
}

function timingSafeEqualString(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function textResult(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text: s.slice(0, 200000) }] };
}

async function callHaService(ha_url, ha_token, domain, service, serviceData) {
  const r = await fetch(
    ha_url + '/api/services/' + encodeURIComponent(String(domain || '')) + '/' + encodeURIComponent(String(service || '')),
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + ha_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(serviceData || {}),
    }
  );
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(body).slice(0, 500));
  return body;
}

async function callHaWsCommand(ha_url, ha_token, type, payload) {
  const wsUrl = String(ha_url || '')
    .replace(/^http:\/\//i, 'ws://')
    .replace(/^https:\/\//i, 'wss://')
    .replace(/\/$/, '') + '/api/websocket';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const reqId = 1001;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch (_) {}
      reject(new Error('Timeout beim HA-WebSocket-Kommando: ' + type));
    }, 12000);
    const finish = (err, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch (_) {}
      if (err) reject(err);
      else resolve(result);
    };
    ws.on('error', (e) => finish(new Error('HA-WebSocket Fehler: ' + (e && e.message ? e.message : 'unknown'))));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')); } catch (_) { return; }
      if (msg && msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: ha_token }));
        return;
      }
      if (msg && msg.type === 'auth_invalid') return finish(new Error('HA-WebSocket Auth ungültig'));
      if (msg && msg.type === 'auth_ok') {
        ws.send(JSON.stringify({ id: reqId, type, ...(payload || {}) }));
        return;
      }
      if (!msg || msg.type !== 'result' || msg.id !== reqId) return;
      if (!msg.success) return finish(new Error('HA-WebSocket Kommando fehlgeschlagen: ' + type));
      finish(null, msg.result);
    });
  });
}

function loadOverrides() {
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function saveOverrides(rows) {
  try {
    fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(rows, null, 2), 'utf8');
  } catch (_) {}
}

const pendingChanges = new Map();

function buildSemanticContextFromAttributes(att) {
  if (!att || typeof att !== 'object') return '';
  const out = [];
  for (const [k, v] of Object.entries(att)) {
    if (!k || v == null) continue;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) out.push(k + ':' + s);
      continue;
    }
    if (Array.isArray(v)) {
      const list = v
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .slice(0, 50);
      if (list.length) out.push(k + ':' + list.join(' '));
      continue;
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      out.push(k + ':' + String(v));
    }
  }
  return out.join(' | ').slice(0, 5000);
}

function toPublicEntityRow(r) {
  return {
    entity_id: r.entity_id,
    state: r.state,
    domain: r.domain,
    friendly_name: r.friendly_name,
    area_id: r.area_id != null ? r.area_id : null,
    area_name: r.area_name != null ? r.area_name : null,
  };
}

async function fetchAllowedStates(ha_url, ha_token, entitySet, domainSet) {
  if (!ha_url || !ha_token) throw new Error('ha_url / ha_token im Add-on konfigurieren');
  const r = await fetch(ha_url + '/api/states', {
    headers: { Authorization: 'Bearer ' + ha_token },
  });
  if (!r.ok) throw new Error('HA /api/states HTTP ' + r.status);
  const states = await r.json();
  if (!Array.isArray(states)) throw new Error('Unerwartete HA-Antwort');
  const rowsAll = [];
  for (const s of states) {
    const id = s.entity_id;
    if (!id || !isEntityAllowed(id, entitySet, domainSet)) continue;
    const att = s.attributes || {};
    rowsAll.push({
      entity_id: id,
      state: s.state,
      domain: String(id).split('.')[0],
      friendly_name: att.friendly_name || id,
      semantic_context: buildSemanticContextFromAttributes(att),
    });
  }
  return rowsAll;
}

async function fetchRegistriesViaWebSocket(ha_url, ha_token) {
  const wsUrl = String(ha_url || '')
    .replace(/^http:\/\//i, 'ws://')
    .replace(/^https:\/\//i, 'wss://')
    .replace(/\/$/, '') + '/api/websocket';

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const reqEntityId = 101;
    const reqAreaId = 102;
    const reqDeviceId = 103;
    let done = false;
    let authed = false;
    let entities = null;
    let areas = null;
    let devices = null;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      try { ws.close(); } catch (_) {}
    };
    const fail = (err) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const succeed = () => {
      if (done) return;
      if (!Array.isArray(entities) || !Array.isArray(areas) || !Array.isArray(devices)) return;
      done = true;
      cleanup();
      resolve({ entities, areas, devices });
    };

    timer = setTimeout(() => fail(new Error('Timeout beim HA-WebSocket-Registryzugriff')), 12000);

    ws.on('error', (e) => fail(new Error('HA-WebSocket Fehler: ' + (e && e.message ? e.message : 'unknown'))));
    ws.on('close', () => {
      if (!done) fail(new Error('HA-WebSocket unerwartet geschlossen'));
    });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')); } catch (_) { return; }
      const t = msg && msg.type;
      if (t === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: ha_token }));
        return;
      }
      if (t === 'auth_invalid') {
        fail(new Error('HA-WebSocket Auth ungültig'));
        return;
      }
      if (t === 'auth_ok') {
        authed = true;
        ws.send(JSON.stringify({ id: reqEntityId, type: 'config/entity_registry/list' }));
        ws.send(JSON.stringify({ id: reqAreaId, type: 'config/area_registry/list' }));
        ws.send(JSON.stringify({ id: reqDeviceId, type: 'config/device_registry/list' }));
        return;
      }
      if (!authed || t !== 'result') return;
      if (msg.id === reqEntityId) {
        if (!msg.success) return fail(new Error('config/entity_registry/list fehlgeschlagen'));
        entities = msg.result;
        succeed();
        return;
      }
      if (msg.id === reqAreaId) {
        if (!msg.success) return fail(new Error('config/area_registry/list fehlgeschlagen'));
        areas = msg.result;
        succeed();
        return;
      }
      if (msg.id === reqDeviceId) {
        if (!msg.success) return fail(new Error('config/device_registry/list fehlgeschlagen'));
        devices = msg.result;
        succeed();
      }
    });
  });
}

function createAreaResolver(ha_url, ha_token, globalAreaAllowlistRaw) {
  let cachePromise = null;
  const hasGlobalScope = splitList(globalAreaAllowlistRaw).length > 0;

  async function loadRegistries() {
    if (cachePromise) return cachePromise;
    cachePromise = (async () => {
      // Registry-Zugriff immer über HA-WebSocket-Kommandos:
      // config/entity_registry/list + config/area_registry/list + config/device_registry/list
      const wsData = await fetchRegistriesViaWebSocket(ha_url, ha_token);
      const entities = wsData.entities;
      const areas = wsData.areas;
      const devices = wsData.devices;
      const entityToAreaId = new Map();
      const deviceToAreaId = new Map();
      const areaIdToName = new Map();
      const tokenToAreaIds = new Map();
      if (Array.isArray(areas)) {
        for (const a of areas) {
          const id = String(a && a.area_id ? a.area_id : '').trim();
          if (!id) continue;
          const name = String((a && (a.name || a.alias || a.area_name)) || '').trim();
          areaIdToName.set(id, name || id);
          const t1 = normalizeKey(id);
          const t2 = normalizeKey(name);
          if (t1) {
            const s = tokenToAreaIds.get(t1) || new Set();
            s.add(id);
            tokenToAreaIds.set(t1, s);
          }
          if (t2) {
            const s = tokenToAreaIds.get(t2) || new Set();
            s.add(id);
            tokenToAreaIds.set(t2, s);
          }
        }
      }
      if (Array.isArray(entities)) {
        for (const e of entities) {
          const entityId = normalizeKey(e && e.entity_id ? e.entity_id : '');
          const areaId = String(e && e.area_id ? e.area_id : '').trim();
          if (!entityId || !areaId) continue;
          entityToAreaId.set(entityId, areaId);
        }
      }
      if (Array.isArray(devices)) {
        for (const d of devices) {
          const deviceId = String(d && d.id ? d.id : '').trim();
          const areaId = String(d && d.area_id ? d.area_id : '').trim();
          if (!deviceId || !areaId) continue;
          deviceToAreaId.set(deviceId, areaId);
        }
      }
      if (Array.isArray(entities)) {
        for (const e of entities) {
          const entityId = normalizeKey(e && e.entity_id ? e.entity_id : '');
          if (!entityId) continue;
          if (entityToAreaId.has(entityId)) continue;
          const deviceId = String(e && e.device_id ? e.device_id : '').trim();
          if (!deviceId) continue;
          const devArea = deviceToAreaId.get(deviceId);
          if (devArea) entityToAreaId.set(entityId, devArea);
        }
      }
      return { entityToAreaId, areaIdToName, tokenToAreaIds };
    })();
    return cachePromise;
  }

  async function resolveAreaIds(raw) {
    const tokens = splitList(raw).map(normalizeKey).filter(Boolean);
    if (!tokens.length) return null;
    const reg = await loadRegistries();
    const out = new Set();
    for (const t of tokens) {
      const ids = reg.tokenToAreaIds.get(t);
      if (!ids || !ids.size) throw new Error('Unbekannte HA-Area: ' + t);
      ids.forEach((id) => out.add(id));
    }
    return out;
  }

  return {
    hasGlobalScope,
    async isEntityAllowedForArea(entityId, requestedAreaRaw) {
      const globalSet = await resolveAreaIds(globalAreaAllowlistRaw);
      const reqSet = await resolveAreaIds(requestedAreaRaw);
      if (!globalSet && !reqSet) return true;
      const reg = await loadRegistries();
      const areaId = reg.entityToAreaId.get(normalizeKey(entityId));
      if (!areaId) return false;
      if (globalSet && !globalSet.has(areaId)) return false;
      if (reqSet && !reqSet.has(areaId)) return false;
      return true;
    },
    async filterRows(rows, requestedAreaRaw) {
      const globalSet = await resolveAreaIds(globalAreaAllowlistRaw);
      const reqSet = await resolveAreaIds(requestedAreaRaw);
      if (!globalSet && !reqSet) return rows;
      const reg = await loadRegistries();
      return rows
        .map((r) => {
          const areaId = reg.entityToAreaId.get(normalizeKey(r.entity_id)) || null;
          const areaName = areaId ? reg.areaIdToName.get(areaId) || areaId : null;
          return { ...r, area_id: areaId, area_name: areaName };
        })
        .filter((r) => {
          if (!r.area_id) return false;
          if (globalSet && !globalSet.has(r.area_id)) return false;
          if (reqSet && !reqSet.has(r.area_id)) return false;
          return true;
        });
    },
  };
}

function createMcpServer(ctx) {
  const {
    ha_url,
    ha_token,
    entitySet,
    domainSet,
    mcp_area_allowlist,
    forced_area_scope,
    mcp_search_embeddings_top_k,
    mcp_search_faiss_enabled,
    mcp_search_faiss_index_dir,
    azure_openai_endpoint,
    azure_openai_api_key,
    azure_openai_embedding_deployment,
    azure_openai_api_version,
  } = ctx;
  const server = new McpServer({
    name: 'ha-chat-addon',
    version: '1.0.0',
  });

  const areaResolver = createAreaResolver(ha_url, ha_token, mcp_area_allowlist);
  let statesCache = { rows: null, at: 0 };
  const getAllowedStatesCached = async () => {
    const now = Date.now();
    if (statesCache.rows && now - statesCache.at < STATES_CACHE_TTL_MS) return statesCache.rows;
    const rows = await fetchAllowedStates(ha_url, ha_token, entitySet, domainSet);
    statesCache = { rows, at: now };
    return rows;
  };
  const clearAllowedStatesCache = () => {
    statesCache = { rows: null, at: 0 };
  };
  const getEffectiveArea = (toolArea) => {
    const forced = String(forced_area_scope || '').trim();
    if (forced) return forced;
    return String(toolArea || '').trim();
  };
  const scopeHint =
    entitySet || domainSet || (typeof mcp_area_allowlist === 'string' && mcp_area_allowlist.trim()) || getEffectiveArea('')
      ? 'Nur freigegebene Entities/Domains/Areas (Add-on mcp_*_allowlist / optional URL-scope).'
      : 'Alle Entities, die das konfigurierte HA-Token darf.';
  const automationEngine = createAutomationChangeEngine({
    callWs: async (type, payload) => callHaWsCommand(ha_url, ha_token, type, payload),
  });
  const entitySearch = createEntitySearchService({
    embeddingTopK: mcp_search_embeddings_top_k,
    faissEnabled: mcp_search_faiss_enabled !== false,
    faissIndexDir: String(mcp_search_faiss_index_dir || '').trim() || '/data/mcp-faiss',
    azureOpenAi: {
      endpoint: azure_openai_endpoint,
      apiKey: azure_openai_api_key,
      deployment: azure_openai_embedding_deployment,
      apiVersion: azure_openai_api_version || '2024-02-15-preview',
    },
    fetchScopedRows: async (area) => {
      const rowsRaw = await getAllowedStatesCached();
      return areaResolver.filterRows(rowsRaw, getEffectiveArea(area));
    },
  });

  const cleanupPendingChanges = () => {
    const now = Date.now();
    for (const [k, v] of pendingChanges.entries()) {
      if (!v || now - v.createdAt > PENDING_CHANGE_TTL_MS || v.used) pendingChanges.delete(k);
    }
  };

  const processExpiredOverrides = async () => {
    const rows = loadOverrides();
    if (!rows.length) return;
    const now = Date.now();
    const keep = [];
    for (const ov of rows) {
      const untilTs = Number(ov && ov.until_ts ? ov.until_ts : 0);
      const entityId = String(ov && ov.entity_id ? ov.entity_id : '').trim();
      if (!entityId || !untilTs) continue;
      if (untilTs > now) {
        keep.push(ov);
        continue;
      }
      try {
        await callHaService(ha_url, ha_token, 'automation', 'turn_on', { entity_id: entityId });
      } catch (_) {
        keep.push(ov);
      }
    }
    saveOverrides(keep);
  };
  processExpiredOverrides().catch(() => {});

  server.registerPrompt(
    'ha_chat_scoped_assistant',
    {
      description: 'Kurzbeschreibung für den eingeschränkten Home-Assistant-Zugriff über dieses Add-on.',
      argsSchema: {},
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Du bist der Home-Assistant-FAB-Assistent für das Café-Dashboard der RTO GmbH. ' +
              'Arbeite strikt tool-gestützt, faktenbasiert und kurz. ' +
              'Du steuerst Home Assistant nur über die Tools list_entities, search_entities, get_scenes, activate_scene, run_script, propose_automation_change, apply_automation_change, temporary_automation_override, get_entity_state und call_service. ' +
              scopeHint +
              ' Ermittle den Geltungsbereich über verfügbare MCP-Entities, nicht über Annahmen. ' +
              'Für call_service gilt strikt: Nutze immer domain, service, optional area und service_data. ' +
              'entity_id darf niemals auf Top-Level stehen, sondern nur in service_data.entity_id (String oder Array). ' +
              ' Nutze bevorzugt die semantischen Tools get_scenes, activate_scene und run_script für Szenen-/Stimmungswünsche. ' +
              'Wenn kein passendes Gerät im MCP-Scope verfügbar ist, melde das klar und steuere nichts außerhalb des Scopes. ' +
              'Bei mehreren Treffern: kurze Rückfrage statt raten. Keine erfundenen Entities.',
          },
        },
      ],
    })
  );

  server.registerTool(
    'list_entities',
    {
      description:
        'Listet HA-Entities mit entity_id, state, domain und friendly_name (gefiltert nach Add-on-Allowlist).',
      inputSchema: {
        limit: z.number().int().min(1).max(5000).optional().describe('Optionales Limit (ohne Angabe: alle)'),
        offset: z.number().int().min(0).optional().describe('Optionaler Startindex für Paging (Standard 0)'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ limit, offset, area }) => {
      const off = offset != null ? offset : 0;
      try {
        const rowsRaw = await getAllowedStatesCached();
        const rowsAll = await areaResolver.filterRows(rowsRaw, getEffectiveArea(area));
        const total = rowsAll.length;
        const pageRows = limit != null ? rowsAll.slice(off, off + limit) : rowsAll.slice(off);
        const rows = pageRows.map(toPublicEntityRow);
        return textResult({
          total,
          returned: rows.length,
          offset: off,
          limit: limit != null ? limit : null,
          has_more: off + rows.length < total,
          entities: rows,
        });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'get_scenes',
    {
      description: 'Listet verfügbare Szene-Entities (Domain scene) im erlaubten Scope.',
      inputSchema: {
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
        limit: z.number().int().min(1).max(5000).optional().describe('Optionales Limit (Standard 200)'),
        offset: z.number().int().min(0).optional().describe('Optionaler Startindex (Standard 0)'),
      },
    },
    async ({ area, limit, offset }) => {
      const lim = limit != null ? limit : 200;
      const off = offset != null ? offset : 0;
      try {
        const rowsRaw = await getAllowedStatesCached();
        const rowsAll = (await areaResolver.filterRows(rowsRaw, getEffectiveArea(area)))
          .filter((r) => String(r.domain || '').toLowerCase() === 'scene')
          .map(toPublicEntityRow);
        const rows = rowsAll.slice(off, off + lim);
        return textResult({
          total: rowsAll.length,
          returned: rows.length,
          offset: off,
          limit: lim,
          has_more: off + rows.length < rowsAll.length,
          entities: rows,
        });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'activate_scene',
    {
      description: 'Aktiviert eine Szene über scene.turn_on mit service_data.entity_id.',
      inputSchema: {
        entity_id: z.string().describe('Scene-Entity, z. B. scene.441_eg_b0_08_szene_bunt'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ entity_id, area }) => {
      const id = String(entity_id || '').trim();
      if (!ha_url || !ha_token) return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      if (!isEntityAllowed(id, entitySet, domainSet)) return textResult({ error: 'Entity nicht freigegeben oder ungültig: ' + id });
      try {
        const data = { entity_id: id };
        await assertServiceDataAllowed(data, entitySet, domainSet, areaResolver, getEffectiveArea(area));
        const r = await fetch(ha_url + '/api/services/scene/turn_on', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + ha_token, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return textResult({ error: 'HTTP ' + r.status, ha_response: body });
        clearAllowedStatesCache();
        return textResult({ ok: true, result: body });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'run_script',
    {
      description: 'Startet ein Script über script.turn_on mit service_data.entity_id.',
      inputSchema: {
        entity_id: z.string().describe('Script-Entity, z. B. script.buffet_szene_mit_spots_aus'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ entity_id, area }) => {
      const id = String(entity_id || '').trim();
      if (!ha_url || !ha_token) return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      if (!isEntityAllowed(id, entitySet, domainSet)) return textResult({ error: 'Entity nicht freigegeben oder ungültig: ' + id });
      try {
        const data = { entity_id: id };
        await assertServiceDataAllowed(data, entitySet, domainSet, areaResolver, getEffectiveArea(area));
        const r = await fetch(ha_url + '/api/services/script/turn_on', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + ha_token, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return textResult({ error: 'HTTP ' + r.status, ha_response: body });
        clearAllowedStatesCache();
        return textResult({ ok: true, result: body });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'search_health',
    {
      description: 'Liefert Gesundheits- und Indexstatusdaten der Embedding/FAISS-Suche.',
      inputSchema: {
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ area }) => {
      try {
        const result = await entitySearch.health({ area: getEffectiveArea(area) });
        return textResult(result);
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'rebuild_search_index',
    {
      description: 'Erzwingt Rebuild des FAISS-Index für den aktuellen Scope/Area.',
      inputSchema: {
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ area }) => {
      try {
        const result = await entitySearch.rebuild({ area: getEffectiveArea(area) });
        return textResult(result);
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'search_entities',
    {
      description:
        'Sucht gezielt in freigegebenen HA-Entities via Embedding-Retrieval (Azure OpenAI + lokaler FAISS-Dateiindex).',
      inputSchema: {
        query: z.string().optional().describe('Freitextsuche (z. B. c0.09, wohnzimmer, decke)'),
        domain: z.union([z.string(), z.array(z.string())]).optional().describe('Optionaler Domain-Filter als String oder Array (z. B. "light" oder ["light","scene","script"]).'),
        state: z.string().optional().describe('Optionaler State-Filter (z. B. on, off, unavailable)'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
        limit: z.number().int().min(1).max(5000).optional().describe('Max. Treffer (Standard 50)'),
        offset: z.number().int().min(0).optional().describe('Startindex für Paging (Standard 0)'),
        top_k: z.number().int().min(1).max(5000).optional().describe('Anzahl der Top-Treffer aus dem FAISS-Index vor Paging (Standard max(limit+offset, Konfig)).'),
      },
    },
    async ({ query, domain, state, area, limit, offset, top_k }) => {
      try {
        const result = await entitySearch.search({
          query,
          domain,
          state,
          area: getEffectiveArea(area),
          limit,
          offset,
          top_k,
        });
        if (Array.isArray(result.entities)) {
          result.entities = result.entities.map(toPublicEntityRow);
        }
        return textResult(result);
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'propose_automation_change',
    {
      description:
        'Erzeugt einen bestätigungspflichtigen Automations-Änderungsvorschlag auf Basis expliziter Parameter (ohne Heuristik).',
      inputSchema: {
        automation_id: z.string().describe('Konkrete Zielautomation (automation_id oder id)'),
        set_time: z.string().optional().describe('Optional: neue Trigger-Zeit HH:MM oder HH:MM:SS'),
        shift_minutes: z.number().int().min(-720).max(720).optional().describe('Optional: Zeitverschiebung in Minuten (+/-)'),
      },
    },
    async ({ automation_id, set_time, shift_minutes }) => {
      try {
        cleanupPendingChanges();
        const proposal = await automationEngine.proposeChange({ automation_id, set_time, shift_minutes });
        if (!proposal || !proposal.found) return textResult(proposal || { found: false });
        if (!proposal.changed) {
          return textResult({
            found: true,
            changed: false,
            message: 'Keine konkrete Trigger-Änderung erkannt. Bitte Zeit/Änderung präzisieren.',
            automation: proposal.automation,
            current_triggers: proposal.current_triggers,
          });
        }
        const changeId = crypto.randomUUID();
        const confirmationToken = crypto.randomBytes(16).toString('hex');
        pendingChanges.set(changeId, {
          createdAt: Date.now(),
          used: false,
          confirmationToken,
          proposal,
        });
        return textResult({
          found: true,
          changed: true,
          change_id: changeId,
          confirmation_token: confirmationToken,
          expires_in_seconds: Math.floor(PENDING_CHANGE_TTL_MS / 1000),
          automation: proposal.automation,
          reason: proposal.reason,
          current_triggers: proposal.current_triggers,
          proposed_triggers: proposal.proposed_triggers,
        });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'apply_automation_change',
    {
      description: 'Wendet einen zuvor vorgeschlagenen Automations-Change nach expliziter Bestätigung an.',
      inputSchema: {
        change_id: z.string().describe('ID aus propose_automation_change'),
        confirmation_token: z.string().describe('Bestätigungstoken aus propose_automation_change'),
      },
    },
    async ({ change_id, confirmation_token }) => {
      try {
        cleanupPendingChanges();
        const entry = pendingChanges.get(String(change_id || '').trim());
        if (!entry) return textResult({ error: 'Unbekannte oder abgelaufene change_id' });
        if (entry.used) return textResult({ error: 'Change wurde bereits angewendet' });
        if (String(entry.confirmationToken) !== String(confirmation_token || '').trim()) {
          return textResult({ error: 'confirmation_token ungültig' });
        }
        const p = entry.proposal || {};
        const result = await automationEngine.applyChange({
          automation_id: p.automation && p.automation.automation_id,
          proposed_triggers: p.proposed_triggers,
          expected_current_hash: p.current_hash,
        });
        entry.used = true;
        pendingChanges.set(String(change_id), entry);
        clearAllowedStatesCache();
        return textResult({ ok: true, applied: result });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'temporary_automation_override',
    {
      description:
        'Setzt eine temporäre Ausnahme für eine Automation (z. B. heute nicht ausführen), mit automatischer Rückaktivierung.',
      inputSchema: {
        entity_id: z.string().describe('Automation-Entity, z. B. automation.buffet_licht_abschalten'),
        duration_minutes: z.number().int().min(1).max(1440).optional().describe('Dauer der Ausnahme in Minuten (Standard 180)'),
        reason: z.string().optional().describe('Optionaler Grund für Audit'),
      },
    },
    async ({ entity_id, duration_minutes, reason }) => {
      const id = String(entity_id || '').trim();
      const mins = duration_minutes != null ? duration_minutes : 180;
      if (!ha_url || !ha_token) return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      if (!isEntityAllowed(id, entitySet, domainSet)) return textResult({ error: 'Entity nicht freigegeben oder ungültig: ' + id });
      try {
        await assertServiceDataAllowed({ entity_id: id }, entitySet, domainSet, areaResolver, getEffectiveArea(''));
        const untilTs = Date.now() + mins * 60 * 1000;
        await callHaService(ha_url, ha_token, 'automation', 'turn_off', { entity_id: id, stop_actions: false });
        const current = loadOverrides();
        const rows = current.filter((x) => String(x.entity_id || '') !== id);
        rows.push({
          entity_id: id,
          until_ts: untilTs,
          reason: String(reason || '').trim() || null,
          created_at: Date.now(),
        });
        saveOverrides(rows);
        clearAllowedStatesCache();
        return textResult({
          ok: true,
          entity_id: id,
          override_until: new Date(untilTs).toISOString(),
          duration_minutes: mins,
        });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'get_entity_state',
    {
      description: 'Liest den State einer einzelnen Entity (nur wenn freigegeben).',
      inputSchema: {
        entity_id: z.string().describe('z. B. light.wohnzimmer'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ entity_id, area }) => {
      if (!ha_url || !ha_token) {
        return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      }
      const id = String(entity_id || '').trim();
      if (!isEntityAllowed(id, entitySet, domainSet)) {
        return textResult({ error: 'Entity nicht freigegeben oder ungültig: ' + id });
      }
      try {
        const areaOk = await areaResolver.isEntityAllowedForArea(id, getEffectiveArea(area));
        if (!areaOk) return textResult({ error: 'Entity liegt außerhalb der erlaubten HA-Area: ' + id });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
      try {
        const r = await fetch(ha_url + '/api/states/' + encodeURIComponent(id), {
          headers: { Authorization: 'Bearer ' + ha_token },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return textResult({ error: 'HTTP ' + r.status, detail: data });
        return textResult(data);
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  server.registerTool(
    'call_service',
    {
      description:
        'Ruft einen HA-Service auf (POST /api/services/<domain>/<service>). Verwende Ziel-Entities in service_data.entity_id (String oder Array). Bei eingeschränktem Zugriff muss service_data.entity_id zur Allowlist passen.',
      inputSchema: {
        domain: z.string().describe('z. B. light, switch, cover'),
        service: z.string().describe('z. B. turn_on, turn_off, toggle'),
        service_data: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('JSON-Objekt mit Ziel in entity_id (String oder Array), z. B. { "entity_id": ["light.a", "light.b"] }'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
      },
    },
    async ({ domain, service, service_data, area }) => {
      if (!ha_url || !ha_token) {
        return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      }
      const dom = String(domain || '').trim();
      const svc = String(service || '').trim();
      if (!/^[a-z0-9_]+$/i.test(dom) || !/^[a-z0-9_]+$/i.test(svc)) {
        return textResult({ error: 'domain oder service ungültig' });
      }
      const data = service_data && typeof service_data === 'object' ? service_data : {};
      try {
        await assertServiceDataAllowed(data, entitySet, domainSet, areaResolver, getEffectiveArea(area));
      } catch (e) {
        return textResult({ error: e.message || String(e) });
      }
      const url = ha_url + '/api/services/' + encodeURIComponent(dom) + '/' + encodeURIComponent(svc);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + ha_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return textResult({ error: 'HTTP ' + r.status, ha_response: body });
        clearAllowedStatesCache();
        return textResult({ ok: true, result: body });
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
    }
  );

  return server;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {object} opts getOptions()-Objekt inkl. mcp_*
 * @param {string} [parsedBody] bereits gelesener Body (nur POST)
 */
async function handleMcpHttp(req, res, opts, parsedBody) {
  if (!opts.mcp_enabled) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'MCP im Add-on deaktiviert (mcp_enabled: false)' }));
    return;
  }
  if (!opts.mcp_bearer_token) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'MCP nicht konfiguriert: mcp_bearer_token im Add-on setzen (geheimer Bearer für Clients).',
      })
    );
    return;
  }
  const token = getBearerToken(req);
  if (!token || !timingSafeEqualString(token, opts.mcp_bearer_token)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: Bearer mcp_bearer_token erforderlich' }));
    return;
  }

  let forcedAreaScope = '';
  try {
    const u = new URL(req.url || '', 'http://mcp.local');
    forcedAreaScope =
      (u.searchParams.get('scope') || u.searchParams.get('area') || u.searchParams.get('area_scope') || '').trim();
  } catch (_) {}

  const { entitySet, domainSet } = buildAllowSets(opts.mcp_entity_allowlist, opts.mcp_domain_allowlist);
  const ctx = {
    ha_url: opts.ha_url,
    ha_token: opts.ha_token,
    entitySet,
    domainSet,
    mcp_area_allowlist: opts.mcp_area_allowlist,
    forced_area_scope: forcedAreaScope,
    mcp_search_embeddings_top_k: opts.mcp_search_embeddings_top_k,
    mcp_search_faiss_enabled: opts.mcp_search_faiss_enabled,
    mcp_search_faiss_index_dir: opts.mcp_search_faiss_index_dir,
    azure_openai_endpoint: opts.azure_openai_endpoint,
    azure_openai_api_key: opts.azure_openai_api_key,
    azure_openai_embedding_deployment: opts.azure_openai_embedding_deployment,
    azure_openai_api_version: opts.azure_openai_api_version,
  };

  let body = parsedBody;
  if (req.method === 'POST' && typeof body === 'string') {
    const t = body.trim();
    if (!t) {
      body = undefined;
    } else {
      try {
        body = JSON.parse(t);
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ungültiges JSON' }));
        return;
      }
    }
  }

  const mcpServer = createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('[HA Chat] MCP:', e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: e.message || 'MCP internal error' },
          id: null,
        })
      );
    }
  } finally {
    try {
      await transport.close();
    } catch (_) {}
    try {
      await mcpServer.close();
    } catch (_) {}
  }
}

module.exports = { handleMcpHttp, getBearerToken };
