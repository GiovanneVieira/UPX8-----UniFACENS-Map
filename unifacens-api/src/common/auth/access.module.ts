import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessController } from './access.controller.js';
import { TeamAccessGuard } from './team-access.guard.js';

@Module({
  controllers: [AccessController],
  providers: [
    TeamAccessGuard,
    { provide: APP_GUARD, useExisting: TeamAccessGuard },
  ],
})
export class AccessModule {}
