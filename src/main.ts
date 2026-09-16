import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { setupApp, setupSwagger } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  setupApp(app);
  setupSwagger(app);

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Delivery Management API listening on http://localhost:${port}`);
  logger.log(`Swagger UI: http://localhost:${port}/api/v1/docs`);
  logger.log(`OpenAPI JSON: http://localhost:${port}/api/v1/docs-json`);
}

await bootstrap();