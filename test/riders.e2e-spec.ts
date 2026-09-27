import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { roles } from '../src/roles/roles.schema.js';
import { eq } from 'drizzle-orm';

describe('Riders (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  /** Test user ids (always cleaned up); API-created rider userIds pushed immediately. */
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
      .send({ email, password })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
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

    const adminEmail = `rider-admin-${run}@e2e.local`;
    const officerEmail = `rider-officer-${run}@e2e.local`;
    const riderEmail = `rider-rider-${run}@e2e.local`;
    await insertUser('ADMIN', adminEmail);
    await insertUser('OFFICER', officerEmail);
    await insertUser('RIDER', riderEmail);
    adminToken = await login(adminEmail);
    officerToken = await login(officerEmail);
    riderToken = await login(riderEmail);
  });

  afterAll(async () => {
    // API-removed rider ids are already gone from users — re-delete is a no-op.
    for (const id of cleanupUserIds) {
      await database.db.delete(users).where(eq(users.id, id));
    }
    await app.close();
  });

  describe('POST /api/v1/riders (ADMIN)', () => {
    it('creates a rider with the forced RIDER role', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Ko Zaw Min ${run}`,
          email: `zawmin-${run}@e2e.local`,
          password: 'password123',
          vehicleType: 'BIKE',
        })
        .expect(201);

      expect(response.body.userId).toEqual(expect.any(String));
      expect(response.body.user.status).toBe('ACTIVE');
      expect(response.body.vehicleType).toBe('BIKE');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      cleanupUserIds.push(response.body.userId);
    });

    it('can log in as the created rider', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Login Rider ${run}`,
          email: `login-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `login-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(200);
      expect((response.body as { accessToken: string }).accessToken).toEqual(
        expect.any(String),
      );
    });

    it('rejects a duplicate rider email with 409', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Dup Rider ${run}`,
          email: `dup-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Dup Rider 2 ${run}`,
          email: `dup-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(409);
    });

    it('rejects email in the update body (400 forbidNonWhitelisted)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Whitelist Rider ${run}`,
          email: `whitelist-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      await request(app.getHttpServer())
        .patch(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `hacked-${run}@e2e.local` })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/riders/:id (ADMIN)', () => {
    it('patch profile-only leaves the user name unchanged', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Profile Rider ${run}`,
          email: `profile-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isAvailable: false })
        .expect(200);

      expect(response.body.isAvailable).toBe(false);
      expect(response.body.user.name).toBe(`Profile Rider ${run}`);
    });

    it('patch name/status reflects in the users row', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Rename Rider ${run}`,
          email: `rename-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      await request(app.getHttpServer())
        .patch(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Renamed Rider ${run}`, status: 'INACTIVE' })
        .expect(200);

      const row = await database.db.query.users.findFirst({
        where: eq(users.id, created.body.userId),
      });
      expect(row?.name).toBe(`Renamed Rider ${run}`);
      expect(row?.status).toBe('INACTIVE');
    });

    it('patch status INACTIVE then re-ACTIVE retrains login', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Status Rider ${run}`,
          email: `status-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      await request(app.getHttpServer())
        .patch(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `status-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/riders/:id (ADMIN)', () => {
    it('deletes the rider and backing user (204, 404, rider login → 401)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Delete Rider ${run}`,
          email: `del-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      await request(app.getHttpServer())
        .delete(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `del-rider-${run}@e2e.local`, password: 'password123' })
        .expect(401);
    });

    it('RIDER role cannot delete anyone (403 before self-delete 400)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Self Rider ${run}`,
          email: `self-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      cleanupUserIds.push(created.body.userId);

      const accessToken = await login(
        `self-rider-${run}@e2e.local`,
        'password123',
      );
      await request(app.getHttpServer())
        .delete(`/api/v1/riders/${created.body.userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('OFFICER permissions', () => {
    let officerRiderUserId: string;

    it('can create, read and patch (2xx)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/riders')
        .set('Authorization', `Bearer ${officerToken}`)
        .send({
          name: `Officer Rider ${run}`,
          email: `officer-rider-${run}@e2e.local`,
          password: 'password123',
        })
        .expect(201);
      officerRiderUserId = created.body.userId;
      cleanupUserIds.push(officerRiderUserId);

      await request(app.getHttpServer())
        .get(`/api/v1/riders/${officerRiderUserId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/riders/${officerRiderUserId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ notes: 'officer note' })
        .expect(200);
    });

    it('cannot delete (403)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/riders/${officerRiderUserId}`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(403);
    });
  });

  describe('RIDER permissions', () => {
    it('cannot list riders (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/riders')
        .set('Authorization', `Bearer ${riderToken}`)
        .expect(403);
    });
  });

  describe('Authentication', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/riders').expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/riders')
        .send({ name: 'X', password: 'password123' })
        .expect(401);
    });
  });
});
