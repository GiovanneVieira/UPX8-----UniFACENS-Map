import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { ApiEnvironment } from 'shared';
import { API_CONFIG } from '../../config/runtime-config.js';
import { PUBLIC_CONTRIBUTION, TEAM_ONLY } from './access.decorators.js';

@Injectable()
export class TeamAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_CONFIG) private readonly config: ApiEnvironment,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const targets = [context.getHandler(), context.getClass()];
    const teamOnly = this.reflector.getAllAndOverride<boolean>(
      TEAM_ONLY,
      targets,
    );
    const publicContribution = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_CONTRIBUTION,
      targets,
    );
    if (
      !teamOnly &&
      (['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
        publicContribution)
    )
      return true;
    const expected = this.config.TEAM_ACCESS_TOKEN;
    if (!expected && this.config.NODE_ENV !== 'production') return true;
    const provided =
      request.headers.authorization?.match(/^Bearer (\S{1,512})$/)?.[1];
    if (
      expected &&
      provided &&
      timingSafeEqual(this.hash(expected), this.hash(provided))
    )
      return true;
    throw new UnauthorizedException(
      'Informe um código válido de acesso da equipe.',
    );
  }

  private hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
