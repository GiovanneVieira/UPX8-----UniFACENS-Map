import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { AnchorsController } from '../../../src/anchors/anchors.controller.js';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';
import { DRIZZLE } from '../../../src/db/database.module.js';
import { STORAGE } from '../../../src/modules/storage/storage.types.js';
import { LocalStorageAdapter } from '../../../src/modules/storage/local.adapter.js';
import * as os from 'node:os';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Anchors Integration with Testcontainers (Google Cloud Anchors & Real PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: INestApplication;

  beforeAll(async () => {
    // 1. Inicia um container PostgreSQL 16 real e isolado
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('unifacens_test')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    const connectionUri = container.getConnectionUri();

    // 2. Executa as migrações oficiais do Drizzle ORM no banco de dados do container
    const migrationClient = new pg.Client({ connectionString: connectionUri });
    await migrationClient.connect();
    const drizzleMigrateDb = drizzle({ client: migrationClient });
    const migrationsFolder = path.resolve(__dirname, '../../../drizzle');
    await migrate(drizzleMigrateDb, { migrationsFolder });
    await migrationClient.end();

    // 3. Cria o pool de conexão real para injeção no NestJS
    pool = new pg.Pool({ connectionString: connectionUri });
    const db = drizzle({ client: pool });

    // 4. Cria o TestingModule do NestJS com serviços reais
    //    (storage em disco temporário — sem rede)
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnchorsController],
      providers: [
        AnchorsService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
        {
          provide: STORAGE,
          useValue: new LocalStorageAdapter(
            fs.mkdtempSync(path.join(os.tmpdir(), 'anchors-storage-')),
          ),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 90000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (pool) {
      await pool.end();
    }
    if (container) {
      await container.stop();
    }
  });

  it('GET /anchors deve retornar 200 com cloud anchors persistidos pelos seeds', async () => {
    const res = await request(app.getHttpServer()).get('/anchors').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const demoCentral = res.body.find((a: any) => a.cloudAnchorId === 'ua-facens-demo-central-001');
    expect(demoCentral).toBeDefined();
    expect(demoCentral.name).toBe('Ponto Central (Origem Facens)');
  });

  it('POST /anchors deve validar via Zod e persistir novo Cloud Anchor no PostgreSQL', async () => {
    const newAnchorPayload = {
      name: 'Entrada Bloco B',
      cloudAnchorId: 'ua-google-ar-bloco-b-999',
      description: 'Catraca de acesso',
    };

    const postRes = await request(app.getHttpServer())
      .post('/anchors')
      .send(newAnchorPayload)
      .expect(201);

    expect(postRes.body).toHaveProperty('id');
    expect(postRes.body.name).toBe('Entrada Bloco B');
    expect(postRes.body.cloudAnchorId).toBe('ua-google-ar-bloco-b-999');
    expect(postRes.body.description).toBe('Catraca de acesso');

    // Confirma persistência real buscando por ID
    const getRes = await request(app.getHttpServer())
      .get(`/anchors/${postRes.body.id}`)
      .expect(200);

    expect(getRes.body.id).toBe(postRes.body.id);
    expect(getRes.body.cloudAnchorId).toBe('ua-google-ar-bloco-b-999');
  });

  it('POST/PATCH /anchors devem persistir a âncora geoespacial hospedada (dupla ancoragem)', async () => {
    // POST já levando o UUID RV (host resolveu antes do save)
    const postRes = await request(app.getHttpServer())
      .post('/anchors')
      .send({
        name: 'Ponto Geoespacial',
        cloudAnchorId: 'ua-visual-geospatial-1',
        geospatialAnchorId: '9f1c2d34-5a67-4b89-9cde-0f1a2b3c4d5e',
        geospatialAccuracyM: 6.4,
        latitude: -23.4699,
        longitude: -47.4297,
      })
      .expect(201);

    expect(postRes.body.geospatialAnchorId).toBe('9f1c2d34-5a67-4b89-9cde-0f1a2b3c4d5e');
    expect(postRes.body.geospatialAccuracyM).toBe(6.4);

    // PATCH grava o UUID quando o host resolve DEPOIS do save
    const patchRes = await request(app.getHttpServer())
      .patch(`/anchors/${postRes.body.id}`)
      .send({
        geospatialAnchorId: '8e0b1c23-4a56-4788-8bcd-9e0f1a2b3c4d',
        geospatialAccuracyM: 8.1,
      })
      .expect(200);

    expect(patchRes.body.geospatialAnchorId).toBe('8e0b1c23-4a56-4788-8bcd-9e0f1a2b3c4d');
    expect(patchRes.body.geospatialAccuracyM).toBe(8.1);

    // Listagem serializa a camada geoespacial (client faz merge por prioridade)
    const listRes = await request(app.getHttpServer()).get('/anchors').expect(200);
    const found = listRes.body.find((a: any) => a.id === postRes.body.id);
    expect(found.geospatialAnchorId).toBe('8e0b1c23-4a56-4788-8bcd-9e0f1a2b3c4d');
  });

  it('GET /anchors deve serializar images e longDescription na listagem (fim do cast no client)', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/anchors')
      .send({ name: 'Ponto Com Detalhes', cloudAnchorId: 'ua-with-details-1' })
      .expect(201);
    expect(postRes.body.images).toEqual([]);
    expect(postRes.body.longDescription).toBeNull();
  });

  it('POST /anchors com modelId deve embutir o modelo override na serialização (F3)', async () => {
    // Modelo mínimo direto no banco (upload real coberto pelos specs de models)
    const [model] = await pool
      .query(
        `INSERT INTO models (name, format, original_key, size_bytes, bounding_box)
         VALUES ('Carrinho de Ferramentas', 'glb', 'dev/models/originals/x/carrinho.glb', 2048,
                 '{"min":[0,0,0],"max":[0.6,0.4,0.3]}'::jsonb)
         RETURNING id`,
      )
      .then((res) => res.rows);

    const postRes = await request(app.getHttpServer())
      .post('/anchors')
      .send({
        name: 'Ferramentas do Lab',
        cloudAnchorId: 'ua-model-override-1',
        modelId: model.id,
      })
      .expect(201);

    // Sem categoria: o modelo do PONTO já resolve no POST (join pelo override)
    expect(postRes.body.modelId).toBe(model.id);
    expect(postRes.body.model).toMatchObject({
      format: 'glb',
      boundingBox: { min: [0, 0, 0], max: [0.6, 0.4, 0.3] },
    });
    expect(postRes.body.model.url).toContain('carrinho.glb');

    // FK violada → 409 amigável (AllExceptionsFilter mapeia 23503)
    await request(app.getHttpServer())
      .post('/anchors')
      .send({
        name: 'Ponto Órfão',
        cloudAnchorId: 'ua-model-override-2',
        modelId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(409);
  });

  it('POST /anchors com payload inválido deve ser rejeitado pelo ZodValidationPipe com 400', async () => {
    const invalidPayload = {
      name: '', // Nome vazio inválido
      // cloudAnchorId ausente
    };

    const res = await request(app.getHttpServer())
      .post('/anchors')
      .send(invalidPayload)
      .expect(400);

    expect(res.body).toHaveProperty('validationErrors');
    expect(Array.isArray(res.body.validationErrors)).toBe(true);
    expect(res.body.validationErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /anchors/:id deve excluir o Cloud Anchor no PostgreSQL real', async () => {
    // Cria âncora temporária
    const postRes = await request(app.getHttpServer())
      .post('/anchors')
      .send({
        name: 'Ponto Temporário',
        cloudAnchorId: 'ua-temp-to-delete',
      })
      .expect(201);

    const anchorId = postRes.body.id;

    // Deleta
    await request(app.getHttpServer()).delete(`/anchors/${anchorId}`).expect(200);

    // Confirma que não existe mais
    await request(app.getHttpServer()).get(`/anchors/${anchorId}`).expect(404);
  });
});
