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
  if (Array.isArray(data.entity_ids)) data.entity_ids.forEach(add);
  return out;
}

function assertServiceDataAllowed(serviceData, entitySet, domainSet) {
  if (entitySet === null && domainSet === null) return;
  const ids = collectEntityIdsFromServiceData(serviceData);
  if (ids.length === 0) {
    throw new Error(
      'Zugriff eingeschränkt: service_data muss entity_id (oder entity_ids) enthalten, damit die Freigabe geprüft werden kann.'
    );
  }
  for (const id of ids) {
    if (!isEntityAllowed(id, entitySet, domainSet)) {
      throw new Error('Entity nicht freigegeben für diesen MCP-Endpunkt: ' + id);
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

function createMcpServer(ctx) {
  const { ha_url, ha_token, entitySet, domainSet } = ctx;
  const server = new McpServer({
    name: 'ha-chat-addon',
    version: '1.0.0',
  });

  const scopeHint =
    entitySet || domainSet
      ? 'Nur freigegebene Entities/Domains (Add-on mcp_entity_allowlist / mcp_domain_allowlist).'
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
              'Du steuerst Home Assistant nur über die Tools list_entities, get_entity_state und call_service. ' +
              scopeHint +
              ' Nutze call_service mit domain, service und service_data (u. a. entity_id).',
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
        limit: z.number().int().min(1).max(500).optional().describe('Max. Anzahl (Standard 120)'),
      },
    },
    async ({ limit }) => {
      if (!ha_url || !ha_token) {
        return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      }
      const lim = limit != null ? limit : 120;
      let states;
      try {
        const r = await fetch(ha_url + '/api/states', {
          headers: { Authorization: 'Bearer ' + ha_token },
        });
        if (!r.ok) return textResult({ error: 'HA /api/states HTTP ' + r.status });
        states = await r.json();
      } catch (e) {
        return textResult({ error: String(e.message || e) });
      }
      if (!Array.isArray(states)) return textResult({ error: 'Unerwartete HA-Antwort' });
      const rows = [];
      for (const s of states) {
        const id = s.entity_id;
        if (!id || !isEntityAllowed(id, entitySet, domainSet)) continue;
        const att = s.attributes || {};
        rows.push({
          entity_id: id,
          state: s.state,
          domain: String(id).split('.')[0],
          friendly_name: att.friendly_name || id,
        });
        if (rows.length >= lim) break;
      }
      return textResult({ count: rows.length, entities: rows });
    }
  );

  server.registerTool(
    'get_entity_state',
    {
      description: 'Liest den State einer einzelnen Entity (nur wenn freigegeben).',
      inputSchema: {
        entity_id: z.string().describe('z. B. light.wohnzimmer'),
      },
    },
    async ({ entity_id }) => {
      if (!ha_url || !ha_token) {
        return textResult({ error: 'ha_url / ha_token im Add-on konfigurieren' });
      }
      const id = String(entity_id || '').trim();
      if (!isEntityAllowed(id, entitySet, domainSet)) {
        return textResult({ error: 'Entity nicht freigegeben oder ungültig: ' + id });
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
        'Ruft einen HA-Service auf (POST /api/services/<domain>/<service>). entity_id in service_data muss zur Allowlist passen.',
      inputSchema: {
        domain: z.string().describe('z. B. light, switch, cover'),
        service: z.string().describe('z. B. turn_on, turn_off, toggle'),
        service_data: z.record(z.string(), z.unknown()).optional().describe('JSON-Objekt, oft mit entity_id'),
      },
    },
    async ({ domain, service, service_data }) => {
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
        assertServiceDataAllowed(data, entitySet, domainSet);
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

  const { entitySet, domainSet } = buildAllowSets(opts.mcp_entity_allowlist, opts.mcp_domain_allowlist);
  const ctx = {
    ha_url: opts.ha_url,
    ha_token: opts.ha_token,
    entitySet,
    domainSet,
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
