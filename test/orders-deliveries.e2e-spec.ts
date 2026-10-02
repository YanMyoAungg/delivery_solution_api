import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { currentDateInTimezone } from '../src/common/utils/local-date.util.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/roles/roles.schema.js';
import { shops } from '../src/shops/shop.schema.js';
import { customers } from '../src/customers/customer.schema.js';
import { orders } from '../src/orders/order.schema.js';
import { orderStatusHistory } from '../src/orders/order-status-history.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { deliveryAttemptHistory, deliveryAttempts } from '../src/deliveries/delivery.schema.js';
import { riders } from '../src/riders/rider.schema.js';
import { riderTownships, townships, townshipRotation } from '../src/townships/township.schema.js';

interface AuthResponse {
  accessToken: string;
}

interface CreatedOrder {
  id: string;
  trackingCode: string;
  status: string;
  riderId: string;
  riderName: string;
  shopName: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
}

describe('Township orders and deliveries (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let ownerToken: string;
  let shopId: string;
  let customerId: string;
  let townshipId: string;
  let riderIds: string[] = [];
  let riderTokens: string[] = [];
  let outsiderToken: string;
  let officerToken: string;
  const orderIds: string[] = [];
  const userIds: string[] = [];
  const run = Date.now();

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return (response.body as AuthResponse).accessToken;
  }

  async function createOrder(): Promise<CreatedOrder> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, townshipId, codAmount: '45000.00' })
      .expect(201);
    const created = response.body as CreatedOrder;
    orderIds.push(created.id);
    return created;
  }

  async function riderAttemptId(orderId: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}/deliveries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    return (response.body as { data: Array<{ id: string }> }).data[0].id;
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
    const officerRole = await database.db.query.roles.findFirst({
      where: eq(roles.name, 'OFFICER'),
      columns: { id: true },
    });
    if (!officerRole) throw new Error('OFFICER role is missing');

    const ownerEmail = `township-owner-${run}@e2e.local`;
    const [owner] = await database.db
      .insert(users)
      .values({
        name: 'Township E2E Owner',
        email: ownerEmail,
        passwordHash: await hashPassword('Password1234'),
        roleId: ownerRole.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    userIds.push(owner.id);
    ownerToken = await login(ownerEmail, 'Password1234');

    const officerEmail = `township-officer-${run}@e2e.local`;
    const [officer] = await database.db
      .insert(users)
      .values({
        name: 'Township E2E Officer',
        email: officerEmail,
        passwordHash: await hashPassword('Password1234'),
        roleId: officerRole.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    userIds.push(officer.id);
    officerToken = await login(officerEmail, 'Password1234');

    const township = await request(app.getHttpServer())
      .post('/api/v1/townships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Township ${run}` })
      .expect(201);
    townshipId = (township.body as { id: string }).id;

    const riderRecords: Array<{ id: string; email: string; name: string }> = [];
    for (const suffix of ['one', 'two']) {
      const email = `township-rider-${suffix}-${run}@e2e.local`;
      const name = `Township Rider ${suffix}`;
      const [user] = await database.db
        .insert(users)
        .values({
          name,
          email,
          phone: `09${run.toString().slice(-8)}`,
          passwordHash: await hashPassword('rider1234'),
          roleId: riderRole.id,
          status: 'ACTIVE',
        })
        .returning({ id: users.id });
      userIds.push(user.id);
      const [rider] = await database.db
        .insert(riders)
        .values({ userId: user.id })
        .returning({ id: riders.id });
      riderRecords.push({ id: rider.id, email, name });
    }
    riderIds = riderRecords.map((rider) => rider.id);
    riderTokens = await Promise.all(
      riderRecords.map((rider) => login(rider.email, 'rider1234')),
    );
    for (const rider of riderRecords) {
      await request(app.getHttpServer())
        .patch(`/api/v1/riders/${rider.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ townshipIds: [townshipId] })
        .expect(200);
    }
    const outsiderEmail = `township-outsider-${run}@e2e.local`;
    const [outsiderUser] = await database.db
      .insert(users)
      .values({
        name: 'Township Outsider',
        email: outsiderEmail,
        passwordHash: await hashPassword('rider1234'),
        roleId: riderRole.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    userIds.push(outsiderUser.id);
    await database.db.insert(riders).values({ userId: outsiderUser.id });
    outsiderToken = await login(outsiderEmail, 'rider1234');

    const shop = await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Township Shop ${run}`,
        channelType: 'TELEGRAM',
        channelName: `TownshipShop${run}`,
      })
      .expect(201);
    shopId = (shop.body as { id: string }).id;
    const customer = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Township Customer ${run}`,
        phone: '09123456789',
        address: 'No. 12 Main Road',
      })
      .expect(201);
    customerId = (customer.body as { id: string }).id;
  });

  afterAll(async () => {
    if (orderIds.length > 0) {
      const attemptRows = await database.db
        .select({ id: deliveryAttempts.id })
        .from(deliveryAttempts)
        .where(inArray(deliveryAttempts.orderId, orderIds));
      const attemptIds = attemptRows.map((row) => row.id);
      if (attemptIds.length > 0) {
        await database.db
          .delete(deliveryAttemptHistory)
          .where(inArray(deliveryAttemptHistory.deliveryAttemptId, attemptIds));
        await database.db
          .delete(deliveryAttempts)
          .where(inArray(deliveryAttempts.id, attemptIds));
      }
      await database.db
        .delete(orderStatusHistory)
        .where(inArray(orderStatusHistory.orderId, orderIds));
      await database.db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (townshipId) {
      await database.db
        .delete(townshipRotation)
        .where(eq(townshipRotation.townshipId, townshipId));
      await database.db
        .delete(riderTownships)
        .where(eq(riderTownships.townshipId, townshipId));
      await database.db.delete(townships).where(eq(townships.id, townshipId));
    }
    if (shopId) await database.db.delete(shops).where(eq(shops.id, shopId));
    if (customerId) {
      await database.db.delete(customers).where(eq(customers.id, customerId));
    }
    if (userIds.length > 0) {
      await database.db.delete(users).where(inArray(users.id, userIds));
    }
    await app.close();
  });

  it('automatically assigns orders round-robin and advances safely under concurrency', async () => {
    const first = await createOrder();
    const second = await createOrder();
    const third = await createOrder();
    const fourth = await createOrder();

    expect(first.status).toBe('ASSIGNED');
    expect(first.riderId).not.toBe(second.riderId);
    expect(first.riderId).toBe(third.riderId);
    expect(second.riderId).toBe(fourth.riderId);
    expect(first.riderName).toContain('Township Rider');
    expect(first).toMatchObject({
      shopName: `Township Shop ${run}`,
      customerName: `Township Customer ${run}`,
      customerPhone: '09123456789',
      customerAddress: 'No. 12 Main Road',
    });

    const parallelOrders = await Promise.all([createOrder(), createOrder()]);
    expect(parallelOrders[0].riderId).not.toBe(parallelOrders[1].riderId);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/orders?search=${first.trackingCode}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listed.body.data[0]).toMatchObject({
      townshipId,
      townshipName: `Township ${run}`,
      riderId: first.riderId,
      riderName: first.riderName,
      shopName: `Township Shop ${run}`,
      customerName: `Township Customer ${run}`,
      customerPhone: '09123456789',
      customerAddress: 'No. 12 Main Road',
    });

    const searchedByPhone = await request(app.getHttpServer())
      .get('/api/v1/orders?search=0912')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      (searchedByPhone.body.data as Array<{ id: string }>).some(
        (order) => order.id === first.id,
      ),
    ).toBe(true);
  });

  it('rejects order creation without a township or an active covered rider', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId })
      .expect(400);

    const township = await request(app.getHttpServer())
      .post('/api/v1/townships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `No Rider ${run}` })
      .expect(201);
    const noRiderTownshipId = (township.body as { id: string }).id;
    expect((township.body as { selectable: boolean }).selectable).toBe(false);

    const selectable = await request(app.getHttpServer())
      .get('/api/v1/townships?selectable=true')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      (selectable.body as Array<{ id: string }>).map((row) => row.id),
    ).not.toContain(noRiderTownshipId);

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, townshipId: noRiderTownshipId })
      .expect(400);
    expect(response.body.message).toContain('has no active rider');
    await database.db.delete(townships).where(eq(townships.id, noRiderTownshipId));
  });

  it('scopes the rider board and redacts other riders’ customer and COD data', async () => {
    const first = await createOrder();
    const second = await createOrder();
    const attemptId = await riderAttemptId(first.id);

    const today = currentDateInTimezone('Asia/Yangon');
    const all = await request(app.getHttpServer())
      .get(`/api/v1/rider/board?date=${today}&filter=all`)
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(200);
    const rows = (all.body as { data: Array<Record<string, unknown>> }).data;
    const own = rows.find((row) => row.id === first.id || row.id === second.id);
    expect(own).toBeDefined();
    const otherOrder = first.riderId === riderIds[0] ? second : first;
    const other = rows.find((row) => row.id === otherOrder.id);
    expect(other).toMatchObject({ isMine: false, shopName: `Township Shop ${run}` });
    expect(other).not.toHaveProperty('customerName');
    expect(other).not.toHaveProperty('customerPhone');
    expect(other).not.toHaveProperty('customerAddress');
    expect(other).not.toHaveProperty('codAmount');
    expect(other).not.toHaveProperty('deliveryFee');
    expect(other).not.toHaveProperty('packageInfo');
    expect(other).not.toHaveProperty('notes');
    expect(other).not.toHaveProperty('deliveryAttemptId');

    const mine = await request(app.getHttpServer())
      .get(`/api/v1/rider/board?date=${today}&filter=mine`)
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(200);
    const mineRows = (mine.body as { data: Array<Record<string, unknown>> }).data;
    expect(mineRows.length).toBeGreaterThan(0);
    expect(mineRows.every((row) => row.isMine === true)).toBe(true);
    expect(mineRows[0]).toHaveProperty('customerPhone', '09123456789');
    expect(mineRows[0]).toHaveProperty('deliveryAttemptId');

    await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/deliveries/${attemptId}`)
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${first.id}/deliveries`)
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${attemptId}/reassign`)
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .send({ riderId: riderIds[1] })
      .expect(403);
  });

  it('does not show township orders to a rider with no coverage', async () => {
    const order = await createOrder();
    const response = await request(app.getHttpServer())
      .get('/api/v1/rider/board?filter=all')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.data).not.toContainEqual(
      expect.objectContaining({ id: order.id }),
    );
  });

  it('allows one-tap delivery/failure from ASSIGNED, rejects start, and preserves retry limits', async () => {
    const completedOrder = await createOrder();
    const completedAttemptId = await riderAttemptId(completedOrder.id);
    const completedRiderIndex = riderIds.indexOf(completedOrder.riderId);
    const reassignedRiderIndex = (completedRiderIndex + 1) % riderIds.length;
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${completedAttemptId}/start`)
      .set('Authorization', `Bearer ${riderTokens[completedRiderIndex]}`)
      .expect(404);
    const reassigned = await request(app.getHttpServer())
      .patch(`/api/v1/deliveries/${completedAttemptId}/reassign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId: riderIds[reassignedRiderIndex] })
      .expect(200);
    expect(
      (reassigned.body as { history: Array<{ event: string }> }).history.some(
        (event) => event.event === 'REASSIGNED',
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${completedAttemptId}/complete`)
      .set('Authorization', `Bearer ${riderTokens[completedRiderIndex]}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${completedAttemptId}/complete`)
      .set('Authorization', `Bearer ${riderTokens[reassignedRiderIndex]}`)
      .expect(200);
    const completed = await request(app.getHttpServer())
      .get(`/api/v1/orders/${completedOrder.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(completed.body.status).toBe('DELIVERED');

    const failedOrder = await createOrder();
    const firstAttemptId = await riderAttemptId(failedOrder.id);
    const firstRiderIndex = riderIds.indexOf(failedOrder.riderId);
    await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${firstAttemptId}/fail`)
      .set('Authorization', `Bearer ${riderTokens[firstRiderIndex]}`)
      .send({ reason: 'CUSTOMER_UNAVAILABLE' })
      .expect(200);

    for (const attemptNumber of [2, 3]) {
      const retry = await request(app.getHttpServer())
        .post(`/api/v1/orders/${failedOrder.id}/deliveries/retry`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ riderId: riderIds[(firstRiderIndex + attemptNumber - 1) % 2] })
        .expect(201);
      expect((retry.body as { attemptNumber: number }).attemptNumber).toBe(
        attemptNumber,
      );
      const ownerIndex = riderIds.indexOf(
        (retry.body as { riderId: string }).riderId,
      );
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${(retry.body as { id: string }).id}/fail`)
        .set('Authorization', `Bearer ${riderTokens[ownerIndex]}`)
        .send({ reason: 'WRONG_ADDRESS' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${failedOrder.id}/deliveries/retry`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ riderId: riderIds[0] })
      .expect(409);
  });

  it('provides the rider dashboard for an office-local date', async () => {
    const assignedOrder = await createOrder();
    const index = riderIds.indexOf(assignedOrder.riderId);
    const date = currentDateInTimezone('Asia/Yangon');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/rider/dashboard?date=${date}`)
      .set('Authorization', `Bearer ${riderTokens[index]}`)
      .expect(200);
    expect(response.body).toMatchObject({
      date,
      assigned: expect.any(Number),
      delivered: expect.any(Number),
      failed: expect.any(Number),
      codCollected: expect.stringMatching(/^\d+\.\d{2}$/),
      codOutstanding: expect.stringMatching(/^\d+\.\d{2}$/),
    });
    expect(
      response.body.assigned + response.body.delivered + response.body.failed,
    ).toBeGreaterThan(0);
  });

  it('allows office reports dashboard access and denies it to riders', async () => {
    const office = await request(app.getHttpServer())
      .get('/api/v1/office/dashboard')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(office.body).toMatchObject({
      date: expect.any(String),
      summary: {
        ordersCreated: expect.any(Number),
        openAssignments: expect.any(Number),
        delivered: expect.any(Number),
        failed: expect.any(Number),
        successRate: expect.any(Number),
      },
      openWork: expect.any(Array),
      recentActivity: expect.any(Array),
      failedOrders: expect.any(Array),
    });

    const selectedDate = await request(app.getHttpServer())
      .get('/api/v1/office/dashboard?date=2026-01-01')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(selectedDate.body.date).toBe('2026-01-01');

    await request(app.getHttpServer())
      .get('/api/v1/office/dashboard')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/office/dashboard')
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(403);
  });
});
