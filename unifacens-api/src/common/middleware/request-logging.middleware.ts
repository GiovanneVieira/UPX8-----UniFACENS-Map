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

// Lido por chamada (não capturado no load do módulo) — testável com stubEnv
// e alterna em runtime sem restart.
function isVerbose(): boolean {
  return process.env.LOG_REQUESTS === 'verbose';
}

function shouldSkip(path: string): boolean {
  if (isVerbose()) return false;
  return (
    path === '/health' ||
    path.startsWith('/uploads/') ||
    // Sondas OpenAI-compatible de ferramentas de dev no host (ex.: o opencode
    // embute um provider vLLM com origin hardcoded 127.0.0.1:8000 — mesma
    // porta desta API; o /health 200 o mantém "vivo" e o sonda /v1/models a
    // cada 30s). Nenhum controller real da API vive em /v1.
    path.startsWith('/v1/')
  );
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
