import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../db/database.module.js';
import { ArDiagnosticsController } from './ar-diagnostics.controller.js';
import { ArDiagnosticsService } from './ar-diagnostics.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ArDiagnosticsController],
  providers: [ArDiagnosticsService],
})
export class ArDiagnosticsModule {}
