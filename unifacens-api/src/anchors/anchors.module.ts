import { Module } from '@nestjs/common';
import { AnchorsController } from './anchors.controller.js';
import { AnchorsService } from './anchors.service.js';
import { StorageModule } from '../modules/storage/storage.module.js';

@Module({
  imports: [StorageModule],
  controllers: [AnchorsController],
  providers: [AnchorsService],
  exports: [AnchorsService],
})
export class AnchorsModule {}
