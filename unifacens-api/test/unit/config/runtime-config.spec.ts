import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '../../../src/config/runtime-config.js';

describe('Variáveis de publicação', () => {
  it('mantém desenvolvimento local sem código e sem credenciais remotas', () => {
    expect(loadApiConfig({ NODE_ENV: 'development' })).toMatchObject({
      PORT: 8000,
      CORS_ORIGINS: [],
    });
  });
  it('recusa produção sem banco e sem código de equipe', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL, TEAM_ACCESS_TOKEN',
    );
  });
  it('valida configuração sem expor credenciais nos erros', () => {
    const secret = 'fixture-secret-never-print';
    let message = '';
    try {
      loadApiConfig({
        NODE_ENV: 'production',
        DATABASE_URL: `invalid://${secret}`,
        TEAM_ACCESS_TOKEN: secret,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secret);
  });
  it('preserva todos os parâmetros SSL fornecidos pelo Neon', () => {
    const url =
      'postgresql://fixture:fixture@ep-example.neon.tech/neondb?sslmode=require&channel_binding=require';
    const config = loadApiConfig({
      NODE_ENV: 'production',
      DATABASE_URL: url,
      TEAM_ACCESS_TOKEN: 'fixture-token-with-at-least-32-characters',
      CORS_ORIGINS: 'https://campus.example.org/, https://outro.example.org',
    });
    expect(config.DATABASE_URL).toBe(url);
    expect(config.CORS_ORIGINS).toEqual([
      'https://campus.example.org',
      'https://outro.example.org',
    ]);
  });
  it.each([
    'https://campus.example.org/caminho',
    'https://usuario:senha@campus.example.org',
    'https://campus.example.org?token=teste',
  ])('recusa CORS com caminho, credenciais ou query: %s', (CORS_ORIGINS) => {
    expect(() => loadApiConfig({ CORS_ORIGINS })).toThrow('CORS_ORIGINS');
  });
});
