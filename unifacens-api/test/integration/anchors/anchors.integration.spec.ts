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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnchorsController],
      providers: [
        AnchorsService,
        {
          provide: DRIZZLE,
          useValue: db,
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
