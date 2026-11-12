import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { orphanAnchorSchema, type OrphanAnchor } from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { anchors } from '../../../src/db/schema.js';
import { OrphanAnchorsController } from '../../../src/modules/ar-diagnostics/orphan-anchors.controller.js';
import { OrphanAnchorsService } from '../../../src/modules/ar-diagnostics/orphan-anchors.service.js';
import {
  RV_CLOUD_ANCHOR_CLIENT,
  type RvCloudAnchorClient,
  type RvListedAnchor,
} from '../../../src/modules/ar-diagnostics/rv-cloud-anchor.client.js';

function rvAnchor(id: string, overrides: Partial<RvListedAnchor> = {}): RvListedAnchor {
  return {
    id,
    keypoint_count: 420,
    descriptor_count: 800,
    resolve_count: 3,
    successful_resolve_count: 1,
    average_confidence: 0.62,
    last_resolved_at: null,
    latitude: -23.5,
    longitude: -47.4,
    altitude: 700,
    created_at: '2026-11-10T18:00:00Z',
    ...overrides,
  };
}

describe('OrphanAnchors: diff plataforma RV − banco (PostgreSQL real)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: pg.Pool | undefined;
  let app: INestApplication;
  let db: DrizzleDB;

  // Fake mutável do adapter RV (seam) — listAll lê no momento da chamada.
  let rvListed: RvListedAnchor[] | null = [];
  const fakeRv: RvCloudAnchorClient = {
    get: async () => ({ error: { code: 'NOT_USED', message: '' } }),
    listAll: async () =>
      rvListed === null ? null : new Map(rvListed.map((a) => [a.id, a])),
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('orphan_anchors_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    const module = await Test.createTestingModule({
      controllers: [OrphanAnchorsController],
      providers: [
        OrphanAnchorsService,
        { provide: DRIZZLE, useValue: db },
        { provide: RV_CLOUD_ANCHOR_CLIENT, useValue: fakeRv },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }, 90000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('âncora hospedada sem registro no banco aparece como órfã com métricas/GPS', async () => {
    await db.delete(anchors);
    rvListed = [
      rvAnchor('11111111-2222-4333-8444-555555555555', {
        created_at: '2026-11-10T18:00:00Z',
      }),
    ];

    const response = await request(app.getHttpServer())
      .get('/admin/orphan-anchors')
      .expect(200);
    const items: OrphanAnchor[] = response.body.map((row: unknown) =>
      orphanAnchorSchema.parse(row),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      cloudAnchorId: '11111111-2222-4333-8444-555555555555',
      provider: 'reactvision',
      keypoints: 420,
      resolveCount: 3,
      successfulResolveCount: 1,
      gps: { latitude: -23.5, longitude: -47.4 },
      hostedAt: '2026-11-10T18:00:00Z',
    });
  });

  it('cloudAnchorId presente no banco NÃO é órfã (some do diff)', async () => {
    await db.delete(anchors);
    await db.insert(anchors).values({
      name: 'Pin adotado',
      cloudAnchorId: '11111111-2222-4333-8444-555555555555',
    });
    rvListed = [
      rvAnchor('11111111-2222-4333-8444-555555555555'),
      rvAnchor('99999999-8888-4777-8666-555555555555'),
    ];

    const response = await request(app.getHttpServer())
      .get('/admin/orphan-anchors')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].cloudAnchorId).toBe('99999999-8888-4777-8666-555555555555');
  });

  it('ordena por hostedAt DESC (órfã nova primeiro — features do scan em memória)', async () => {
    await db.delete(anchors);
    rvListed = [
      rvAnchor('aaaaaaaa-0000-4000-8000-000000000001', {
        created_at: '2026-11-08T10:00:00Z',
      }),
      rvAnchor('aaaaaaaa-0000-4000-8000-000000000002', {
        created_at: '2026-11-11T10:00:00Z',
      }),
    ];

    const response = await request(app.getHttpServer())
      .get('/admin/orphan-anchors')
      .expect(200);

    expect(response.body.map((row: OrphanAnchor) => row.cloudAnchorId)).toEqual([
      'aaaaaaaa-0000-4000-8000-000000000002',
      'aaaaaaaa-0000-4000-8000-000000000001',
    ]);
  });

  it('secret key ausente (listAll null) retorna lista vazia — sem fonte de verdade', async () => {
    rvListed = null;
    const response = await request(app.getHttpServer())
      .get('/admin/orphan-anchors')
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('classifica provider por prefixo (defensivo — IDs não são intercambiáveis)', async () => {
    await db.delete(anchors);
    rvListed = [
      rvAnchor('ua-abcdef0123456789'),
      rvAnchor('aaaaaaaa-0000-4000-8000-000000000003', { latitude: null, longitude: null }),
    ];

    const response = await request(app.getHttpServer())
      .get('/admin/orphan-anchors')
      .expect(200);
    const items: OrphanAnchor[] = response.body.map((row: unknown) =>
      orphanAnchorSchema.parse(row),
    );

    const google = items.find((row) => row.cloudAnchorId.startsWith('ua-'));
    expect(google?.provider).toBe('google');
    const rv = items.find((row) => !row.cloudAnchorId.startsWith('ua-'));
    expect(rv?.provider).toBe('reactvision');
    expect(rv?.gps).toBeNull();
  });
});
