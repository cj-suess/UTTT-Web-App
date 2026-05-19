import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Bootstraps the Nest application: creates the dependency-injection container,
 * wires up controllers, and starts the HTTP server.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Permissive CORS so the Vite dev server (different port) can call us.
  // Tighten allowed origins for production.
  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[backend] Listening on http://localhost:${port}`);
}

bootstrap();