const CHROMADB_URL = process.env.CHROMA_URL || 'http://localhost:8000';
const COLLECTION_NAME = 'ha_chat_docs';

export async function getOrCreateCollection(): Promise<string> {
  const base = CHROMADB_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/collections/${COLLECTION_NAME}`);
  if (res.ok) return COLLECTION_NAME;
  await fetch(`${base}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COLLECTION_NAME, metadata: { 'hnsw:space': 'cosine' } }),
  });
  return COLLECTION_NAME;
}

export async function addDocuments(
  ids: string[],
  documents: string[],
  metadatas: Record<string, unknown>[],
  embeddings: number[][],
): Promise<void> {
  const base = CHROMADB_URL.replace(/\/$/, '');
  await getOrCreateCollection();
  await fetch(`${base}/api/v1/collections/${COLLECTION_NAME}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, documents, metadatas, embeddings }),
  });
}

export async function query(
  queryEmbedding: number[],
  nResults: number,
): Promise<{ documents: string[][]; metadatas: Record<string, unknown>[][]; distances: number[][] }> {
  const base = CHROMADB_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/collections/${COLLECTION_NAME}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embeddings: [queryEmbedding],
      n_results: nResults,
      include: ['documents', 'metadatas', 'distances'],
    }),
  });
  const data = await res.json();
  return {
    documents: data.documents ?? [[]],
    metadatas: data.metadatas ?? [[]],
    distances: data.distances ?? [[]],
  };
}
