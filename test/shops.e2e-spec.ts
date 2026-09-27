import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { roles } from '../src/roles/roles.schema.js';
import { shops } from '../src/shops/shop.schema.js';
import { eq, ilike } from 'drizzle-orm';

describe('Shops (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  /** Rows created through the API by a test account; shop ids look like `shop-<uuid>`. */
  const createdShopIds: string[] = [];
  /** Test user ids inserted directly (always cleaned up). */
  const cleanupUserIds: string[] = [];
  let adminEmail: string;
  let adminToken: string;
  let officerToken: string;
  let riderToken: string;
  let officerEmail: string;

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

  function createShop(
    token: string,
    name: string,
    channelType: 'VIBER' | 'TELEGRAM' = 'VIBER',
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        channelType,
        channelName: `${name} Group`,
      });
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

    adminEmail = `shop-admin-${run}@e2e.local`;
    officerEmail = `shop-officer-${run}@e2e.local`;
    const riderEmail = `shop-rider-${run}@e2e.local`;
    await insertUser('ADMIN', adminEmail);
    await insertUser('OFFICER', officerEmail);
    await insertUser('RIDER', riderEmail);
    adminToken = await login(adminEmail);
    officerToken = await login(officerEmail);
    riderToken = await login(riderEmail);
  });

  afterAll(async () => {
    // Shop rows made through the API don't delete their creator accounts,
    // so remove by name prefix using ilike like we search the table.
    const like = `%${run}%`;
    const rows = await database.db
      .select({ id: shops.id })
      .from(shops)
      .where(ilike(shops.name, like));
    for (const row of rows) {
      await database.db.delete(shops).where(eq(shops.id, row.id));
    }
    // Rider users are API-deleted; cleanup is a no-op for them.
    for (const id of cleanupUserIds) {
      await database.db.delete(users).where(eq(users.id, id));
    }
    await app.close();
  });

  describe('POST /api/v1/shops (ADMIN)', () => {
    it('creates a shop with channel fields and never returns chatId', async () => {
      const response = await createShop(
        adminToken,
        `Alpha Shop ${run}`,
        'VIBER',
      ).expect(201);

      expect(response.body.name).toBe(`Alpha Shop ${run}`);
      expect(response.body.channelType).toBe('VIBER');
      expect(response.body.channelName).toBe(`Alpha Shop ${run} Group`);
      expect(response.body).not.toHaveProperty('chatId');
      createdShopIds.push(response.body.id);
    });

    it('rejects a duplicate shop name with 409', async () => {
      await createShop(adminToken, `Alpha Shop ${run}`).expect(409);
    });

    it('requires channelName (400 when missing)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shops')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `No Channel Shop ${run}`,
          channelType: 'VIBER',
        })
        .expect(400);
    });

    it('rejects chatId in the request body (400, whitelist)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/shops')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `ChatId Shop ${run}`,
          channelType: 'VIBER',
          channelName: 'ChatId Shop Group',
          chatId: '12345',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/shops (ADMIN)', () => {
    beforeAll(async () => {
      await createShop(adminToken, `Bravo Shop ${run}`, 'TELEGRAM');
    });

    it('lists shops with pagination metadata and no chatId leaked', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/shops?search=Bravo Shop`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).not.toHaveProperty('chatId');
      expect(response.body.meta.total).toBeGreaterThan(0);
      expect(response.body.meta.perPage).toBeGreaterThan(0);
    });

    it('filters by channelType', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/shops?channelType=TELEGRAM&search=Bravo Shop`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const shop of response.body.data as CreatedShop[]) {
        expect(shop.channelType).toBe('TELEGRAM');
      }
    });

    it('paginates', async () => {
      const pageOne = await request(app.getHttpServer())
        .get('/api/v1/shops?page=1&perPage=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const pageTwo = await request(app.getHttpServer())
        .get('/api/v1/shops?page=2&perPage=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(pageOne.body.data).toHaveLength(1);
      if (pageOne.body.meta.total > 1) {
        expect(pageTwo.body.data[0].id).not.toBe(pageOne.body.data[0].id);
      }
    });

    it('returns a single shop by id', async () => {
      const [shopId] = createdShopIds;
      const response = await request(app.getHttpServer())
        .get(`/api/v1/shops/${shopId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(shopId);
      expect(response.body).not.toHaveProperty('chatId');
    });

    it('returns 404 for an unknown shop id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/shops/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 400 for a malformed shop id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/shops/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('PATCH /api/v1/shops/:id (ADMIN)', () => {
    it('updates only provided fields', async () => {
      const [shopId] = createdShopIds;
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/shops/${shopId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Alpha Renamed ${run}` })
        .expect(200);

      expect(response.body.name).toBe(`Alpha Renamed ${run}`);
      expect(response.body.channelType).toBe('VIBER');
      expect(response.body).not.toHaveProperty('chatId');
    });

    it('returns 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/shops/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/shops/:id (ADMIN)', () => {
    it('deletes an existing shop (204, then 404)', async () => {
      const created = await createShop(
        adminToken,
        `Delete Target ${run}`,
        'VIBER',
      ).expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/shops/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/shops/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('OFFICER permissions', () => {
    it('can create, read and patch (2xx)', async () => {
      const created = await createShop(
        officerToken,
        `Officer Shop ${run}`,
      ).expect(201);
      createdShopIds.push(created.body.id);

      await request(app.getHttpServer())
        .get(`/api/v1/shops/${created.body.id}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/shops/${created.body.id}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ notes: 'officer note' })
        .expect(200);
    });

    it('cannot delete (403)', async () => {
      const [shopId] = createdShopIds;
      await request(app.getHttpServer())
        .delete(`/api/v1/shops/${shopId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });
  });

  describe('RIDER permissions', () => {
    it('cannot list shops (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/shops')
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(403);
    });
  });

  describe('Authentication', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/shops').expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/shops')
        .send({ name: 'X', channelType: 'VIBER', channelName: 'Y' })
        .expect(401);
    });
  });
});
