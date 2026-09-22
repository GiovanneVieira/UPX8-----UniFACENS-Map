import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../../../src/app.controller.js';
import { AppService } from '../../../src/app.service.js';

describe('App Integration (HTTP)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / deve responder 200 com Hello World!', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.text).toBe('Hello World!');
  });
});
