import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/permissions/roles.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { eq } from 'drizzle-orm';

describe('Auth & Users (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  const cleanupIds: string[] = [];
  const roleIds: Record<string, string> = {};

  const run = Date.now();

  async function getRoleId(roleName: string): Promise<string> {
    const row = await database.db.query.roles.findFirst({
      where: eq(roles.name, roleName),
      columns: { id: true },
    });
    if (!row) throw new Error(`Role '${roleName}' not found — run db:seed`);
    return row.id;
  }

  async function insertUser(
    overrides: {
      name?: string;
      email?: string;
      passwordHash?: string;
      role?: string;
      status?: string;
    } = {},
  ) {
    const roleId = await getRoleId(overrides.role ?? 'OWNER');
    const [row] = await database.db
      .insert(users)
      .values({
        name: overrides.name ?? 'E2E Owner',
        email: overrides.email ?? `owner-${run}@e2e.local`,
        passwordHash:
          overrides.passwordHash ?? (await hashPassword('owner1234')),
        roleId,
        status: (overrides.status ?? 'ACTIVE') as 'ACTIVE',
      })
      .returning({ id: users.id });
    cleanupIds.push(row.id);
    return row.id;
  }

  async function login(email: string, password = 'owner1234') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return response.body as { accessToken: string };
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

    for (const name of ['OWNER', 'ADMIN', 'OFFICER', 'RIDER']) {
      roleIds[name] = await getRoleId(name);
    }
  });

  afterAll(async () => {
    for (const id of cleanupIds) {
      await database.db.delete(users).where(eq(users.id, id));
    }
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns an access token and the user profile (no password hash)', async () => {
      const email = `owner-${run}@e2e.local`;
      await insertUser({ email });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'owner1234' })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user.email).toBe(email);
      expect(response.body.user.role).toBe('OWNER');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body.permissions).toBeInstanceOf(Array);
      expect(response.body.permissions.length).toBeGreaterThan(0);
    });

    it('rejects invalid credentials with 401', async () => {
      await insertUser({ email: `owner-badpw-${run}@e2e.local` });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `owner-badpw-${run}@e2e.local`, password: 'wrongpass' })
        .expect(401);
    });

    it('rejects a deactivated account with 401', async () => {
      const email = `owner-inactive-${run}@e2e.local`;
      await insertUser({ email, status: 'INACTIVE' });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'owner1234' })
        .expect(401);
    });

    it('rejects a malformed body with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('returns the authenticated user profile', async () => {
      const email = `owner-me-${run}@e2e.local`;
      await insertUser({ email });
      const { accessToken } = await login(email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user.email).toBe(email);
      expect(response.body.permissions).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('rejects a wrong current password with 400', async () => {
      const email = `owner-cp-${run}@e2e.local`;
      await insertUser({ email });
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'wrongpass', newPassword: 'newpassword1' })
        .expect(400);
    });

    it('rotates the password so the new one works on the next login', async () => {
      const email = `owner-cpok-${run}@e2e.local`;
      await insertUser({ email });
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'owner1234', newPassword: 'newpassword1' })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'newpassword1' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'owner1234' })
        .expect(401);
    });

    it('enforces a minimum new-password length with 400', async () => {
      const email = `owner-cplen-${run}@e2e.local`;
      await insertUser({ email });
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'owner1234', newPassword: 'short' })
        .expect(400);
    });
  });

  describe('Users CRUD (admin-only)', () => {
    let adminEmail: string;
    let adminToken: string;

    beforeAll(async () => {
      adminEmail = `admin-${run}@e2e.local`;
      await insertUser({ email: adminEmail });
      adminToken = (await login(adminEmail)).accessToken;
    });

    it('returns 401 on unauthenticated list/create', async () => {
      await request(app.getHttpServer()).get('/api/v1/users').expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({})
        .expect(401);
    });

    it('returns 403 for a RIDER on admin routes', async () => {
      const riderEmail = `rider-forbidden-${run}@e2e.local`;
      await insertUser({ email: riderEmail, role: 'RIDER' });
      const { accessToken } = await login(riderEmail);

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('creates a user without leaking the password hash', async () => {
      const email = `officer-${run}@e2e.local`;
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Officer One',
          email,
          roleId: roleIds['OFFICER'],
          password: 'password1',
        })
        .expect(201);

      expect(createResponse.body.email).toBe(email);
      expect(createResponse.body.role).toBe('OFFICER');
      expect(createResponse.body).not.toHaveProperty('passwordHash');
      cleanupIds.push(createResponse.body.id);

      const { accessToken } = await login(email, 'password1');
      expect(accessToken).toEqual(expect.any(String));
    });

    it('rejects a duplicate email with 409', async () => {
      const email = `dup-${run}@e2e.local`;
      await insertUser({ email });

      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dupe',
          email,
          roleId: roleIds['OFFICER'],
          password: 'password1',
        })
        .expect(409);
    });

    it('validates the payload (short password → 400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'X',
          email: `short-${run}@e2e.local`,
          roleId: roleIds['OFFICER'],
          password: 'x',
        })
        .expect(400);
    });

    it('lists users with the created record in results', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users?search=${run}@e2e.local`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.meta.total).toBeGreaterThan(0);
      expect(response.body.data[0]).not.toHaveProperty('passwordHash');
    });

    it('gets a single user by id', async () => {
      const email = `getone-${run}@e2e.local`;
      const created = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'GetOne',
          email,
          roleId: roleIds['OFFICER'],
          password: 'password1',
        })
        .expect(201);
      cleanupIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(created.body.id);
      expect(response.body.email).toBe(email);
    });

    it('returns 404 for an unknown user id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('updates a user name', async () => {
      const email = `update-${run}@e2e.local`;
      const created = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Before',
          email,
          roleId: roleIds['OFFICER'],
          password: 'password1',
        })
        .expect(201);
      cleanupIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'After' })
        .expect(200);

      expect(response.body.name).toBe('After');
    });

    it('forbids deactivating an OWNER account (403)', async () => {
      const ownerId = await insertUser({
        email: `owner-guard-${run}@e2e.local`,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${ownerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' })
        .expect(403);
    });

    it('forbids deleting an OWNER account (400)', async () => {
      const ownerId = await insertUser({ email: `owner-del-${run}@e2e.local` });

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${ownerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('forbids deleting your own account (400)', async () => {
      const selfEmail = `admin-self-${run}@e2e.local`;
      const selfId = await insertUser({ email: selfEmail });
      const { accessToken } = await login(selfEmail);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${selfId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('deletes a non-owner user', async () => {
      const email = `delete-${run}@e2e.local`;
      const created = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'DeleteMe',
          email,
          roleId: roleIds['OFFICER'],
          password: 'password1',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Security hardenings (e2e)', () => {
    let adminEmail: string;
    let adminToken: string;

    beforeAll(async () => {
      adminEmail = `hsec-admin-${run}@e2e.local`;
      await insertUser({ email: adminEmail, role: 'ADMIN' });
      adminToken = (await login(adminEmail)).accessToken;
    });

    it('forbids an ADMIN creating an OWNER (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Root',
          email: `hsec-root-${run}@e2e.local`,
          roleId: roleIds['OWNER'],
          password: 'password1',
        })
        .expect(403);
    });

    it('forbids an ADMIN promoting a user to OWNER (403)', async () => {
      const officerId = await insertUser({
        email: `hsec-officer-${run}@e2e.local`,
        roleId: roleIds['OFFICER'],
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${officerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: roleIds['OWNER'] })
        .expect(403);
    });

    it('forbids resetting an OWNER password via PATCH (403)', async () => {
      const ownerId = await insertUser({
        email: `hsec-ownpwd-${run}@e2e.local`,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${ownerId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'PwnedP@ss123' })
        .expect(403);
    });

    it('returns 400 for a malformed :id (not 500)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('searching for a literal % does not return the whole table', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users?search=%25')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // '%' as a literal search term should match only users whose email/name contains '%'
      // (none do), so the result set should be empty — not every row in the table.
      expect(response.body.data).toHaveLength(0);
    });

    it('invalidates old tokens after a password change (401)', async () => {
      const email = `hsec-cp-${run}@e2e.local`;
      await insertUser({ email });
      const { accessToken } = await login(email);

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'owner1234', newPassword: 'newpassword1' })
        .expect(204);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('Health stays public under global auth', () => {
    it('returns 200 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });

    it('documents the bearer security scheme on protected paths', async () => {
      const spec = await request(app.getHttpServer())
        .get('/api/v1/docs-json')
        .expect(200);

      expect(Object.keys(spec.body.paths)).toContain('/api/v1/users');
      expect(Object.keys(spec.body.paths)).toContain('/api/v1/auth/login');
      expect(Object.keys(spec.body.paths)).toContain('/api/v1/auth/me');
      expect(spec.body.paths['/api/v1/auth/me'].get.security).toEqual([
        { 'access-token': [] },
      ]);
    });
  });
});
