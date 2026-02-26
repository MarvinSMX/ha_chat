import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { N8nService } from './n8n.service';

@Module({
  controllers: [ChatController],
  providers: [N8nService],
  exports: [N8nService],
})
export class ChatModule {}
