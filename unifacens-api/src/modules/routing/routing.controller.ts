import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException, ConflictException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import type { RouteRequest, RouteResponse } from 'shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { routeRequestSchema, navigationDraftRequestSchema, type NavigationDraftRequest } from 'shared';
import { AdminOnly } from '../../common/auth/access.decorators.js';
import { RoutingService } from './routing.service.js';

@ApiTags('routing')
@Controller('routing')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Post('route')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({
    summary: 'Calcular rota pedestrian (A* sobre grid caminhável do campus)',
  })
  async route(
    @Body(new ZodValidationPipe(routeRequestSchema)) request: RouteRequest,
  ): Promise<RouteResponse> {
    try {
      return await this.routingService.route(request);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Não foi possível calcular a rota.',
      );
    }
  }

  @Post('navigation/drafts')
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({
    summary:
      'Gerar MALHA EM RASCUNHO da rede de navegação a partir da grade caminhável (geometria automática; atributos de acessibilidade ficam desconhecidos para o levantamento)',
  })
  async generateNavigationDraft(
    @Body(new ZodValidationPipe(navigationDraftRequestSchema)) dto: NavigationDraftRequest,
    @Req() request: Request,
  ) {
    try {
      return await this.routingService.generateNavigationDraft(
        dto,
        request.user?.id ?? '',
      );
    } catch (err) {
      // 409 (versão já cadastrada) e 400 (âncoras/validação) preservam a
      // mensagem real — o catch-all genérico virava tudo 400 e escondia a
      // causa (retry com a mesma versão parecia "erro misterioso").
      if (err instanceof BadRequestException || err instanceof ConflictException) {
        throw err;
      }
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Não foi possível gerar a malha.',
      );
    }
  }
}
