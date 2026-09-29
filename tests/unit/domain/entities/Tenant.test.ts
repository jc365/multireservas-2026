import { describe, it, expect } from 'vitest';
import Tenant, {
  CURRENCIES,
  isValidTimeZone,
  normalizeName,
  normalizeCurrency,
  normalizeTimeZone,
} from '../../../../backend/src/domain/entities/Tenant';

const fullRow = {
  id: 'tenant-demo',
  name: 'Tenant Demo',
  slug: 'demo',
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  settings: {
    slotDuration: 30,
    maxServiceDuration: 240,
    clientDataRetention: 'nextMonth',
    defaultLanguage: 'en',
    requireClientPhone: false,
    requireClientEmail: true,
  },
  schedules: [
    {
      label: 'Horario semanal',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      start: '09:00',
      end: '18:00',
      breaks: [{ start: '13:00', end: '14:00' }],
    },
  ],
  holidays: [
    { label: 'Navidad', date: '2026-12-25', recurring: true },
    { label: 'Puente local', date: '2026-10-12', recurring: false },
  ],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

function makeRow(overrides: Partial<typeof fullRow> = {}) {
  return { ...fullRow, ...overrides };
}

describe('Tenant (F3.4)', () => {
  describe('reconstitute() — lectura', () => {
    it('fila completa → todos los getters', () => {
      const tenant = Tenant.reconstitute(fullRow);
      expect(tenant.id).toBe('tenant-demo');
      expect(tenant.name).toBe('Tenant Demo');
      expect(tenant.slug).toBe('demo');
      expect(tenant.currency).toBe('EUR');
      expect(tenant.timezone).toBe('Europe/Madrid');
      expect(tenant.isActive).toBe(true);
      expect(tenant.createdAt).toEqual(fullRow.createdAt);
      expect(tenant.updatedAt).toEqual(fullRow.updatedAt);
      expect(tenant.settings.slotDuration).toBe(30);
      expect(tenant.settings.requireClientPhone).toBe(false);
      expect(tenant.schedules).toHaveLength(1);
      expect(tenant.schedules[0].rrule).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
      );
      expect(tenant.holidays).toHaveLength(2);
      expect(tenant.holidays[0].rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
      expect(tenant.holidays[1].rrule).toBe('DTSTART;VALUE=DATE:20261012');
    });

    it('settings legados {} → defaults (tolerante)', () => {
      const tenant = Tenant.reconstitute(makeRow({ settings: {} }));
      expect(tenant.settings.slotDuration).toBe(15);
      expect(tenant.settings.clientDataRetention).toBe('nextMonth');
      expect(tenant.settings.requireClientPhone).toBe(true);
      expect(tenant.settings.requireClientEmail).toBe(false);
    });

    it('schedules/holidays null → [] (defaults de fila)', () => {
      const tenant = Tenant.reconstitute(
        makeRow({ schedules: null, holidays: null })
      );
      expect(tenant.schedules).toEqual([]);
      expect(tenant.holidays).toEqual([]);
    });

    it('name/currency/timezone inválidos → throw', () => {
      expect(() => Tenant.reconstitute(makeRow({ name: '   ' }))).toThrow(
        'Tenant name is required'
      );
      expect(() => Tenant.reconstitute(makeRow({ currency: 'JPY' }))).toThrow(
        'currency must be EUR, USD or GBP'
      );
      expect(() => Tenant.reconstitute(makeRow({ timezone: 'Not/AZone' }))).toThrow(
        'timezone must be a valid IANA time zone'
      );
    });

    it('schedules corruptos → throw (nunca datos silenciosos)', () => {
      expect(() =>
        Tenant.reconstitute(makeRow({ schedules: [{ label: '', days: [] }] }))
      ).toThrow('schedule label is required');
      expect(() => Tenant.reconstitute(makeRow({ schedules: 'nope' }))).toThrow(
        'schedules must be an array'
      );
    });
  });

  describe('withConfig() — escritura estricta (PUT)', () => {
    const config = {
      name: 'Renombrado',
      currency: 'USD',
      timezone: 'America/New_York',
      settings: { slotDuration: 45 },
      schedules: [
        { label: 'Sábado', days: ['sat'], start: '10:00', end: '14:00', breaks: [] },
      ],
      holidays: [{ label: 'Año Nuevo', date: '2027-01-01', recurring: true }],
    };

    it('devuelve instancia nueva con el payload validado y la original intacta', () => {
      const original = Tenant.reconstitute(fullRow);
      const updated = original.withConfig(config);

      expect(updated).not.toBe(original);
      expect(updated.id).toBe(original.id);
      expect(updated.slug).toBe('demo');
      expect(updated.name).toBe('Renombrado');
      expect(updated.currency).toBe('USD');
      expect(updated.timezone).toBe('America/New_York');
      expect(updated.settings.slotDuration).toBe(45);
      expect(updated.settings.requireClientPhone).toBe(true);
      expect(updated.schedules[0].rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=SA');
      expect(updated.holidays[0].rrule).toBe('RRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1');

      expect(original.name).toBe('Tenant Demo');
      expect(original.currency).toBe('EUR');
      expect(original.settings.slotDuration).toBe(30);
      expect(original.schedules[0].label).toBe('Horario semanal');
    });

    it('perfil inválido → throw', () => {
      const tenant = Tenant.reconstitute(fullRow);
      expect(() => tenant.withConfig({ ...config, name: '' })).toThrow(
        'Tenant name is required'
      );
      expect(() => tenant.withConfig({ ...config, currency: 'XXX' })).toThrow(
        'currency must be EUR, USD or GBP'
      );
      expect(() => tenant.withConfig({ ...config, timezone: 'bad/zone' })).toThrow(
        'timezone must be a valid IANA time zone'
      );
    });

    it('settings/schedules/holidays inválidos → throw (todo o nada)', () => {
      const tenant = Tenant.reconstitute(fullRow);
      expect(() =>
        tenant.withConfig({ ...config, settings: { slotDuration: 20 } })
      ).toThrow('slotDuration must be one of 15, 30, 45 or 60');
      expect(() =>
        tenant.withConfig({
          ...config,
          schedules: [{ label: 'X', days: [], start: '10:00', end: '12:00' }],
        })
      ).toThrow('schedule days must be a non-empty array');
      expect(() =>
        tenant.withConfig({
          ...config,
          holidays: [{ label: 'X', date: '2026-02-31' }],
        })
      ).toThrow('holiday date must be a valid YYYY-MM-DD date');
      expect(() => tenant.withConfig({ ...config, schedules: {} })).toThrow(
        'schedules must be an array'
      );
    });
  });

  describe('toConfigRecord()', () => {
    it('devuelve JSON saneado con rrules regeneradas', () => {
      const tenant = Tenant.reconstitute(makeRow({ settings: {} }));
      const record = tenant.toConfigRecord();
      expect(record.name).toBe('Tenant Demo');
      expect(record.currency).toBe('EUR');
      expect(record.timezone).toBe('Europe/Madrid');
      expect(record.settings).toEqual({
        slotDuration: 15,
        maxServiceDuration: 180,
        clientDataRetention: 'nextMonth',
        defaultLanguage: 'en',
        requireClientPhone: true,
        requireClientEmail: false,
      });
      expect(record.schedules).toHaveLength(1);
      expect((record.schedules[0] as { rrule: string }).rrule).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
      );
      expect(record.holidays).toHaveLength(2);
    });
  });

  describe('helpers de validación', () => {
    it('isValidTimeZone acepta IANA y rechaza basura', () => {
      expect(isValidTimeZone('UTC')).toBe(true);
      expect(isValidTimeZone('Europe/Madrid')).toBe(true);
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('Not/AZone')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone(42)).toBe(false);
      expect(isValidTimeZone(null)).toBe(false);
    });

    it('normalizeName recorta y valida', () => {
      expect(normalizeName('  Hola  ')).toBe('Hola');
      expect(() => normalizeName('')).toThrow('Tenant name is required');
      expect(() => normalizeName(42)).toThrow('Tenant name is required');
      expect(() => normalizeName('x'.repeat(201))).toThrow(
        'Tenant name must be at most 200 characters'
      );
    });

    it('normalizeCurrency solo admite el enum', () => {
      for (const currency of CURRENCIES) {
        expect(normalizeCurrency(currency)).toBe(currency);
      }
      expect(() => normalizeCurrency('JPY')).toThrow('currency must be EUR, USD or GBP');
    });

    it('normalizeTimeZone exige IANA válida', () => {
      expect(normalizeTimeZone(' Europe/Madrid ')).toBe('Europe/Madrid');
      expect(() => normalizeTimeZone('bad/zone')).toThrow(
        'timezone must be a valid IANA time zone'
      );
    });
  });
});
