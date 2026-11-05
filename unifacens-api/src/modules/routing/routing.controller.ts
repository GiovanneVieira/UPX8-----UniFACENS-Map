import { Controller, Post, Body, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { RouteRequest, RouteResponse } from 'shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { routeRequestSchema } from 'shared';
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
}
