import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/access.decorators.js';
import { ArDiagnosticsService } from './ar-diagnostics.service.js';

/**
 * Diagnóstico de Cloud Anchors. @Public(): leitura de diagnóstico de
 * INFRA (keypoints/resolves/GPS tag — sem dado de usuário), mesma natureza
 * do healthcheck; permite testes rápidos por curl sem JWT.
 */
@Public()
@Controller('ar/diagnostics')
export class ArDiagnosticsController {
  constructor(private readonly diagnostics: ArDiagnosticsService) {}

  /**
   * Painel de qualidade: pins do banco cruzados com a API ReactVision
   * (keypoints, resolves, confiança, GPS tag) + classificação de provider
   * por cloudAnchorId (reactvision/google/synthetic/seed).
   */
  @Get('cloud-anchors')
  async cloudAnchors() {
    return this.diagnostics.cloudAnchorsPanel();
  }
}
