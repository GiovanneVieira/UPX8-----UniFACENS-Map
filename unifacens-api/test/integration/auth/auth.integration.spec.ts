import request from 'supertest';
import { AdminController } from '../../../src/modules/admin/admin.controller.js';
import { AdminRepository } from '../../../src/modules/admin/admin.repository.js';
import { AdminService } from '../../../src/modules/admin/admin.service.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { APP_GUARD } from '@nestjs/core';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import express from 'express';
import net from 'node:net';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { toNodeHandler } from 'better-auth/node';
import { apiEnvironmentSchema } from 'shared';
import { API_CONFIG } from '../../../src/config/runtime-config.js';
import { configureHttp } from '../../../src/config/configure-http.js';
import { JwtAdminGuard } from '../../../src/common/auth/jwt-admin.guard.js';
import { AccessController } from '../../../src/common/auth/access.controller.js';
import {
  BETTER_AUTH,
  createBetterAuth,
  type BetterAuthInstance,
} from '../../../src/common/auth/better-auth.js';
import { HealthController } from '../../../src/health/health.controller.js';
import { PlacesController } from '../../../src/modules/places/places.controller.js';
import { PlacesService } from '../../../src/modules/places/places.service.js';
import { PlacesRepository } from '../../../src/modules/places/places.repository.js';
import { AnchorsController } from '../../../src/anchors/anchors.controller.js';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { STORAGE } from '../../../src/modules/storage/storage.types.js';
import { LocalStorageAdapter } from '../../../src/modules/storage/local.adapter.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { anchors, categories, places } from '../../../src/db/schema.js';

const origin = 'https://campus.example.org';
const adminFixture = {
  email: 'admin@facens.dev',
  password: 'fixture-admin-pass-123',
};
const commonFixture = {
  email: 'user@facens.dev',
  password: 'fixture-user-pass-123',
};
const publicPlace = {
  name: 'Exemplo público',
  // Preenchido no beforeAll com o id da categoria seedada 'entrance'.
  categoryId: '',
  latitude: 0,
  longitude: 0,
  source: 'demo',
};
const anchorPayload = {
  name: 'Exemplo protegido',
  cloudAnchorId: 'fixture-sem-hospedagem-google',
};

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

