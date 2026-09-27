import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/roles/roles.schema.js';
import { customers } from '../src/customers/customer.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let ownerId: string;
  let ownerToken: string;
  const createdCustomerIds: string[] = [];
  const run = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    setupSwagger(app);
    await app.init();
    database = app.get(DatabaseService);

    const role = await database.db.query.roles.findFirst({
      where: eq(roles.name, 'OWNER'),
      columns: { id: true },
    });
    if (!role) throw new Error('OWNER role missing - run db:seed');
    const [user] = await database.db
      .insert(users)
      .values({
        name: 'Customers E2E Owner',
        email: `customers-owner-${run}@e2e.local`,
        passwordHash: await hashPassword('owner1234'),
        roleId: role.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    ownerId = user.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `customers-owner-${run}@e2e.local`,
        password: 'owner1234',
      })
      .expect(200);
    ownerToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    for (const id of createdCustomerIds) {
      await database.db.delete(customers).where(eq(customers.id, id));
    }
    await database.db.delete(users).where(eq(users.id, ownerId));
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/customers').expect(401);
  });

  it('creates, lists, reads, updates and deletes a customer', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Customer ${run}`,
        phone: '09123456789',
        address: 'Main Road',
      })
      .expect(201);
    const customerId = created.body.id as string;
    createdCustomerIds.push(customerId);

    expect(created.body.name).toBe(`Customer ${run}`);
    expect(created.body).not.toHaveProperty('passwordHash');

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/customers?search=${run}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      listed.body.data.map((customer: { id: string }) => customer.id),
    ).toContain(customerId);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Updated Customer ${run}` })
      .expect(200);
    expect(updated.body.name).toBe(`Updated Customer ${run}`);

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    createdCustomerIds.splice(createdCustomerIds.indexOf(customerId), 1);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('validates the required name', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: '' })
      .expect(400);
  });
});
