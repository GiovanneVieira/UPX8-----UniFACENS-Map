import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiEnvironmentSchema } from 'shared';
import { createBetterAuth } from '../common/auth/better-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../../../.env.api'), quiet: true });

/**
 * Seed idempotente do administrador inicial (ADMIN_EMAIL/ADMIN_PASSWORD).
 * Usado no start:dev para garantir um admin local em desenvolvimento
 * (decisão D3: autenticação obrigatória também em dev, comportamento prod-like).
 */
async function main() {
  const parsed = apiEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      '[SeedAdmin] Configuração de API inválida:',
      parsed.error.issues.map((i) => i.path.join('.')).join(', '),
    );
    process.exit(1);
  }
  const config = parsed.data;

  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    console.log(
      '[SeedAdmin] ADMIN_EMAIL/ADMIN_PASSWORD ausentes — seed de admin ignorado.',
    );
    return;
  }

  let connectionString =
    config.DATABASE_MIGRATION_URL ||
    config.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5433/unifacens_map';
  const url = new URL(connectionString);
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1';
    connectionString = url.toString();
  }

  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    const db = drizzle({ client: pool });
    const auth = createBetterAuth(config, db);

    try {
      await auth.api.createUser({
        body: {
          email: config.ADMIN_EMAIL,
          password: config.ADMIN_PASSWORD,
          name: 'Administrador',
          role: 'admin',
          data: { emailVerified: true },
        },
      });
      console.log(`[SeedAdmin] ✅ Admin criado: ${config.ADMIN_EMAIL}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exist|duplicate|unique/i.test(message)) {
        console.log(
          `[SeedAdmin] Admin ${config.ADMIN_EMAIL} já existe — nada a fazer.`,
        );
      } else {
        throw err;
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes('seed-admin')) {
  await main();
}
