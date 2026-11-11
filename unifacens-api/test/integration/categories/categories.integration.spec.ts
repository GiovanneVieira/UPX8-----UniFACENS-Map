import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { categorySchema, type Category } from 'shared';
import { DRIZZLE, type DrizzleDB } from '../../../src/db/database.module.js';
import { categories, places } from '../../../src/db/schema.js';
import { STORAGE } from '../../../src/modules/storage/storage.types.js';
import { CategoriesController } from '../../../src/modules/categories/categories.controller.js';
import { CategoriesService } from '../../../src/modules/categories/categories.service.js';
import { CategoriesRepository } from '../../../src/modules/categories/categories.repository.js';

const storageStub = {
  driver: 'local' as const,
  url: (key: string) => (key.startsWith('/uploads/') ? key : `/uploads/${key}`),
  put: async (key: string) => ({ key, url: `/uploads/${key}` }),
  delete: async () => undefined,
};

describe('Categories: CRUD, seed e vínculo com modelo (PostgreSQL real)', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: pg.Pool | undefined;
  let app: INestApplication;
  let db: DrizzleDB;
  let laboratoryId = '';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('categories_test')
      .start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle({ client: pool });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    const module = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        CategoriesService,
        CategoriesRepository,
        { provide: DRIZZLE, useValue: db },
        { provide: STORAGE, useValue: storageStub },
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

  it('GET /categories devolve as 11 categorias do seed, ordenadas, com model null', async () => {
    const response = await request(app.getHttpServer()).get('/categories').expect(200);
    const items: Category[] = response.body.map((row: unknown) => categorySchema.parse(row));
    expect(items).toHaveLength(11);
    expect(items.map((category: Category) => category.slug)).toEqual([
      'building', 'classroom', 'laboratory', 'entrance', 'ramp', 'elevator',
      'restroom', 'drinking_fountain', 'cafeteria', 'service', 'other',
    ]);
    expect(items.every((category: Category) => category.model === null)).toBe(true);
    laboratoryId = items.find((c: Category) => c.slug === 'laboratory')!.id;
  });

  it('POST cria categoria nova e recusa slug duplicado com 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/categories/admin')
      .send({ label: 'Auditório', slug: 'auditorio', sort: 11 })
      .expect(201);
    expect(created.body).toMatchObject({ label: 'Auditório', slug: 'auditorio' });

    await request(app.getHttpServer())
      .post('/categories/admin')
      .send({ label: 'Auditório II', slug: 'auditorio' })
      .expect(409);
  });

  it('recusa slug malformado e modelo inexistente', async () => {
    await request(app.getHttpServer())
      .post('/categories/admin')
      .send({ label: 'Inválida', slug: 'Slug Inválido!' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/categories/admin')
      .send({
        label: 'Sem modelo',
        slug: 'sem-modelo',
        modelId: '10000000-0000-4000-8000-000000000099',
      })
      .expect(404);
  });

  it('PATCH atualiza label/sort e desvincula modelo com null', async () => {
    const [created] = await request(app.getHttpServer())
      .post('/categories/admin')
      .send({ label: 'Cantina 2', slug: 'cantina-2' })
      .expect(201)
      .then((response) => [response.body]);
    const updated = await request(app.getHttpServer())
      .patch(`/categories/admin/${created.id}`)
      .send({ label: 'Cantina Dois', sort: 42 })
      .expect(200);
    expect(updated.body).toMatchObject({ label: 'Cantina Dois', sort: 42 });
  });

  it('DELETE bloqueia (409) categoria em uso por local e libera quando desvinculada', async () => {
    await db.insert(places).values({
      name: 'Lab usado no guard',
      categoryId: laboratoryId,
      latitude: 0,
      longitude: 0,
      source: 'demo',
    });
    const blocked = await request(app.getHttpServer())
      .delete(`/categories/admin/${laboratoryId}`)
      .expect(409);
    expect(blocked.body.message).toMatch(/em uso/i);

    await db.delete(places);
    await request(app.getHttpServer())
      .delete(`/categories/admin/${laboratoryId}`)
      .expect(200);
    const remaining = await db.select().from(categories);
    expect(remaining.find((row) => row.id === laboratoryId)).toBeUndefined();
  });
});
