import nodemailer, { type Transporter } from 'nodemailer';
import type { ApiEnvironment } from 'shared';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type OtpEmailType =
  | 'email-verification'
  | 'sign-in'
  | 'forget-password'
  | 'change-email';

const OTP_VALIDITY_MINUTES = 5;

/**
 * Serviço de envio de e-mail (nodemailer) para os OTPs do better-auth.
 *
 * - `SMTP_URL` configurado → transporte real (587 STARTTLS / 465 TLS);
 * - sem `SMTP_URL` (dev) → **console fallback**: o corpo é logado no
 *   servidor e o fluxo de OTP continua funcionando para testes locais
 *   (combinado em plano: "dev loga OTP no console da API").
 * - Em produção o schema de config EXIGE SMTP_URL (fail-fast no boot):
 *   com requireEmailVerification ativo, sem e-mail ninguém verifica conta.
 *
 * Instanciável direto (mesma forma de createBetterAuth — sem módulo Nest)
 * para facilitar a injeção em factories e testes.
 */
export class MailerService {
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ApiEnvironment) {
    this.transporter = config.SMTP_URL
      ? nodemailer.createTransport(config.SMTP_URL)
      : null;
  }

  /** true quando há transporte SMTP real (false = console fallback). */
  get enabled(): boolean {
    return this.transporter !== null;
  }

  async sendMail(input: SendMailInput): Promise<void> {
    if (!this.transporter) {
      // eslint-disable-next-line no-console -- dev fallback deliberado
      console.log(
        `[mailer:console] → ${input.to} | ${input.subject}\n${input.text}`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.config.SMTP_FROM ?? 'no-reply@facens.br',
      ...input,
    });
  }

  /**
   * E-mail com o código OTP de 6 dígitos (verificação de e-mail ou
   * redefinição de senha). Resposta neutra por design — o corpo nunca
   * confirma existência de conta além do próprio destinatário.
   */
  async sendOtpEmail(to: string, otp: string, type: OtpEmailType): Promise<void> {
    const isReset = type === 'forget-password';
    const purpose = isReset ? 'redefinir sua senha' : 'verificar seu e-mail';
    const subject = isReset
      ? 'Código para redefinir sua senha · UniFACENS Map'
      : 'Código de verificação · UniFACENS Map';
    const text = [
      `Seu código para ${purpose} é: ${otp}`,
      `Ele expira em ${OTP_VALIDITY_MINUTES} minutos.`,
      'Se você não solicitou este código, ignore este e-mail.',
    ].join('\n');
    const html = [
      `<p>Seu código para <strong>${purpose}</strong> é:</p>`,
      `<p style="font-size:28px;letter-spacing:8px;font-weight:700">${otp}</p>`,
      `<p>Expira em ${OTP_VALIDITY_MINUTES} minutos. Se você não solicitou, ignore este e-mail.</p>`,
    ].join('\n');
    await this.sendMail({ to, subject, text, html });
  }
}
