import { describe, it, expect } from 'vitest';
import TenantSettings, {
  SLOT_DURATIONS,
  DATA_RETENTIONS,
  DEFAULT_LANGUAGE,
} from '../../../../backend/src/domain/value-objects/TenantSettings';

describe('TenantSettings (F3.4 #4, #11)', () => {
  describe('create() — estricto (PUT)', () => {
    it('objeto vacío → defaults', () => {
      const settings = TenantSettings.create({});
      expect(settings.slotDuration).toBe(15);
      expect(settings.maxServiceDuration).toBe(180);
      expect(settings.clientDataRetention).toBe('nextMonth');
      expect(settings.defaultLanguage).toBe('en');
      expect(settings.requireClientPhone).toBe(true);
      expect(settings.requireClientEmail).toBe(false);
    });

    it('payload completo válido → todos los valores', () => {
      const settings = TenantSettings.create({
        slotDuration: 30,
        maxServiceDuration: 240,
        clientDataRetention: 'never',
        defaultLanguage: 'es',
        requireClientPhone: false,
        requireClientEmail: true,
      });
      expect(settings.getValue()).toEqual({
        slotDuration: 30,
        maxServiceDuration: 240,
        clientDataRetention: 'never',
        defaultLanguage: 'es',
        requireClientPhone: false,
        requireClientEmail: true,
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
});
