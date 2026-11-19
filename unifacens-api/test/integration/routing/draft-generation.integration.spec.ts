import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { toNodeHandler } from 'better-auth/node';
import { apiEnvironmentSchema } from 'shared';
import { API_CONFIG } from '../../../src/config/runtime-config.js';
import { configureHttp } from '../../../src/config/configure-http.js';
import { JwtAdminGuard } from '../../../src/common/auth/jwt-admin.guard.js';
import {
  BETTER_AUTH,
  createBetterAuth,
  type BetterAuthInstance,
} from '../../../src/common/auth/better-auth.js';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { RoutingController } from '../../../src/modules/routing/routing.controller.js';
import { RoutingService } from '../../../src/modules/routing/routing.service.js';
import { NavigationController } from '../../../src/modules/navigation/navigation.controller.js';
import { NavigationService } from '../../../src/modules/navigation/navigation.service.js';
import { NavigationRepository } from '../../../src/modules/navigation/navigation.repository.js';
import { CAMPUS_FIXTURE } from '../../../src/modules/routing/campus-fixture.js';
import { anchors, campusObstacles } from '../../../src/db/schema.js';

/**
 * Geração de MALHA EM RASCUNHO (F1, plano 2026-11-19): a geometria sai da
 * grade A* do campus; os atributos de acessibilidade nascem DESCONHECIDOS
 * (unverified/null) — o cálculo responde insufficient_data até o
 * levantamento de campo conferir os trechos (honestidade do motor).
 */
