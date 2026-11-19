import { createClient, type RedisClientType } from 'redis';
import type { SecondaryStorage } from 'better-auth';

/**
 * Adaptador `secondaryStorage` do better-auth sobre Redis (node-redis),
 * seguindo o pattern oficial da documentação (concepts/database).
 *
 * Com ele configurado, os OTPs do plugin emailOTP e os rate-limits passam
 * a viver no Redis (TTL nativo) em vez da `verification` table do Postgres.
 *
 * ⚠️ Conexão LAZY (lição de device 2026-11-18): conectar no factory mantinha
 * o event loop vivo para sempre e TRAVAVA scripts one-shot (migrate/seed do
 * start:dev ficavam pendurados no `&&` — o `nest start` nunca subia). A
 * conexão só abre na PRIMEIRA operação de OTP; scripts que nunca usam OTP
 * nunca conectam.
 *
 * Erros de conectividade são logados e NÃO derrubam a API (a operação de
 * OTP falha até o Redis voltar — o usuário re-solicita o código).
 */
export function createRedisSecondaryStorage(url: string): SecondaryStorage {
  const client: RedisClientType = createClient({ url });
  let connectPromise: Promise<void> | null = null;

  client.on('error', (error) => {
    // eslint-disable-next-line no-console -- telemetria de infra visível no log da API
    console.error(`[secondary-storage:redis] ${error.message}`);
  });

  function ensureConnected(): Promise<void> {
    if (client.isOpen) return Promise.resolve();
    if (!connectPromise) {
      connectPromise = client
        .connect()
        .then(() => undefined)
        .catch((error: Error) => {
          // Permite retry na próxima operação (Redis pode voltar).
          connectPromise = null;
          console.error(
            `[secondary-storage:redis] falha ao conectar (${url.replace(/\/\/.*@/, '//***@')}): ${error.message}`,
          );
          throw error;
        });
    }
    return connectPromise;
  }

  return {
    async get(key) {
      await ensureConnected();
      return client.get(key);
    },
    async getAndDelete(key) {
      await ensureConnected();
      return client.getDel(key);
    },
    async increment(key, ttl) {
      if (!Number.isInteger(ttl) || ttl <= 0) {
        throw new TypeError('Redis increment TTL must be a positive integer');
      }
      await ensureConnected();
      // incr + expire NX atômicos: a primeira incrementação define o TTL.
      const replies = await client
        .multi()
        .incr(key)
        .expire(key, ttl, 'NX')
        .exec();
      return Number(replies?.[0] ?? 0);
    },
    async set(key, value, ttl) {
      await ensureConnected();
      if (ttl) await client.set(key, value, { EX: ttl });
      else await client.set(key, value);
    },
    async delete(key) {
      await ensureConnected();
      await client.del(key);
    },
  };
}
