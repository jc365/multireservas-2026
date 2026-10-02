/**
 * @file EmailService.ts
 * @module infrastructure/email
 *
 * Proveedor de email mínimo del backend (F3.3). Réplica de la
 * configuración del EmailClient del orquestador (console | resend |
 * smtp) pero sin dependencias nuevas:
 * - `console` (default): loguea el email completo por pino.
 * - `resend`: POST a api.resend.com con fetch nativo (RESEND_API_KEY).
 * - `smtp`: NO soportado en backend v1 → degrada a console con warning
 *   (deuda F4; el orquestador sí tiene smtp).
 *
 * Nunca lanza: devuelve `false` en fallo y loguea el error.
 */

import logger from '../logging/logger';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export function getFrontendOrigin(): string {
  const explicit = process.env.FRONTEND_URL;
  if (explicit && explicit.trim().length > 0) return explicit.replace(/\/$/, '');
  const cors = process.env.CORS_ORIGIN;
  if (cors && cors.trim().length > 0) return cors.split(',')[0].trim().replace(/\/$/, '');
  return 'http://localhost:5173';
}

export default class EmailService {
  private smtpWarned = false;

  async send(input: SendEmailInput): Promise<boolean> {
    try {
      const provider = (process.env.EMAIL_PROVIDER || 'console').toLowerCase();

      if (provider === 'resend') {
        return await this.sendResend(input);
      }

      if (provider === 'smtp' && !this.smtpWarned) {
        this.smtpWarned = true;
        logger.warn(
          'EmailService: provider smtp no soportado en backend v1 — usando console (deuda F4)'
        );
      }

      return this.sendConsole(input);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error }, 'EmailService: send failed');
      return false;
    }
  }

  /**
   * Email de verificación de registro (F4.4a). El link apunta al
   * frontend `/tenant-config?token=<token>`; el token solo viaja en
   * la URL del email (nunca por la API). Nunca lanza (delega en
   * `send`).
   */
  async sendVerificationEmail(to: string, token: string): Promise<boolean> {
    const link = `${getFrontendOrigin()}/tenant-config?token=${encodeURIComponent(token)}`;
    const text = [
      'Welcome to MultiReservas!',
      '',
      'Confirm your email address to activate your business configuration:',
      link,
      '',
      'This link expires in 24 hours.',
      'If you did not create this account, you can ignore this email.',
    ].join('\n');
    return this.send({ to, subject: 'Confirm your email - MultiReservas', text });
  }

  private sendConsole(input: SendEmailInput): boolean {
    logger.info(
      {
        provider: 'console',
        to: input.to,
        from: process.env.EMAIL_FROM || 'noreply@events-starter.local',
        subject: input.subject,
        body: input.text,
      },
      'EmailService[console]: email enviado (log)'
    );
    return true;
  }

  private async sendResend(input: SendEmailInput): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.warn('EmailService: EMAIL_PROVIDER=resend sin RESEND_API_KEY — no se envía');
      return false;
    }

    const fromName = process.env.EMAIL_FROM_NAME || 'MultiReservas';
    const from = process.env.EMAIL_FROM || 'noreply@events-starter.local';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${from}>`,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'EmailService[resend]: fallo en el envío');
      return false;
    }
    logger.info({ to: input.to, subject: input.subject }, 'EmailService[resend]: email enviado');
    return true;
  }
}

export const emailService = new EmailService();
