import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/roles/roles.schema.js';
import { riders } from '../src/riders/rider.schema.js';
import { shops } from '../src/shops/shop.schema.js';
import { customers } from '../src/customers/customer.schema.js';
import { orders } from '../src/orders/order.schema.js';
import { orderStatusHistory } from '../src/orders/order-status-history.schema.js';
import { pickups, pickupOrders } from '../src/pickups/pickup.schema.js';
import {
  deliveryAttempts,
  deliveryAttemptHistory,
} from '../src/deliveries/delivery.schema.js';

interface AuthResponse {
  accessToken: string;
}

describe('Pickup and delivery first slice (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let ownerToken: string;
  let riderToken: string;
  let otherRiderToken: string;
  let riderId: string;
  let otherRiderId: string;
  let shopId: string;
  let customerId: string;
  const orderIds: string[] = [];
  const pickupIds: string[] = [];
  const attemptIds: string[] = [];
  const userIds: string[] = [];
  const run = Date.now();

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return (response.body as AuthResponse).accessToken;
  }

  async function createOrder(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId })
      .expect(201);
    const id = (response.body as { id: string }).id;
    orderIds.push(id);
    return id;
  }

  async function createPickup(orderId: string, key: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/pickups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', key)
      .send({
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        orderIds: [orderId],
      })
      .expect(201);
    const id = (response.body as { id: string }).id;
    pickupIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    setupSwagger(app);
    await app.init();
    database = app.get(DatabaseService);

    const ownerRole = await database.db.query.roles.findFirst({
      where: eq(roles.name, 'OWNER'),
      columns: { id: true },
    });
    const riderRole = await database.db.query.roles.findFirst({
      where: eq(roles.name, 'RIDER'),
      columns: { id: true },
    });
    if (!ownerRole || !riderRole) throw new Error('Required roles are missing');

    const ownerEmail = `pickup-owner-${run}@e2e.local`;
    const [owner] = await database.db
      .insert(users)
      .values({
        name: 'Pickup Owner',
        email: ownerEmail,
        passwordHash: await hashPassword('owner1234'),
        roleId: ownerRole.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    userIds.push(owner.id);
    ownerToken = await login(ownerEmail, 'owner1234');

    const riderRecords = await Promise.all(
      ['one', 'two'].map(async (suffix) => {
        const email = `pickup-rider-${suffix}-${run}@e2e.local`;
        const [user] = await database.db
          .insert(users)
          .values({
            name: `Pickup Rider ${suffix}`,
            email,
            passwordHash: await hashPassword('rider1234'),
            roleId: riderRole.id,
            status: 'ACTIVE',
          })
          .returning({ id: users.id });
        const [rider] = await database.db
          .insert(riders)
          .values({ userId: user.id })
          .returning({ id: riders.id });
        userIds.push(user.id);
        return { email, riderId: rider.id };
      }),
    );
    riderId = riderRecords[0].riderId;
    otherRiderId = riderRecords[1].riderId;
    riderToken = await login(riderRecords[0].email, 'rider1234');
    otherRiderToken = await login(riderRecords[1].email, 'rider1234');

    const shop = await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Pickup Shop ${run}` })
      .expect(201);
    shopId = (shop.body as { id: string }).id;
    const customer = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Pickup Customer ${run}` })
      .expect(201);
    customerId = (customer.body as { id: string }).id;
  });

  afterAll(async () => {
    if (attemptIds.length > 0) {
      await database.db
        .delete(deliveryAttemptHistory)
        .where(inArray(deliveryAttemptHistory.deliveryAttemptId, attemptIds));
      await database.db
        .delete(deliveryAttempts)
        .where(inArray(deliveryAttempts.id, attemptIds));
    }
    if (pickupIds.length > 0) {
      await database.db
        .delete(pickupOrders)
        .where(inArray(pickupOrders.pickupId, pickupIds));
      await database.db.delete(pickups).where(inArray(pickups.id, pickupIds));
    }
    if (orderIds.length > 0) {
      await database.db
        .delete(orderStatusHistory)
        .where(inArray(orderStatusHistory.orderId, orderIds));
      await database.db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (shopId) await database.db.delete(shops).where(eq(shops.id, shopId));
    if (customerId)
      await database.db.delete(customers).where(eq(customers.id, customerId));
    if (userIds.length > 0)
      await database.db.delete(users).where(inArray(users.id, userIds));
    await app.close();
  });

  it('completes and receives an atomic pickup, with idempotent creation', async () => {
    const orderId = await createOrder();
    const pickupId = await createPickup(orderId, `pickup-${run}-one`);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/pickups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `pickup-${run}-one`)
      .send({ scheduledAt: new Date().toISOString(), orderIds: [orderId] })
      .expect(201);
    expect((duplicate.body as { id: string }).id).toBe(pickupId);

    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${pickupId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${pickupId}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((order.body as { status: string }).status).toBe(
      'RECEIVED_AT_OFFICE',
    );
  });

  it('cancels a scheduled pickup and permits a new eligible pickup', async () => {
    const orderId = await createOrder();
    const cancelledId = await createPickup(orderId, `pickup-${run}-cancelled`);
    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${cancelledId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const replacementId = await createPickup(
      orderId,
      `pickup-${run}-replacement`,
    );
    expect(replacementId).not.toBe(cancelledId);
  });

  it('enforces rider ownership and completes a delivery', async () => {
    const orderId = await createOrder();
    const pickupId = await createPickup(orderId, `pickup-${run}-two`);
    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${pickupId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${pickupId}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${orderId}/assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId })
      .expect(201);
    const attemptId = (assigned.body as { id: string }).id;
    attemptIds.push(attemptId);

    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${attemptId}/start`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .expect(403);
    const own = await request(app.getHttpServer())
      .get('/api/v1/riders/me/deliveries')
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    expect(
      (own.body as { data: Array<{ id: string }> }).data.map((row) => row.id),
    ).toContain(attemptId);
    await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${attemptId}/reassign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId: otherRiderId })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${attemptId}/start`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${attemptId}/start`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${attemptId}/complete`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .expect(200);
    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((order.body as { status: string }).status).toBe('DELIVERED');
  });

  it('records failed attempts and creates a new attempt on retry', async () => {
    const orderId = await createOrder();
    const pickupId = await createPickup(orderId, `pickup-${run}-three`);
    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${pickupId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/pickups/${pickupId}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const first = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${orderId}/assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId })
      .expect(201);
    const firstId = (first.body as { id: string }).id;
    attemptIds.push(firstId);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${firstId}/start`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${firstId}/fail`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'CUSTOMER_UNAVAILABLE' })
      .expect(200);
    const retry = await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/deliveries/retry`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId: otherRiderId })
      .expect(201);
    const retryId = (retry.body as { id: string }).id;
    attemptIds.push(retryId);
    expect(retryId).not.toBe(firstId);
    expect((retry.body as { attemptNumber: number }).attemptNumber).toBe(2);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${retryId}/start`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${retryId}/fail`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .send({ reason: 'WRONG_ADDRESS', note: 'Second attempt still failed' })
      .expect(200);
    const third = await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/deliveries/retry`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId })
      .expect(201);
    const thirdId = (third.body as { id: string }).id;
    attemptIds.push(thirdId);
    expect((third.body as { attemptNumber: number }).attemptNumber).toBe(3);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${thirdId}/start`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${thirdId}/fail`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ reason: 'CUSTOMER_REFUSED' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderId}/deliveries/retry`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId })
      .expect(409);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}/deliveries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      (history.body as { data: Array<{ attemptNumber: number }> }).data,
    ).toHaveLength(3);
  });
});
