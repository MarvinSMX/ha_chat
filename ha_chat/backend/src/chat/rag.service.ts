import { AzureOpenAI } from 'openai';
import { getOptions, getEmbeddingConfig, getChatConfig } from '../config/options';
import * as chromaService from './chroma.service';

export interface ChatResponse {
  answer: string;
  sources: Array<{ title: string; url: string; score?: number }>;
  actions: unknown[];
}

export class RagService {
  private getEmbeddingClient(): AzureOpenAI | null {
    const opts = getOptions();
    const cfg = getEmbeddingConfig(opts);
    if (!cfg.endpoint || !cfg.apiKey || !cfg.deployment) return null;
    return new AzureOpenAI({
      endpoint: cfg.endpoint,
      apiKey: cfg.apiKey,
      deployment: cfg.deployment,
      apiVersion: '2024-02-01',
    });
  }

  private getChatClient(): AzureOpenAI | null {
    const opts = getOptions();
    const cfg = getChatConfig(opts);
    if (!cfg.endpoint || !cfg.apiKey || !cfg.deployment) return null;
    return new AzureOpenAI({
      endpoint: cfg.endpoint,
      apiKey: cfg.apiKey,
      deployment: cfg.deployment,
      apiVersion: '2024-02-01',
    });
  }

  async getEmbedding(text: string): Promise<number[]> {
    const client = this.getEmbeddingClient();
    if (!client) throw new Error('Azure Embedding nicht konfiguriert');
    const opts = getOptions();
    const cfg = getEmbeddingConfig(opts);
    const res = await client.embeddings.create({
      model: cfg.deployment,
      input: text,
    });
    return res.data[0]?.embedding ?? [];
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const client = this.getChatClient();
    if (!client) throw new Error('Azure Chat nicht konfiguriert');
    const opts = getOptions();
    const cfg = getChatConfig(opts);
    const res = await client.chat.completions.create({
      model: cfg.deployment,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 1,
    });
    return (res.choices[0]?.message?.content ?? '').trim();
  }

  async runRag(message: string, k = 8): Promise<ChatResponse> {
    const queryEmbedding = await this.getEmbedding(message);
    const results = await chromaService.query(queryEmbedding, k);

    const docs = results.documents[0] ?? [];
    const metas = results.metadatas[0] ?? [];

    const contextStr =
      docs.length === 0
        ? '(Keine passenden Dokumente gefunden.)'
        : docs.map((d, i) => `[${i + 1}] ${d}`).join('\n\n');

    const systemPrompt =
      'Du bist ein hilfreicher Assistent mit Zugriff auf die Wissensbasis des Nutzers. ' +
      'Der Kontext stammt aus seinen synchronisierten Dokumenten (z. B. OneNote). ' +
      'Antworte knapp auf Deutsch. Beziehe dich auf den Kontext und nenne Quellen (z. B. [1], [2]). ' +
      'Wenn du nach deinem Zugriff gefragt wirst: Erkläre, dass du die Inhalte aus der Wissensbasis (OneNote-Sync) nutzt. ' +
      'Erfinde nichts; wenn der Kontext nichts Relevantes enthält, sag das.';

    const userPrompt = `Kontext:\n\n${contextStr}\n\n---\n\nFrage: ${message}`;
    const answer = await this.chat(systemPrompt, userPrompt);

    const sources = metas.map((m: Record<string, unknown>, i: number) => ({
      title: (m.title ?? m.section ?? `Quelle ${i + 1}`) as string,
      url: (m.url ?? '') as string,
      score: 1,
    }));

    return { answer, sources, actions: [] };
  }

  async addToChroma(
    ids: string[],
    documents: string[],
    metadatas: Record<string, unknown>[],
    embeddings: number[][],
  ): Promise<void> {
    await chromaService.addDocuments(ids, documents, metadatas, embeddings);
  }
}
