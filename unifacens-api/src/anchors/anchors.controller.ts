import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  NotFoundException,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AnchorsService } from './anchors.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  createAnchorSchema,
  anchorDetailSchema,
  type Anchor,
  type AnchorDetail,
  type CreateAnchorDto,
} from 'shared';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AdminOnly } from '../common/auth/access.decorators.js';

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

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
  @ApiOperation({ summary: 'Buscar uma âncora específica pelo ID (com imagens)' })
  async getAnchorById(@Param('id') id: string): Promise<AnchorDetail> {
    const anchor = await this.anchorsService.findById(id);
    if (!anchor) {
      throw new NotFoundException(`Âncora com ID ${id} não encontrada`);
    }
    return anchorDetailSchema.parse(anchor);
  }

  @Post()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Cadastrar nova âncora com Cloud Anchor ID gerado pelo ARCore' })
  async createAnchor(
    @Body(new ZodValidationPipe(createAnchorSchema)) dto: CreateAnchorDto,
  ): Promise<Anchor> {
    return this.anchorsService.create(dto);
  }

  @Post(':id/images')
  @AdminOnly()
  @ApiBearerAuth('admin-bearer')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Fazer upload de imagens vinculadas à âncora (máx 5, 5MB cada)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'files', maxCount: MAX_IMAGES }]))
  async uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: { files?: Array<{ buffer: Buffer; mimetype: string; size: number; originalname: string }> },
  ): Promise<{ images: string[] }> {
    const uploaded = files?.files ?? [];
    if (uploaded.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    for (const file of uploaded) {
      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        throw new BadRequestException(
          `Tipo não suportado: ${file.mimetype}. Use JPEG, PNG ou WebP.`,
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `Arquivo ${file.originalname} excede 5MB.`,
        );
      }
    }

    const anchor = await this.anchorsService.findById(id);
    if (!anchor) {
      throw new NotFoundException(`Âncora com ID ${id} não encontrada`);
    }

    const images = await this.anchorsService.addImages(
      id,
      uploaded.map((f) => f.buffer),
      uploaded.map((f) => f.mimetype),
    );

    return { images };
  }

  @Delete(':id')
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Excluir uma âncora do catálogo pelo ID' })
  async deleteAnchor(@Param('id') id: string): Promise<{ success: boolean }> {
    const res = await this.anchorsService.remove(id);
    if (!res.success) {
      throw new NotFoundException(`Âncora com ID ${id} não encontrada para exclusão`);
    }
    return res;
  }
}
