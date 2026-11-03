import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { jwt } from 'better-auth/plugins/jwt';
import type { ApiEnvironment } from 'shared';
import type { DrizzleDB } from '../../db/database.module.js';

export const BETTER_AUTH = Symbol('BETTER_AUTH');

/**
 * Instância do better-auth (SSOT de autenticação da API).
 *
 * - Estratégia primária no mobile: JWT (plugin `jwt`) resgatado em
 *   `POST /auth/jwt/token` e enviado como `Authorization: Bearer` —
 *   validado localmente pelo guard contra o JWKS de `/auth/jwks`.
 * - Plugins: `admin` (roles `user`/`admin`; default `user`) e `jwt`
 *   (expiração 24h com refresh silencioso via sessão persistida).
 *
 * Nota: NÃO anotar o tipo de retorno manualmente — a inferência preserva
 * os endpoints tipados dos plugins (auth.api.createUser, jwt etc.).
 */
export function createBetterAuth(
  config: ApiEnvironment,
  db: DrizzleDB,
) {
  return betterAuth({
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/auth',
    database: drizzleAdapter(db, { provider: 'pg' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    trustedOrigins: config.CORS_ORIGINS,
    plugins: [
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
      jwt({
        jwt: {
          issuer: config.BETTER_AUTH_URL,
          audience: config.BETTER_AUTH_URL,
          expirationTime: '24h',
          definePayload: ({ user }) => ({
            role: (user as { role?: string }).role ?? 'user',
            email: user.email,
          }),
        },
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
