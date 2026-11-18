import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '../../../src/config/runtime-config.js';

describe('Variáveis de publicação', () => {
  it('mantém desenvolvimento local sem código e sem credenciais remotas', () => {
    expect(loadApiConfig({ NODE_ENV: 'development' })).toMatchObject({
      PORT: 8000,
      CORS_ORIGINS: [],
      TRUSTED_APP_ORIGINS: [],
    });
  });
  it('recusa produção sem banco e sem secret do better-auth', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL, BETTER_AUTH_SECRET',
    );
  });
  it('exige SMTP_URL em produção (fail-fast: sem e-mail ninguém verifica conta)', () => {
    expect(() =>
      loadApiConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://fixture:fixture@db:5432/x',
        BETTER_AUTH_SECRET: 'fixture-secret-with-at-least-32-characters',
      }),
    ).toThrow('SMTP_URL');
  });
  it('valida REDIS_URL e SMTP_URL (protocolos e formato)', () => {
    const config = loadApiConfig({
      REDIS_URL: 'redis://redis:6379',
      SMTP_URL: 'smtps://user:pass@smtp.example.org:465',
      SMTP_FROM: 'UniFACENS Map <no-reply@facens.br>',
    });
    expect(config.REDIS_URL).toBe('redis://redis:6379');
    expect(config.SMTP_URL).toBe('smtps://user:pass@smtp.example.org:465');
    expect(() => loadApiConfig({ REDIS_URL: 'http://redis:6379' })).toThrow('REDIS_URL');
    expect(() => loadApiConfig({ SMTP_URL: 'http://smtp:587' })).toThrow('SMTP_URL');
  });
  it('valida configuração sem expor credenciais nos erros', () => {
    const secret = 'fixture-secret-never-print';
    let message = '';
    try {
      loadApiConfig({
        NODE_ENV: 'production',
        DATABASE_URL: `invalid://${secret}`,
        BETTER_AUTH_SECRET: secret,
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
      BETTER_AUTH_SECRET: 'fixture-secret-with-at-least-32-characters',
      SMTP_URL: 'smtp://fixture:fixture@smtp.example.org:587',
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
  it('parseia schemes de app nativo em TRUSTED_APP_ORIGINS (CSV com espaços)', () => {
    const config = loadApiConfig({
      TRUSTED_APP_ORIGINS: 'unifacensclient:// , exp://',
    });
    expect(config.TRUSTED_APP_ORIGINS).toEqual([
      'unifacensclient://',
      'exp://',
    ]);
  });
  it.each([
    'unifacensclient://host',
    'unifacensclient:///caminho',
    'unifacensclient:',
    'unifacensclient',
    'https://app.example.org',
  ])('recusa TRUSTED_APP_ORIGINS fora do formato scheme:// (%s)', (TRUSTED_APP_ORIGINS) => {
    expect(() => loadApiConfig({ TRUSTED_APP_ORIGINS })).toThrow(
      'TRUSTED_APP_ORIGINS',
    );
  });
});
