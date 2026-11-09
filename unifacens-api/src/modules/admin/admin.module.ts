import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';

@Module({
  controllers: [AdminController],
  providers: [AdminRepository, AdminService],
})
export class AdminModule {}
