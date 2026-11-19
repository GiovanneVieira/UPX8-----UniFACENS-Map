import { Module } from '@nestjs/common';
import { NavigationController } from './navigation.controller.js';
import { NavigationRepository } from './navigation.repository.js';
import { NavigationService } from './navigation.service.js';

@Module({
  controllers: [NavigationController],
  providers: [NavigationService, NavigationRepository],
  exports: [NavigationService],
})
export class NavigationModule {}
