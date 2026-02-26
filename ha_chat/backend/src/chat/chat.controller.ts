import { Controller, Post, Body } from '@nestjs/common';
import { RagService } from './rag.service';
import { getOptions, getEmbeddingConfig, getChatConfig } from '../config/options';

@Controller('api')
export class ChatController {
  constructor(private readonly rag: RagService) {}

  @Post('chat')
  async chat(@Body() body: { message?: string }) {
    const message = (body?.message ?? '').trim();
    if (!message) {
      return { error: 'message fehlt' };
    }
    const opts = getOptions();
    const emb = getEmbeddingConfig(opts);
    const chat = getChatConfig(opts);
    if (!emb.endpoint || !emb.apiKey || !emb.deployment) {
      return { error: 'Azure OpenAI (Embedding) nicht konfiguriert' };
    }
    if (!chat.endpoint || !chat.apiKey || !chat.deployment) {
      return { error: 'Azure OpenAI (Chat/LLM) nicht konfiguriert' };
    }
    try {
      const result = await this.rag.runRag(message, 8);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { error: err };
    }
  }
}
