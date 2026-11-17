import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { jwt } from 'better-auth/plugins/jwt';
import { expo } from '@better-auth/expo';
import type { ApiEnvironment } from 'shared';
import type { DrizzleDB } from '../../db/database.module.js';
import {
  user,
  session,
  account,
  verification,
  jwks,
} from '../../db/schema.js';

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
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, jwks },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    // Em desenvolvimento, confia na origem do próprio request: o client
    // expo envia como Origin a URL do Metro (IP de LAN que muda com a rede),
    // que de outra forma recebe 403 INVALID_ORIGIN. Em produção, somente a
    // origem da API e as origens explicitamente listadas em CORS_ORIGINS são aceitas.
    trustedOrigins: (request?: Request) => {
      const origins = [
        new URL(config.BETTER_AUTH_URL).origin,
        ...config.CORS_ORIGINS,
      ];
      if (config.NODE_ENV !== 'production' && request) {
        const requestOrigin = request.headers.get('origin');
        if (requestOrigin) origins.push(requestOrigin);
      }
      return [...new Set(origins)];
    },
    ...(config.NODE_ENV === 'production'
      ? {
          advanced: {
            defaultCookieAttributes: {
              sameSite: 'none' as const,
              secure: true,
            },
          },
        }
      : {}),
    plugins: [
      // Plugin expo (SERVER) — ensina o better-auth a ler o header
      // `expo-origin` que o expoClient do app nativo envia no lugar do
      // `Origin` (nativos não mandam Origin). SEM ele: qualquer request COM
      // cookie de sessão válido (assinatura HMAC ok, mesmo sessão revogada/
      // expirada) ativa o CSRF-check → 403 MISSING_OR_NULL_ORIGIN → o
      // re-login fica impossível (lição de device 2026-11-12: sessões
      // revogadas pelo seed do boot dispararam a primeira ocorrência).
      expo(),
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
            name: user.name,
          }),
        },
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
