import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailerService } from '../../../src/common/mailer/mailer.service.js';
import { apiEnvironmentSchema, type ApiEnvironment } from 'shared';

function devConfig(overrides: Record<string, string> = {}): ApiEnvironment {
  return apiEnvironmentSchema.parse({ NODE_ENV: 'development', ...overrides });
}

describe('MailerService (dev fallback sem SMTP_URL)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem SMTP_URL: disabled e loga o OTP no console sem lançar', async () => {
    const service = new MailerService(devConfig());
    expect(service.enabled).toBe(false);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(
      service.sendOtpEmail('dev@facens.dev', '123456', 'email-verification'),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    const output = log.mock.calls[0]?.join(' ');
    expect(output).toContain('dev@facens.dev');
    expect(output).toContain('123456');
    expect(output).toContain('verificar seu e-mail');
  });

  it('OTP de reset usa o assunto/tom de redefinição', async () => {
    const service = new MailerService(devConfig());
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await service.sendOtpEmail('dev@facens.dev', '654321', 'forget-password');
    const output = log.mock.calls[0]?.join(' ');
    expect(output).toContain('redefinir sua senha');
    expect(output).toContain('654321');
  });

  it('com SMTP_URL: habilita transporte real (sem envio no unit test)', () => {
    const service = new MailerService(
      devConfig({ SMTP_URL: 'smtp://user:pass@smtp.example.org:587' }),
    );
    expect(service.enabled).toBe(true);
  });
});
