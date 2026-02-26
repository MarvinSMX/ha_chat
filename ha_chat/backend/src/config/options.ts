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
