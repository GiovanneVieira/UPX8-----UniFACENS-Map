import { AnchorsController } from '../../../src/anchors/anchors.controller.js';
import { AnchorsService } from '../../../src/anchors/anchors.service.js';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import request from 'supertest';
import { adminListQuerySchema, updateAdminPointSchema } from 'shared';
import { AdminController } from '../../../src/modules/admin/admin.controller.js';
import { AdminService } from '../../../src/modules/admin/admin.service.js';
import { AdminRepository } from '../../../src/modules/admin/admin.repository.js';
import { JwtAdminGuard } from '../../../src/common/auth/jwt-admin.guard.js';
import { API_CONFIG } from '../../../src/config/runtime-config.js';

const id = '199b4685-03c5-46a7-adc7-027af35262c5';
const record = {
  id,
  name: 'Biblioteca',
  description: 'Acervo',
  longDescription: null,
  images: [],
  placeId: null,
  latitude: -23.47,
  longitude: -47.43,
  altitude: 605,
  heading: 0,
  cloudAnchorId: 'test',
  createdAt: new Date('2026-11-01T12:00:00Z'),
};
const repository = {
  listPoints: vi.fn(async () => ({ items: [record], total: 1 })),
  listUsers: vi.fn(async () => ({
    items: [
      {
        id: 'user1',
        name: 'Gustavo',
        email: 'example@example.com',
        role: 'admin',
        emailVerified: true,
        banned: null,
        createdAt: record.createdAt,
        password: 'must-not-leak',
      },
    ],
    total: 1,
  })),
  updatePoint: vi.fn(async (key: string, dto: object) =>
    key === id ? { ...record, ...dto } : undefined,
  ),
};

describe('Painel administrativo HTTP', () => {
  let app: INestApplication;
  let jwks: Server;
  let admin: string;
  let member: string;
  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    const publicKey = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'admin-tests',
      alg: 'RS256',
    };
    jwks = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ keys: [publicKey] }));
    });
    await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
    const address = jwks.address();
    if (!address || typeof address === 'string')
      throw new Error('Porta indisponível');
    const issuer = `http://127.0.0.1:${address.port}`;
    const token = (role: string) =>
      new SignJWT({ role })
        .setProtectedHeader({ alg: 'RS256', kid: 'admin-tests' })
        .setSubject('user1')
        .setIssuer(issuer)
        .setAudience(issuer)
        .setExpirationTime('5m')
        .sign(keys.privateKey);
    admin = await token('admin');
    member = await token('user');
    const module = await Test.createTestingModule({
      controllers: [AdminController, AnchorsController],
      providers: [
        AdminService,
        {
          provide: AnchorsService,
          useValue: {
            findById: async () => record,
            addImages: async () => ['/uploads/anchors/test.png'],
            remove: async () => ({ success: true }),
          },
        },
        JwtAdminGuard,
        { provide: APP_GUARD, useExisting: JwtAdminGuard },
        { provide: API_CONFIG, useValue: { BETTER_AUTH_URL: issuer } },
        { provide: AdminRepository, useValue: repository },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (jwks) await new Promise<void>((resolve) => jwks.close(() => resolve()));
  });
  it('exige login e rejeita JWT inválido', async () => {
    await request(app.getHttpServer()).get('/admin/points').expect(401);
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('rejeita usuário comum em todas as rotas administrativas', async () => {
    for (const endpoint of ['/admin/points', '/admin/users'])
      await request(app.getHttpServer())
        .get(endpoint)
        .set('Authorization', `Bearer ${member}`)
        .expect(403);
    await request(app.getHttpServer())
      .patch(`/admin/points/${id}`)
      .set('Authorization', `Bearer ${member}`)
      .send({ name: 'Outro' })
      .expect(403);
  });
  it('pagina e filtra os pontos com parâmetros validados', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/points?search=Biblioteca&limit=10&offset=20')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(response.body.items[0].name).toBe('Biblioteca');
    expect(repository.listPoints).toHaveBeenLastCalledWith({
      search: 'Biblioteca',
      limit: 10,
      offset: 20,
    });
    await request(app.getHttpServer())
      .get('/admin/points?limit=999')
      .set('Authorization', `Bearer ${admin}`)
      .expect(400);
  });
  it('não expõe campos privados na listagem de usuários', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(response.body.items[0]).not.toHaveProperty('password');
    expect(response.body.items[0].banned).toBe(false);
  });
  it('protege uploads e rejeita arquivos fora dos limites', async () => {
    const url = `/anchors/${id}/images`;
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${member}`)
      .attach('files', Buffer.from('image'), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${admin}`)
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${admin}`)
      .attach('files', Buffer.from('text'), {
        filename: 'text.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${admin}`)
      .attach('files', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    const image = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${admin}`)
      .attach('files', Buffer.from('image'), {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(image.body.images).toEqual(['/uploads/anchors/test.png']);
    await request(app.getHttpServer())
      .delete(`/anchors/${id}`)
      .set('Authorization', `Bearer ${member}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/anchors/${id}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
  });

  it('edita texto preservando coordenadas e valida IDs e propriedades', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/points/${id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: ' Nome novo ', description: '' })
      .expect(200);
    expect(response.body.name).toBe('Nome novo');
    expect(response.body.latitude).toBe(record.latitude);
    await request(app.getHttpServer())
      .patch(`/admin/points/${id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ latitude: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/admin/points/invalid')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Outro' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/admin/points/299b4685-03c5-46a7-adc7-027af35262c5')
      .set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Outro' })
      .expect(404);
  });
});

describe('Contratos do painel', () => {
  it('recusa edição vazia, nome em branco e campos fora do escopo', () => {
    for (const dto of [
      {},
      { name: ' ' },
      { role: 'admin' },
      { cloudAnchorId: 'other' },
      { description: 'a'.repeat(1001) },
    ])
      expect(updateAdminPointSchema.safeParse(dto).success).toBe(false);
  });
  it('limita a paginação e aceita filtros sem valores', () => {
    expect(adminListQuerySchema.parse({})).toEqual({
      search: '',
      offset: 0,
      limit: 20,
    });
    for (const query of [
      { offset: -1 },
      { limit: 0 },
      { search: 'x'.repeat(101) },
    ])
      expect(adminListQuerySchema.safeParse(query).success).toBe(false);
  });
});
