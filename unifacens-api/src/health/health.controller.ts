import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type pg from 'pg';
import { Public } from '../common/auth/access.decorators.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject('PG_POOL') private readonly pool: pg.Pool) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Verificar disponibilidade da API e do banco' })
  async check() {
    try {
      await this.pool.query('SELECT 1 FROM places LIMIT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível.');
    }
  }
}
