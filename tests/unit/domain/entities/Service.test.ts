/**
 * @file Service.test.ts
 * @module tests/unit/domain/entities
 */

import { describe, it, expect } from 'vitest';
import Service from '../../../../backend/src/domain/entities/Service';
import ServiceName from '../../../../backend/src/domain/value-objects/ServiceName';
import BookingSettings from '../../../../backend/src/domain/value-objects/BookingSettings';

const settings = BookingSettings.fromTenantSettings({}); // slot 15, max 180

function makeInput(overrides: Partial<Parameters<typeof Service.create>[0]> = {}) {
  return {
    tenantId: 'tenant-demo',
    name: ServiceName.create('Classic Haircut'),
    duration: 30,
    ...overrides,
  };
}

describe('Service entity — creación', () => {
  it('crea un servicio con id prefijado svc-', () => {
    const service = Service.create(makeInput(), settings);

    expect(service.id.startsWith('svc-')).toBe(true);
    expect(service.tenantId).toBe('tenant-demo');
    expect(service.name.getValue()).toBe('Classic Haircut');
    expect(service.duration).toBe(30);
    expect(service.isActive).toBe(true);
    expect(service.price).toBeNull();
    expect(service.description).toBeNull();
    expect(service.category).toBeNull();
    expect(service.createdAt).toBeInstanceOf(Date);
    expect(service.updatedAt).toBeInstanceOf(Date);
  });

  it('crea un servicio con todos los campos', () => {
    const service = Service.create(
      makeInput({ description: 'Cut and style', duration: 45, price: 25.5, category: 'hair', isActive: false }),
      settings
    );

    expect(service.description).toBe('Cut and style');
    expect(service.duration).toBe(45);
    expect(service.price).toBe(25.5);
    expect(service.category).toBe('hair');
    expect(service.isActive).toBe(false);
  });

  it('acepta price null explícito', () => {
    const service = Service.create(makeInput({ price: null }), settings);
    expect(service.price).toBeNull();
  });

  it('acepta duration = slotDuration (límite mínimo)', () => {
    const service = Service.create(makeInput({ duration: 15 }), settings);
    expect(service.duration).toBe(15);
  });

  it('acepta duration = maxServiceDuration (límite máximo)', () => {
    const service = Service.create(makeInput({ duration: 180 }), settings);
    expect(service.duration).toBe(180);
  });
});

describe('Service entity — validación de duration', () => {
  it('duration 0 → error (debe ser positiva)', () => {
    expect(() => Service.create(makeInput({ duration: 0 }), settings)).toThrow(
      'Service duration must be a positive integer of minutes'
    );
  });

  it('duration negativa → error', () => {
    expect(() => Service.create(makeInput({ duration: -15 }), settings)).toThrow(
      'Service duration must be a positive integer of minutes'
    );
  });

  it('duration no entera → error', () => {
    expect(() => Service.create(makeInput({ duration: 30.5 }), settings)).toThrow(
      'Service duration must be a positive integer of minutes'
    );
  });

  it('duration < slotDuration → error', () => {
    expect(() => Service.create(makeInput({ duration: 10 }), settings)).toThrow(
      'Service duration must be at least 15 minutes'
    );
  });

  it('duration no múltiplo de slotDuration → error', () => {
    expect(() => Service.create(makeInput({ duration: 20 }), settings)).toThrow(
      'Service duration must be a multiple of 15 minutes'
    );
  });

  it('duration > maxServiceDuration → error', () => {
    expect(() => Service.create(makeInput({ duration: 195 }), settings)).toThrow(
      'Service duration cannot exceed 180 minutes'
    );
  });

  it('respeta los ajustes personalizados del tenant', () => {
    const custom = BookingSettings.fromTenantSettings({ slotDuration: 30, maxServiceDuration: 120 });

    expect(() => Service.create(makeInput({ duration: 60 }), custom)).not.toThrow();
    expect(() => Service.create(makeInput({ duration: 30 }), custom)).not.toThrow();
    expect(() => Service.create(makeInput({ duration: 120 }), custom)).not.toThrow();
    expect(() => Service.create(makeInput({ duration: 45 }), custom)).toThrow(
      'Service duration must be a multiple of 30 minutes'
    );
    expect(() => Service.create(makeInput({ duration: 150 }), custom)).toThrow(
      'Service duration cannot exceed 120 minutes'
    );
  });
});

