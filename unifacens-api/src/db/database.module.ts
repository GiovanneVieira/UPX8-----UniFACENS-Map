import { Global, Module, OnModuleInit } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { runMigrations } from './migrate.js';

export const DRIZZLE = Symbol('DRIZZLE');
export type DrizzleDB = NodePgDatabase;

const poolProvider = {
  provide: 'PG_POOL',
  useFactory: () => {
    const pool = new pg.Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@postgres:5432/unifacens_map',
    });
    return pool;
  },
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
export class DatabaseModule implements OnModuleInit {
  async onModuleInit() {
    try {
      await runMigrations();
    } catch (err) {
      console.error('[DatabaseModule] Erro ao executar migrações automáticas:', err);
    }
  }
}

