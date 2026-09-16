import { Test } from '@nestjs/testing';
import {
  Body,
  Controller,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { Public } from '../src/common/auth/public.decorator.js';

class ValidationProbeDto {
  @IsString()
  name: string;

  @IsInt()
  @Type(() => Number)
  size: number;
}

@Controller({ path: 'probe', version: '1' })
@Public()
class ValidationProbeController {
  @Post()
  echo(@Body() dto: ValidationProbeDto): { name: string; size: number } {
    return { name: dto.name, size: dto.size };
  }
}

describe('Delivery Management API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports a live database connection', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.dependencies.database.status).toBe('up');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('GET /api/v1/docs-json serves the OpenAPI specification', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/docs-json')
      .expect(200);
    const spec = response.body;

    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info.title).toBe('Delivery Management API');
    expect(spec.info.version).toBe('1.0');
    expect(Object.keys(spec.paths)).toContain('/api/v1/health');
    expect(spec.components.securitySchemes['access-token']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('GET /api/v1/docs serves the Swagger UI', async () => {
    await request(app.getHttpServer()).get('/api/v1/docs').expect(200);
  });

  it('rejects routes without versioning or the API prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
    await request(app.getHttpServer()).get('/api/health').expect(404);
  });
});

describe('Global ValidationPipe (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ValidationProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unknown properties with forbidNonWhitelisted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'test', size: 3, extra: true })
      .expect(400);

    expect(response.body.message).toContain('property extra should not exist');
  });

  it('rejects payloads failing validation rules', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'test', size: 'not-a-number' })
      .expect(400);

    expect(Array.isArray(response.body.message)).toBe(true);
  });

  it('whitelists and transforms valid payloads', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'test', size: '3' })
      .expect(201);

    expect(response.body).toEqual({ name: 'test', size: 3 });
  });
});