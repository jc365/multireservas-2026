/**
 * @file BookingSettings.test.ts
 * @module tests/unit/domain/value-objects
 */

import { describe, it, expect } from 'vitest';
import BookingSettings, {
  DEFAULT_SLOT_DURATION,
  MAX_SERVICE_DURATION_FACTOR,
} from '../../../../backend/src/domain/value-objects/BookingSettings';

describe('BookingSettings.fromTenantSettings', () => {
  it('settings vacíos → defaults (slot 15, max 180)', () => {
    const settings = BookingSettings.fromTenantSettings({});

    expect(settings.slotDuration).toBe(15);
    expect(settings.maxServiceDuration).toBe(15 * 12);
  });

  it('slotDuration configurado → max = 12 × slot', () => {
    const settings = BookingSettings.fromTenantSettings({ slotDuration: 30 });

    expect(settings.slotDuration).toBe(30);
    expect(settings.maxServiceDuration).toBe(30 * MAX_SERVICE_DURATION_FACTOR);
  });

  it('maxServiceDuration configurado se respeta si es válido', () => {
    const settings = BookingSettings.fromTenantSettings({
      slotDuration: 20,
      maxServiceDuration: 200,
    });

    expect(settings.slotDuration).toBe(20);
    expect(settings.maxServiceDuration).toBe(200);
  });

  it('maxServiceDuration < slotDuration se ignora (fallback)', () => {
    const settings = BookingSettings.fromTenantSettings({
      slotDuration: 30,
      maxServiceDuration: 10,
    });

    expect(settings.maxServiceDuration).toBe(360);
  });

  it('valores inválidos → defaults', () => {
    expect(BookingSettings.fromTenantSettings({ slotDuration: -5 }).slotDuration).toBe(DEFAULT_SLOT_DURATION);
    expect(BookingSettings.fromTenantSettings({ slotDuration: 15.5 }).slotDuration).toBe(DEFAULT_SLOT_DURATION);
    expect(BookingSettings.fromTenantSettings({ slotDuration: '30' }).slotDuration).toBe(DEFAULT_SLOT_DURATION);
    expect(BookingSettings.fromTenantSettings(null).slotDuration).toBe(DEFAULT_SLOT_DURATION);
    expect(BookingSettings.fromTenantSettings(undefined).slotDuration).toBe(DEFAULT_SLOT_DURATION);
    expect(BookingSettings.fromTenantSettings([15]).slotDuration).toBe(DEFAULT_SLOT_DURATION);
    expect(BookingSettings.fromTenantSettings('settings').slotDuration).toBe(DEFAULT_SLOT_DURATION);
  });
});
