import { Injectable } from '@nestjs/common';
import { getOptions } from '../config/options';

export interface IngestDocument {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface InferenceResponse {
  answer: string;
  sources?: Array<{ title?: string; url?: string; score?: number }>;
  actions?: unknown[];
}

@Injectable()
export class N8nService {
  private getIngestUrl(): string {
    const url = (getOptions().n8n_ingest_webhook_url ?? '').trim();
    return url.replace(/\/$/, '');
  }

  private getInferenceUrl(): string {
    const url = (getOptions().n8n_inference_webhook_url ?? '').trim();
    return url.replace(/\/$/, '');
  }

  /** Sendet Dokumente an den N8N Ingest-Webhook (Embedding + Speicher in N8N/Chroma). */
  async sendToIngest(documents: IngestDocument[]): Promise<void> {
    const url = this.getIngestUrl();
    if (!url) throw new Error('N8N Ingest-Webhook-URL fehlt');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`N8N Ingest: ${res.status} ${res.statusText}${text ? ' – ' + text.slice(0, 200) : ''}`);
    }
  }

  /** Sendet Nutzerfrage an den N8N Inference-Webhook (RAG in N8N), liefert Antwort + Quellen. */
  async inference(message: string): Promise<InferenceResponse> {
    const url = this.getInferenceUrl();
    if (!url) throw new Error('N8N Inference-Webhook-URL fehlt');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.trim() }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`N8N Inference: ${res.status} ${res.statusText}${text ? ' – ' + text.slice(0, 200) : ''}`);
    }
    if (!text.trim()) {
      return { answer: '', sources: [], actions: [] };
    }
    try {
      const data = JSON.parse(text) as InferenceResponse & { error?: string };
      if (data.error) throw new Error(data.error);
      return {
        answer: data.answer ?? '',
        sources: Array.isArray(data.sources) ? data.sources : [],
        actions: Array.isArray(data.actions) ? data.actions : [],
      };
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error('N8N Inference: Antwort ist kein gültiges JSON');
      throw e;
    }
  }
}
