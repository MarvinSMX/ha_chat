'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { execFile } = require('child_process');

const EMBEDDING_CACHE_TTL_MS = 10 * 60 * 1000;
const EMBEDDING_BATCH_SIZE = 64;
const execFileAsync = promisify(execFile);

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

function buildEmbeddingTextForEntity(row) {
  return [
    String(row.friendly_name || ''),
    String(row.entity_id || ''),
    String(row.domain || ''),
    String(row.area_name || ''),
    String(row.area_id || ''),
  ]
    .join(' | ')
    .trim();
}

async function fetchAzureOpenAiEmbeddings(client, inputs) {
  const endpoint = String(client && client.endpoint ? client.endpoint : '').replace(/\/$/, '');
  const deployment = String(client && client.deployment ? client.deployment : '').trim();
  const apiKey = String(client && client.apiKey ? client.apiKey : '').trim();
  const apiVersion = String(client && client.apiVersion ? client.apiVersion : '2024-02-15-preview').trim();
  if (!endpoint || !deployment || !apiKey) {
    throw new Error('Azure OpenAI Embeddings nicht vollständig konfiguriert.');
  }
  const url =
    endpoint +
    '/openai/deployments/' +
    encodeURIComponent(deployment) +
    '/embeddings?api-version=' +
    encodeURIComponent(apiVersion || '2024-02-15-preview');
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: inputs }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Azure OpenAI Embeddings HTTP ' + r.status + ' ' + JSON.stringify(body).slice(0, 400));
  if (!body || !Array.isArray(body.data)) throw new Error('Unerwartete Azure Embeddings-Antwort');
  const vectors = body.data
    .slice()
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((d) => d.embedding);
  if (vectors.length !== inputs.length) throw new Error('Embedding-Antwort unvollständig');
  return vectors;
}

async function writeJsonTempFile(prefix, payload) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(tmpDir, 'payload.json');
  await fs.promises.writeFile(filePath, JSON.stringify(payload), 'utf8');
  return { tmpDir, filePath };
}

async function runFaissBuild(indexScriptPath, input, indexFile, metaFile) {
  await execFileAsync('python3', [
    indexScriptPath,
    'build',
    '--input-json',
    input,
    '--index-file',
    indexFile,
    '--meta-file',
    metaFile,
  ]);
}

async function runFaissSearch(indexScriptPath, queryJson, indexFile, metaFile, topK) {
  const { stdout } = await execFileAsync('python3', [
    indexScriptPath,
    'search',
    '--query-json',
    queryJson,
    '--index-file',
    indexFile,
    '--meta-file',
    metaFile,
    '--top-k',
    String(topK),
  ]);
  const out = JSON.parse(String(stdout || '{}'));
  return Array.isArray(out.hits) ? out.hits : [];
}

