import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigService } from './config.service';
import { ChromaService } from './chroma.service';
import { RagService } from './rag.service';
import { OnenoteService } from './onenote.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [ConfigService, ChromaService, RagService, OnenoteService],
})
export class AppModule {}
