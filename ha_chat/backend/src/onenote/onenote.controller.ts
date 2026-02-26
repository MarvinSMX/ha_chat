import { Controller, Get, Post, Body } from '@nestjs/common';
import { OnenoteService } from './onenote.service';

@Controller('api')
export class OnenoteController {
  constructor(private readonly onenote: OnenoteService) {}

  @Get('onenote_status')
  async status() {
    return this.onenote.getStatus();
  }

  @Post('onenote_notebook')
  async saveNotebook(@Body() body: { notebook_id?: string; notebook_name?: string }) {
    return this.onenote.saveNotebook(
      (body?.notebook_id ?? '').trim() || undefined,
      (body?.notebook_name ?? '').trim() || undefined,
    );
  }

  @Post('sync_onenote')
  async sync() {
    return this.onenote.runSync();
  }
}
