/**
 * @file GetAvailabilityUseCase.ts
 * @module application/use-cases/reservations
 *
 * GET /availability (F4.1a): slots libres de un empleado para un
 * servicio de `duration` minutos, según el motor de disponibilidad
 * (ScheduleCalculator). Tres modos de ventana (F0):
 * - ASAP: sin from/to → `from = now`, `to = now + advanceBookingLimit`.
 * - Desde fecha: from sin to → `to = from + advanceBookingLimit` (techo:
 *   el horizonte nunca supera `now + advanceBookingLimit`).
 * - Rango: from + to (to en YYYY-MM-DD → fin exclusivo del día local;
 *   recortado al horizonte de anticipación).
 * `to` sin `from` → 400. Paginación sin cursor: el cliente pide la
 * siguiente tanda con `from = nextFrom` (último start + 1 min).
 *
 * F4.4c ("sin preferencia"): `employeeId` es opcional. Sin él se
 * calculan los slots de TODOS los empleados activos del tenant y se
 * fusionan por instante de inicio — cada slot devuelto lleva su
 * `employeeId` (el primer empleado libre en ese instante, en el orden
 * del repositorio). Sin ningún empleado activo → `slots: []`.
 *
 * F4.5a (multi-servicio seguido): `serviceIds=svc1,svc2` sustituye a
 * `duration` (exclusivos entre sí). El use case valida que todos los
 * servicios existan, pertenezcan al tenant y estén activos, y usa la
 * **suma de duraciones** como ancho del slot (bloque contiguo, sin
 * gaps). Techo: el total no puede superar `maxServiceDuration`.
 * Además, en este modo se filtran los empleados que **no ofrecen
 * todos** los servicios pedidos (`offersAllServices` o M2M `serviceIds`)
 * — el modo `duration` conserva su comportamiento anterior.
 * La respuesta añade `duration` (total) en ambos modos.
 */

import type { GetAvailabilityInput } from '../../dtos';
import Tenant from '../../../domain/entities/Tenant';
import type Employee from '../../../domain/entities/Employee';
import ScheduleBlock from '../../../domain/value-objects/ScheduleBlock';
import Holiday from '../../../domain/value-objects/Holiday';
import { MAX_AVAILABILITY_BATCH_SIZE } from '../../../domain/value-objects/TenantSettings';
import ScheduleCalculator, {
  type AvailabilitySlot,
  type BusyRange,
} from '../../../domain/services/ScheduleCalculator';
import { convertToUTC } from '../../../domain/utils/TimezoneService';
import { isValidDate } from '../../../domain/utils/dayMaster';
import type ITenantRepository from '../../interfaces/ITenantRepository';
import type IEmployeeRepository from '../../interfaces/IEmployeeRepository';
import type IReservationRepository from '../../interfaces/IReservationRepository';
import type IServiceRepository from '../../interfaces/IServiceRepository';
import logger from '../../../infrastructure/logging/requestContext';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface AvailabilitySlotView {
  startUTC: string;
  endUTC: string;
  localStart: string;
  localEnd: string;
  /** F4.4c: empleado activo asignado a ese hueco. */
  employeeId: string;
}

export interface AvailabilityResult {
  slots: AvailabilitySlotView[];
  hasMore: boolean;
  /** F4.5a: duración total pedida (suma con `serviceIds`). */
  duration: number;
  nextFrom?: string;
}

