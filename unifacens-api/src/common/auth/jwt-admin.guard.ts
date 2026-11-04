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
import { ADMIN_ONLY, PUBLIC_CONTRIBUTION } from './access.decorators.js';

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  role: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AuthenticatedAdmin;
  }
}

const BEARER_PATTERN = /^Bearer (\S+)$/;
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Guard global de autorização (substitui o TeamAccessGuard).
 *
 * Regras (decisões D2–D4 do plano de auth):
 * - Leituras (GET/HEAD/OPTIONS) e `@PublicContribution()` permanecem abertas;
 * - Toda mutation exige `Authorization: Bearer <JWT>` válido — também em
 *   desenvolvimento (D3: comportamento prod-like, sem bypass);
 * - O JWT é emitido pelo plugin `jwt` do better-auth e validado localmente
 *   contra o JWKS de `/auth/jwks` (jose com cache e rotação automática);
 * - Apenas `role === 'admin'` pode mutar (D4: login aberto a todos, edição
 *   exclusiva da equipe);
 * - `@AdminOnly()` exige admin mesmo em rotas de leitura.
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
    const adminOnly =
      this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) ?? false;
    const publicContribution = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_CONTRIBUTION,
      targets,
    );

    if (
      !adminOnly &&
      (SAFE_METHODS.includes(request.method) || publicContribution)
    ) {
      return true;
    }

    const token = request.headers.authorization?.match(BEARER_PATTERN)?.[1];
    if (!token) {
      throw new UnauthorizedException(
        'Autenticação necessária. Faça login com uma conta de administrador.',
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

    if (payload.role !== 'admin') {
      throw new ForbiddenException('Operação exclusiva de administradores.');
    }

    const nameClaim = payload.name;
    const emailClaim = payload.email;
    request.admin = {
      id: payload.sub ?? '',
      name: typeof nameClaim === 'string' ? nameClaim : '',
      email: typeof emailClaim === 'string' ? emailClaim : '',
      role: payload.role,
    };
    return true;
  }
}
