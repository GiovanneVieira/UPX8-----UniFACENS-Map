import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, emailOTP } from 'better-auth/plugins';
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
import { MailerService } from '../mailer/mailer.service.js';
import { createRedisSecondaryStorage } from './secondary-storage.js';

export const BETTER_AUTH = Symbol('BETTER_AUTH');

/**
 * Instância do better-auth (SSOT de autenticação da API).
 *
 * - Estratégia primária no mobile: JWT (plugin `jwt`) resgatado em
 *   `POST /auth/jwt/token` e enviado como `Authorization: Bearer` —
 *   validado localmente pelo guard contra o JWKS de `/auth/jwks`.
 * - Plugins: `admin` (roles `user`/`admin`; default `user`), `jwt`
 *   (expiração 24h com refresh silencioso via sessão persistida) e
 *   `emailOTP` (OTP 6 dígitos/5min p/ verificação de e-mail e reset de
 *   senha — códigos no Redis via secondaryStorage quando REDIS_URL existe).
 *
 * Nota: NÃO anotar o tipo de retorno manualmente — a inferência preserva
 * os endpoints tipados dos plugins (auth.api.createUser, jwt etc.).
 */
export function createBetterAuth(
  config: ApiEnvironment,
  db: DrizzleDB,
  mailer: MailerService = new MailerService(config),
  /**
   * Testes de integração desabilitam o rate-limit nativo: com o contador no
   * Redis (persistente na suite), os 3 sign-ins/10s tornariam a suíte
   * flaky. Produção mantém os limites padrão (3/60s nos endpoints de OTP).
   */
  options: { disableRateLimit?: boolean } = {},
) {
  return betterAuth({
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/auth',
    ...(options.disableRateLimit
      ? { rateLimit: { enabled: false as const } }
      : {}),
    // OTPs (emailOTP) e rate-limits no Redis quando disponível — sem
    // REDIS_URL, fallback graceful para a `verification` table (Postgres).
    ...(config.REDIS_URL
      ? { secondaryStorage: createRedisSecondaryStorage(config.REDIS_URL) }
      : {}),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, jwks },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Conta nova só entra com e-mail verificado (OTP). Seeds/fixtures
      // criam com emailVerified: true — invariante §13 do AGENTS.md.
      requireEmailVerification: true,
    },
    // Em desenvolvimento, confia na origem do próprio request: o client
    // expo envia como Origin a URL do Metro (IP de LAN que muda com a rede),
    // que de outra forma recebe 403 INVALID_ORIGIN. Em produção, somente a
    // origem da API, as origens HTTP(S) do CORS_ORIGINS e os schemes de app
    // nativo do TRUSTED_APP_ORIGINS são aceitos.
    trustedOrigins: (request?: Request) => {
      const origins = [
        new URL(config.BETTER_AUTH_URL).origin,
        ...config.CORS_ORIGINS,
        // O plugin expo SOBRESCREVE o `origin` do request com o header
        // `expo-origin` (scheme do app, ex.: unifacensclient://) e o
        // formCsrfMiddleware do sign-in valida a origem mesmo sem cookie —
        // sem o scheme aqui, todo login nativo recebe 403 em produção
        // (lição de device 2026-11-18: "Invalid origin: unifacensclient://").
        ...config.TRUSTED_APP_ORIGINS,
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
      // OTP 6 dígitos, TTL 5 min (verificação de e-mail + reset de senha).
      // Rate-limit nativo do better-auth: 3 envios/60s por endpoint.
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        async sendVerificationOTP({ email, otp, type }) {
          await mailer.sendOtpEmail(email, otp, type);
        },
      }),
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
