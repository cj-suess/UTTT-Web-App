import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  // Bind to loopback by default: on a shared machine, listening on all
  // interfaces would let anyone on the network call the API (and spend the
  // Anthropic key via /hint). Set HOST=0.0.0.0 to expose it deliberately.
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
  console.log(`[backend] Listening on http://localhost:${port}`);
}

bootstrap();