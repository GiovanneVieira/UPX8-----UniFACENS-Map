import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module.js';
import { ArDiagnosticsController } from './ar-diagnostics.controller.js';
import { ArDiagnosticsService } from './ar-diagnostics.service.js';
import { OrphanAnchorsController } from './orphan-anchors.controller.js';
import { OrphanAnchorsService } from './orphan-anchors.service.js';
import {
  HttpRvCloudAnchorClient,
  RV_CLOUD_ANCHOR_CLIENT,
} from './rv-cloud-anchor.client.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ArDiagnosticsController, OrphanAnchorsController],
  providers: [
    ArDiagnosticsService,
    OrphanAnchorsService,
    { provide: RV_CLOUD_ANCHOR_CLIENT, useClass: HttpRvCloudAnchorClient },
  ],
})
export class ArDiagnosticsModule {}
