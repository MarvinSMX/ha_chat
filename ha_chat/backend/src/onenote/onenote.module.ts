import { Module } from '@nestjs/common';
import { OnenoteController } from './onenote.controller';
import { OnenoteService } from './onenote.service';

@Module({
  controllers: [OnenoteController],
  providers: [OnenoteService],
})
export class OnenoteModule {}
