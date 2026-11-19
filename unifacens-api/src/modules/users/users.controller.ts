import {
  Controller,
  Delete,
  Post,
  Req,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthenticatedRead } from '../../common/auth/access.decorators.js';
import { UsersService } from './users.service.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Self-service do usuário autenticado (qualquer role — não exige admin).
 * O id vem do JWT validado pelo guard (`request.user.id`).
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('me/avatar')
  @AuthenticatedRead()
  @ApiBearerAuth('admin-bearer')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Enviar foto de perfil (câmera ou biblioteca)' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }),
  )
  async uploadAvatar(
    @Req() request: Request,
    @UploadedFile() file?: MulterFile,
  ): Promise<{ image: string }> {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo não suportado: ${file.mimetype}. Use JPEG, PNG ou WebP.`,
      );
    }
    const { image } = await this.usersService.setAvatar(
      request.user?.id ?? '',
      file.buffer,
      file.mimetype,
    );
    return { image: image ?? '' };
  }

  @Delete('me/avatar')
  @AuthenticatedRead()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Remover a foto de perfil' })
  async deleteAvatar(@Req() request: Request): Promise<{ image: string | null }> {
    return this.usersService.removeAvatar(request.user?.id ?? '');
  }
}
