import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express';
import type { ApiEnvironment } from 'shared';
import { API_CONFIG } from '../../config/runtime-config.js';
import { ADMIN_ONLY, AUTHENTICATED_READ, PUBLIC } from './access.decorators.js';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

const BEARER_PATTERN = /^Bearer (\S+)$/;
const MUTATION_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * Guard global de autenticação/autorização (modelo: identidade primeiro).
 *
 * Regras (plano de auth v2 — JWT em tudo):
 * - `@Public()` isenta a rota (política de acesso, healthcheck);
 * - Toda outra rota exige `Authorization: Bearer <JWT>` válido — em qualquer
 *   ambiente (sem bypass em dev), para leituras e mutations;
 * - Mutations (POST/PATCH/PUT/DELETE) e `@AdminOnly()` exigem `role === 'admin'`;
 * - `@AuthenticatedRead()` permite consultas POST para qualquer role autenticada;
 *   `@AdminOnly()` sempre prevalece sobre essa exceção;
 * - O JWT é emitido pelo plugin `jwt` do better-auth e validado localmente
 *   contra o JWKS de `/auth/jwks` (jose com cache e rotação automáticos).
 */
@Injectable()
export class JwtAdminGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private readonly reflector: Reflector,
    @Inject(API_CONFIG) config: ApiEnvironment,
  ) {
    this.issuer = config.BETTER_AUTH_URL;
    this.audience = config.BETTER_AUTH_URL;
    this.jwks = createRemoteJWKSet(
      new URL(`${config.BETTER_AUTH_URL.replace(/\/$/, '')}/auth/jwks`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(PUBLIC, targets) ?? false;
    // Preflight CORS não carrega credenciais — sempre liberado.
    if (isPublic || request.method === 'OPTIONS') return true;

    const token = request.headers.authorization?.match(BEARER_PATTERN)?.[1];
    if (!token) {
      throw new UnauthorizedException(
        'Autenticação necessária. Faça login para acessar.',
      );
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      }));
    } catch {
      throw new UnauthorizedException(
        'Sessão inválida ou expirada. Faça login novamente.',
      );
    }

    const adminOnly =
      this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) ?? false;
    const isMutation = MUTATION_METHODS.includes(request.method);
    const authenticatedRead =
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_READ, targets) ??
      false;
    if (
      (adminOnly || (isMutation && !authenticatedRead)) &&
      payload.role !== 'admin'
    ) {
      throw new ForbiddenException('Operação exclusiva de administradores.');
    }

    const nameClaim = payload.name;
    const emailClaim = payload.email;
    request.user = {
      id: payload.sub ?? '',
      name: typeof nameClaim === 'string' ? nameClaim : '',
      email: typeof emailClaim === 'string' ? emailClaim : '',
      role: typeof payload.role === 'string' ? payload.role : 'user',
    };
    return true;
  }
}
