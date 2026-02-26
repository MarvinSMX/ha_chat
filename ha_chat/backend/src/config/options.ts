import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const OPTIONS_PATH = process.env.OPTIONS_PATH || '/data/options.json';

export interface AppOptions {
  azure_endpoint?: string;
  azure_api_key?: string;
  azure_embedding_endpoint?: string;
  azure_embedding_api_key?: string;
  azure_embedding_deployment?: string;
  azure_chat_endpoint?: string;
  azure_chat_api_key?: string;
  azure_chat_deployment?: string;
  microsoft_client_id?: string;
  microsoft_client_secret?: string;
  microsoft_tenant_id?: string;
  onenote_notebook_id?: string;
  onenote_notebook_name?: string;
  ha_url?: string;
  ha_token?: string;
  /** RAG: Anzahl der ähnlichsten Chunks (Top-k). Default 8 */
  rag_top_k?: number;
  /** RAG: LLM-Temperature (0–1). Default 0.5 für fokussierte Antworten */
  rag_temperature?: number;
  /** RAG: Minimaler Similarity-Score (0–1), Chunks darunter werden ignoriert. 0 = aus */
  rag_score_threshold?: number;
}

let cached: AppOptions = {};

export function loadOptions(): AppOptions {
  if (existsSync(OPTIONS_PATH)) {
    try {
      cached = JSON.parse(readFileSync(OPTIONS_PATH, 'utf-8'));
    } catch {}
  }
  return { ...cached };
}

export function getOptions(): AppOptions {
  loadOptions();
  return { ...cached };
}

export function getEmbeddingConfig(opts: AppOptions) {
  return {
    endpoint: (opts.azure_embedding_endpoint || opts.azure_endpoint || '').trim().replace(/\/$/, ''),
    apiKey: (opts.azure_embedding_api_key || opts.azure_api_key || '').trim(),
    deployment: (opts.azure_embedding_deployment || 'text-embedding-ada-002').trim(),
  };
}

export function getChatConfig(opts: AppOptions) {
  return {
    endpoint: (opts.azure_chat_endpoint || opts.azure_endpoint || '').trim().replace(/\/$/, ''),
    apiKey: (opts.azure_chat_api_key || opts.azure_api_key || '').trim(),
    deployment: (opts.azure_chat_deployment || 'gpt-4o').trim(),
  };
}

export function getRagConfig(opts: AppOptions) {
  return {
    topK: Math.max(1, Math.min(50, Number(opts.rag_top_k) || 8)),
    temperature: Math.max(0, Math.min(1, Number(opts.rag_temperature) ?? 0.5)),
    scoreThreshold: Math.max(0, Math.min(1, Number(opts.rag_score_threshold) ?? 0)),
  };
}