describe('Autenticação better-auth: JWT obrigatório, roles e PostgreSQL real', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: NestExpressApplication;
  let db: DrizzleDB;
  let auth: BetterAuthInstance;
  let baseUrl: string;
  let adminJwt: string;
  let commonJwt: string;

  /** Fluxo real do mobile: sign-in e-mail/senha → cookie de sessão → JWT. */
  async function signInForJwt(email: string, password: string): Promise<string> {
    const signIn = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ email, password }),
    });
    expect(signIn.ok).toBeTruthy();
    const cookies = signIn.headers.getSetCookie().map((c) => c.split(';')[0]);
    expect(cookies.length).toBeGreaterThan(0);

    const tokenResponse = await fetch(`${baseUrl}/auth/token`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        cookie: cookies.join('; '),
        origin: baseUrl,
      },
    });
    expect(tokenResponse.ok).toBeTruthy();
    const body = (await tokenResponse.json()) as { token: string };
    expect(body.token).toBeTruthy();
    return body.token;
  }

  function bearer(jwt: string): Record<string, string> {
    return { authorization: `Bearer ${jwt}` };
  }

  beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('auth_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    // Resolve o id da categoria seedada 'entrance' (enum → tabela).
    const [entrance] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, 'entrance'))
      .limit(1);
    publicPlace.categoryId = entrance.id;

    const config = apiEnvironmentSchema.parse({
      NODE_ENV: 'production',
      DATABASE_URL: container.getConnectionUri(),
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: 'fixture-integration-secret-with-32-chars-min',
      CORS_ORIGINS: origin,
    });

    const moduleFixture = await Test.createTestingModule({
      controllers: [
        AdminController,
        PlacesController,
        AnchorsController,
        AccessController,
        HealthController,
      ],
      providers: [
        AdminRepository,
        AdminService,
        PlacesService,
        PlacesRepository,
        AnchorsService,
        JwtAdminGuard,
        { provide: APP_GUARD, useExisting: JwtAdminGuard },
        { provide: API_CONFIG, useValue: config },
        { provide: DRIZZLE, useValue: db },
        { provide: 'PG_POOL', useValue: pool },
        {
          provide: STORAGE,
          useValue: new LocalStorageAdapter(
            fs.mkdtempSync(path.join(os.tmpdir(), 'auth-storage-')),
          ),
        },
        {
          provide: BETTER_AUTH,
          useFactory: (database: DrizzleDB) => createBetterAuth(config, database),
          inject: [DRIZZLE],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>(
      new ExpressAdapter(),
      { bodyParser: false },
    );
    configureHttp(app, config);
    auth = app.get<BetterAuthInstance>(BETTER_AUTH);

    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.use('/auth', toNodeHandler(auth));
    expressInstance.use(express.json({ limit: '1mb' }));

    await app.listen(port, '127.0.0.1');

    await auth.api.createUser({
      body: {
        email: adminFixture.email,
        password: adminFixture.password,
        name: 'Admin Fixture',
        role: 'admin',
        data: { emailVerified: true },
      },
    });
    await auth.api.createUser({
      body: {
        email: commonFixture.email,
        password: commonFixture.password,
        name: 'Usuário Comum',
        role: 'user',
        data: { emailVerified: true },
      },
    });

    adminJwt = await signInForJwt(adminFixture.email, adminFixture.password);
    commonJwt = await signInForJwt(commonFixture.email, commonFixture.password);
  }, 180000);

  beforeEach(async () => {
    await db.delete(places);
    await db.delete(anchors);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('emite JWTs distintos para admin e usuário comum', () => {
    expect(adminJwt).not.toEqual(commonJwt);
  });

  it('mantém públicas apenas política e healthcheck', async () => {
    const policy = await fetch(`${baseUrl}/access`);
    expect(policy.status).toBe(200);
    expect(await policy.json()).toEqual({ requiresTeamAccess: true });
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
  });

  it('exige JWT para leituras (401 sem token) e libera para qualquer role', async () => {
    expect((await fetch(`${baseUrl}/places`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/anchors`)).status).toBe(401);

    const asUser = await fetch(`${baseUrl}/places`, { headers: bearer(commonJwt) });
    expect(asUser.status).toBe(200);
    const asAdmin = await fetch(`${baseUrl}/anchors`, { headers: bearer(adminJwt) });
    expect(asAdmin.status).toBe(200);
  });

  it('bloqueia mutations sem token (401) também em desenvolvimento', async () => {
    const [place] = await db.insert(places).values(publicPlace).returning();

    expect(
      (
        await fetch(`${baseUrl}/places/${place.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Não autorizado' }),
        })
      ).status,
    ).toBe(401);
    expect(
      (await fetch(`${baseUrl}/places/${place.id}`, { method: 'DELETE' })).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/anchors`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(anchorPayload),
        })
      ).status,
    ).toBe(401);
    expect((await db.select().from(places))[0].name).toBe(publicPlace.name);
  });

  it('recusa token inválido ou expirado com 401', async () => {
    const response = await fetch(`${baseUrl}/anchors`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer eyJhbGciOiJub25lIn0.falso.falso',
      },
      body: JSON.stringify(anchorPayload),
    });
    expect(response.status).toBe(401);
  });

  it('proíbe qualquer mutation para contas comuns (role user → 403)', async () => {
    const createPlace = await fetch(`${baseUrl}/places`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(commonJwt),
      },
      body: JSON.stringify(publicPlace),
    });
    expect(createPlace.status).toBe(403);

    const createAnchor = await fetch(`${baseUrl}/anchors`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(commonJwt),
      },
      body: JSON.stringify(anchorPayload),
    });
    expect(createAnchor.status).toBe(403);
    expect(await db.select().from(anchors)).toHaveLength(0);
    expect(await db.select().from(places)).toHaveLength(0);
  });

  it('valida a sessão de admin e libera o CRUD completo de âncoras', async () => {
    const session = await fetch(`${baseUrl}/access/session`, {
      headers: bearer(adminJwt),
    });
    expect(session.status).toBe(200);
    const sessionBody = (await session.json()) as {
      canEdit: boolean;
      user: { email: string; role: string };
    };
    expect(sessionBody.canEdit).toBe(true);
    expect(sessionBody.user.email).toBe(adminFixture.email);
    expect(sessionBody.user.role).toBe('admin');

    const created = await fetch(`${baseUrl}/anchors`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(adminJwt),
      },
      body: JSON.stringify(anchorPayload),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string };

    expect(
      (
        await fetch(`${baseUrl}/anchors/${createdBody.id}`, {
          method: 'DELETE',
          headers: bearer(adminJwt),
        })
      ).status,
    ).toBe(200);
    expect(await db.select().from(anchors)).toHaveLength(0);
  });

  it('admin cadastra, edita e exclui locais do catálogo', async () => {
    const created = await fetch(`${baseUrl}/places`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...bearer(adminJwt),
      },
      body: JSON.stringify(publicPlace),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      id: string;
      verificationStatus: string;
    };
    expect(createdBody.verificationStatus).toBe('unverified');

    const updated = await fetch(`${baseUrl}/places/${createdBody.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...bearer(adminJwt),
      },
      body: JSON.stringify({ name: 'Exemplo revisado' }),
    });
    expect(updated.status).toBe(200);

    expect(
      (
        await fetch(`${baseUrl}/places/${createdBody.id}`, {
          method: 'DELETE',
          headers: bearer(adminJwt),
        })
      ).status,
    ).toBe(200);
    expect(await db.select().from(places)).toHaveLength(0);
  });

  it('exige admin mesmo em rota de leitura marcada com @AdminOnly sem token', async () => {
    expect((await fetch(`${baseUrl}/access/session`)).status).toBe(401);
    expect(
      (await fetch(`${baseUrl}/access/session`, { headers: bearer(commonJwt) }))
        .status,
    ).toBe(403);
  });

  it('permite preflight com credenciais somente para a origem configurada', async () => {
    const response = await fetch(`${baseUrl}/places`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'Authorization',
    );

    const authPreflight = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(authPreflight.status).toBe(204);
    expect(authPreflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect(
      authPreflight.headers.get('access-control-allow-credentials'),
    ).toBe('true');

    const authSession = await fetch(`${baseUrl}/auth/get-session`, {
      headers: { origin },
    });
    expect(authSession.status).toBe(200);
    expect(authSession.headers.get('access-control-allow-origin')).toBe(origin);
    expect(authSession.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );

    const rejected = await fetch(`${baseUrl}/access`, {
      headers: { origin: 'https://outra-origem.example.org' },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('emite cookies de sessão cross-site somente com atributos seguros em produção', async () => {
    const response = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(adminFixture),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');

    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => /session_token/i.test(cookie));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/;\s*SameSite=None/i);
    expect(sessionCookie).toMatch(/;\s*Secure(?:;|$)/i);
    expect(sessionCookie).toMatch(/;\s*HttpOnly/i);
  });

  it('healthcheck consulta o PostgreSQL real', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('re-login do app nativo (cookie de sessão + expo-origin, sem Origin) não cai no CSRF-check', async () => {
    // Regressão 2026-11-12: o expoClient do app nativo envia `expo-origin`
    // (nativos não mandam Origin) + cookie persistido. Sem o plugin `expo`
    // no servidor, cookie com assinatura válida (mesmo sessão revogada pelo
    // seed/expirada) ativava o CSRF-check → 403 MISSING_OR_NULL_ORIGIN →
    // re-login impossível no device.
    const firstSignIn = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify(commonFixture),
    });
    expect(firstSignIn.ok).toBeTruthy();
    const sessionCookie = firstSignIn.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    expect(sessionCookie).toContain('session_token');

    // Re-login fiel ao device: cookie na mão, UA okhttp, expo-origin, SEM Origin.
    const retry = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie,
        'expo-origin': 'unifacensclient://',
        'user-agent': 'okhttp/4.9.2',
      },
      body: JSON.stringify(adminFixture),
    });
    expect(retry.status).not.toBe(403);
    expect(retry.ok).toBeTruthy();
    const body = (await retry.json()) as { user: { email: string } };
    expect(body.user.email).toBe(adminFixture.email);
  });
  it('restringe listagem de usuários e edição dos pontos aos administradores', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(401);
    await request(app.getHttpServer()).get('/admin/users').set(bearer(commonJwt)).expect(403);
    const users = await request(app.getHttpServer()).get('/admin/users?search=Admin').set(bearer(adminJwt)).expect(200);
    expect(users.body.items.some((u: { email: string }) => u.email === adminFixture.email)).toBe(true);
    expect(users.body.items[0]).not.toHaveProperty('password');
    const created = await request(app.getHttpServer()).post('/anchors').set(bearer(adminJwt))
      .send({ name: 'Ponto admin', cloudAnchorId: 'admin-test', latitude: -23.4699, longitude: -47.4297 }).expect(201);
    const url = `/admin/points/${created.body.id}`;
    await request(app.getHttpServer()).patch(url).set(bearer(commonJwt)).send({ name: 'Inválido' }).expect(403);
    await request(app.getHttpServer()).patch(url).set(bearer(adminJwt)).send({ latitude: 0 }).expect(400);
    await request(app.getHttpServer()).patch(url).set(bearer(adminJwt))
      .send({ name: 'Nome atualizado', description: 'Descrição atualizada' }).expect(200);
    const detail = await request(app.getHttpServer()).get(`/anchors/${created.body.id}`).set(bearer(adminJwt)).expect(200);
    expect(detail.body.name).toBe('Nome atualizado');
    expect(detail.body.latitude).toBe(-23.4699);
  });

});
