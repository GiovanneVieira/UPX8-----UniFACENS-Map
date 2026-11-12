import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import {
  requestLoggingMiddleware,
  type LoggedRequest,
} from '../../../src/common/middleware/request-logging.middleware.js';

function makeReq(overrides: Partial<LoggedRequest> = {}) {
  return {
    method: 'GET',
    path: '/anchors',
    originalUrl: '/anchors?limit=1',
    ...overrides,
  } as LoggedRequest;
}

function makeRes() {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    setHeader: ReturnType<typeof vi.fn>;
  };
  res.statusCode = 200;
  res.setHeader = vi.fn();
  return res as unknown as Response & { statusCode: number };
}

/** Roda o middleware e simula o término da resposta. */
function run(req: LoggedRequest, statusCode = 200) {
  const res = makeRes();
  const next = vi.fn();
  requestLoggingMiddleware()(req, res, next);
  res.statusCode = statusCode;
  res.emit('finish');
  return { res, next };
}

describe('requestLoggingMiddleware (access log global)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('não bloqueia a request e loga acesso com method/url/status/duração/reqId', () => {
    const { next } = run(makeReq(), 201);
    expect(next).toHaveBeenCalledOnce();

    const line = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('→ GET /anchors?limit=1 201');
    expect(line).toMatch(/req:[0-9a-f-]{36}/);
    expect(line).toMatch(/\d+(\.\d+)?ms/);
    expect(line).toContain('user:-');
  });

  it('anexa x-request-id no response e requestId na request (correlação com o filter)', () => {
    const req = makeReq();
    const { res } = run(req);
    const header = (res.setHeader as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]) => name === 'x-request-id',
    );
    expect(header?.[1]).toEqual(req.requestId);
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('não loga /health nem /uploads estáticos (ruído)', () => {
    run(makeReq({ path: '/health', originalUrl: '/health' }));
    run(makeReq({ path: '/uploads/anchors/a.jpg', originalUrl: '/uploads/anchors/a.jpg' }));
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('4xx loga como warn e 5xx como error', () => {
    run(makeReq({ path: '/x', originalUrl: '/x' }), 404);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();

    run(makeReq({ path: '/y', originalUrl: '/y' }), 500);
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('inclui userId quando o guard populou req.user', () => {
    const req = makeReq({ user: { id: 'user-123' } } as Partial<LoggedRequest>);
    run(req);
    const line = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('user:user-123');
  });
});
