import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { modelSchema } from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { categories } from '../../../src/db/schema.js';
import { STORAGE } from '../../../src/modules/storage/storage.types.js';
import { LocalStorageAdapter } from '../../../src/modules/storage/local.adapter.js';
import { ModelsController } from '../../../src/modules/models/models.controller.js';
import { ModelsService } from '../../../src/modules/models/models.service.js';
import { CategoriesController } from '../../../src/modules/categories/categories.controller.js';
import { CategoriesService } from '../../../src/modules/categories/categories.service.js';
import { CategoriesRepository } from '../../../src/modules/categories/categories.repository.js';

/** GLB sintético com magic válido (passa na validação de magic bytes). */
function glbBuffer(size = 64): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12, 8);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, size - 12), 7)]);
}

const FBX_ASCII = Buffer.from(
  '; FBX 7.4.0 project file\nFBXHeaderExtension: {\n}\n' + 'x'.repeat(48),
  'utf8',
);

describe('Models: upload, conversão FBX→GLB e vínculo (PostgreSQL real)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: pg.Pool | undefined;
  let app: INestApplication;
  let db: DrizzleDB;
  let storageRoot: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('models_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'models-storage-'));
    const module = await Test.createTestingModule({
      controllers: [ModelsController, CategoriesController],
      providers: [
        ModelsService,
        CategoriesService,
        CategoriesRepository,
        { provide: DRIZZLE, useValue: db },
        { provide: STORAGE, useValue: new LocalStorageAdapter(storageRoot) },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }, 90000);

  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (container) await container.stop();
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  it('POST aceita .glb válido e grava original em models/originals/', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', glbBuffer(), { filename: 'geladeira.glb', contentType: 'model/gltf-binary' })
      .expect(201);
    const model = modelSchema.parse(response.body);
    expect(model.format).toBe('glb');
    expect(model.converted).toBe(false);
    // Prefixo de ambiente (NODE_ENV=test → dev) isola objetos por ambiente.
    expect(model.url).toMatch(/^\/uploads\/dev\/models\/originals\/.+\.glb$/);
    expect(
      fs.existsSync(path.join(storageRoot, model.url.replace('/uploads/', ''))),
    ).toBe(true);
  });

  it('recusa FBX com orientação de exportar GLB (sem conversão server-side)', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', FBX_ASCII, { filename: 'bebedouro.fbx', contentType: 'application/octet-stream' })
      .expect(400);
    expect(response.body.message).toMatch(/FBX não é aceito/);
    // Nada gravado no storage (prefixo de ambiente: NODE_ENV=test → dev/).
    const allEntries = fs.readdirSync(
      path.join(storageRoot, 'dev', 'models', 'originals'),
      { recursive: true },
    );
    expect(allEntries.some((entry) => String(entry).includes('bebedouro'))).toBe(false);
  });

  it('recusa conteúdo FBX renomeado como .glb com a mesma orientação', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', FBX_ASCII, { filename: 'disfarce.glb', contentType: 'model/gltf-binary' })
      .expect(400);
    expect(response.body.message).toMatch(/FBX detectado/);
  });

  it('recusa arquivo acima de 1MB, extensão errada e conteúdo incoerente', async () => {
    await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', Buffer.concat([glbBuffer(), Buffer.alloc(1024 * 1024)]), {
        filename: 'grande.glb',
        contentType: 'model/gltf-binary',
      })
      .expect(413);
    await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', glbBuffer(), { filename: 'modelo.stl' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', Buffer.from('texto comum'), { filename: 'fake.glb' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/models')
      .expect(400);
  });

  it('GET lista com categoria vinculada; DELETE bloqueia vínculo (409) e remove storage', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/admin/models')
      .attach('file', glbBuffer(), { filename: 'porta.glb' })
      .expect(201);
    const modelId = uploaded.body.id;

    const emptyList = await request(app.getHttpServer()).get('/admin/models').expect(200);
    const listed = emptyList.body.items.find((item: { id: string }) => item.id === modelId);
    expect(listed.category).toBeNull();

    // Vincula a categoria seedada 'entrance' — categoria é mandante.
    const [entrance] = await db.select().from(categories);
    await request(app.getHttpServer())
      .patch(`/categories/admin/${entrance.id}`)
      .send({ modelId })
      .expect(200);

    const withCategory = await request(app.getHttpServer()).get('/admin/models').expect(200);
    const linked = withCategory.body.items.find((item: { id: string }) => item.id === modelId);
    expect(linked.category).toMatchObject({ id: entrance.id });

    const blocked = await request(app.getHttpServer())
      .delete(`/admin/models/${modelId}`)
      .expect(409);
    expect(blocked.body.message).toMatch(/vinculado/i);

    // Desvincula e exclui — arquivos somem do storage.
    await request(app.getHttpServer())
      .patch(`/categories/admin/${entrance.id}`)
      .send({ modelId: null })
      .expect(200);
    const originalKey = uploaded.body.originalUrl.replace('/uploads/', '');
    await request(app.getHttpServer()).delete(`/admin/models/${modelId}`).expect(200);
    expect(fs.existsSync(path.join(storageRoot, originalKey))).toBe(false);
    await request(app.getHttpServer()).delete(`/admin/models/${modelId}`).expect(404);
  });
});
