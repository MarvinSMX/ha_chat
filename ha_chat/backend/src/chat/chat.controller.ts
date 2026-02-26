import { Controller, Post, Body } from '@nestjs/common';
import { N8nService } from './n8n.service';
import { getOptions } from '../config/options';

@Controller('api')
export class ChatController {
  constructor(private readonly n8n: N8nService) {}

  @Post('chat')
  async chat(@Body() body: { message?: string }) {
    const message = (body?.message ?? '').trim();
    if (!message) {
      return { error: 'message fehlt' };
    }
    const inferenceUrl = (getOptions().n8n_inference_webhook_url ?? '').trim();
    if (!inferenceUrl) {
      return { error: 'N8N Inference-Webhook-URL fehlt (Add-on konfigurieren)' };
    }
    try {
      const result = await this.n8n.inference(message);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { error: err };
    }
  }
}
