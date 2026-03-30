'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { fetchAzureOpenAiEmbeddings } = require('../search/entity-search.js');

const execFileAsync = promisify(execFile);
const PYTHON_BIN = process.env.PYTHON_BIN || '/opt/pyenv/bin/python';

async function writeJsonTempFile(prefix, payload) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(tmpDir, 'payload.json');
  await fs.promises.writeFile(filePath, JSON.stringify(payload), 'utf8');
  return { tmpDir, filePath };
}

async function runFaissBuild(indexScriptPath, input, indexFile, metaFile) {
  await execFileAsync(PYTHON_BIN, [
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
  const { stdout } = await execFileAsync(PYTHON_BIN, [
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

function scopeDirFor(baseDir, userId, areaScope) {
  const key = String(userId || 'public') + '\0' + String(areaScope || '');
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(baseDir, h);
}

function azureEmbeddingClient(opts) {
  return {
    endpoint: String(opts.azure_openai_endpoint || '').replace(/\/$/, ''),
    deployment: String(opts.azure_openai_embedding_deployment || '').trim(),
    apiKey: String(opts.azure_openai_api_key || '').trim(),
    apiVersion: String(opts.azure_openai_api_version || '2024-02-15-preview').trim(),
  };
}

function embeddingReady(client) {
  return !!(client.endpoint && client.deployment && client.apiKey);
}

/**
 * @param {Record<string, unknown>} opts
 */
function createAgentMemoryService(opts) {
  const enabled = opts.agent_memory_enabled === true;
  const dataDir = process.env.DATA_DIR || '/data';
  const baseDir = String(opts.agent_memory_dir || '').trim() || path.join(dataDir, 'agent-memory');
  const maxDocs = Number.isFinite(Number(opts.agent_memory_max_docs))
    ? Math.max(1, Math.min(5000, Number(opts.agent_memory_max_docs)))
    : 200;
  const pyScriptPath = path.join(__dirname, '..', 'faiss_index.py');

  async function loadStore(dir) {
    const p = path.join(dir, 'store.json');
    try {
      const raw = await fs.promises.readFile(p, 'utf8');
      const j = JSON.parse(raw);
      if (j && Array.isArray(j.docs)) return { path: p, docs: j.docs };
    } catch (_) {}
    return { path: p, docs: [] };
  }

  async function saveStore(storePath, docs) {
    await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
    await fs.promises.writeFile(storePath, JSON.stringify({ docs }, null, 2), 'utf8');
  }

  async function rebuildIndex(dir, docs, embClient) {
    if (!docs.length) {
      const indexFile = path.join(dir, 'index.faiss');
      const metaFile = path.join(dir, 'index.meta.json');
      try {
        await fs.promises.unlink(indexFile);
      } catch (_) {}
      try {
        await fs.promises.unlink(metaFile);
      } catch (_) {}
      return;
    }
    const texts = docs.map((d) => String(d.text || ''));
    const vectors = await fetchAzureOpenAiEmbeddings(embClient, texts);
    const ids = docs.map((d) => String(d.id));
    const { tmpDir, filePath } = await writeJsonTempFile('ha-agent-faiss-', { vectors, ids });
    try {
      const indexFile = path.join(dir, 'index.faiss');
      const metaFile = path.join(dir, 'index.meta.json');
      await fs.promises.mkdir(dir, { recursive: true });
      await runFaissBuild(pyScriptPath, filePath, indexFile, metaFile);
    } finally {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  return {
    async retrieveContext(userId, areaScope, userMessage, topK) {
      if (!enabled) return '';
      const client = azureEmbeddingClient(opts);
      if (!embeddingReady(client)) return '';
      const q = String(userMessage || '').trim();
      if (!q) return '';
      const dir = scopeDirFor(baseDir, userId, areaScope);
      const { docs } = await loadStore(dir);
      if (!docs.length) return '';
      const indexFile = path.join(dir, 'index.faiss');
      const metaFile = path.join(dir, 'index.meta.json');
      if (!fs.existsSync(indexFile) || !fs.existsSync(metaFile)) return '';
      const [qv] = await fetchAzureOpenAiEmbeddings(client, [q]);
      const { tmpDir, filePath } = await writeJsonTempFile('ha-agent-q-', { query_vector: qv });
      try {
        const k = Math.max(1, Math.min(50, Number(topK) || 5));
        const hits = await runFaissSearch(pyScriptPath, filePath, indexFile, metaFile, k);
        const byId = new Map(docs.map((d) => [String(d.id), d]));
        const lines = [];
        for (const h of hits) {
          const d = byId.get(String(h.id));
          if (d && d.text) lines.push(d.text.trim());
        }
        if (!lines.length) return '';
        return (
          'Relevante frühere Gesprächsfragmente (Kontext):\n' +
          lines.map((t, i) => '- ' + t.replace(/\n/g, ' ')).join('\n')
        );
      } finally {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (_) {}
      }
    },

    async rememberExchange(userId, areaScope, userMessage, fullAssistantText) {
      if (!enabled) return;
      const client = azureEmbeddingClient(opts);
      if (!embeddingReady(client)) return;
      const u = String(userMessage || '').trim();
      const a = String(fullAssistantText || '').trim();
      if (!u && !a) return;
      const dir = scopeDirFor(baseDir, userId, areaScope);
      await fs.promises.mkdir(dir, { recursive: true });
      const { path: storePath, docs } = await loadStore(dir);
      const text = 'Nutzer: ' + u + '\nAssistent: ' + a;
      docs.push({
        id: crypto.randomUUID(),
        text,
        created_at: Date.now(),
      });
      while (docs.length > maxDocs) docs.shift();
      await saveStore(storePath, docs);
      await rebuildIndex(dir, docs, client);
    },
  };
}

module.exports = { createAgentMemoryService };
