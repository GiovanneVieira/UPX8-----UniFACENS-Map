import {
  Global,
  Inject,
  Module,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { runMigrations } from './migrate.js';
import { API_CONFIG } from '../config/runtime-config.js';
import type { ApiEnvironment } from 'shared';

export const DRIZZLE = Symbol('DRIZZLE');
export type DrizzleDB = NodePgDatabase;

const poolProvider = {
  provide: 'PG_POOL',
  useFactory: (config: ApiEnvironment) => {
    const pool = new pg.Pool({
      connectionString:
        config.DATABASE_URL ||
        'postgresql://postgres:postgres@postgres:5432/unifacens_map',
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    return pool;
  },
  inject: [API_CONFIG],
};

const drizzleProvider = {
  provide: DRIZZLE,
  useFactory: (pool: pg.Pool) => {
    return drizzle({ client: pool });
  },
  inject: ['PG_POOL'],
};

@Global()
@Module({
  providers: [poolProvider, drizzleProvider],
  exports: [DRIZZLE, 'PG_POOL'],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject('PG_POOL') private readonly pool: pg.Pool,
    @Inject(API_CONFIG) private readonly config: ApiEnvironment,
  ) {}
  async onModuleInit() {
    await runMigrations(
      this.config.DATABASE_MIGRATION_URL || this.config.DATABASE_URL,
    );
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
