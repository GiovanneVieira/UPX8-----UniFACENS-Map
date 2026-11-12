import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Access log global — middleware Express registrado NO main.ts ANTES de TUDO
 * (incluindo /auth do better-auth e /uploads estático, que ficam montados
 * direto no Express e NÃO seriam cobertos por um interceptor NestJS).
 *
 * Formato (stdout → console do Render):
 *   → METHOD url STATUS duraçãoMs req:<uuid> user:<id|->
 * Níveis: 2xx/3xx log · 4xx warn · 5xx error.
 *
 * Correlação: `x-request-id` no response + `req.requestId` — o
 * AllExceptionsFilter inclui o mesmo id nos logs de erro.
 *
 * Regras de segurança: NUNCA logar body/headers (Bearer JWT / PII).
 * Exclusões de ruído: /health e /uploads/* (LOG_REQUESTS=verbose remove).
 */

/** Request anotada pelo middleware (requestId para correlação de erros). */
export interface LoggedRequest extends Request {
  requestId?: string;
}

const VERBOSE = process.env.LOG_REQUESTS === 'verbose';

function shouldSkip(path: string): boolean {
  if (VERBOSE) return false;
  return path === '/health' || path.startsWith('/uploads/');
}

export function requestLoggingMiddleware() {
  const logger = new Logger('Http');
  return (req: LoggedRequest, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const start = performance.now();

    res.on('finish', () => {
      if (shouldSkip(req.path)) return;
      const durationMs = (performance.now() - start).toFixed(1);
      // Populado pelo JwtAdminGuard em rotas protegidas; melhor-auth (/auth)
      // e rotas públicas permanecem '-'.
      const user = (req as { user?: { id?: string; sub?: string } }).user;
      const userId = user?.id ?? user?.sub ?? '-';
      const line = `→ ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms req:${requestId} user:${userId}`;
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.log(line);
    });

    next();
  };
}
