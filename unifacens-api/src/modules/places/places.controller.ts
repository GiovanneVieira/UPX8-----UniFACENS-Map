import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import {
  z,
  createPlaceSchema,
  placesQuerySchema,
  updatePlaceSchema,
  type CreatePlaceDto,
  type PlacesQuery,
  type UpdatePlaceDto,
} from 'shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PlacesService } from './places.service.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(@Inject(PlacesService) private readonly service: PlacesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar locais do campus com busca, categoria e paginação',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  findAll(@Query(new ZodValidationPipe(placesQuerySchema)) query: PlacesQuery) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar os detalhes de um local' })
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({
    summary: 'Cadastrar local (exclusivo de administradores)',
  })
  @ApiBody({
    schema: z.toJSONSchema(createPlaceSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  create(@Body(new ZodValidationPipe(createPlaceSchema)) dto: CreatePlaceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({
    summary: 'Atualizar um local e invalidar sua verificação anterior',
  })
  @ApiBody({
    schema: z.toJSONSchema(updatePlaceSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updatePlaceSchema)) dto: UpdatePlaceDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Excluir um local do catálogo' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