describe('Service entity — validación de price', () => {
  it('price negativo → error', () => {
    expect(() => Service.create(makeInput({ price: -1 }), settings)).toThrow(
      'Service price cannot be negative'
    );
  });

  it('price > 99999999.99 → error', () => {
    expect(() => Service.create(makeInput({ price: 100000000 }), settings)).toThrow(
      'Service price cannot exceed 99999999.99'
    );
  });

  it('price con más de 2 decimales → error', () => {
    expect(() => Service.create(makeInput({ price: 12.345 }), settings)).toThrow(
      'Service price can have at most 2 decimal places'
    );
  });

  it('price 0 y 2 decimales válidos → ok', () => {
    expect(() => Service.create(makeInput({ price: 0 }), settings)).not.toThrow();
    expect(() => Service.create(makeInput({ price: 99999999.99 }), settings)).not.toThrow();
  });
});

describe('Service entity — validación de description/category', () => {
  it('description > 2000 chars → error', () => {
    expect(() => Service.create(makeInput({ description: 'x'.repeat(2001) }), settings)).toThrow(
      'Service description cannot exceed 2000 characters'
    );
  });

  it('category > 100 chars → error', () => {
    expect(() => Service.create(makeInput({ category: 'x'.repeat(101) }), settings)).toThrow(
      'Service category cannot exceed 100 characters'
    );
  });
});

describe('Service entity — reconstitute', () => {
  it('reconstituye desde campos de BD', () => {
    const service = Service.reconstitute({
      id: 'svc-fixed-0001',
      tenantId: 'tenant-demo',
      name: ServiceName.create('Full Color'),
      description: 'Colour',
      duration: 90,
      price: 65.5,
      category: 'hair',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });

    expect(service.id).toBe('svc-fixed-0001');
    expect(service.duration).toBe(90);
    expect(service.price).toBe(65.5);
    expect(service.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('duration <= 0 en BD → error (invariante duro)', () => {
    expect(() =>
      Service.reconstitute({
        id: 'svc-bad',
        tenantId: 'tenant-demo',
        name: ServiceName.create('Bad Service'),
        description: null,
        duration: 0,
        price: null,
        category: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).toThrow('Service duration must be a positive integer of minutes');
  });
});

describe('Service entity — withUpdates', () => {
  it('actualiza campos y bump updatedAt', async () => {
    const service = Service.create(makeInput(), settings);
    await new Promise((r) => setTimeout(r, 5));

    const updated = service.withUpdates({ name: ServiceName.create('New Name'), price: 30 }, settings);

    expect(updated.id).toBe(service.id);
    expect(updated.tenantId).toBe(service.tenantId);
    expect(updated.name.getValue()).toBe('New Name');
    expect(updated.price).toBe(30);
    expect(updated.duration).toBe(30);
    expect(updated.createdAt).toEqual(service.createdAt);
    expect(updated.updatedAt.getTime()).toBeGreaterThan(service.updatedAt.getTime());
  });

  it('duration inválida en update → error', () => {
    const service = Service.create(makeInput(), settings);
    expect(() => service.withUpdates({ duration: 20 }, settings)).toThrow(
      'Service duration must be a multiple of 15 minutes'
    );
  });

  it('sin duration en update no valida contra settings', () => {
    const service = Service.create(makeInput(), settings);
    const updated = service.withUpdates({ description: 'x' }, settings);
    expect(updated.description).toBe('x');
  });
});
