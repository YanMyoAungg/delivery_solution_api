import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

describe('Retired workflow routes (e2e)', () => {
  let application: INestApplication;

  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = moduleReference.createNestApplication();
    setupApp(application);
    await application.init();
  });

  afterAll(async () => {
    await application.close();
  });

  it('does not expose pickup routes', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/pickups')
      .expect(404);
  });

  it('does not expose delivery-attempt routes', async () => {
    await request(application.getHttpServer())
      .get('/api/v1/deliveries')
      .expect(404);
    await request(application.getHttpServer())
      .get('/api/v1/riders/me/deliveries')
      .expect(404);
  });
});
