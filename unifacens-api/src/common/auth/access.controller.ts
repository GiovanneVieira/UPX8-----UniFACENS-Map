import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminOnly, Public } from './access.decorators.js';
import type { AuthenticatedUser } from './jwt-admin.guard.js';

@ApiTags('access')
@Controller('access')
export class AccessController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consultar a política de acesso ao catálogo (rota pública)',
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
    const user = request.user as AuthenticatedUser;
    return {
      canEdit: true as const,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
