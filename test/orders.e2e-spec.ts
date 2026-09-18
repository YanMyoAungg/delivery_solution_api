import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/roles/roles.schema.js';
import { shops } from '../src/shops/shop.schema.js';
import { customers } from '../src/customers/customer.schema.js';
import { orders } from '../src/orders/order.schema.js';
import { orderStatusHistory } from '../src/orders/order-status-history.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let ownerId: string;
  let ownerToken: string;
  let shopId: string;
  let customerId: string;
  const createdOrderIds: string[] = [];
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
        name: 'Orders E2E Owner',
        email: `orders-owner-${run}@e2e.local`,
        passwordHash: await hashPassword('owner1234'),
        roleId: role.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    ownerId = user.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `orders-owner-${run}@e2e.local`, password: 'owner1234' })
      .expect(200);
    ownerToken = login.body.accessToken as string;

    const shop = await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Orders Shop ${run}` })
      .expect(201);
    shopId = shop.body.id as string;

    const customer = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Orders Customer ${run}` })
      .expect(201);
    customerId = customer.body.id as string;
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await database.db
        .delete(orderStatusHistory)
        .where(inArray(orderStatusHistory.orderId, createdOrderIds));
      await database.db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (shopId) await database.db.delete(shops).where(eq(shops.id, shopId));
    if (customerId) {
      await database.db.delete(customers).where(eq(customers.id, customerId));
    }
    await database.db.delete(users).where(eq(users.id, ownerId));
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
  });

  it('registers a PENDING order with an initial history row', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, packageInfo: { items: 2 } })
      .expect(201);
    const orderId = created.body.id as string;
    createdOrderIds.push(orderId);

    expect(created.body.trackingCode).toMatch(
      /^ORD-[0-9A-HJKMNP-TV-Z]{26}$/,
    );
    expect(created.body.status).toBe('PENDING');
    expect(created.body.shopId).toBe(shopId);
    expect(created.body.customerId).toBe(customerId);
    expect(created.body.deliveryFee).toBe('0.00');
    expect(created.body.codAmount).toBe('0.00');
    expect(created.body).not.toHaveProperty('passwordHash');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(detail.body.status).toBe('PENDING');
    expect(detail.body.history).toHaveLength(1);
    expect(detail.body.history[0].fromStatus).toBeNull();
    expect(detail.body.history[0].toStatus).toBe('PENDING');

    const history = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body).toHaveLength(1);
  });

  it('lists and searches orders by tracking code', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId })
      .expect(201);
    const orderId = created.body.id as string;
    const trackingCode = created.body.trackingCode as string;
    createdOrderIds.push(orderId);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/orders?search=${trackingCode}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      listed.body.data.map((order: { id: string }) => order.id),
    ).toContain(orderId);

    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/orders?status=PENDING&shopId=${shopId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(filtered.body.data.length).toBeGreaterThan(0);
  });

  it('rejects registration with unknown shop or customer', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        shopId: '00000000-0000-4000-8000-000000000000',
        customerId,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        shopId,
        customerId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(400);
  });

  it('validates the payload and returns 404 for unknown orders', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, deliveryFee: 'not-money' })
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/orders/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/orders/00000000-0000-4000-8000-000000000000/history')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });
});
