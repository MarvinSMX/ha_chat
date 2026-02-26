import { readFileSync, existsSync } from 'fs';

const OPTIONS_PATH = process.env.OPTIONS_PATH || '/data/options.json';

export interface AppOptions {
  microsoft_client_id?: string;
  microsoft_client_secret?: string;
  microsoft_tenant_id?: string;
  onenote_notebook_id?: string;
  onenote_notebook_name?: string;
  ha_url?: string;
  ha_token?: string;
  n8n_ingest_webhook_url?: string;
  n8n_inference_webhook_url?: string;
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
