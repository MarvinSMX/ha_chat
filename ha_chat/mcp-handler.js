/**
 * MCP (Model Context Protocol) über Streamable HTTP – gleicher Port wie die Web-UI / direkter Host-Port.
 * Auth: Authorization: Bearer <mcp_bearer_token>
 * HA-Aufrufe mit ha_url + ha_token; optional Entity-/Domain-Filter.
 */
'use strict';

const crypto = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const WebSocket = require('ws');
const MiniSearch = require('minisearch');
const SEARCH_INDEX_CACHE_TTL_MS = 30000;

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

function normalizeSearchText(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function deUmlautForSearch(raw) {
  return String(raw || '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae')
    .replace(/Ö/g, 'oe')
    .replace(/Ü/g, 'ue');
}

const SEARCH_SYNONYMS = {
  klima: ['klimaanlage', 'klimageraet', 'klimagerat', 'klimatisierung', 'climate'],
  klimaanlage: ['klima', 'klimageraet', 'klimagerat', 'climate'],
  klimageraet: ['klimaanlage', 'klimagerat', 'klima', 'climate'],
  klimagerat: ['klimaanlage', 'klimageraet', 'klima', 'climate'],
  climate: ['klima', 'klimaanlage', 'klimageraet', 'klimagerat'],
  heizung: ['heizkoerper', 'heizkorper', 'waerme', 'warm'],
  heizkoerper: ['heizung', 'waerme', 'warm'],
  licht: ['lampe', 'leuchte', 'light'],
  lampe: ['licht', 'leuchte', 'light'],
  leuchte: ['licht', 'lampe', 'light'],
  lueftung: ['luefter', 'ventilator', 'fan'],
  luefter: ['lueftung', 'ventilator', 'fan'],
  ventilator: ['luefter', 'lueftung', 'fan'],
};

function buildNormalizedSynonymMap(source) {
  const map = new Map();
  for (const [rawKey, rawValues] of Object.entries(source || {})) {
    const keyTokens = tokenizeForSearch(rawKey);
    const valueTokens = Array.isArray(rawValues)
      ? rawValues.flatMap((v) => tokenizeForSearch(v))
      : [];
    for (const kt of keyTokens) {
      const set = map.get(kt) || new Set();
      for (const vt of valueTokens) set.add(vt);
      map.set(kt, set);
    }
  }
  return map;
}

const SEARCH_SYNONYMS_NORMALIZED = buildNormalizedSynonymMap(SEARCH_SYNONYMS);

function stemSearchToken(token) {
  let t = String(token || '');
  if (!t) return '';
  // Sehr leichtes Stemming für deutsche Suchbegriffe.
  if (t.length > 6 && t.endsWith('ungen')) t = t.slice(0, -5);
  else if (t.length > 5 && t.endsWith('ung')) t = t.slice(0, -3);
  else if (t.length > 5 && t.endsWith('en')) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith('er')) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

function tokenizeForSearch(raw) {
  const t1 = normalizeSearchText(raw);
  const t2 = normalizeSearchText(deUmlautForSearch(raw));
  const base = (t1 + ' ' + t2).trim();
  if (!base) return [];
  return Array.from(
    new Set(
      base
        .split(/\s+/)
        .map(stemSearchToken)
        .filter((t) => t && t.length >= 2)
    )
  );
}

function buildWeightedQueryTerms(rawQuery) {
  const out = new Map();
  const baseTerms = tokenizeForSearch(rawQuery);
  for (const t of baseTerms) {
    out.set(t, Math.max(out.get(t) || 0, 1.0));
    const synSet = SEARCH_SYNONYMS_NORMALIZED.get(t);
    if (synSet && synSet.size) {
      for (const x of synSet) {
        out.set(x, Math.max(out.get(x) || 0, 0.75));
      }
    }
  }
  return out;
}

function createMiniSearchIndex(rows) {
  const ms = new MiniSearch({
    idField: 'entity_id',
    fields: ['friendly_name', 'entity_id', 'friendly_name_tokens', 'entity_id_tokens'],
    storeFields: ['entity_id', 'friendly_name', 'domain', 'state', 'area_id', 'area_name'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'OR',
      boost: {
        friendly_name: 4,
        friendly_name_tokens: 3,
        entity_id: 2,
        entity_id_tokens: 1.5,
      },
    },
    processTerm: (term) => stemSearchToken(normalizeSearchText(term)),
    tokenize: (text) => tokenizeForSearch(text),
  });
  ms.addAll(
    rows.map((r) => ({
      ...r,
      friendly_name_tokens: tokenizeForSearch(r.friendly_name).join(' '),
      entity_id_tokens: tokenizeForSearch(r.entity_id).join(' '),
    }))
  );
  return ms;
}

function buildSearchTermsForIndex(rawQuery) {
  const weighted = buildWeightedQueryTerms(rawQuery);
  const terms = Array.from(weighted.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .filter(Boolean);
  return Array.from(new Set(terms));
}

function buildRowsSignature(rows) {
  const h = crypto.createHash('sha1');
  for (const r of rows) {
    h.update(String(r.entity_id || ''));
    h.update('|');
    h.update(String(r.friendly_name || ''));
    h.update('|');
    h.update(String(r.state || ''));
    h.update('|');
    h.update(String(r.domain || ''));
    h.update('|');
    h.update(String(r.area_id || ''));
    h.update('\n');
  }
  return h.digest('hex');
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
  const { ha_url, ha_token, entitySet, domainSet, mcp_area_allowlist, forced_area_scope } = ctx;
  const server = new McpServer({
    name: 'ha-chat-addon',
    version: '1.0.0',
  });
  const searchIndexCache = new Map();

  const areaResolver = createAreaResolver(ha_url, ha_token, mcp_area_allowlist);
  const getEffectiveArea = (toolArea) => {
    const forced = String(forced_area_scope || '').trim();
    if (forced) return forced;
    return String(toolArea || '').trim();
  };
  const scopeHint =
    entitySet || domainSet || (typeof mcp_area_allowlist === 'string' && mcp_area_allowlist.trim()) || getEffectiveArea('')
      ? 'Nur freigegebene Entities/Domains/Areas (Add-on mcp_*_allowlist / optional URL-scope).'
      : 'Alle Entities, die das konfigurierte HA-Token darf.';

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
              'Du steuerst Home Assistant nur über die Tools list_entities, search_entities, get_entity_state und call_service. ' +
              scopeHint +
              ' Ermittle den Geltungsbereich über verfügbare MCP-Entities, nicht über Annahmen. ' +
              'Für call_service gilt strikt: Nutze immer domain, service, optional area und service_data. ' +
              'entity_id darf niemals auf Top-Level stehen, sondern nur in service_data.entity_id (String oder Array). ' +
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
        const rowsRaw = await fetchAllowedStates(ha_url, ha_token, entitySet, domainSet);
        const rowsAll = await areaResolver.filterRows(rowsRaw, getEffectiveArea(area));
        const total = rowsAll.length;
        const rows = limit != null ? rowsAll.slice(off, off + limit) : rowsAll.slice(off);
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
    'search_entities',
    {
      description:
        'Sucht gezielt in freigegebenen HA-Entities mit MiniSearch-Index (BM25/Fuzzy) über entity_id/friendly_name sowie optional nach domain/state.',
      inputSchema: {
        query: z.string().optional().describe('Freitextsuche (z. B. c0.09, wohnzimmer, decke)'),
        domain: z.string().optional().describe('Optionaler Domain-Filter (z. B. light, switch, lock)'),
        state: z.string().optional().describe('Optionaler State-Filter (z. B. on, off, unavailable)'),
        area: z.string().optional().describe('Optionaler HA-Area-Filter (Name oder area_id)'),
        limit: z.number().int().min(1).max(5000).optional().describe('Max. Treffer (Standard 50)'),
        offset: z.number().int().min(0).optional().describe('Startindex für Paging (Standard 0)'),
        top_k: z.number().int().min(1).max(5000).optional().describe('Anzahl der Top-Treffer aus dem Suchindex vor Paging (Standard max(limit+offset, 200)).'),
      },
    },
    async ({ query, domain, state, area, limit, offset, top_k }) => {
      const q = String(query || '').trim().toLowerCase();
      const d = String(domain || '').trim().toLowerCase();
      const s = String(state || '').trim().toLowerCase();
      const lim = limit != null ? limit : 50;
      const off = offset != null ? offset : 0;
      try {
        const rowsRaw = await fetchAllowedStates(ha_url, ha_token, entitySet, domainSet);
        const rowsAll = await areaResolver.filterRows(rowsRaw, getEffectiveArea(area));
        const scopedRows = rowsAll.filter((r) => {
          if (d && String(r.domain || '').toLowerCase() !== d) return false;
          if (s && String(r.state || '').toLowerCase() !== s) return false;
          return true;
        });
        let filtered;
        if (!q) {
          filtered = scopedRows
            .slice()
            .sort((a, b) => String(a.friendly_name || '').localeCompare(String(b.friendly_name || ''), 'de'));
        } else {
          const terms = buildSearchTermsForIndex(q);
          if (!terms.length) {
            filtered = [];
          } else {
            const cacheKey = JSON.stringify({
              area: getEffectiveArea(area) || '',
              domain: d || '',
              state: s || '',
            });
            const sig = buildRowsSignature(scopedRows);
            const now = Date.now();
            const existing = searchIndexCache.get(cacheKey);
            const canReuse =
              !!(existing && existing.signature === sig && now - existing.createdAt < SEARCH_INDEX_CACHE_TTL_MS);
            const entry = canReuse
              ? existing
              : {
                  signature: sig,
                  createdAt: now,
                  index: createMiniSearchIndex(scopedRows),
                };
            if (!canReuse) searchIndexCache.set(cacheKey, entry);

            // Opportunistische Cache-Bereinigung.
            if (searchIndexCache.size > 32) {
              for (const [k, v] of searchIndexCache.entries()) {
                if (now - v.createdAt >= SEARCH_INDEX_CACHE_TTL_MS) searchIndexCache.delete(k);
              }
            }

            const queryString = terms.join(' ');
            const hits = entry.index.search(queryString);
            const topKRequested = top_k != null ? top_k : Math.max(200, off + lim);
            const topK = Math.max(topKRequested, off + lim);
            const limitedHits = hits.slice(0, topK);
            filtered = limitedHits.map((h) => ({
              entity_id: h.entity_id,
              friendly_name: h.friendly_name,
              domain: h.domain,
              state: h.state,
              area_id: h.area_id,
              area_name: h.area_name,
            }));
          }
        }
        const rows = filtered.slice(off, off + lim);
        return textResult({
          total: filtered.length,
          returned: rows.length,
          offset: off,
          limit: lim,
          top_k: q ? (top_k != null ? Math.max(top_k, off + lim) : Math.max(200, off + lim)) : null,
          has_more: off + rows.length < filtered.length,
          query: q || null,
          domain: d || null,
          state: s || null,
          area: getEffectiveArea(area) || null,
          entities: rows,
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
