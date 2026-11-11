import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MODEL_UPLOAD_LIMIT_BYTES } from 'shared';
import { AdminOnly } from '../../common/auth/access.decorators.js';
import { ModelsService } from './models.service.js';

@ApiTags('models')
@ApiBearerAuth('admin-bearer')
@AdminOnly()
@Controller('admin/models')
export class ModelsController {
  constructor(private readonly service: ModelsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Enviar modelo 3D (.glb/.gltf/.obj/.vrx — FBX não é aceito, exporte GLB)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MODEL_UPLOAD_LIMIT_BYTES, files: 1 },
    }),
  )
  async upload(
    @UploadedFile()
    file?: { buffer: Buffer; originalname: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.service.upload(file);
  }

  @Get()
  @ApiOperation({ summary: 'Listar modelos com a categoria vinculada' })
  async list() {
    return this.service.list();
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Excluir modelo (409 quando vinculado a alguma categoria)',
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