describe('Rascunho de rede de navegação gerado da grade caminhável', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: NestExpressApplication;
  let db: DrizzleDB;
  let auth: BetterAuthInstance;
  let baseUrl: string;
  let adminJwt: string;
  let userJwt: string;
  let originAnchorId: string;
  let destinationAnchorId: string;
  /** Linha reta entre as âncoras (para provar que a malha DESVIA do muro). */
  let straightMeters: number;

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

  beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('routing_draft_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });

    // ── Cenário ANTES do boot (a grade é construída no onModuleInit):
    // centro do campus, 2 âncoras a ~40m em linha reta e um MURO vertical
    // fino entre elas — a malha gerada precisa DESVIAR (grade A*).
    const { minLat, minLng, maxLat, maxLng } = CAMPUS_FIXTURE.bbox;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const M_LAT = 0.00000904;
    const M_LNG = 0.00001016;
    const eastLng = centerLng + 40 * M_LNG;
    const wallLngA = centerLng + 15 * M_LNG;
    const wallLngB = centerLng + 17 * M_LNG;
    const wallLatA = centerLat - 60 * M_LAT;
    const wallLatB = centerLat + 60 * M_LAT;

    await db.insert(campusObstacles).values({
      id: 'muro-teste',
      name: 'Muro de teste',
      category: 'wall',
      polygon: [
        [wallLatA, wallLngA],
        [wallLatB, wallLngA],
        [wallLatB, wallLngB],
        [wallLatA, wallLngB],
      ],
    });
    [originAnchorId] = (
      await db
        .insert(anchors)
        .values({
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Ponto Oeste',
          cloudAnchorId: 'draft-origin',
          latitude: centerLat,
          longitude: centerLng,
        })
        .returning({ id: anchors.id })
    ).map((row) => row.id);
    [destinationAnchorId] = (
      await db
        .insert(anchors)
        .values({
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Ponto Leste',
          cloudAnchorId: 'draft-destination',
          latitude: centerLat,
          longitude: eastLng,
        })
        .returning({ id: anchors.id })
    ).map((row) => row.id);
    const R = 6371000;
    const dLat = 0;
    const dLng = ((eastLng - centerLng) * Math.PI) / 180;
    const latRad = (centerLat * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(latRad) * Math.cos(latRad) * Math.sin(dLng / 2) ** 2;
    straightMeters = R * 2 * Math.asin(Math.sqrt(a));

    const config = apiEnvironmentSchema.parse({
      NODE_ENV: 'production',
      DATABASE_URL: container.getConnectionUri(),
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: 'routing-draft-test-secret-at-least-32-chars',
      SMTP_URL: 'smtp://fixture:fixture@smtp.example.org:587',
    });
    auth = createBetterAuth(config, db);

    const moduleFixture = await Test.createTestingModule({
      controllers: [RoutingController, NavigationController],
      providers: [
        RoutingService,
        NavigationService,
        NavigationRepository,
        JwtAdminGuard,
        { provide: APP_GUARD, useExisting: JwtAdminGuard },
        { provide: API_CONFIG, useValue: config },
        { provide: DRIZZLE, useValue: db },
        { provide: 'PG_POOL', useValue: pool },
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
    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.use('/auth', toNodeHandler(auth));
    expressInstance.use(express.json({ limit: '1mb' }));
    await app.listen(port, '127.0.0.1');

    async function token(role: 'admin' | 'user') {
      const email = `${role}@draft.example.org`;
      const password = 'synthetic-password-123';
      await auth.api.createUser({
        body: {
          name: role,
          email,
          password,
          role,
          data: { emailVerified: true },
        },
      });
      const login = await fetch(`${baseUrl}/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ email, password }),
      });
      expect(login.ok).toBe(true);
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const response = await fetch(`${baseUrl}/auth/token`, {
        headers: { cookie, origin: baseUrl },
      });
      expect(response.ok).toBe(true);
      return ((await response.json()) as { token: string }).token;
    }
    adminJwt = await token('admin');
    userJwt = await token('user');
  }, 180000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  async function http(
    path: string,
    method: string,
    body?: unknown,
    token: string | null = adminJwt,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }

  it('exige admin e gera malha honesta: geometria desvia do muro, atributos desconhecidos', async () => {
    const body = {
      networkId: 'campus-draft',
      version: 'gen-v1',
      anchorIds: [originAnchorId, destinationAnchorId],
    };
    const forbidden = await http(
      '/routing/navigation/drafts',
      'POST',
      body,
      userJwt,
    );
    expect(forbidden.status).toBe(403);

    const created = await http('/routing/navigation/drafts', 'POST', body);
    expect(created.status).toBe(201);
    const graph = (created.body as { graph: unknown }).graph as {
      dataSource: string;
      nodes: Array<{
        id: string;
        anchorId?: string | null;
        position: { kind: string; latitude: number; longitude: number } | null;
      }>;
      edges: Array<{
        lengthMeters: number;
        verification: { status: string };
        widthMeters: number | null;
        stepCount: number | null;
      }>;
    };
    expect(graph.dataSource).toBe('field_survey');
    const anchorNodes = graph.nodes.filter((node) => node.anchorId);
    expect(anchorNodes).toHaveLength(2);
    for (const node of graph.nodes) {
      expect(node.position?.kind).toBe('geographic');
    }
    expect(graph.edges.length).toBeGreaterThan(0);
    const totalMeters = graph.edges.reduce((sum, e) => sum + e.lengthMeters, 0);
    // O muro obriga desvio: malha bem maior que a linha reta de ~40m.
    expect(totalMeters).toBeGreaterThan(straightMeters * 2);
    for (const edge of graph.edges) {
      expect(edge.verification.status).toBe('unverified');
      expect(edge.widthMeters).toBeNull();
      expect(edge.stepCount).toBeNull();
    }
  });

  it('publish exige revisão de levantamento; cálculo responde insufficient_data (rascunho honesto)', async () => {
    const versionPath = '/navigation/networks/campus-draft/versions/gen-v1';
    const noReview = await http(`${versionPath}/publish`, 'POST', {});
    expect(noReview.status).toBe(400);

    const reviewed = await http(`${versionPath}/publish`, 'POST', {
      review: {
        validUntil: new Date(Date.now() + 3_600_000).toISOString(),
        evidenceIds: ['evidence-1'],
      },
    });
    expect(reviewed.status).toBe(200);

    const result = await http(`${versionPath}/route-by-anchors`, 'POST', {
      origin: { anchorId: originAnchorId },
      destination: { anchorId: destinationAnchorId },
      mode: 'navigation',
    });
    expect(result.status).toBe(200);
    expect((result.body as { status: string }).status).toBe('insufficient_data');
  });
});
