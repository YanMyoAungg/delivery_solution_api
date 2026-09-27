import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { roles } from '../src/roles/roles.schema.js';
import { customers } from '../src/customers/customer.schema.js';
import { eq, ilike } from 'drizzle-orm';

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  /** Test user ids (always cleaned up). */
  const cleanupUserIds: string[] = [];
  let adminToken: string;
  let officerToken: string;
  let riderToken: string;

  const run = Date.now();

  async function insertUser(role: string, email: string) {
    const roleRow = await database.db.query.roles.findFirst({
      where: eq(roles.name, role),
      columns: { id: true },
    });
    if (!roleRow) throw new Error(`Role '${role}' not found — run db:seed`);
    const [row] = await database.db
      .insert(users)
      .values({
        name: `E2E ${role}`,
        email,
        passwordHash: await hashPassword('password1'),
        roleId: roleRow.id,
        status: 'ACTIVE' as const,
      })
      .returning({ id: users.id });
    cleanupUserIds.push(row.id);
  }

  async function login(email: string, password = 'password1') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return (response.body as { accessToken?: string }).accessToken ?? '';
  }

  function createCustomer(token: string, name: string, phone: string) {
    return request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, phone });
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

    const adminEmail = `customer-admin-${run}@e2e.local`;
    const officerEmail = `customer-officer-${run}@e2e.local`;
    const riderEmail = `customer-rider-${run}@e2e.local`;
    await insertUser('ADMIN', adminEmail);
    await insertUser('OFFICER', officerEmail);
    await insertUser('RIDER', riderEmail);
    adminToken = await login(adminEmail);
    officerToken = await login(officerEmail);
    riderToken = await login(riderEmail);
  });

  afterAll(async () => {
    const like = `Run ${run}%`;
    const rows = await database.db
      .select({ id: customers.id })
      .from(customers)
      .where(ilike(customers.name, like));
    for (const row of rows) {
      await database.db.delete(customers).where(eq(customers.id, row.id));
    }
    for (const id of cleanupUserIds) {
      await database.db.delete(users).where(eq(users.id, id));
    }
    await app.close();
  });

  describe('POST /api/v1/customers (ADMIN)', () => {
    it('creates a customer with optional fields nulled', async () => {
      const response = await createCustomer(
        adminToken,
        `Run ${run} Ma Aye Chan`,
        '09111122233',
      ).expect(201);

      expect(response.body.name).toBe(`Run ${run} Ma Aye Chan`);
      expect(response.body.phone).toBe('09111122233');
      expect(response.body.address).toBeNull();
      expect(response.body.notes).toBeNull();
    });

    it('accepts duplicate customer names (201, dup-legal)', async () => {
      await createCustomer(
        adminToken,
        `Run ${run} Ma Aye Chan`,
        '09111122233',
      ).expect(201);
    });

    it('requires a name (missing → 400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '09111122233' })
        .expect(400);
    });
  });

  describe('GET /api/v1/customers (ADMIN)', () => {
    beforeAll(async () => {
      await createCustomer(adminToken, `Run ${run} Ko Nyi Zaw`, '09777888999');
    });

    it('lists customers with pagination metadata', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers?search=Ko Nyi Zaw`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.meta.total).toBeGreaterThan(0);
      expect(response.body.meta.perPage).toBeGreaterThan(0);
    });

    it('paginates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&perPage=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.totalPages).toBeGreaterThan(1);
    });

    it('gets a single customer by id', async () => {
      const found = await request(app.getHttpServer())
        .get(`/api/v1/customers?search=Ko Nyi Zaw`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const customerId = (found.body.data[0] as { id: string }).id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(customerId);
      expect(response.body.name).toBe(`Run ${run} Ko Nyi Zaw`);
    });

    it('returns 404 for an unknown customer id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 400 for a malformed customer id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('PATCH /api/v1/customers/:id (ADMIN)', () => {
    it('updates only provided fields', async () => {
      const created = await createCustomer(
        adminToken,
        `Run ${run} Patch Target`,
        '09888889999',
      ).expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '09333444555' })
        .expect(200);

      expect(response.body.name).toBe(`Run ${run} Patch Target`);
      expect(response.body.phone).toBe('09333444555');
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/customers/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '091111' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/customers/:id (ADMIN)', () => {
    it('deletes an existing customer (204, then 404)', async () => {
      const created = await createCustomer(
        adminToken,
        `Run ${run} Delete Target`,
        '09999999999',
      ).expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/customers/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/customers/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('OFFICER permissions', () => {
    let officerCustomerId: string;

    it('can create, read and patch (2xx)', async () => {
      const created = await createCustomer(
        officerToken,
        `Run ${run} Officer Customer`,
        '09222223333',
      ).expect(201);
      officerCustomerId = created.body.id;

      await request(app.getHttpServer())
        .get(`/api/v1/customers/${officerCustomerId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/customers/${officerCustomerId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ notes: 'officer note' })
        .expect(200);
    });

    it('cannot delete (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/customers/${officerCustomerId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });
  });

  describe('RIDER permissions', () => {
    it('cannot list customers (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(403);
    });
  });

  describe('Authentication', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/customers').expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/customers')
        .send({ name: 'X' })
        .expect(401);
    });
  });
});
