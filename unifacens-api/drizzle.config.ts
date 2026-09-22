import { defineConfig } from 'drizzle-kit';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.api') });
dotenv.config();

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  dbUrl = 'postgresql://postgres:postgres@127.0.0.1:5433/unifacens_map';
} else if (dbUrl.includes('@postgres:5432')) {
  // Se executando do host fora do Docker, mapeia postgres:5432 -> 127.0.0.1:5433
  dbUrl = dbUrl.replace('@postgres:5432', '@127.0.0.1:5433');
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
});
