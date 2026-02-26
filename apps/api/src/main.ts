import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = parseInt(process.env.SUPERVISOR_INGRESS_PORT || '8099', 10);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  await app.listen(PORT, '0.0.0.0');
  console.log(`Running on http://0.0.0.0:${PORT}`);
}
bootstrap();
