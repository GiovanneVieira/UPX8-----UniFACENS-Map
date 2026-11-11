import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from 'shared';
import { AdminOnly } from '../../common/auth/access.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar categorias com o modelo 3D vinculado (ordem de exibição)',
  })
  async list() {
    return this.service.list();
  }

  @Post('/admin')
  @AdminOnly()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Criar categoria (opcionalmente vinculando um modelo)' })
  async create(
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return this.service.create(dto);
  }

  @Patch('/admin/:id')
  @AdminOnly()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Atualizar categoria (label, slug, ordem, modelo)' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete('/admin/:id')
  @AdminOnly()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({
    summary: 'Excluir categoria (409 quando usada por locais ou pontos AR)',
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
