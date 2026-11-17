import { Controller, Get } from '@nestjs/common';
import { AdminOnly } from '../../common/auth/access.decorators.js';
import { OrphanAnchorsService } from './orphan-anchors.service.js';

/**
 * Âncoras órfãs (plataforma RV sem registro no banco). @AdminOnly(): expõe
 * inventário da plataforma + habilita a adoção (POST /anchors exige JWT
 * admin pelo guard global) — diferente do /ar/diagnostics/* (healthcheck
 * de infra, @Public).
 */
@AdminOnly()
@Controller('admin/orphan-anchors')
export class OrphanAnchorsController {
  constructor(private readonly orphans: OrphanAnchorsService) {}

  /** Diff ReactVision − banco: âncoras hospedadas sem pin correspondente. */
  @Get()
  async list() {
    return this.orphans.listOrphans();
  }
}
