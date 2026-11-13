import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiQuery,
  type SchemaObject,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  z,
  importNavigationNetworkSchema,
  navigationNetworkParamsSchema,
  navigationNetworksQuerySchema,
  navigationRequestSchema,
  publishNavigationNetworkSchema,
  type ImportNavigationNetworkDto,
  type NavigationNetworkParams,
  type NavigationNetworksQuery,
  type NavigationRequest,
  type PublishNavigationNetworkDto,
  navigationAnchorRequestSchema,
  type NavigationAnchorRequest,
} from 'shared';
import {
  AdminOnly,
  AuthenticatedRead,
} from '../../common/auth/access.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { NavigationService } from './navigation.service.js';

@ApiTags('navigation')
@ApiBearerAuth('admin-bearer')
@Controller('navigation/networks')
export class NavigationController {
  constructor(
    @Inject(NavigationService) private readonly service: NavigationService,
  ) {}

  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOperation({
    summary: 'Listar versões da rede; usuários comuns veem somente publicadas',
  })
  list(
    @Query(new ZodValidationPipe(navigationNetworksQuerySchema))
    query: NavigationNetworksQuery,
    @Req() request: Request,
  ) {
    return this.service.list(query, request.user?.role === 'admin');
  }

  @Post()
  @AdminOnly()
  @ApiOperation({
    summary:
      'Importar versão imutável em rascunho, com nós e trechos em transação',
  })
  @ApiBody({
    schema: z.toJSONSchema(importNavigationNetworkSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  importVersion(
    @Body(new ZodValidationPipe(importNavigationNetworkSchema))
    dto: ImportNavigationNetworkDto,
    @Req() request: Request,
  ) {
    return this.service.importVersion(dto, request.user!.id);
  }

  @Get(':networkId/versions/:version')
  @ApiParam({ name: 'networkId', description: 'Identificador da rede' })
  @ApiParam({ name: 'version', description: 'Versão imutável da rede' })
  @ApiOperation({
    summary: 'Consultar nós, trechos e versão; rascunho restrito a admin',
  })
  getVersion(
    @Param(new ZodValidationPipe(navigationNetworkParamsSchema))
    params: NavigationNetworkParams,
    @Req() request: Request,
  ) {
    return this.service.getVersion(params, request.user?.role === 'admin');
  }

  @Post(':networkId/versions/:version/publish')
  @ApiParam({ name: 'networkId', description: 'Identificador da rede' })
  @ApiParam({ name: 'version', description: 'Versão imutável da rede' })
  @AdminOnly()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Publicar versão; levantamento exige revisão explícita com evidências',
  })
  @ApiBody({
    schema: z.toJSONSchema(publishNavigationNetworkSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  publish(
    @Param(new ZodValidationPipe(navigationNetworkParamsSchema))
    params: NavigationNetworkParams,
    @Body(new ZodValidationPipe(publishNavigationNetworkSchema))
    dto: PublishNavigationNetworkDto,
    @Req() request: Request,
  ) {
    return this.service.publish(params, dto, request.user!.id);
  }

  @Post(':networkId/versions/:version/route-by-anchors')
  @AuthenticatedRead()
  @HttpCode(200)
  @ApiParam({ name: 'networkId', description: 'Identificador da rede' })
  @ApiParam({ name: 'version', description: 'Versão publicada ativa' })
  @ApiOperation({
    summary: 'Calcular percurso acessível para um ponto AR por sua identidade',
  })
  @ApiBody({
    schema: z.toJSONSchema(navigationAnchorRequestSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  routeByAnchors(
    @Param(new ZodValidationPipe(navigationNetworkParamsSchema))
    params: NavigationNetworkParams,
    @Body(new ZodValidationPipe(navigationAnchorRequestSchema))
    dto: NavigationAnchorRequest,
    @Req() request: Request,
  ) {
    return this.service.routeByAnchors(
      params,
      dto,
      request.user?.role === 'admin',
    );
  }

  @Post(':networkId/versions/:version/route')
  @ApiParam({ name: 'networkId', description: 'Identificador da rede' })
  @ApiParam({ name: 'version', description: 'Versão publicada ativa' })
  @AuthenticatedRead()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Calcular percurso por nó para qualquer usuário autenticado, sem alterar a rede',
  })
  @ApiBody({
    schema: z.toJSONSchema(navigationRequestSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  route(
    @Param(new ZodValidationPipe(navigationNetworkParamsSchema))
    params: NavigationNetworkParams,
    @Body(new ZodValidationPipe(navigationRequestSchema))
    dto: NavigationRequest,
    @Req() request: Request,
  ) {
    return this.service.route(params, dto, request.user?.role === 'admin');
  }
}
