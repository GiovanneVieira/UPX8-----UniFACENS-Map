import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_GUARD } from '@nestjs/core';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { apiEnvironmentSchema } from 'shared';
import { API_CONFIG } from '../../../src/config/runtime-config.js';
import { configureHttp } from '../../../src/config/configure-http.js';
import { TeamAccessGuard } from '../../../src/common/auth/team-access.guard.js';
import { AccessController } from '../../../src/common/auth/access.controller.js';
import { HealthController } from '../../../src/health/health.controller.js';
import { PlacesController } from '../../../src/modules/places/places.controller.js';
import { PlacesService } from '../../../src/modules/places/places.service.js';
import { PlacesRepository } from '../../../src/modules/places/places.repository.js';
import { AnchorsController } from '../../../src/anchors/anchors.controller.js';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { anchors, places } from '../../../src/db/schema.js';

const token = 'fixture-team-token-for-real-integration-tests';
const authorization = `Bearer ${token}`;
const origin = 'https://campus.example.org';
const payload = {
  name: 'Exemplo público',
  category: 'entrance',
  latitude: 0,
  longitude: 0,
  source: 'demo',
};

describe('Publicação: acesso da equipe, CORS e PostgreSQL real', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: NestExpressApplication;
  let db: DrizzleDB;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('access_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../drizzle', import.meta.url),
      ),
    });
    const config = apiEnvironmentSchema.parse({
      NODE_ENV: 'production',
      DATABASE_URL: container.getConnectionUri(),
      TEAM_ACCESS_TOKEN: token,
      CORS_ORIGINS: origin,
    });
    const module = await Test.createTestingModule({
      controllers: [
        PlacesController,
        AnchorsController,
        AccessController,
        HealthController,
      ],
      providers: [
        PlacesService,
        PlacesRepository,
        AnchorsService,
        TeamAccessGuard,
        { provide: APP_GUARD, useExisting: TeamAccessGuard },
        { provide: API_CONFIG, useValue: config },
        { provide: DRIZZLE, useValue: db },
        { provide: 'PG_POOL', useValue: pool },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttp(app, config);
    await app.init();
  }, 90000);

  beforeEach(async () => {
    await db.delete(places);
    await db.delete(anchors);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('mantém consulta, política e cadastro não verificado públicos', async () => {
    expect(
      (await request(app.getHttpServer()).get('/access').expect(200)).body,
    ).toEqual({ requiresTeamAccess: true });
    const created = await request(app.getHttpServer())
      .post('/places')
      .send(payload)
      .expect(201);
    expect(created.body.verificationStatus).toBe('unverified');
    await request(app.getHttpServer())
      .get(`/places/${created.body.id}`)
      .expect(200);
    expect((await db.select().from(places)).length).toBe(1);
  });

  it('bloqueia edição e exclusão sem código sem alterar o banco', async () => {
    const [place] = await db.insert(places).values(payload).returning();
    await request(app.getHttpServer())
      .patch(`/places/${place.id}`)
      .send({ name: 'Não autorizado' })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/places/${place.id}`)
      .expect(401);
    expect((await db.select().from(places))[0].name).toBe(payload.name);
  });

  it.each(['', 'Bearer errado', 'Basic fixture', `Bearer ${token}extra`])(
    'recusa credencial inválida em acesso da equipe: %j',
    async (header) => {
      await request(app.getHttpServer())
        .get('/access/team')
        .set('Authorization', header)
        .expect(401);
    },
  );

  it('valida acesso sem devolver o segredo e permite editar/excluir', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get('/access/team')
          .set('Authorization', authorization)
          .expect(200)
      ).body,
    ).toEqual({ canEdit: true });
    const [place] = await db.insert(places).values(payload).returning();
    const updated = await request(app.getHttpServer())
      .patch(`/places/${place.id}`)
      .set('Authorization', authorization)
      .send({ name: 'Exemplo revisado' })
      .expect(200);
    expect(updated.body.name).toBe('Exemplo revisado');
    expect(updated.body.verificationStatus).toBe('unverified');
    await request(app.getHttpServer())
      .delete(`/places/${place.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(await db.select().from(places)).toHaveLength(0);
  });

  it('protege também as gravações de âncoras do protótipo AR', async () => {
    const anchor = {
      name: 'Exemplo protegido',
      cloudAnchorId: 'fixture-sem-hospedagem-google',
    };
    await request(app.getHttpServer())
      .post('/anchors')
      .send(anchor)
      .expect(401);
    expect(await db.select().from(anchors)).toHaveLength(0);
    const created = await request(app.getHttpServer())
      .post('/anchors')
      .set('Authorization', authorization)
      .send(anchor)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/anchors/${created.body.id}`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/anchors/${created.body.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(await db.select().from(anchors)).toHaveLength(0);
  });

  it('permite preflight somente para a origem configurada, com Authorization', async () => {
    const response = await request(app.getHttpServer())
      .options('/places')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-headers']).toContain(
      'Authorization',
    );
    const rejected = await request(app.getHttpServer())
      .get('/places')
      .set('Origin', 'https://outra-origem.example.org')
      .expect(200);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('healthcheck consulta o PostgreSQL real', async () => {
    expect(
      (await request(app.getHttpServer()).get('/health').expect(200)).body,
    ).toEqual({ status: 'ok' });
  });
});
