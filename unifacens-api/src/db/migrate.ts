import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../../../.env.api'), quiet: true });

export async function runMigrations(customConnectionString?: string) {
  let client: pg.Client | undefined;
  try {
    let connectionString =
      customConnectionString ||
      process.env.DATABASE_MIGRATION_URL ||
      process.env.DATABASE_URL;
    if (!connectionString) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Conexão não configurada.');
      connectionString =
        'postgresql://postgres:postgres@127.0.0.1:5433/unifacens_map';
    }
    const url = new URL(connectionString);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      connectionString = url.toString();
    }
    console.log('[Migrator] Iniciando conexão para aplicar migrações.');
    client = new pg.Client({ connectionString });
    await client.connect();
    const db = drizzle({ client });
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    console.log('[Migrator] Aplicando migrações da pasta:', migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log('[Migrator] ✅ Migrações aplicadas com sucesso!');
  } catch {
    console.error(
      '[Migrator] Falha na conexão ou nas migrações. Confira a configuração do banco.',
    );
    throw new Error('Não foi possível preparar o banco de dados.');
  } finally {
    await client?.end();
  }
}

// Executa diretamente se invocado como script
if (process.argv[1]?.includes('migrate')) {
  try {
    await runMigrations();
  } catch {
    process.exit(1);
  }
}
