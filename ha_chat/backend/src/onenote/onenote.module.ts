import { Module } from '@nestjs/common';
import { OnenoteController } from './onenote.controller';
import { OnenoteService } from './onenote.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [OnenoteController],
  providers: [OnenoteService],
})
export class OnenoteModule {}