/** Slot + empleado que lo cubre (entrada interna de la fusión F4.4c). */
interface AssignableSlot {
  slot: AvailabilitySlot;
  employeeId: string;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function nextDayString(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}

export default class GetAvailabilityUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly employeeRepository: IEmployeeRepository,
    private readonly reservationRepository: IReservationRepository,
    private readonly serviceRepository: IServiceRepository
  ) {}

  async execute(
    tenantId: string,
    input: GetAvailabilityInput,
    now: Date = new Date()
  ): Promise<AvailabilityResult> {
    logger.info({ tenantId, employeeId: input.employeeId }, 'GetAvailabilityUseCase: starting');

    if (!tenantId) {
      throw new Error('Tenant scope required');
    }
    const rawEmployeeId = input.employeeId;
    if (rawEmployeeId != null && rawEmployeeId !== '' && typeof rawEmployeeId !== 'string') {
      // ?employeeId=a&employeeId=b llega como array: mejor 400 que
      // ignorar el filtro en silencio.
      throw new Error('employeeId must be a string');
    }
    const employeeId = typeof rawEmployeeId === 'string' ? rawEmployeeId.trim() : '';

    // F4.5a: `serviceIds` y `duration` son excluyentes.
    const rawServiceIds = input.serviceIds;
    if (rawServiceIds != null && rawServiceIds !== '' && typeof rawServiceIds !== 'string') {
      // ?serviceIds=a&serviceIds=b llega como array → 400, igual que
      // employeeId.
      throw new Error('serviceIds must be a string');
    }
    const serviceIdsRaw = typeof rawServiceIds === 'string' ? rawServiceIds.trim() : '';
    const hasServiceIds = serviceIdsRaw !== '';
    const hasDuration = !isBlank(input.duration);
    if (hasServiceIds && hasDuration) {
      throw new Error('serviceIds and duration must not be used together');
    }
    if (!hasServiceIds && !hasDuration) {
      throw new Error('duration is required');
    }

    if (isBlank(input.from) && !isBlank(input.to)) {
      throw new Error('to requires from');
    }

    const record = await this.tenantRepository.findByIdFull(tenantId);
    if (!record) {
      throw new Error('Tenant not found');
    }
    const tenant = Tenant.reconstitute(record);
    const settings = tenant.settings;

    // Duración efectiva: la suma de los servicios (F4.5a) o el
    // `duration` explícito. `capabilityIds` solo se aplica en modo
    // serviceIds (decisión F4.5a #5).
    let duration: number;
    let capabilityIds: string[] | null = null;
    if (hasServiceIds) {
      const group = await this.resolveServiceGroup(tenantId, serviceIdsRaw, settings.maxServiceDuration);
      duration = group.duration;
      capabilityIds = group.ids;
    } else {
      duration = this.parsePositiveInt(input.duration, 'duration', true);
    }

    if (duration % settings.slotDuration !== 0) {
      throw new Error('duration must be a multiple of slotDuration');
    }

    const limit = isBlank(input.limit)
      ? settings.availabilityBatchSize
      : this.parsePositiveInt(input.limit, 'limit', false);
    if (limit > MAX_AVAILABILITY_BATCH_SIZE) {
      throw new Error(`limit must be at most ${MAX_AVAILABILITY_BATCH_SIZE}`);
    }

    const timezone = tenant.timezone;
    const horizon = new Date(now.getTime() + settings.advanceBookingLimit * DAY_MS);

    let fromUTC: Date;
    if (isBlank(input.from)) {
      fromUTC = new Date(now.getTime());
    } else {
      fromUTC = this.parseInstant(input.from as string, timezone, 'from');
    }

    let toUTC: Date;
    if (isBlank(input.to)) {
      toUTC = horizon;
    } else {
      const rawTo = input.to as string;
      const parsed =
        DATE_ONLY.test(rawTo) && isValidDate(rawTo)
          ? convertToUTC(`${nextDayString(rawTo)}T00:00`, timezone)
          : this.parseInstant(rawTo, timezone, 'to');
      toUTC = parsed.getTime() < horizon.getTime() ? parsed : horizon;
    }

    let entries: AssignableSlot[];
    if (employeeId) {
      const single = await this.employeeRepository.findById(employeeId);
      if (!single || single.tenantId !== tenantId) {
        throw new Error('Employee not found');
      }
      if (!single.isActive) {
        return { slots: [], hasMore: false, duration };
      }
      if (capabilityIds && !this.canOfferAll(single, capabilityIds)) {
        // F4.5a: el empleado concreto no ofrece todos los servicios
        // pedidos → sin huecos (mismo camino que inactivo).
        return { slots: [], hasMore: false, duration };
      }
      entries = (
        await this.computeEmployeeSlots(tenant, single, fromUTC, toUTC, now, duration)
      ).map((slot) => ({ slot, employeeId: single.id }));
    } else {
      // F4.4c "sin preferencia": hueco de cualquier empleado activo.
      entries = await this.mergeEmployeeSlots(
        tenant,
        fromUTC,
        toUTC,
        now,
        duration,
        capabilityIds
      );
    }

    entries.sort((a, b) => a.slot.startUTC.getTime() - b.slot.startUTC.getTime());
    const page = entries.slice(0, limit);
    const hasMore = entries.length > limit;
    const result: AvailabilityResult = {
      slots: page.map((entry) => this.toView(entry.slot, entry.employeeId)),
      hasMore,
      duration,
    };
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      result.nextFrom = new Date(last.slot.startUTC.getTime() + MINUTE_MS).toISOString();
    }

    logger.info(
      { tenantId, employeeId: employeeId || null, slots: page.length, hasMore },
      'GetAvailabilityUseCase: completed'
    );
    return result;
  }

  /**
   * F4.4c: slots libres de TODOS los empleados activos del tenant,
   * fusionados por instante de inicio. Si varios empleados tienen el
   * mismo instante libre gana el primero en el orden del repositorio.
   *
   * F4.5a: con `capabilityIds` (modo `serviceIds`) solo entran los
   * empleados que ofrecen TODOS los servicios pedidos.
   */
  private async mergeEmployeeSlots(
    tenant: Tenant,
    fromUTC: Date,
    toUTC: Date,
    now: Date,
    duration: number,
    capabilityIds: string[] | null = null
  ): Promise<AssignableSlot[]> {
    const employees = (await this.employeeRepository.findByTenantId(tenant.id)).filter(
      (candidate) =>
        candidate.isActive &&
        (capabilityIds === null || this.canOfferAll(candidate, capabilityIds))
    );
    const byStart = new Map<number, AssignableSlot>();
    for (const employee of employees) {
      const slots = await this.computeEmployeeSlots(
        tenant,
        employee,
        fromUTC,
        toUTC,
        now,
        duration
      );
      for (const slot of slots) {
        const key = slot.startUTC.getTime();
        if (!byStart.has(key)) {
          byStart.set(key, { slot, employeeId: employee.id });
        }
      }
    }
    return [...byStart.values()];
  }

  /**
   * F4.5a: `serviceIds=svc1,svc2` → ids en el orden pedido y duración
   * total (suma de los tramos; los repetidos cuentan una vez por cada
   * aparición). Valida que existan, pertenezcan al tenant y estén
   * activos, y que la suma no supere `maxServiceDuration`.
   *
   * @throws {Error} `Service not found` (404) si alguno no existe o es
   * de otro tenant; `service must be active` / `serviceIds … must be …`
   * (400) para el resto.
   */
  private async resolveServiceGroup(
    tenantId: string,
    raw: string,
    maxServiceDuration: number
  ): Promise<{ ids: string[]; duration: number }> {
    const ids = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '');
    if (ids.length === 0) {
      throw new Error('serviceIds is required');
    }
    const unique = [...new Set(ids)];
    const records = await this.serviceRepository.findByIds(unique);
    const byId = new Map(records.map((service) => [service.id, service]));

    let total = 0;
    for (const id of ids) {
      const service = byId.get(id);
      if (!service || service.tenantId !== tenantId) {
        throw new Error('Service not found');
      }
      if (!service.isActive) {
        throw new Error('service must be active');
      }
      total += service.duration;
    }

    if (total > maxServiceDuration) {
      throw new Error(
        `serviceIds total duration must be at most ${maxServiceDuration} minutes`
      );
    }
    return { ids, duration: total };
  }

  /** F4.5a (solo modo `serviceIds`): el empleado ofrece TODOS. */
  private canOfferAll(employee: Employee, serviceIds: string[]): boolean {
    if (employee.offersAllServices) return true;
    return serviceIds.every((id) => employee.serviceIds.includes(id));
  }

  /** Slots libres de UN empleado (horario/festivos custom + ocupación). */
  private async computeEmployeeSlots(
    tenant: Tenant,
    employee: Employee,
    fromUTC: Date,
    toUTC: Date,
    now: Date,
    duration: number
  ): Promise<AvailabilitySlot[]> {
    const busy: BusyRange[] = await this.reservationRepository.findActiveRanges(
      tenant.id,
      employee.id,
      fromUTC,
      toUTC
    );

    return ScheduleCalculator.compute({
      timezone: tenant.timezone,
      slotDuration: tenant.settings.slotDuration,
      duration,
      fromUTC,
      toUTC,
      nowUTC: now,
      tenantSchedules: tenant.schedules,
      tenantHolidays: tenant.holidays,
      employeeSchedule: this.resolveEmployeeSchedule(employee.customSchedule),
      employeeHolidays: this.resolveEmployeeHolidays(employee.customHolidays),
      busy,
    });
  }

  private toView(slot: AvailabilitySlot, employeeId: string): AvailabilitySlotView {
    return {
      startUTC: slot.startUTC.toISOString(),
      endUTC: slot.endUTC.toISOString(),
      localStart: slot.localStart,
      localEnd: slot.localEnd,
      employeeId,
    };
  }

  private parsePositiveInt(
    value: string | number | undefined,
    field: string,
    required: boolean
  ): number {
    if (isBlank(value)) {
      if (required) throw new Error(`${field} is required`);
      throw new Error(`${field} must be a positive integer`);
    }
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d+$/.test(value)
          ? Number(value)
          : NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${field} must be a positive integer`);
    }
    return parsed;
  }

  /**
   * `YYYY-MM-DD` o `YYYY-MM-DDTHH:MM[:SS]` (sin offset → hora local
   * del tenant) o ISO completo con offset → Date.
   * @throws {Error} `invalid <field>` si no es interpretable.
   */
  private parseInstant(value: string, timezone: string, field: string): Date {
    if (DATE_ONLY.test(value)) {
      if (!isValidDate(value)) throw new Error(`invalid ${field}`);
      return convertToUTC(`${value}T00:00`, timezone);
    }
    if (LOCAL_DATETIME.test(value)) {
      try {
        return convertToUTC(value, timezone);
      } catch {
        throw new Error(`invalid ${field}`);
      }
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`invalid ${field}`);
    }
    return parsed;
  }

  /**
   * Horario custom del empleado. Sin columna `useGlobalSchedule`
   * (decisión F4.1a): `customSchedule == null` ⇒ horario del tenant.
   * Formas aceptadas: array de bloques o `{ blocks: [...] }` (el
   * almacén de F3.2 exige objeto JSON, no array). `{} ⇒` sin custom.
   */
  private resolveEmployeeSchedule(raw: unknown): ScheduleBlock[] | null {
    if (raw === null || raw === undefined) return null;
    const candidate = Array.isArray(raw)
      ? raw
      : this.isPlainObject(raw) && Array.isArray(raw.blocks)
        ? raw.blocks
        : this.isPlainObject(raw) && Array.isArray(raw.schedules)
          ? raw.schedules
          : this.isPlainObject(raw) && Object.keys(raw).length === 0
            ? null
            : undefined;
    if (candidate === undefined) {
      throw new Error(
        'employee customSchedule must be an array of schedule blocks or { blocks: [...] }'
      );
    }
    return ScheduleBlock.parse(candidate);
  }

  /**
   * Festivos custom del empleado (se SUMAN a los del tenant, F0 #2).
   * Formas aceptadas: array o `{ holidays: [...] }`; `{}` ⇒ ninguno.
   */
  private resolveEmployeeHolidays(raw: unknown): Holiday[] {
    if (raw === null || raw === undefined) return [];
    const candidate = Array.isArray(raw)
      ? raw
      : this.isPlainObject(raw) && Array.isArray(raw.holidays)
        ? raw.holidays
        : this.isPlainObject(raw) && Object.keys(raw).length === 0
          ? null
          : undefined;
    if (candidate === undefined) {
      throw new Error(
        'employee customHolidays must be an array of holidays or { holidays: [...] }'
      );
    }
    return Holiday.parse(candidate);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
