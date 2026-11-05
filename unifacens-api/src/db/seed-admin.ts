import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from 'better-auth/crypto';
import { apiEnvironmentSchema } from 'shared';
import { createBetterAuth } from '../common/auth/better-auth.js';
import { user as userTable, account as accountTable, session as sessionTable } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../../../.env.api'), quiet: true });

/**
 * Seed UPSERT do administrador inicial (ADMIN_EMAIL/ADMIN_PASSWORD).
 *
 * - Admin NÃO existe → cria com role admin via auth.api.createUser.
 * - Admin JÁ existe → **sincroniza a senha** com ADMIN_PASSWORD do .env.api
 *   (hash scrypt via `hashPassword` do better-auth) e **revoga as sessões
 *   ativas** na tabela session.
 *
 * Com isso, o `.env.api` é a fonte de verdade da senha de dev em qualquer
 * `docker compose up` / restart (C0/M1 do plano de navegação AR).
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
      if (!/already exist|duplicate|unique/i.test(message)) {
        throw err;
      }

      // Admin já existe: sincroniza a senha com a env (upsert de senha).
      const [existingUser] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.email, config.ADMIN_EMAIL))
        .limit(1);

      if (!existingUser) {
        console.warn(
          '[SeedAdmin] ⚠️ Conflito de e-mail mas usuário não encontrado — verifique manualmente.',
        );
        return;
      }
      const userId = existingUser.id;

      // Hash scrypt (mesmo algoritmo/formato do better-auth: salt:hash hex).
      const passwordHash = await hashPassword(config.ADMIN_PASSWORD);

      // Atualiza o hash na account credential (ou cria se não existir).
      const [credentialAccount] = await db
        .select({ id: accountTable.id })
        .from(accountTable)
        .where(
          and(
            eq(accountTable.userId, userId),
            eq(accountTable.providerId, 'credential'),
          ),
        )
        .limit(1);

      if (credentialAccount) {
        await db
          .update(accountTable)
          .set({ password: passwordHash, updatedAt: new Date() })
          .where(eq(accountTable.id, credentialAccount.id));
      } else {
        await db.insert(accountTable).values({
          id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          accountId: userId,
          providerId: 'credential',
          userId,
          password: passwordHash,
        });
      }

      // Revoga sessões ativas (segurança: senha antiga não deve manter acesso).
      await db.delete(sessionTable).where(eq(sessionTable.userId, userId));

      console.log(
        `[SeedAdmin] ✅ Admin ${config.ADMIN_EMAIL} já existia — senha sincronizada com .env.api (sessões revogadas).`,
      );
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes('seed-admin')) {
  await main();
}
