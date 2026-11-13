import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  ExpressAdapter,
  type NestExpressApplication,
} from '@nestjs/platform-express';
import { APP_GUARD } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  apiEnvironmentSchema,
  navigationNetworkVersionSchema,
  navigationResultSchema,
} from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { API_CONFIG } from '../../../src/config/runtime-config.js';
import { createBetterAuth } from '../../../src/common/auth/better-auth.js';
import { JwtAdminGuard } from '../../../src/common/auth/jwt-admin.guard.js';
import { NavigationModule } from '../../../src/modules/navigation/navigation.module.js';
import {
  navigationNetworks,
  navigationVersions,
  navigationNodes,
  navigationEdges,
  anchors,
} from '../../../src/db/schema.js';
import { makeNavigationGraph } from '../../unit/navigation/navigation.fixture.js';

/** Dados fictícios em banco descartável; nenhuma chamada a Google ou banco real do campus. */
describe('Navegação: persistência, publicação, JWT e cálculo por HTTP', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: pg.Pool | undefined;
  let db: DrizzleDB;
  let app: NestExpressApplication | undefined;
  let baseUrl: string;
  let adminJwt: string;
  let userJwt: string;
  const root = '/navigation/networks';
  const versionPath = `${root}/synthetic-navigation/versions/test-v1`;
  const routeRequest = {
    originNodeId: 'origin',
    destinationNodeId: 'building-access',
    mode: 'demonstration',
  };

  function graph() {
    const value = makeNavigationGraph();
    const now = Date.now();
    for (const edge of value.edges) {
      edge.verification = {
        status: 'verified',
        verifiedAt: new Date(now - 60000).toISOString(),
        validUntil: new Date(now + 3600000).toISOString(),
        evidenceIds: ['synthetic-evidence'],
      };
      edge.availability = {
        status: 'open',
        checkedAt: new Date(now - 60000).toISOString(),
        validUntil: new Date(now + 3600000).toISOString(),
      };
    }
    return value;
  }

  async function http(
    path: string,
    method = 'GET',
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

  async function publish(value = graph()) {
    expect((await http(root, 'POST', value)).status).toBe(201);
    const path = `${root}/${value.id}/versions/${value.version}`;
    expect((await http(`${path}/publish`, 'POST', {})).status).toBe(200);
    return path;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('navigation_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../drizzle', import.meta.url),
      ),
    });

    // Porta efêmera real; nenhuma simulação de JWKS ou guard.
    const { createServer } = await import('node:net');
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const result =
          typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolve(result));
      });
    });
    baseUrl = `http://127.0.0.1:${port}`;
    const config = apiEnvironmentSchema.parse({
      NODE_ENV: 'production',
      DATABASE_URL: container.getConnectionUri(),
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: 'navigation-test-secret-at-least-32-characters',
    });
    const auth = createBetterAuth(config, db);
    // O módulo global abaixo fornece a conexão real aos providers da feature.
    const { Module, Global } = await import('@nestjs/common');
    @Global()
    @Module({
      providers: [{ provide: DRIZZLE, useValue: db }],
      exports: [DRIZZLE],
    })
    class TestDatabaseModule {}
    const testingModule = await Test.createTestingModule({
      imports: [TestDatabaseModule, NavigationModule],
      providers: [
        { provide: API_CONFIG, useValue: config },
        JwtAdminGuard,
        { provide: APP_GUARD, useExisting: JwtAdminGuard },
      ],
    }).compile();
    app = testingModule.createNestApplication<NestExpressApplication>(
      new ExpressAdapter(),
      { bodyParser: false, logger: false },
    );
    app.getHttpAdapter().getInstance().use('/auth', toNodeHandler(auth));
    app
      .getHttpAdapter()
      .getInstance()
      .use(express.json({ limit: '1mb' }));
    await app.listen(port, '127.0.0.1');
    async function token(role: 'admin' | 'user') {
      const email = `${role}@navigation.example.org`;
      const password = 'synthetic-password-123';
      await auth.api.createUser({
        body: { name: role, email, password, role },
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

  beforeEach(async () => {
    await db.delete(navigationNetworks);
    await db.delete(anchors);
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it('exige JWT e mantém importação/publicação exclusivas de admin', async () => {
    expect((await http(root, 'GET', undefined, null)).status).toBe(401);
    expect((await http(root, 'POST', graph(), userJwt)).status).toBe(403);
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest, null)).status,
    ).toBe(401);
    expect(
      (await http(`${versionPath}/publish`, 'POST', {}, userJwt)).status,
    ).toBe(403);
  });

  it('persiste nós/trechos em rascunho e preserva os dados após nova leitura', async () => {
    const value = graph();
    const imported = await http(root, 'POST', value);
    expect(imported.status).toBe(201);
    expect(navigationNetworkVersionSchema.parse(imported.body)).toMatchObject({
      status: 'draft',
      nodeCount: 3,
      edgeCount: 3,
      graph: {
        ...value,
        nodes: expect.arrayContaining(value.nodes),
        edges: expect.arrayContaining(value.edges),
      },
    });
    expect((await db.select().from(navigationNodes)).length).toBe(3);
    expect((await db.select().from(navigationEdges)).length).toBe(3);
    expect((await http(versionPath)).body).toEqual(imported.body);
    expect(
      (await db.select().from(navigationVersions))[0].createdByUserId,
    ).toBeTruthy();
  });

  it('oculta rascunhos de usuários comuns e impede cálculo antes da publicação', async () => {
    await http(root, 'POST', graph());
    expect((await http(versionPath, 'GET', undefined, userJwt)).status).toBe(
      404,
    );
    expect((await http(root, 'GET', undefined, userJwt)).body.items).toEqual(
      [],
    );
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest, userJwt))
        .status,
    ).toBe(404);
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest)).status,
    ).toBe(409);
  });

  it('usuário comum calcula 20m ou 70m respeitando os critérios no banco', async () => {
    await publish();
    const shortest = await http(
      `${versionPath}/route`,
      'POST',
      routeRequest,
      userJwt,
    );
    expect(shortest.status).toBe(200);
    expect(navigationResultSchema.parse(shortest.body)).toMatchObject({
      status: 'ok',
      distanceMeters: 20,
    });
    const stepFree = await http(
      `${versionPath}/route`,
      'POST',
      { ...routeRequest, needs: { stepFree: true } },
      userJwt,
    );
    expect(stepFree.status).toBe(200);
    expect(stepFree.body).toMatchObject({
      status: 'ok',
      distanceMeters: 70,
      edgeIds: ['sidewalk', 'ramp'],
    });
    expect(
      (await http(root, 'GET', undefined, userJwt)).body.items,
    ).toHaveLength(1);
    expect((await db.select().from(navigationVersions))[0]).toMatchObject({
      status: 'published',
    });
  });

  it('bloqueia demo no modo real e recusa grafo/relógio enviados no pedido de cálculo', async () => {
    await publish();
    expect(
      (
        await http(
          `${versionPath}/route`,
          'POST',
          { ...routeRequest, mode: 'navigation' },
          userJwt,
        )
      ).body.status,
    ).toBe('demo_not_allowed');
    expect(
      (
        await http(
          `${versionPath}/route`,
          'POST',
          { ...routeRequest, graph: graph() },
          userJwt,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await http(
          `${versionPath}/route`,
          'POST',
          { ...routeRequest, evaluatedAt: '2026-01-01' },
          userJwt,
        )
      ).status,
    ).toBe(400);
  });

  it('recusa importação inválida sem deixar rede parcial', async () => {
    const value = graph();
    value.edges[0].toNodeId = 'missing';
    expect((await http(root, 'POST', value)).status).toBe(400);
    expect(await db.select().from(navigationNetworks)).toEqual([]);
    expect(await db.select().from(navigationNodes)).toEqual([]);
  });

  it('mantém versões publicadas imutáveis e recusa mudança da origem dos dados', async () => {
    await publish();
    const revised = graph();
    revised.edges[0].lengthMeters = 100;
    expect((await http(root, 'POST', revised)).status).toBe(409);
    revised.version = 'test-v2';
    revised.dataSource = 'field_survey';
    expect((await http(root, 'POST', revised)).status).toBe(409);
    revised.dataSource = 'demo';
    expect((await http(root, 'POST', revised)).status).toBe(201);
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest, userJwt)).body
        .distanceMeters,
    ).toBe(20);
  });

  it('publicação repetida é idempotente e não prolonga validade por acidente', async () => {
    await publish();
    const before = (await http(versionPath)).body;
    expect((await http(`${versionPath}/publish`, 'POST', {})).body).toEqual(
      before,
    );
    expect(await db.select().from(navigationVersions)).toHaveLength(1);
  });

  it('uma nova publicação retira a versão antiga sem permitir sua reativação', async () => {
    await publish();
    const revised = graph();
    revised.version = 'closed-v2';
    revised.edges[2].availability = { status: 'closed' };
    const next = await publish(revised);
    expect((await http(versionPath)).body).toMatchObject({
      status: 'retired',
      retiredAt: expect.any(String),
    });
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest, userJwt))
        .status,
    ).toBe(404);
    expect(
      (
        await http(
          `${next}/route`,
          'POST',
          { ...routeRequest, needs: { stepFree: true } },
          userJwt,
        )
      ).body.status,
    ).toBe('no_route');
    expect((await http(`${versionPath}/publish`, 'POST', {})).status).toBe(409);
    expect(
      (await http(root, 'GET', undefined, userJwt)).body.items,
    ).toHaveLength(1);
  });

  it('importações concorrentes da mesma versão resultam em uma única rede íntegra', async () => {
    const value = graph();
    const responses = await Promise.all([
      http(root, 'POST', value),
      http(root, 'POST', value),
    ]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(await db.select().from(navigationVersions)).toHaveLength(1);
    expect(await db.select().from(navigationNodes)).toHaveLength(3);
    expect(await db.select().from(navigationEdges)).toHaveLength(3);
  });

  it('falha real de gravação em lote desfaz rede, versão e nós da importação', async () => {
    await pool!.query(
      "ALTER TABLE navigation_edges ADD CONSTRAINT integration_failure CHECK (id <> 'ramp')",
    );
    try {
      expect((await http(root, 'POST', graph())).status).toBe(500);
      expect(await db.select().from(navigationNetworks)).toEqual([]);
      expect(await db.select().from(navigationVersions)).toEqual([]);
      expect(await db.select().from(navigationNodes)).toEqual([]);
    } finally {
      await pool!.query(
        'ALTER TABLE navigation_edges DROP CONSTRAINT integration_failure',
      );
    }
  });

  it('migration aditiva pode ser reaplicada sem apagar os dados', async () => {
    await publish();
    const migration = await readFile(
      new URL(
        '../../../drizzle/20261109001548_navigation_networks/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await pool!.query(migration);
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest, userJwt)).body
        .distanceMeters,
    ).toBe(20);
  });

  it('desconhecido e interdição retornam resultados de domínio sem rota insegura', async () => {
    const value = graph();
    value.edges[2].widthMeters = null;
    await publish(value);
    expect(
      (
        await http(
          `${versionPath}/route`,
          'POST',
          { ...routeRequest, needs: { stepFree: true, minWidthMeters: 1 } },
          userJwt,
        )
      ).body.status,
    ).toBe('insufficient_data');
    value.version = 'closed-v2';
    value.edges[2].availability = { status: 'closed' };
    const path = await publish(value);
    expect(
      (
        await http(
          `${path}/route`,
          'POST',
          { ...routeRequest, needs: { stepFree: true } },
          userJwt,
        )
      ).body.status,
    ).toBe('no_route');
  });

  it('levantamento importado não reaproveita aprovação e exige revisão para publicar', async () => {
    const value = graph();
    value.dataSource = 'field_survey';
    const created = await http(root, 'POST', value);
    expect(created.status).toBe(201);
    expect(
      created.body.graph.edges.every(
        (edge: { verification: { status: string } }) =>
          edge.verification.status === 'unverified',
      ),
    ).toBe(true);
    expect((await http(`${versionPath}/publish`, 'POST', {})).status).toBe(400);
    const review = {
      evidenceIds: ['synthetic-review'],
      validUntil: new Date(Date.now() + 3600000).toISOString(),
    };
    expect(
      (await http(`${versionPath}/publish`, 'POST', { review })).status,
    ).toBe(400);
    expect((await http(versionPath)).body.status).toBe('draft');
  });

  it('publica uma revisão explícita de levantamento com posições e calcula por nó', async () => {
    const value = graph();
    value.dataSource = 'field_survey';
    value.nodes.forEach((node, i) => {
      node.position = {
        kind: 'geographic',
        latitude: 0,
        longitude: i * 0.0001,
      };
    });
    await http(root, 'POST', value);
    const review = {
      evidenceIds: ['synthetic-review-not-campus'],
      validUntil: new Date(Date.now() + 3600000).toISOString(),
    };
    expect(
      (await http(`${versionPath}/publish`, 'POST', { review })).status,
    ).toBe(200);
    const result = await http(
      `${versionPath}/route`,
      'POST',
      { ...routeRequest, mode: 'navigation', needs: { stepFree: true } },
      userJwt,
    );
    expect(result.body).toMatchObject({
      status: 'ok',
      dataSource: 'field_survey',
      distanceMeters: 70,
    });
  });

  it('FKs impedem referências a outro conjunto e transação desfaz inserção parcial', async () => {
    await publish();
    const rowsBefore = await db.select().from(navigationEdges);
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(navigationNodes).values({
          networkId: 'synthetic-navigation',
          version: 'test-v1',
          id: 'temporary',
          name: 'Temporary',
          kind: 'reference',
        });
        await tx.execute(
          sql`INSERT INTO navigation_edges (network_id, version, id, from_node_id, to_node_id, kind, length_meters) VALUES ('synthetic-navigation', 'test-v1', 'invalid-fk', 'temporary', 'missing', 'walkway', 10)`,
        );
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(navigationNodes)
        .where(eq(navigationNodes.id, 'temporary')),
    ).toEqual([]);
    expect(await db.select().from(navigationEdges)).toEqual(rowsBefore);
  });

  it('pagina sem expor rascunho e valida os parâmetros de consulta', async () => {
    await publish();
    const second = graph();
    second.id = 'synthetic-second';
    await publish(second);
    const draft = graph();
    draft.version = 'draft-v3';
    await http(root, 'POST', draft);
    const first = await http(`${root}?limit=1`, 'GET', undefined, userJwt);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextOffset).toBe(1);
    const next = await http(
      `${root}?limit=1&offset=1`,
      'GET',
      undefined,
      userJwt,
    );
    expect(next.body.items).toHaveLength(1);
    expect(next.body.nextOffset).toBeNull();
    expect((await http(`${root}?limit=0`)).status).toBe(400);
    expect(
      (await http(`${root}?status=draft`, 'GET', undefined, userJwt)).status,
    ).toBe(400);
  });

  it('expõe os contratos da navegação na documentação OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app!,
      new DocumentBuilder()
        .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'admin-bearer')
        .build(),
    );
    expect(document.paths[root]?.post?.requestBody).toBeTruthy();
    expect(
      document.paths[`${root}/{networkId}/versions/{version}/route`]?.post,
    ).toMatchObject({
      summary: expect.any(String),
      security: [{ 'admin-bearer': [] }],
    });
  });

  const originAnchorId = '10000000-0000-4000-8000-000000000001';
  const destinationAnchorId = '10000000-0000-4000-8000-000000000002';
  const unmappedAnchorId = '10000000-0000-4000-8000-000000000003';
  const missingAnchorId = '10000000-0000-4000-8000-000000000004';
  const anchorRequest = {
    origin: { anchorId: originAnchorId },
    destination: { anchorId: destinationAnchorId },
    mode: 'demonstration',
  };
  async function mappedGraph() {
    await db.insert(anchors).values([
      {
        id: originAnchorId,
        name: 'Entrada AR fictícia',
        cloudAnchorId: 'synthetic-origin',
      },
      {
        id: destinationAnchorId,
        name: 'Jardim AR fictício',
        description: 'Ao lado da biblioteca',
        cloudAnchorId: 'synthetic-destination',
      },
      {
        id: unmappedAnchorId,
        name: 'Outro local AR fictício',
        cloudAnchorId: 'synthetic-unmapped',
      },
    ]);
    const value = graph();
    Object.assign(value.nodes[0], { anchorId: originAnchorId });
    Object.assign(value.nodes[2], {
      anchorId: destinationAnchorId,
      kind: 'reference',
    });
    return value;
  }

  it('persiste a identidade das âncoras e calcula para qualquer categoria de ponto AR', async () => {
    await publish(await mappedGraph());
    const stored = await http(versionPath, 'GET', undefined, userJwt);
    expect(stored.body.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'origin', anchorId: originAnchorId }),
        expect.objectContaining({
          id: 'building-access',
          kind: 'reference',
          anchorId: destinationAnchorId,
        }),
      ]),
    );
    const result = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      anchorRequest,
      userJwt,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'ok', distanceMeters: 20 });
    const stepFree = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, needs: { stepFree: true } },
      userJwt,
    );
    expect(stepFree.body).toMatchObject({
      status: 'ok',
      distanceMeters: 70,
      edgeIds: ['sidewalk', 'ramp'],
    });
  });

  it('mantém vínculo após renomear a âncora e aceita origem por nó conhecido', async () => {
    await publish(await mappedGraph());
    await db
      .update(anchors)
      .set({ name: 'Nome alterado' })
      .where(eq(anchors.id, destinationAnchorId));
    const result = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, origin: { nodeId: 'origin' } },
      userJwt,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'ok', distanceMeters: 20 });
  });

  it('calcula no modo real com referencial local conferido sem exigir GPS na âncora', async () => {
    const value = await mappedGraph();
    value.dataSource = 'field_survey';
    value.nodes.forEach((node, index) => {
      node.position = {
        kind: 'local',
        referenceId: 'synthetic-survey',
        xMeters: index * 10,
        yMeters: 0,
      };
    });
    expect((await http(root, 'POST', value)).status).toBe(201);
    expect(
      (
        await http(`${versionPath}/publish`, 'POST', {
          review: {
            evidenceIds: ['synthetic-review-not-campus'],
            validUntil: new Date(Date.now() + 3600000).toISOString(),
          },
        })
      ).status,
    ).toBe(200);
    const result = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, mode: 'navigation', needs: { stepFree: true } },
      userJwt,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: 'ok',
      dataSource: 'field_survey',
      distanceMeters: 70,
    });
  });

  it('distingue âncora existente sem percurso de âncora inexistente', async () => {
    await publish(await mappedGraph());
    const unmapped = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, destination: { anchorId: unmappedAnchorId } },
      userJwt,
    );
    expect(unmapped.status).toBe(200);
    expect(unmapped.body).toMatchObject({
      status: 'anchor_not_in_network',
      unmappedAnchorIds: [unmappedAnchorId],
    });
    const missing = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, destination: { anchorId: missingAnchorId } },
      userJwt,
    );
    expect(missing.status).toBe(404);
    expect(missing.body.message).toContain('AR');
  });

  it('exige sessão, valida IDs e mantém proteção de demonstração na consulta por âncora', async () => {
    await publish(await mappedGraph());
    expect(
      (
        await http(
          `${versionPath}/route-by-anchors`,
          'POST',
          anchorRequest,
          null,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await http(
          `${versionPath}/route-by-anchors`,
          'POST',
          { ...anchorRequest, destination: { anchorId: 'inválido' } },
          userJwt,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await http(
          `${versionPath}/route-by-anchors`,
          'POST',
          { ...anchorRequest, graph: graph() },
          userJwt,
        )
      ).status,
    ).toBe(400);
    const realMode = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, mode: 'navigation' },
      userJwt,
    );
    expect(realMode.body.status).toBe('demo_not_allowed');
  });

  it('não consulta rascunhos/histórico por âncora e não relaxa restrições em caminho bloqueado', async () => {
    const value = await mappedGraph();
    await http(root, 'POST', value);
    expect(
      (
        await http(
          `${versionPath}/route-by-anchors`,
          'POST',
          anchorRequest,
          userJwt,
        )
      ).status,
    ).toBe(404);
    expect(
      (await http(`${versionPath}/route-by-anchors`, 'POST', anchorRequest))
        .status,
    ).toBe(409);
    await http(`${versionPath}/publish`, 'POST', {});
    value.version = 'closed-for-anchors';
    value.edges[2].availability = { status: 'closed' };
    const newPath = await publish(value);
    expect(
      (
        await http(
          `${versionPath}/route-by-anchors`,
          'POST',
          anchorRequest,
          userJwt,
        )
      ).status,
    ).toBe(404);
    const closed = await http(
      `${newPath}/route-by-anchors`,
      'POST',
      { ...anchorRequest, needs: { stepFree: true } },
      userJwt,
    );
    expect(closed.body.status).toBe('no_route');
  });

  it('recusa vínculos inexistentes ou ambíguos sem persistência parcial', async () => {
    const value = await mappedGraph();
    Object.assign(value.nodes[2], { anchorId: missingAnchorId });
    expect((await http(root, 'POST', value)).status).toBe(400);
    expect(await db.select().from(navigationNetworks)).toHaveLength(0);
    Object.assign(value.nodes[2], { anchorId: originAnchorId });
    expect((await http(root, 'POST', value)).status).toBe(400);
    expect(await db.select().from(navigationNodes)).toHaveLength(0);
  });

  it('preserva a rede ao remover uma âncora e recusa novo cálculo pelo ID removido', async () => {
    await publish(await mappedGraph());
    await db.delete(anchors).where(eq(anchors.id, destinationAnchorId));
    const result = await http(
      `${versionPath}/route-by-anchors`,
      'POST',
      anchorRequest,
      userJwt,
    );
    expect(result.status).toBe(404);
    const stored = await http(versionPath);
    expect(stored.body.graph.nodes).toHaveLength(3);
    expect(stored.body.graph.edges).toHaveLength(3);
    expect(
      (await http(`${versionPath}/route`, 'POST', routeRequest, userJwt)).body
        .status,
    ).toBe('ok');
  });

  it('aplica a migration de vínculos duas vezes sem alterar registros e impõe unicidade no banco', async () => {
    await publish(await mappedGraph());
    const migration = await readFile(
      new URL(
        '../../../drizzle/20261113174144_navigation_anchor_links/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await pool!.query(migration);
    await pool!.query(migration);
    const stored = await http(versionPath);
    expect(
      stored.body.graph.nodes.find(
        (node: { id: string }) => node.id === 'origin',
      ).anchorId,
    ).toBe(originAnchorId);
    await expect(
      db
        .insert(navigationNodes)
        .values({
          networkId: 'synthetic-navigation',
          version: 'test-v1',
          id: 'ambiguous',
          name: 'Duplicado',
          kind: 'reference',
          anchorId: originAnchorId,
        }),
    ).rejects.toThrow();
    expect((await db.select().from(navigationNodes)).length).toBe(3);
  });
});
