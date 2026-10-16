import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { getDateInTimeZone } from '../src/common/utils/timezone-date.util.js';
import { townships } from '../src/townships/township.schema.js';

function localTimeAsUtc(date: string, time: string, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(candidate));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(values.get('year')), Number(values.get('month')) - 1, Number(values.get('day')),
      Number(values.get('hour')), Number(values.get('minute')), Number(values.get('second')),
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

function addCalendarDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let ownerId: string;
  let ownerToken: string;
  let shopId: string;
  let customerId: string;
  let townshipId: string;
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
    const [township] = await database.db.insert(townships).values({
      name: `Orders Township ${run}`,
      leadTimeDays: 2,
    }).returning({ id: townships.id });
    townshipId = township.id;
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
    if (townshipId) await database.db.delete(townships).where(eq(townships.id, townshipId));
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
    expect(created.body).not.toHaveProperty('codAmount');
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

  it.each(['02:00', '23:30'])('creates and filters an order created at Myanmar local time %s', async (localTime) => {
    const timeZone = app.get(ConfigService).get<string>('APP_TIMEZONE') ?? 'Asia/Yangon';
    const localDate = getDateInTimeZone(new Date(), timeZone);
    const localCreatedAt = localTimeAsUtc(localDate, localTime, timeZone);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(localCreatedAt);
    try {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `orders-owner-${run}@e2e.local`, password: 'owner1234' })
        .expect(200);
      const token = login.body.accessToken as string;
      const created = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shopId, customerId, townshipId })
        .expect(201);
      const orderId = created.body.id as string;
      const trackingCode = created.body.trackingCode as string;
      createdOrderIds.push(orderId);
      expect(created.body.estimatedDeliveryDate).toBe(addCalendarDays(localDate, 2));

      await database.db.update(orders).set({ createdAt: localCreatedAt, deliveredAt: localCreatedAt })
        .where(eq(orders.id, orderId));
      for (const dateBasis of ['ENTRY', 'DELIVERED'] as const) {
        const listed = await request(app.getHttpServer())
          .get('/api/v1/orders')
          .query({ dateFrom: localDate, dateTo: localDate, dateBasis, search: trackingCode })
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(listed.body.data.map((order: { id: string }) => order.id)).toContain(orderId);
      }
    } finally {
      vi.useRealTimers();
    }
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
