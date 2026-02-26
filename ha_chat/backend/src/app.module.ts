import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ChatModule } from './chat/chat.module';
import { OnenoteModule } from './onenote/onenote.module';

const FRONTEND_DIST = process.env.FRONTEND_DIST || join(__dirname, '..', '..', 'frontend', 'dist');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: FRONTEND_DIST,
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),
    ChatModule,
    OnenoteModule,
  ],
})
export class AppModule {}
