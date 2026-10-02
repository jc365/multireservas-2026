import { describe, it, expect } from 'vitest';
import TenantSettings, {
  SLOT_DURATIONS,
  DATA_RETENTIONS,
  DEFAULT_LANGUAGE,
  preserveEmailVerification,
} from '../../../../backend/src/domain/value-objects/TenantSettings';

describe('TenantSettings (F3.4 #4, #11 + F4.1a)', () => {
  describe('create() — estricto (PUT)', () => {
    it('objeto vacío → defaults', () => {
      const settings = TenantSettings.create({});
      expect(settings.slotDuration).toBe(15);
      expect(settings.maxServiceDuration).toBe(180);
      expect(settings.clientDataRetention).toBe('nextMonth');
      expect(settings.defaultLanguage).toBe('en');
      expect(settings.requireClientPhone).toBe(true);
      expect(settings.requireClientEmail).toBe(false);
      expect(settings.advanceBookingLimit).toBe(30);
      expect(settings.availabilityBatchSize).toBe(10);
      expect(settings.allowCustomerAssignment).toBe(true);
    });

    it('payload completo válido → todos los valores', () => {
      const settings = TenantSettings.create({
        slotDuration: 30,
        maxServiceDuration: 240,
        clientDataRetention: 'never',
        defaultLanguage: 'es',
        requireClientPhone: false,
        requireClientEmail: true,
        advanceBookingLimit: 60,
        availabilityBatchSize: 25,
        allowCustomerAssignment: false,
      });
      expect(settings.getValue()).toEqual({
        slotDuration: 30,
        maxServiceDuration: 240,
        clientDataRetention: 'never',
        defaultLanguage: 'es',
        requireClientPhone: false,
        requireClientEmail: true,
        advanceBookingLimit: 60,
        availabilityBatchSize: 25,
        allowCustomerAssignment: false,
      });
    });

    it('maxServiceDuration ausente → 12 × slotDuration', () => {
      expect(TenantSettings.create({ slotDuration: 45 }).maxServiceDuration).toBe(540);
    });

    it('no-objeto → throw', () => {
      expect(() => TenantSettings.create('nope')).toThrow('settings must be an object');
      expect(() => TenantSettings.create(null)).toThrow('settings must be an object');
      expect(() => TenantSettings.create([])).toThrow('settings must be an object');
    });

    it('slotDuration fuera del set → throw', () => {
      expect(() => TenantSettings.create({ slotDuration: 20 })).toThrow(
        'slotDuration must be one of 15, 30, 45 or 60'
      );
      expect(() => TenantSettings.create({ slotDuration: '30' })).toThrow(
        'slotDuration must be one of 15, 30, 45 or 60'
      );
      for (const valid of SLOT_DURATIONS) {
        expect(TenantSettings.create({ slotDuration: valid }).slotDuration).toBe(valid);
      }
    });

    it('maxServiceDuration no múltiplo del slot o menor que él → throw', () => {
      expect(() =>
        TenantSettings.create({ slotDuration: 30, maxServiceDuration: 45 })
      ).toThrow('maxServiceDuration must be a multiple of slotDuration');
      expect(() =>
        TenantSettings.create({ slotDuration: 30, maxServiceDuration: 15 })
      ).toThrow('maxServiceDuration must be a multiple of slotDuration');
    });

    it('clientDataRetention fuera del set → throw', () => {
      expect(() =>
        TenantSettings.create({ clientDataRetention: 'forever' })
      ).toThrow('clientDataRetention must be nextDay, nextMonth or never');
      for (const valid of DATA_RETENTIONS) {
        expect(
          TenantSettings.create({ clientDataRetention: valid }).clientDataRetention
        ).toBe(valid);
      }
    });

    it('defaultLanguage vacío o no-string → throw', () => {
      expect(() => TenantSettings.create({ defaultLanguage: '  ' })).toThrow(
        'defaultLanguage must be a non-empty string'
      );
      expect(() => TenantSettings.create({ defaultLanguage: 42 })).toThrow(
        'defaultLanguage must be a non-empty string'
      );
      expect(TenantSettings.create({ defaultLanguage: '  es  ' }).defaultLanguage).toBe('es');
    });

    it('flags no booleanos → throw', () => {
      expect(() => TenantSettings.create({ requireClientPhone: 'yes' })).toThrow(
        'requireClientPhone must be a boolean'
      );
      expect(() => TenantSettings.create({ requireClientEmail: 1 })).toThrow(
        'requireClientEmail must be a boolean'
      );
    });

    it('advanceBookingLimit fuera de 1..365 o no entero → throw (F4.1a)', () => {
      expect(() => TenantSettings.create({ advanceBookingLimit: 0 })).toThrow(
        'advanceBookingLimit must be an integer between 1 and 365'
      );
      expect(() => TenantSettings.create({ advanceBookingLimit: 366 })).toThrow(
        'advanceBookingLimit must be an integer between 1 and 365'
      );
      expect(() => TenantSettings.create({ advanceBookingLimit: 7.5 })).toThrow(
        'advanceBookingLimit must be an integer between 1 and 365'
      );
      expect(TenantSettings.create({ advanceBookingLimit: 1 }).advanceBookingLimit).toBe(1);
      expect(TenantSettings.create({ advanceBookingLimit: 365 }).advanceBookingLimit).toBe(365);
    });

    it('availabilityBatchSize fuera de 1..50 o no entero → throw (F4.1a)', () => {
      expect(() => TenantSettings.create({ availabilityBatchSize: 0 })).toThrow(
        'availabilityBatchSize must be an integer between 1 and 50'
      );
      expect(() => TenantSettings.create({ availabilityBatchSize: 51 })).toThrow(
        'availabilityBatchSize must be an integer between 1 and 50'
      );
      expect(() => TenantSettings.create({ availabilityBatchSize: '10' })).toThrow(
        'availabilityBatchSize must be an integer between 1 and 50'
      );
      expect(TenantSettings.create({ availabilityBatchSize: 50 }).availabilityBatchSize).toBe(50);
    });

    it('allowCustomerAssignment no booleano → throw (F4.1a)', () => {
      expect(() => TenantSettings.create({ allowCustomerAssignment: 'yes' })).toThrow(
        'allowCustomerAssignment must be a boolean'
      );
      expect(
        TenantSettings.create({ allowCustomerAssignment: false }).allowCustomerAssignment
      ).toBe(false);
    });

    it('DEFAULT_LANGUAGE es en (sin usar hasta SF8)', () => {
      expect(DEFAULT_LANGUAGE).toBe('en');
    });
  });

  describe('from() — tolerante (GET/reconstitute)', () => {
    it('no-objeto → defaults en vez de throw', () => {
      for (const raw of [null, undefined, 'x', 42, []]) {
        const settings = TenantSettings.from(raw);
        expect(settings.slotDuration).toBe(15);
        expect(settings.clientDataRetention).toBe('nextMonth');
        expect(settings.requireClientPhone).toBe(true);
      }
    });

    it('settings legados {} → defaults', () => {
      expect(TenantSettings.from({}).getValue()).toEqual(TenantSettings.create({}).getValue());
    });

    it('campos inválidos caen en su default, válidos se conservan', () => {
      const settings = TenantSettings.from({
        slotDuration: 999,
        maxServiceDuration: 45,
        clientDataRetention: 'nextDay',
        requireClientPhone: 'yes',
        requireClientEmail: true,
      });
      expect(settings.slotDuration).toBe(15);
      expect(settings.maxServiceDuration).toBe(45);
      expect(settings.clientDataRetention).toBe('nextDay');
      expect(settings.requireClientPhone).toBe(true);
      expect(settings.requireClientEmail).toBe(true);
    });

    it('maxServiceDuration que no encaja con el slot resuelto → default 12× slot', () => {
      const settings = TenantSettings.from({ slotDuration: 30, maxServiceDuration: 31 });
      expect(settings.slotDuration).toBe(30);
      expect(settings.maxServiceDuration).toBe(360);
    });

    it('campos F4.1a inválidos caen en default, válidos se conservan', () => {
      const settings = TenantSettings.from({
        advanceBookingLimit: 9999,
        availabilityBatchSize: 0,
        allowCustomerAssignment: 'nope',
      });
      expect(settings.advanceBookingLimit).toBe(30);
      expect(settings.availabilityBatchSize).toBe(10);
      expect(settings.allowCustomerAssignment).toBe(true);

      const custom = TenantSettings.from({
        advanceBookingLimit: 14,
        availabilityBatchSize: 3,
        allowCustomerAssignment: false,
      });
      expect(custom.advanceBookingLimit).toBe(14);
      expect(custom.availabilityBatchSize).toBe(3);
      expect(custom.allowCustomerAssignment).toBe(false);
    });
  });

  it('getValue devuelve copia plana y equals compara por valor', () => {
    const a = TenantSettings.create({ slotDuration: 30 });
    const b = TenantSettings.create({ slotDuration: 30 });
    const c = TenantSettings.create({ slotDuration: 45 });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(a.getValue()).not.toBe(b.getValue());
    expect(a.getValue()).toEqual(b.getValue());
  });

  describe('email_verification (F4.4a)', () => {
    const valid = { token: 'tok-abc', expiresAt: '2026-10-02T10:00:00.000Z' };

    it('create() con clave válida → getValue() la incluye y el getter la expone', () => {
      const settings = TenantSettings.create({ slotDuration: 30, email_verification: valid });
      expect(settings.emailVerification).toEqual(valid);
      expect(settings.getValue()).toMatchObject({ slotDuration: 30, email_verification: valid });
    });

    it('create() sin clave → ausente (verificado)', () => {
      const settings = TenantSettings.create({});
      expect(settings.emailVerification).toBeUndefined();
      expect(settings.getValue().email_verification).toBeUndefined();
    });

    it('create() null → ausente (borrado)', () => {
      const settings = TenantSettings.create({ email_verification: null });
      expect(settings.emailVerification).toBeUndefined();
    });

    it('create() con clave inválida → throw', () => {
      expect(() => TenantSettings.create({ email_verification: { token: '' } })).toThrow(
        'email_verification must be an object with token and expiresAt'
      );
      expect(() =>
        TenantSettings.create({ email_verification: { token: 'x', expiresAt: 'no-date' } })
      ).toThrow('email_verification must be an object with token and expiresAt');
    });

    it('from() conserva una clave válida y descarta una inválida (tolerante)', () => {
      const good = TenantSettings.from({ email_verification: valid });
      expect(good.emailVerification).toEqual(valid);

      const bad = TenantSettings.from({ email_verification: { token: 42 } });
      expect(bad.emailVerification).toBeUndefined();
    });

    it('equals distingue el estado de verificación', () => {
      const pending = TenantSettings.create({ email_verification: valid });
      const verified = TenantSettings.create({});
      expect(pending.equals(verified)).toBe(false);
      expect(pending.equals(TenantSettings.create({ email_verification: valid }))).toBe(true);
    });

    it('preserveEmailVerification: el payload no inyecta ni borra la clave', () => {
      const injected = { slotDuration: 30, email_verification: valid };

      // Sin previo válido → se elimina la clave inyectada.
      expect(preserveEmailVerification(injected, {})).toEqual({ slotDuration: 30 });
      // Con previo válido → se restaura el valor almacenado.
      expect(preserveEmailVerification(injected, { email_verification: valid })).toEqual({
        slotDuration: 30,
        email_verification: valid,
      });
      // Input no-objeto → se devuelve tal cual.
      expect(preserveEmailVerification('x', {})).toBe('x');
    });
  });
});
