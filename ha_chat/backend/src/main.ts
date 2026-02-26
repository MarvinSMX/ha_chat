import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OnenoteService } from './onenote/onenote.service';

const PORT = parseInt(process.env.SUPERVISOR_INGRESS_PORT || process.env.PORT || '8099', 10);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  await app.listen(PORT, '0.0.0.0');
  console.log(`Running on http://0.0.0.0:${PORT}`);

  // OneNote-Sync beim Start (wie zuvor in Python) – im Hintergrund, damit bei Device Flow der Server schon läuft
  const onenote = app.get(OnenoteService);
  setImmediate(() => {
    onenote
      .runSync()
      .then((r) => {
        if (r.error) console.warn('OneNote-Sync beim Start:', r.error);
        else if (r.documents_added !== undefined && r.documents_added > 0)
          console.log('OneNote-Sync beim Start: %d Dokumente in ChromaDB', r.documents_added);
      })
      .catch((e) => console.warn('OneNote-Sync beim Start fehlgeschlagen:', e));
  });
}
bootstrap();
