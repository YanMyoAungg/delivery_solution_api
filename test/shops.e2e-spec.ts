import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { setupApp, setupSwagger } from '../src/setup-app.js';
import { DatabaseService } from '../src/common/database/database.service.js';
import { users } from '../src/users/user.schema.js';
import { roles } from '../src/roles/roles.schema.js';
import { shops } from '../src/shops/shop.schema.js';
import { hashPassword } from '../src/common/utils/password.util.js';

describe('Shops (e2e)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let ownerId: string;
  let ownerToken: string;
  const createdShopIds: string[] = [];
  const run = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
        name: 'Shops E2E Owner',
        email: `shops-owner-${run}@e2e.local`,
        passwordHash: await hashPassword('Password1234'),
        roleId: role.id,
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    ownerId = user.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `shops-owner-${run}@e2e.local`, password: 'Password1234' })
      .expect(200);
    ownerToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    for (const id of createdShopIds) {
      await database.db.delete(shops).where(eq(shops.id, id));
    }
    await database.db.delete(users).where(eq(users.id, ownerId));
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/shops').expect(401);
  });

  it('creates, lists, reads, updates and deletes a shop', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Shop ${run}`,
        phone: '09123456789',
        address: 'Main Road',
        notes: 'Deliver before 6pm',
        channelType: 'VIBER',
        channelName: `ShopChannel ${run}`,
      })
      .expect(201);
    const shopId = created.body.id as string;
    createdShopIds.push(shopId);

    expect(created.body.name).toBe(`Shop ${run}`);
    expect(created.body.channelType).toBe('VIBER');
    expect(created.body.channelName).toBe(`ShopChannel ${run}`);
    expect(created.body.notes).toBe('Deliver before 6pm');
    expect(created.body).not.toHaveProperty('passwordHash');
    expect(created.body).not.toHaveProperty('chatId');

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/shops?search=${run}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listed.body.data.map((shop: { id: string }) => shop.id)).toContain(
      shopId,
    );

    await request(app.getHttpServer())
      .get(`/api/v1/shops/${shopId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/shops/${shopId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Updated Shop ${run}` })
      .expect(200);
    expect(updated.body.name).toBe(`Updated Shop ${run}`);

    await request(app.getHttpServer())
      .delete(`/api/v1/shops/${shopId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    createdShopIds.splice(createdShopIds.indexOf(shopId), 1);

    await request(app.getHttpServer())
      .get(`/api/v1/shops/${shopId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('validates payloads and rejects duplicate names', async () => {
    const name = `Duplicate Shop ${run}`;
    const payload = { name, channelType: 'VIBER', channelName: `Dup${run}` };
    const first = await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(201);
    createdShopIds.push(first.body.id as string);

    await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(payload)
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...payload, name: '' })
      .expect(400);
  });

  it('requires the channel fields and rejects an unknown channel type', async () => {
    // Each case omits exactly one required field, so a 400 can only come from
    // that field's own rule. Omitting both would pass even if only one rule
    // existed, so the two cases are deliberately separate.
    await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `NoChannelType ${run}`,
        channelName: `NoChannelType${run}`,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `NoChannelName ${run}`,
        channelType: 'VIBER',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `NoChannels ${run}`,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `BadChannel ${run}`,
        channelType: 'WHATSAPP',
        channelName: `BadChannel${run}`,
      })
      .expect(400);
  });

  it('updates channel fields and accepts a search by channel name', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Channel Update ${run}`,
        channelType: 'VIBER',
        channelName: `BeforeUpdate${run}`,
      })
      .expect(201);
    const shopId = created.body.id as string;
    createdShopIds.push(shopId);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/shops/${shopId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        channelType: 'TELEGRAM',
        channelName: `AfterUpdate${run}`,
        notes: 'Updated note',
      })
      .expect(200);
    expect(updated.body.channelType).toBe('TELEGRAM');
    expect(updated.body.channelName).toBe(`AfterUpdate${run}`);
    expect(updated.body.notes).toBe('Updated note');

    const searched = await request(app.getHttpServer())
      .get(`/api/v1/shops?search=AfterUpdate${run}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      searched.body.data.map((shop: { id: string }) => shop.id),
    ).toContain(shopId);
  });
});
