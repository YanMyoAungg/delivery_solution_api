import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const API_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';

export function setupApp(app: INestApplication): INestApplication {
  // Global API prefix -> /api
  app.setGlobalPrefix(API_PREFIX);

  // URI versioning -> /api/v1 (default version 1)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_DEFAULT_VERSION,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS
  const config = app.get(ConfigService);
  const origin = config.get<string>('CORS_ORIGIN', '*');
  app.enableCors({
    origin: origin === '*' ? true : origin.split(','),
    credentials: true,
  });

  return app;
}

export function setupSwagger(app: INestApplication): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Delivery Management API')
    .setDescription(
      'Backend API for the Delivery Management System — a single delivery ' +
        "company's operations: shops, customers, riders, orders, pickups, " +
        'deliveries, returns, payments/COD and scheduled notifications.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/docs', app, document, {
    useGlobalPrefix: true,
    swaggerOptions: { persistAuthorization: true },
  });
}