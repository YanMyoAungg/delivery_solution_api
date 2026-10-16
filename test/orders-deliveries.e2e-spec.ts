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
import { townships } from '../src/townships/township.schema.js';

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
  deliveryFee: string;
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
  let outsiderRiderId: string;
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

  async function createOrder(
    riderId: string = riderIds[0],
    deliveryFee?: string,
  ): Promise<CreatedOrder> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        shopId,
        customerId,
        townshipId,
        riderId,
        codAmount: '45000.00',
        ...(deliveryFee !== undefined && { deliveryFee }),
      })
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
      .send({ name: `Township ${run}`, defaultDeliveryFee: '4200.00' })
      .expect(201);
    townshipId = (township.body as { id: string }).id;
    expect(township.body.defaultDeliveryFee).toBe('4200.00');

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
    const [outsiderRider] = await database.db
      .insert(riders)
      .values({ userId: outsiderUser.id })
      .returning({ id: riders.id });
    outsiderRiderId = outsiderRider.id;
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

  it('assigns each order to the office-selected rider and snapshots the township default fee', async () => {
    const existingOrder = await createOrder(riderIds[0]);
    await request(app.getHttpServer())
      .patch(`/api/v1/townships/${townshipId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ defaultDeliveryFee: '4700.00' })
      .expect(200);

    const townshipList = await request(app.getHttpServer())
      .get('/api/v1/townships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(townshipList.body).toContainEqual(
      expect.objectContaining({ id: townshipId, defaultDeliveryFee: '4700.00' }),
    );

    const assignableRiders = await request(app.getHttpServer())
      .get('/api/v1/riders/assignable')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);
    expect(assignableRiders.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: riderIds[0] }),
        expect.objectContaining({ id: riderIds[1] }),
        expect.objectContaining({ id: outsiderRiderId }),
      ]),
    );

    const first = await createOrder(riderIds[1]);
    const second = await createOrder(riderIds[1]);
    const overridden = await createOrder(outsiderRiderId, '6900.00');

    expect(first.status).toBe('ASSIGNED');
    expect(first.riderId).toBe(riderIds[1]);
    expect(second.riderId).toBe(riderIds[1]);
    expect(overridden.riderId).toBe(outsiderRiderId);
    expect(first.deliveryFee).toBe('4700.00');
    expect(existingOrder.deliveryFee).toBe('4200.00');
    expect(overridden.deliveryFee).toBe('6900.00');
    expect(first.riderName).toContain('Township Rider');
    expect(first).toMatchObject({
      shopName: `Township Shop ${run}`,
      customerName: `Township Customer ${run}`,
      customerPhone: '09123456789',
      customerAddress: 'No. 12 Main Road',
    });

    const parallelOrders = await Promise.all([
      createOrder(riderIds[1]),
      createOrder(riderIds[1]),
    ]);
    expect(parallelOrders.map((order) => order.riderId)).toEqual([
      riderIds[1],
      riderIds[1],
    ]);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/orders?search=${first.trackingCode}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listed.body.data[0]).toMatchObject({
      townshipId,
      townshipName: `Township ${run}`,
      riderId: riderIds[1],
      riderName: first.riderName,
      deliveryFee: '4700.00',
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

  it('requires an existing township and an active rider when creating an order', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, townshipId })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        shopId,
        customerId,
        townshipId: '00000000-0000-4000-8000-000000000001',
        riderId: riderIds[0],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        shopId,
        customerId,
        townshipId,
        riderId: '00000000-0000-4000-8000-000000000001',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, riderId: riderIds[0] })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/riders/${outsiderRiderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    const activeRiders = await request(app.getHttpServer())
      .get('/api/v1/riders/assignable')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(activeRiders.body).not.toContainEqual(
      expect.objectContaining({ id: outsiderRiderId }),
    );
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shopId, customerId, townshipId, riderId: outsiderRiderId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/riders/${outsiderRiderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/riders/assignable')
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(403);
  });

  it('requires a valid default delivery fee when creating a township', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/townships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Missing Fee ${run}` })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/townships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Invalid Fee ${run}`, defaultDeliveryFee: '12.345' })
      .expect(400);
  });

  it('returns only the authenticated rider’s current assignments with full own-order detail', async () => {
    const first = await createOrder(riderIds[0]);
    const second = await createOrder(riderIds[1]);
    const attemptId = await riderAttemptId(first.id);

    const today = currentDateInTimezone('Asia/Yangon');
    const ownBoard = await request(app.getHttpServer())
      .get(`/api/v1/rider/board?date=${today}&filter=all`)
      .set('Authorization', `Bearer ${riderTokens[0]}`)
      .expect(200);
    const ownRows = (ownBoard.body as { data: Array<Record<string, unknown>> }).data;
    expect(ownRows).toContainEqual(
      expect.objectContaining({
        id: first.id,
        deliveryAttemptId: attemptId,
        isMine: true,
        customerName: `Township Customer ${run}`,
        customerPhone: '09123456789',
        deliveryFee: first.deliveryFee,
      }),
    );
    expect(ownRows).not.toContainEqual(expect.objectContaining({ id: second.id }));
    expect(ownBoard.body).not.toHaveProperty('filter');

    const otherRiderBoard = await request(app.getHttpServer())
      .get(`/api/v1/rider/board?date=${today}`)
      .set('Authorization', `Bearer ${riderTokens[1]}`)
      .expect(200);
    expect(otherRiderBoard.body.data).toContainEqual(
      expect.objectContaining({
        id: second.id,
        deliveryAttemptId: expect.any(String),
      }),
    );
    expect(otherRiderBoard.body.data).not.toContainEqual(
      expect.objectContaining({ id: first.id }),
    );

    const outsiderBoard = await request(app.getHttpServer())
      .get('/api/v1/rider/board')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    expect(outsiderBoard.body.data).not.toContainEqual(
      expect.objectContaining({ id: first.id }),
    );
    expect(outsiderBoard.body.data).not.toContainEqual(
      expect.objectContaining({ id: second.id }),
    );

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

  it('shows an order created without township coverage to the rider explicitly assigned to it', async () => {
    const order = await createOrder(outsiderRiderId);
    const response = await request(app.getHttpServer())
      .get('/api/v1/rider/board')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    expect(response.body.data).toContainEqual(
      expect.objectContaining({
        id: order.id,
        deliveryAttemptId: expect.any(String),
      }),
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
    const today = currentDateInTimezone('Asia/Yangon');
    const previousRiderBoard = await request(app.getHttpServer())
      .get(`/api/v1/rider/board?date=${today}`)
      .set('Authorization', `Bearer ${riderTokens[completedRiderIndex]}`)
      .expect(200);
    expect(previousRiderBoard.body.data).not.toContainEqual(
      expect.objectContaining({ id: completedOrder.id }),
    );
    const newRiderBoard = await request(app.getHttpServer())
      .get(`/api/v1/rider/board?date=${today}`)
      .set('Authorization', `Bearer ${riderTokens[reassignedRiderIndex]}`)
      .expect(200);
    expect(newRiderBoard.body.data).toContainEqual(
      expect.objectContaining({ id: completedOrder.id }),
    );
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
