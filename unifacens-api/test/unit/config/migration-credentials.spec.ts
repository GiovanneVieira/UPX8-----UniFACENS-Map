import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../../../src/db/migrate.js';

describe('Migração: proteção de credenciais', () => {
  afterEach(() => vi.restoreAllMocks());
  it('não inclui conexão nem senha no erro de uma URL malformada', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'fixture-password-must-not-appear';
    await expect(
      runMigrations(`psql 'postgresql://fixture:${secret}@example.org/db'`),
    ).rejects.toThrow('Não foi possível preparar o banco de dados.');
    expect(
      JSON.stringify([...log.mock.calls, ...errorLog.mock.calls]),
    ).not.toContain(secret);
  });
});
