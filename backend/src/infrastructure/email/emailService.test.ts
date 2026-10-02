/**
 * @file emailService.test.ts
 * @module infrastructure/email
 *
 * EmailService mínimo (F3.3): console | resend | smtp→console.
 * Nunca lanza; devuelve false en fallo.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import EmailService, { getFrontendOrigin } from './EmailService';
import logger from '../logging/logger';

const input = { to: 'laura@example.com', subject: 'Reservation confirmed', text: 'Hola' };

describe('EmailService', () => {
  let service: EmailService;
  const originalEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };

  beforeEach(() => {
    service = new EmailService();
    vi.restoreAllMocks();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.FRONTEND_URL;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllGlobals();
  });

  it('por defecto (console) → true y loguea el email', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    const result = await service.send(input);

    expect(result).toBe(true);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({ provider: 'console', to: input.to, subject: input.subject, body: input.text })
    );
  });

  it('EMAIL_PROVIDER=smtp → degrada a console con warning (una sola vez)', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    expect(await service.send(input)).toBe(true);
    expect(await service.send(input)).toBe(true);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ provider: 'console' }));
  });

  it('EMAIL_PROVIDER=resend sin RESEND_API_KEY → false y warning', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

    const result = await service.send(input);

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('EMAIL_PROVIDER=resend con API key → POST a resend y true', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_123';
    process.env.EMAIL_FROM = 'noreply@test.com';
    process.env.EMAIL_FROM_NAME = 'Demo';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.send(input);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.to).toEqual(['laura@example.com']);
    expect(body.subject).toBe(input.subject);
    expect(body.from).toBe('Demo <noreply@test.com>');
  });

  it('resend responde con error HTTP → false (no lanza)', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_123';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const result = await service.send(input);

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('fetch lanza excepción → false (nunca lanza)', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_123';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(service.send(input)).resolves.toBe(false);
  });

  it('sendVerificationEmail → link /tenant-config?token=… (F4.4a)', async () => {
    process.env.FRONTEND_URL = 'https://app.test/';
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);

    const result = await service.sendVerificationEmail('owner@test.com', 'tok-abc123');

    expect(result).toBe(true);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = infoSpy.mock.calls[0][0] as { to: string; subject: string; body: string };
    expect(logged.to).toBe('owner@test.com');
    expect(logged.subject).toBe('Confirm your email - MultiReservas');
    expect(logged.body).toContain('https://app.test/tenant-config?token=tok-abc123');
    expect(logged.body).toContain('expires in 24 hours');
  });
});

describe('getFrontendOrigin', () => {
  const originalEnv = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('FRONTEND_URL tiene prioridad y quita la barra final', () => {
    process.env.FRONTEND_URL = 'https://app.test/';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    expect(getFrontendOrigin()).toBe('https://app.test');
  });

  it('usa el primer origen de CORS_ORIGIN', () => {
    delete process.env.FRONTEND_URL;
    process.env.CORS_ORIGIN = 'http://localhost:5173,http://otro.test';
    expect(getFrontendOrigin()).toBe('http://localhost:5173');
  });

  it('fallback a localhost:5173', () => {
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGIN;
    expect(getFrontendOrigin()).toBe('http://localhost:5173');
  });
});
