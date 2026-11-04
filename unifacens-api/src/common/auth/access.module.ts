import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { API_CONFIG } from '../../config/runtime-config.js';
import { DRIZZLE, type DrizzleDB } from '../../db/database.module.js';
import type { ApiEnvironment } from 'shared';
import { AccessController } from './access.controller.js';
import { JwtAdminGuard } from './jwt-admin.guard.js';
import { BETTER_AUTH, createBetterAuth } from './better-auth.js';

@Module({
  controllers: [AccessController],
  providers: [
    {
      provide: BETTER_AUTH,
      useFactory: (db: DrizzleDB, config: ApiEnvironment) =>
        createBetterAuth(config, db),
      inject: [DRIZZLE, API_CONFIG],
    },
    JwtAdminGuard,
    { provide: APP_GUARD, useExisting: JwtAdminGuard },
  ],
  exports: [BETTER_AUTH],
})
export class AccessModule {}
