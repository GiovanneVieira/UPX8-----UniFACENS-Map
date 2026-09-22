import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { AnchorsService } from './anchors.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createAnchorSchema,
  type Anchor,
  type CreateAnchorDto,
} from 'shared';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('anchors')
@Controller('anchors')
export class AnchorsController {
  constructor(private readonly anchorsService: AnchorsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as âncoras na nuvem (Google Cloud Anchors)' })
  async getAnchors(): Promise<Anchor[]> {
    return this.anchorsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar uma âncora específica pelo ID' })
  async getAnchorById(@Param('id') id: string): Promise<Anchor> {
    const anchor = await this.anchorsService.findById(id);
    if (!anchor) {
      throw new NotFoundException(`Âncora com ID ${id} não encontrada`);
    }
    return anchor;
  }

  @Post()
  @ApiOperation({ summary: 'Cadastrar nova âncora com Cloud Anchor ID gerado pelo ARCore' })
  async createAnchor(
    @Body(new ZodValidationPipe(createAnchorSchema)) dto: CreateAnchorDto,
  ): Promise<Anchor> {
    return this.anchorsService.create(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir uma âncora do catálogo pelo ID' })
  async deleteAnchor(@Param('id') id: string): Promise<{ success: boolean }> {
    const res = await this.anchorsService.remove(id);
    if (!res.success) {
      throw new NotFoundException(`Âncora com ID ${id} não encontrada para exclusão`);
    }
    return res;
  }
}