function createEntitySearchService(config) {
  const {
    embeddingTopK,
    faissEnabled,
    faissIndexDir,
    azureOpenAi,
    fetchScopedRows,
  } = config;

  const embeddingClient = {
    endpoint: azureOpenAi.endpoint,
    apiKey: azureOpenAi.apiKey,
    deployment: azureOpenAi.deployment,
    apiVersion: azureOpenAi.apiVersion || '2024-02-15-preview',
  };
  const embeddingConfigured = !!(embeddingClient.endpoint && embeddingClient.apiKey && embeddingClient.deployment);
  const faissScriptPath = path.join(__dirname, '..', 'faiss_index.py');
  const embeddingCache = new Map();

  const getEmbeddingTopKDefault = () => {
    const n = Number(embeddingTopK);
    if (!Number.isFinite(n)) return 200;
    return Math.min(5000, Math.max(10, Math.floor(n)));
  };

  async function prepareEmbeddingsForRows(cacheKey, rows) {
    const sig = buildRowsSignature(rows);
    const now = Date.now();
    const existing = embeddingCache.get(cacheKey);
    const canReuse = !!(existing && existing.signature === sig && now - existing.createdAt < EMBEDDING_CACHE_TTL_MS);
    if (canReuse) return existing;

    const texts = rows.map((r) => buildEmbeddingTextForEntity(r));
    const vectors = new Array(texts.length);
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const emb = await fetchAzureOpenAiEmbeddings(embeddingClient, batch);
      for (let j = 0; j < emb.length; j += 1) vectors[i + j] = emb[j];
    }
    const entry = { signature: sig, createdAt: now, vectors };
    embeddingCache.set(cacheKey, entry);
    if (embeddingCache.size > 8) {
      for (const [k, v] of embeddingCache.entries()) {
        if (now - v.createdAt >= EMBEDDING_CACHE_TTL_MS) embeddingCache.delete(k);
      }
    }
    return entry;
  }

  async function ensureFaissIndex(scopeKey, rows) {
    if (!faissEnabled) return null;
    const rowsById = new Map(rows.map((r) => [String(r.entity_id), r]));
    const signature = buildRowsSignature(rows);
    const nameHash = crypto.createHash('sha1').update(scopeKey).digest('hex');
    const indexFile = path.join(faissIndexDir, `${nameHash}.faiss`);
    const metaFile = path.join(faissIndexDir, `${nameHash}.meta.json`);
    const stateFile = path.join(faissIndexDir, `${nameHash}.state.json`);
    await fs.promises.mkdir(faissIndexDir, { recursive: true });

    let state = null;
    try {
      state = JSON.parse(await fs.promises.readFile(stateFile, 'utf8'));
    } catch (_) {}

    const reuse = !!(state && state.signature === signature && fs.existsSync(indexFile) && fs.existsSync(metaFile));
    if (!reuse) {
      const emb = await prepareEmbeddingsForRows('faiss:' + scopeKey, rows);
      const tmp = await writeJsonTempFile('ha-faiss-build-', {
        ids: rows.map((r) => String(r.entity_id)),
        vectors: emb.vectors,
      });
      try {
        await runFaissBuild(faissScriptPath, tmp.filePath, indexFile, metaFile);
        await fs.promises.writeFile(
          stateFile,
          JSON.stringify({ signature, updated_at: Date.now(), count: rows.length }),
          'utf8'
        );
      } finally {
        try { await fs.promises.rm(tmp.tmpDir, { recursive: true, force: true }); } catch (_) {}
      }
    }
    return { indexFile, metaFile, rowsById };
  }

  async function search(params) {
    const q = String(params.query || '').trim().toLowerCase();
    const d = String(params.domain || '').trim().toLowerCase();
    const s = String(params.state || '').trim().toLowerCase();
    const lim = params.limit != null ? params.limit : 50;
    const off = params.offset != null ? params.offset : 0;
    const area = String(params.area || '').trim();

    const rowsAll = await fetchScopedRows(area);
    const searchBaseRows = rowsAll.slice();
    let filtered;

    if (!q) {
      filtered = searchBaseRows
        .filter((r) => (!d || String(r.domain || '').toLowerCase() === d) && (!s || String(r.state || '').toLowerCase() === s))
        .slice()
        .sort((a, b) => String(a.friendly_name || '').localeCompare(String(b.friendly_name || ''), 'de'));
    } else {
      if (!embeddingConfigured) {
        throw new Error(
          'Embedding-Suche ist nicht konfiguriert. Bitte azure_openai_endpoint, azure_openai_api_key und azure_openai_embedding_deployment setzen.'
        );
      }
      const queryText = q;
      const scopeKey = JSON.stringify({ area, mode: 'faiss_scope_v2' });
      const faiss = await ensureFaissIndex(scopeKey, searchBaseRows);
      if (!faiss) {
        filtered = [];
      } else {
        const qVec = (await fetchAzureOpenAiEmbeddings(embeddingClient, [queryText]))[0];
        const qTmp = await writeJsonTempFile('ha-faiss-query-', { query_vector: qVec });
        let semanticHits = [];
        try {
          const topKRequested = params.top_k != null ? params.top_k : Math.max(getEmbeddingTopKDefault(), off + lim);
          const topK = Math.max(topKRequested, off + lim);
          semanticHits = await runFaissSearch(faissScriptPath, qTmp.filePath, faiss.indexFile, faiss.metaFile, topK);
        } finally {
          try { await fs.promises.rm(qTmp.tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
        filtered = [];
        for (const hit of semanticHits) {
          const id = String(hit && hit.id ? hit.id : '');
          if (!id) continue;
          const row = faiss.rowsById.get(id);
          if (!row) continue;
          if (d && String(row.domain || '').toLowerCase() !== d) continue;
          if (s && String(row.state || '').toLowerCase() !== s) continue;
          filtered.push(row);
        }
      }
    }

    const rows = filtered.slice(off, off + lim);
    return {
      total: filtered.length,
      returned: rows.length,
      offset: off,
      limit: lim,
      top_k: q ? (params.top_k != null ? Math.max(params.top_k, off + lim) : Math.max(getEmbeddingTopKDefault(), off + lim)) : null,
      has_more: off + rows.length < filtered.length,
      query: q || null,
      domain: d || null,
      state: s || null,
      area: area || null,
      retrieval_mode: q ? 'faiss' : 'list_sorted',
      entities: rows,
    };
  }

  return { search, embeddingConfigured };
}

module.exports = { createEntitySearchService };

