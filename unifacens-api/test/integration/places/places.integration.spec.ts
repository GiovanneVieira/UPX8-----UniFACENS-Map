import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { placeSchema, placesPageSchema } from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { places } from '../../../src/db/schema.js';
import { PlacesController } from '../../../src/modules/places/places.controller.js';
import { PlacesService } from '../../../src/modules/places/places.service.js';
import { PlacesRepository } from '../../../src/modules/places/places.repository.js';

const payload = {
  name: 'Exemplo — Laboratório',
  category: 'laboratory',
  latitude: -23.4699,
  longitude: -47.4297,
  building: 'Bloco de demonstração',
  floor: 0,
  description: 'Coordenadas ilustrativas, sem levantamento presencial.',
  source: 'demo',
};
const absentId = '10000000-0000-4000-8000-000000000001';

describe('Places: HTTP, Zod e PostgreSQL real', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: pg.Pool | undefined;
  let app: INestApplication;
  let db: DrizzleDB;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('places_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../drizzle', import.meta.url),
      ),
    });
    const module = await Test.createTestingModule({
      controllers: [PlacesController],
      providers: [
        PlacesService,
        PlacesRepository,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }, 90000);

  beforeEach(async () => {
    await db.delete(places);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  it('inicia com catálogo vazio e não transforma âncoras AR em locais reais', async () => {
    const response = await request(app.getHttpServer())
      .get('/places')
      .expect(200);
    expect(response.body).toEqual({ items: [], total: 0 });
  });

  it('cadastra, normaliza e persiste um local sem cloudAnchorId', async () => {
    const created = await request(app.getHttpServer())
      .post('/places')
      .send({ ...payload, name: '  Exemplo — Lab  ' })
      .expect(201);
    const place = placeSchema.parse(created.body);
    expect(place.name).toBe('Exemplo — Lab');
    expect(place.verificationStatus).toBe('unverified');
    expect(place.verifiedAt).toBeNull();
    expect(place.floor).toBe(0);
    const fetched = await request(app.getHttpServer())
      .get(`/places/${place.id}`)
      .expect(200);
    expect(fetched.body).toEqual(created.body);
    expect((await db.select().from(places)).length).toBe(1);
  });

  it('assume informação da equipe quando origem não é enviada', async () => {
    const response = await request(app.getHttpServer())
      .post('/places')
      .send({
        name: 'Exemplo',
        category: 'entrance',
        latitude: 0,
        longitude: 0,
      })
      .expect(201);
    expect(response.body.source).toBe('team_report');
    expect(response.body.building).toBeNull();
  });

  it.each([
    { ...payload, name: ' ' },
    { ...payload, latitude: 91 },
    { ...payload, longitude: -181 },
    { ...payload, category: 'accessible' },
    { ...payload, floor: 1.5 },
    { ...payload, verificationStatus: 'verified' },
    { ...payload, verifiedAt: new Date().toISOString() },
  ])('rejeita payload inválido ou verificação forjada: %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/places')
      .send(invalid)
      .expect(400);
    expect(await db.select().from(places)).toHaveLength(0);
  });

  it('combina busca por nome/bloco, categoria e paginação estável', async () => {
    await db.insert(places).values([
      { ...payload, name: 'Exemplo A' },
      { ...payload, name: 'Exemplo B' },
      { ...payload, name: 'Exemplo C', category: 'entrance' },
    ]);
    const first = await request(app.getHttpServer())
      .get('/places')
      .query({ search: 'DEMONSTRAÇÃO', category: 'laboratory', limit: 1 })
      .expect(200);
    const page = placesPageSchema.parse(first.body);
    expect(page.total).toBe(2);
    expect(page.items.map((place) => place.name)).toEqual(['Exemplo A']);
    const second = await request(app.getHttpServer())
      .get('/places')
      .query({
        search: 'DEMONSTRAÇÃO',
        category: 'laboratory',
        limit: 1,
        offset: 1,
      })
      .expect(200);
    expect(second.body.items[0].name).toBe('Exemplo B');
  });

  it('trata % e _ como texto literal na busca', async () => {
    await db.insert(places).values([
      { ...payload, name: 'Exemplo 50%_teste' },
      { ...payload, name: 'Exemplo outro' },
    ]);
    const response = await request(app.getHttpServer())
      .get('/places')
      .query({ search: '%_' })
      .expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].name).toBe('Exemplo 50%_teste');
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { category: 'fake' },
    { unexpected: 'field' },
  ])('rejeita filtros inválidos: %j', async (query) => {
    await request(app.getHttpServer()).get('/places').query(query).expect(400);
  });

  it('editar um local invalida a verificação e preserva a origem não enviada', async () => {
    const [original] = await db
      .insert(places)
      .values({
        ...payload,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
      })
      .returning();
    const response = await request(app.getHttpServer())
      .patch(`/places/${original.id}`)
      .send({ name: 'Exemplo atualizado', floor: null })
      .expect(200);
    expect(response.body).toMatchObject({
      name: 'Exemplo atualizado',
      source: 'demo',
      floor: null,
      verificationStatus: 'unverified',
      verifiedAt: null,
    });
    const [persisted] = await db
      .select()
      .from(places)
      .where(eq(places.id, original.id));
    expect(persisted.verificationStatus).toBe('unverified');
    expect(persisted.verifiedAt).toBeNull();
  });

  it('rejeita atualização vazia e confirmação de verificação pela API', async () => {
    const [original] = await db.insert(places).values(payload).returning();
    await request(app.getHttpServer())
      .patch(`/places/${original.id}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/places/${original.id}`)
      .send({ verificationStatus: 'verified' })
      .expect(400);
  });

  it('exclui local e retorna 404 para registros ausentes', async () => {
    const [original] = await db.insert(places).values(payload).returning();
    await request(app.getHttpServer())
      .delete(`/places/${original.id}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/places/${original.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/places/${original.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/places/${absentId}`)
      .send({ name: 'Ausente' })
      .expect(404);
  });

  it('rejeita UUID inválido antes de consultar o banco', async () => {
    await request(app.getHttpServer()).get('/places/not-a-uuid').expect(400);
  });
});
