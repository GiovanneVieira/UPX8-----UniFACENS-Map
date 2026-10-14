import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiEnvironment } from 'shared';
import { API_CONFIG } from '../../config/runtime-config.js';
import { TeamOnly } from './access.decorators.js';

@ApiTags('access')
@Controller('access')
export class AccessController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiEnvironment) {}

  @Get()
  @ApiOperation({ summary: 'Consultar a política de acesso ao catálogo' })
  policy() {
    return {
      requiresTeamAccess:
        this.config.NODE_ENV === 'production' ||
        Boolean(this.config.TEAM_ACCESS_TOKEN),
    };
  }

  @Get('team')
  @TeamOnly()
  @ApiBearerAuth('team-access')
  @ApiOperation({ summary: 'Validar o código de acesso da equipe' })
  verify() {
    return { canEdit: true as const };
  }
}
