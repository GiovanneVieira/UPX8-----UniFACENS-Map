import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(customConnectionString?: string) {
  let connectionString = customConnectionString || process.env.DATABASE_URL;

  if (!connectionString) {
    connectionString = 'postgresql://postgres:postgres@127.0.0.1:5433/unifacens_map';
  } else if (connectionString.includes('localhost')) {
    connectionString = connectionString.replace('localhost', '127.0.0.1');
  }

  console.log('[Migrator] Conectando ao banco de dados:', connectionString);
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const db = drizzle({ client });
    const migrationsFolder = path.resolve(__dirname, '../../drizzle');
    console.log('[Migrator] Aplicando migrações da pasta:', migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log('[Migrator] ✅ Migrações aplicadas com sucesso!');
  } catch (err) {
    console.error('[Migrator] ❌ Erro ao executar migrações:', err);
    throw err;
  } finally {
    await client.end();
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
