import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { RagService } from './rag.service';

@Module({
  controllers: [ChatController],
  providers: [RagService],
  exports: [RagService],
})
export class ChatModule {}
