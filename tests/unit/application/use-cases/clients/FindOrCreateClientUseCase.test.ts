/**
 * @file FindOrCreateClientUseCase.test.ts
 * @module tests/unit/application/use-cases/clients
 *
 * Client interno (F3.3): búsqueda por phone con fallback a email,
 * creación, visitCount/lastVisit y dataExpiresAt por retención.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import FindOrCreateClientUseCase, {
  computeDataExpiresAt,
} from '../../../../../backend/src/application/use-cases/clients/FindOrCreateClientUseCase';
import Client from '../../../../../backend/src/domain/entities/Client';
import type IClientRepository from '../../../../../backend/src/application/interfaces/IClientRepository';
import type ITenantRepository from '../../../../../backend/src/application/interfaces/ITenantRepository';
import type { TenantSettingsRecord } from '../../../../../backend/src/application/interfaces/ITenantRepository';

function makeClient(overrides: Partial<Parameters<typeof Client.create>[0]> = {}): Client {
  return Client.create({
    tenantId: 'tenant-demo',
    firstName: 'Laura',
    lastName: 'Gómez',
    phone: '+34600111222',
    email: 'laura@example.com',
    ...overrides,
  });
}

function makeClientWithVisit(lastVisit: Date, dataExpiresAt: Date | null, visitCount = 1): Client {
  return Client.reconstitute({
    id: 'cli-existing',
    tenantId: 'tenant-demo',
    userId: null,
    firstName: 'Laura',
    lastName: 'Gómez',
    email: 'laura@example.com',
    phone: '+34600111222',
    notes: null,
    dataExpiresAt,
    visitCount,
    lastVisit,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function makeTenant(settings: Record<string, unknown> = {}): TenantSettingsRecord {
  return { id: 'tenant-demo', settings, timezone: 'UTC' };
}

describe('FindOrCreateClientUseCase', () => {
  let useCase: FindOrCreateClientUseCase;
  let clientRepo: jest.Mocked<IClientRepository>;
  let tenantRepo: jest.Mocked<ITenantRepository>;

  beforeEach(() => {
    clientRepo = {
      findById: vi.fn().mockResolvedValue(null),
      findByTenantAndPhone: vi.fn().mockResolvedValue(null),
      findByTenantAndEmail: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findBySlug: vi.fn(),
      save: vi.fn(),
    } as unknown as jest.Mocked<ITenantRepository>;
    useCase = new FindOrCreateClientUseCase(clientRepo, tenantRepo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nada encontrado → crea cliente nuevo con visitCount 1', async () => {
    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' },
      'tenant-demo'
    );

    expect(client.id.startsWith('cli-')).toBe(true);
    expect(client.tenantId).toBe('tenant-demo');
    expect(client.visitCount).toBe(1);
    expect(client.lastVisit).toBeInstanceOf(Date);
    expect(clientRepo.save).toHaveBeenCalledTimes(1);
    expect(clientRepo.findByTenantAndPhone).toHaveBeenCalledWith('tenant-demo', '+34600111222');
  });

  it('reutiliza por phone → visitCount +1 (F3.3 #4/#5)', async () => {
    const existing = makeClient();
    clientRepo.findByTenantAndPhone.mockResolvedValue(existing);

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' },
      'tenant-demo'
    );

    expect(client.id).toBe(existing.id);
    expect(client.visitCount).toBe(existing.visitCount + 1);
    expect(client.lastVisit).toBeInstanceOf(Date);
    expect(clientRepo.findByTenantAndEmail).not.toHaveBeenCalled();
    expect(clientRepo.save).toHaveBeenCalledTimes(1);
  });

  it('phone no encontrado → fallback por email y sincroniza teléfono', async () => {
    const existing = makeClient({ phone: '+34600000000' });
    clientRepo.findByTenantAndEmail.mockResolvedValue(existing);

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222', email: 'laura@example.com' },
      'tenant-demo'
    );

    expect(clientRepo.findByTenantAndEmail).toHaveBeenCalledWith('tenant-demo', 'laura@example.com');
    expect(client.phone).toBe('+34600111222'); // withPhone del fallback
    expect(client.visitCount).toBe(existing.visitCount + 1);
  });

  it('email encontrado pero mismo phone → no llama a withPhone', async () => {
    const existing = makeClient();
    clientRepo.findByTenantAndEmail.mockResolvedValue(existing);

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: existing.phone, email: existing.email! },
      'tenant-demo'
    );

    expect(client.phone).toBe(existing.phone);
    expect(client.visitCount).toBe(existing.visitCount + 1);
  });

  it('sin phone y requireClientPhone default (true) → throw', async () => {
    await expect(
      useCase.execute({ firstName: 'Laura', lastName: 'Gómez' }, 'tenant-demo')
    ).rejects.toThrow('client phone is required');
    expect(clientRepo.save).not.toHaveBeenCalled();
  });

  it('requireClientPhone=false en settings → permite crear sin phone', async () => {
    tenantRepo.findById.mockResolvedValue(
      makeTenant({ requireClientPhone: false, clientDataRetention: 'never' })
    );

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '   ' },
      'tenant-demo'
    );

    expect(client.phone).toBe('');
    expect(client.visitCount).toBe(1);
  });

  it('requireClientEmail=true y sin email → throw', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({ requireClientEmail: true }));

    await expect(
      useCase.execute({ firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' }, 'tenant-demo')
    ).rejects.toThrow('client email is required');
    expect(clientRepo.save).not.toHaveBeenCalled();
  });

  it('retención nextDay → dataExpiresAt = lastVisit + 24h', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'nextDay' }));

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' },
      'tenant-demo'
    );

    expect(client.dataExpiresAt).toBeInstanceOf(Date);
    expect(client.dataExpiresAt!.getTime() - client.lastVisit!.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('retención nextMonth → dataExpiresAt = lastVisit + 1 mes', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'nextMonth' }));

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' },
      'tenant-demo'
    );

    const expected = new Date(client.lastVisit!);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(client.dataExpiresAt!.getTime()).toBe(expected.getTime());
  });

  it('retención never → dataExpiresAt null', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'never' }));

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' },
      'tenant-demo'
    );

    expect(client.dataExpiresAt).toBeNull();
  });

  it('settings desconocidos o ausentes → dataExpiresAt = nextMonth (default F3.3.1)', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({}));

    const client = await useCase.execute(
      { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' },
      'tenant-demo'
    );

    const expected = new Date(client.lastVisit!);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(client.dataExpiresAt!.getTime()).toBe(expected.getTime());
  });

  it('tenant sin settings → defaults (phone requerido)', async () => {
    tenantRepo.findById.mockResolvedValue({ id: 'tenant-demo', settings: null });

    await expect(
      useCase.execute({ firstName: 'Laura', lastName: 'Gómez' }, 'tenant-demo')
    ).rejects.toThrow('client phone is required');
  });

  it('firstName inválido → el error de la entity se propaga', async () => {
    await expect(
      useCase.execute({ firstName: ' ', lastName: 'Gómez', phone: '+34600111222' }, 'tenant-demo')
    ).rejects.toThrow('Client firstName is required');
    expect(clientRepo.save).not.toHaveBeenCalled();
  });

  describe('F3.3.1: lastVisit = reserva más futura', () => {
    const existingLastVisit = new Date('2026-10-10T10:00:00.000Z');
    const existingExpires = new Date('2026-11-10T10:00:00.000Z');
    const input = { firstName: 'Laura', lastName: 'Gómez', phone: '+34600111222' };

    it('visitAt posterior → avanza lastVisit y recalcula dataExpiresAt', async () => {
      tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'nextMonth' }));
      clientRepo.findByTenantAndPhone.mockResolvedValue(
        makeClientWithVisit(existingLastVisit, existingExpires, 3)
      );

      const visitAt = new Date('2026-10-20T09:30:00.000Z');
      const client = await useCase.execute(input, 'tenant-demo', visitAt);

      expect(client.lastVisit!.getTime()).toBe(visitAt.getTime());
      const expected = new Date(visitAt);
      expected.setUTCMonth(expected.getUTCMonth() + 1);
      expect(client.dataExpiresAt!.getTime()).toBe(expected.getTime());
      expect(client.visitCount).toBe(4);
    });

    it('visitAt anterior → no toca lastVisit ni dataExpiresAt (solo visitCount)', async () => {
      tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'nextMonth' }));
      clientRepo.findByTenantAndPhone.mockResolvedValue(
        makeClientWithVisit(existingLastVisit, existingExpires, 3)
      );

      const visitAt = new Date('2026-10-05T09:30:00.000Z');
      const client = await useCase.execute(input, 'tenant-demo', visitAt);

      expect(client.lastVisit!.getTime()).toBe(existingLastVisit.getTime());
      expect(client.dataExpiresAt!.getTime()).toBe(existingExpires.getTime());
      expect(client.visitCount).toBe(4);
    });

    it('visitAt igual → no toca lastVisit ni dataExpiresAt', async () => {
      tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'nextDay' }));
      clientRepo.findByTenantAndPhone.mockResolvedValue(
        makeClientWithVisit(existingLastVisit, existingExpires, 3)
      );

      const client = await useCase.execute(input, 'tenant-demo', new Date(existingLastVisit));

      expect(client.lastVisit!.getTime()).toBe(existingLastVisit.getTime());
      expect(client.dataExpiresAt!.getTime()).toBe(existingExpires.getTime());
      expect(client.visitCount).toBe(4);
    });

    it('cliente nuevo con visitAt → lastVisit = fecha de la reserva', async () => {
      tenantRepo.findById.mockResolvedValue(makeTenant({ clientDataRetention: 'nextMonth' }));

      const visitAt = new Date('2026-12-24T18:00:00.000Z');
      const client = await useCase.execute(input, 'tenant-demo', visitAt);

      expect(client.lastVisit!.getTime()).toBe(visitAt.getTime());
      const expected = new Date(visitAt);
      expected.setUTCMonth(expected.getUTCMonth() + 1);
      expect(client.dataExpiresAt!.getTime()).toBe(expected.getTime());
      expect(client.visitCount).toBe(1);
      expect(clientRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});

describe('computeDataExpiresAt', () => {
  const base = new Date('2026-10-01T10:00:00.000Z');

  it('nextDay → +24h', () => {
    expect(computeDataExpiresAt('nextDay', base)!.getTime()).toBe(base.getTime() + 86_400_000);
  });

  it('nextMonth → +1 mes UTC', () => {
    const expected = new Date(base);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(computeDataExpiresAt('nextMonth', base)!.getTime()).toBe(expected.getTime());
  });

  it('never → null', () => {
    expect(computeDataExpiresAt('never', base)).toBeNull();
  });

  it('desconocido/undefined → nextMonth (default F3.3.1)', () => {
    const expected = new Date(base);
    expected.setUTCMonth(expected.getUTCMonth() + 1);
    expect(computeDataExpiresAt('whatever', base)!.getTime()).toBe(expected.getTime());
    expect(computeDataExpiresAt(undefined, base)!.getTime()).toBe(expected.getTime());
    expect(computeDataExpiresAt(null, base)!.getTime()).toBe(expected.getTime());
  });
});
