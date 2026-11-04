import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminOnly } from './access.decorators.js';
import type { AuthenticatedAdmin } from './jwt-admin.guard.js';

@ApiTags('access')
@Controller('access')
export class AccessController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consultar a política de acesso ao catálogo (edição exige admin)',
  })
  policy() {
    // Autenticação é obrigatória para mutations em qualquer ambiente (D3).
    return { requiresTeamAccess: true as const };
  }

  @Get('session')
  @AdminOnly()
  @ApiBearerAuth('admin-bearer')
  @ApiOperation({ summary: 'Validar o JWT de administrador e obter a identidade' })
  @HttpCode(HttpStatus.OK)
  session(@Req() request: Request) {
    const admin = request.admin as AuthenticatedAdmin;
    return {
      canEdit: true as const,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    };
  }
}
