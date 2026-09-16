import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/roles/roles.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';
import { eq } from 'drizzle-orm';

describe('Permissions & Roles (e2e)', () => {
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
    if (!row) throw new Error(`Role '${roleName}' missing — run seed`);
    return row.id;
  }

  async function insertUser(roleName: string, email: string) {
    const roleId = await getRoleId(roleName);
    const [row] = await database.db
      .insert(users)
      .values({
        name: `E2E ${roleName}`,
        email,
        passwordHash: await hashPassword('owner1234'),
        roleId,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    cleanupIds.push(row.id);
    return row.id;
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'owner1234' })
      .expect(200);
    return response.body.accessToken as string;
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

  describe('GET /api/v1/permissions', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/permissions').expect(401);
    });

    it('returns the catalog for an OWNER', async () => {
      const email = `perm-owner-${run}@e2e.local`;
      await insertUser('OWNER', email);
      const token = await login(email);

      const response = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      const modules = response.body.map((g: { module: string }) => g.module);
      expect(modules).toContain('users');
      const permissionsGroup = response.body.find(
        (g: { module: string }) => g.module === 'permissions',
      );
      expect(permissionsGroup.permissions).not.toContain('permissions.create');
    });

    it('forbids a RIDER (403)', async () => {
      const email = `perm-rider-${run}@e2e.local`;
      await insertUser('RIDER', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/permissions/roles/:roleId', () => {
    it('returns the granted keys for a role', async () => {
      const email = `perm-owner2-${run}@e2e.local`;
      await insertUser('OWNER', email);
      const token = await login(email);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/permissions/roles/${roleIds.ADMIN}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toContain('users.read');
      expect(response.body).toContain('roles.create');
    });
  });

  describe('PUT /api/v1/permissions/roles/:roleId', () => {
    it('lets an OWNER replace OFFICER grants', async () => {
      const email = `perm-owner3-${run}@e2e.local`;
      await insertUser('OWNER', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.OFFICER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['users.read'] })
        .expect(200);
    });

    it('forbids an ADMIN editing OWNER (403)', async () => {
      const email = `perm-admin-${run}@e2e.local`;
      await insertUser('ADMIN', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.OWNER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['users.read'] })
        .expect(403);
    });

    it('forbids an ADMIN editing ADMIN (403)', async () => {
      const email = `perm-admin2-${run}@e2e.local`;
      await insertUser('ADMIN', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.ADMIN}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['users.read'] })
        .expect(403);
    });

    it('lets an ADMIN edit OFFICER (200)', async () => {
      const email = `perm-admin3-${run}@e2e.local`;
      await insertUser('ADMIN', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.OFFICER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['users.read'] })
        .expect(200);
    });

    it('forbids an OWNER editing OWNER (403)', async () => {
      const email = `perm-owner4-${run}@e2e.local`;
      await insertUser('OWNER', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.OWNER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['users.read'] })
        .expect(403);
    });

    it('rejects an unknown permission key (404)', async () => {
      const email = `perm-admin4-${run}@e2e.local`;
      await insertUser('ADMIN', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.OFFICER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['shops.notarealaction'] })
        .expect(404);
    });

    it('busts the permission cache immediately', async () => {
      const email = `perm-owner6-${run}@e2e.local`;
      await insertUser('OWNER', email);
      const token = await login(email);

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.RIDER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: ['users.read'] })
        .expect(200);

      const grants = await request(app.getHttpServer())
        .get(`/api/v1/permissions/roles/${roleIds.RIDER}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(grants.body).toContain('users.read');

      await request(app.getHttpServer())
        .put(`/api/v1/permissions/roles/${roleIds.RIDER}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissions: [] })
        .expect(200);
    });
  });
});
