/**
 * @file routes.ts
 * @module infrastructure/api/v1/routes
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CreateUserUseCase } from '../../../application/use-cases/CreateUserUseCase';
import { GetAllUsersUseCase } from '../../../application/use-cases/GetAllUsersUseCase';
import { LoginUseCase } from '../../../application/use-cases/LoginUseCase';
import RegisterUseCase from '../../../application/use-cases/auth/RegisterUseCase';
import ResendVerificationUseCase from '../../../application/use-cases/auth/ResendVerificationUseCase';
import VerifyEmailUseCase from '../../../application/use-cases/tenants/VerifyEmailUseCase';
import CreateServiceUseCase from '../../../application/use-cases/services/CreateServiceUseCase';
import GetServiceUseCase from '../../../application/use-cases/services/GetServiceUseCase';
import ListServicesUseCase from '../../../application/use-cases/services/ListServicesUseCase';
import UpdateServiceUseCase from '../../../application/use-cases/services/UpdateServiceUseCase';
import DeleteServiceUseCase from '../../../application/use-cases/services/DeleteServiceUseCase';
import CreateEmployeeUseCase from '../../../application/use-cases/employees/CreateEmployeeUseCase';
import GetEmployeeUseCase from '../../../application/use-cases/employees/GetEmployeeUseCase';
import ListEmployeesUseCase from '../../../application/use-cases/employees/ListEmployeesUseCase';
import UpdateEmployeeUseCase from '../../../application/use-cases/employees/UpdateEmployeeUseCase';
import DeleteEmployeeUseCase from '../../../application/use-cases/employees/DeleteEmployeeUseCase';
import FindOrCreateClientUseCase from '../../../application/use-cases/clients/FindOrCreateClientUseCase';
import CreateReservationUseCase from '../../../application/use-cases/reservations/CreateReservationUseCase';
import ListReservationsUseCase from '../../../application/use-cases/reservations/ListReservationsUseCase';
import GetReservationUseCase from '../../../application/use-cases/reservations/GetReservationUseCase';
import UpdateReservationUseCase from '../../../application/use-cases/reservations/UpdateReservationUseCase';
import CancelReservationUseCase from '../../../application/use-cases/reservations/CancelReservationUseCase';
import GetAvailabilityUseCase from '../../../application/use-cases/reservations/GetAvailabilityUseCase';
import GetTenantConfigUseCase from '../../../application/use-cases/tenants/GetTenantConfigUseCase';
import UpdateTenantConfigUseCase from '../../../application/use-cases/tenants/UpdateTenantConfigUseCase';
import { GetConfigUseCase, GetAllConfigUseCase, GetConfigByCategoryUseCase } from '../../../application/use-cases/config/GetConfigUseCase';
import { UpsertConfigUseCase } from '../../../application/use-cases/config/UpsertConfigUseCase';
import { DeleteConfigUseCase } from '../../../application/use-cases/config/DeleteConfigUseCase';
import PrismaUserRepository from '../../persistence/PrismaUserRepository';
import PrismaServiceRepository from '../../persistence/PrismaServiceRepository';
import PrismaEmployeeRepository from '../../persistence/PrismaEmployeeRepository';
import PrismaClientRepository from '../../persistence/PrismaClientRepository';
import PrismaReservationRepository from '../../persistence/PrismaReservationRepository';
import PrismaTenantRepository from '../../persistence/PrismaTenantRepository';
import PrismaBitacoraRepository from '../../persistence/PrismaBitacoraRepository';
import PrismaConfigRepository from '../../persistence/PrismaConfigRepository';
import BitacoraService from '../../logging/BitacoraService';
import HashService from '../../security/HashService';
import requestLogger from '../../logging/requestContext';
import { authMiddleware } from '../../middleware/auth';
import { adminMiddleware } from '../../middleware/admin';
import { tenantScope } from '../../middleware/tenant';
import type { AuthRequest } from '../../middleware/auth';
import type { TenantRequest } from '../../middleware/tenant';
import ListBitacoraUseCase from '../../../application/use-cases/bitacora/ListBitacoraUseCase';
import ListTenantsUseCase from '../../../application/use-cases/admin/ListTenantsUseCase';
import GetTenantUseCase from '../../../application/use-cases/admin/GetTenantUseCase';
import CreateTenantUseCase from '../../../application/use-cases/admin/CreateTenantUseCase';
import UpdateTenantUseCase from '../../../application/use-cases/admin/UpdateTenantUseCase';
import SetTenantActiveUseCase from '../../../application/use-cases/admin/SetTenantActiveUseCase';
import prisma from '../../persistence/prismaClient';
import { isR2Configured, getFileUrlAsync } from '../../storage/storageService';
import Service from '../../../domain/entities/Service';
import Employee from '../../../domain/entities/Employee';
import Tenant from '../../../domain/entities/Tenant';
import type { ReservationWithRelations } from '../../../application/interfaces/IReservationRepository';
import { emailService } from '../../email/EmailService';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../errors';
import {
  CONFIG_NOT_FOUND,
  EMPLOYEE_NOT_FOUND,
  RESERVATION_NOT_FOUND,
  SERVICE_NOT_FOUND,
  TENANT_NOT_FOUND,
} from '../../errors/mr-codes';

const LOG_LEVEL_NORMALIZE: Record<string, string> = {
  'warning': 'warn',
  'critical': 'fatal',
  'debug': 'debug',
  'info': 'info',
  'warn': 'warn',
  'error': 'error',
  'fatal': 'fatal',
  'trace': 'trace',
};

function normalizeLogLevel(value: unknown): string {
  if (typeof value !== 'string') return 'info';
  return LOG_LEVEL_NORMALIZE[value.toLowerCase()] ?? 'info';
}

const router = Router();

const userRepository = new PrismaUserRepository();
const bitacoraRepository = new PrismaBitacoraRepository();
const bitacoraService = new BitacoraService(bitacoraRepository);
const hashService = new HashService();

const createUserUseCase = new CreateUserUseCase(userRepository, bitacoraService, hashService);
const getAllUsersUseCase = new GetAllUsersUseCase(userRepository);
const loginUseCase = new LoginUseCase(userRepository, hashService);

const serviceRepository = new PrismaServiceRepository();
const tenantRepository = new PrismaTenantRepository();
// F4.4a — registro público (necesita tenantRepository, antes que él).
const registerUseCase = new RegisterUseCase(
  userRepository,
  tenantRepository,
  hashService,
  bitacoraService
);
const createServiceUseCase = new CreateServiceUseCase(serviceRepository, tenantRepository, bitacoraService);
const getServiceUseCase = new GetServiceUseCase(serviceRepository);
const listServicesUseCase = new ListServicesUseCase(serviceRepository);
const updateServiceUseCase = new UpdateServiceUseCase(serviceRepository, tenantRepository, bitacoraService);
const deleteServiceUseCase = new DeleteServiceUseCase(serviceRepository, bitacoraService);

const employeeRepository = new PrismaEmployeeRepository();
const createEmployeeUseCase = new CreateEmployeeUseCase(employeeRepository, serviceRepository, userRepository, tenantRepository, bitacoraService);
const getEmployeeUseCase = new GetEmployeeUseCase(employeeRepository);
const listEmployeesUseCase = new ListEmployeesUseCase(employeeRepository);
const updateEmployeeUseCase = new UpdateEmployeeUseCase(employeeRepository, serviceRepository, userRepository, bitacoraService);
const deleteEmployeeUseCase = new DeleteEmployeeUseCase(employeeRepository, bitacoraService);

const clientRepository = new PrismaClientRepository();
const reservationRepository = new PrismaReservationRepository();
const findOrCreateClientUseCase = new FindOrCreateClientUseCase(clientRepository, tenantRepository);
// F4.4c: CreateReservation lo usa para asignar el empleado cuando el
// cliente pide "sin preferencia" → se construye antes que él.
const getAvailabilityUseCase = new GetAvailabilityUseCase(
  tenantRepository,
  employeeRepository,
  reservationRepository,
  serviceRepository
);
const createReservationUseCase = new CreateReservationUseCase(
  reservationRepository,
  employeeRepository,
  serviceRepository,
  clientRepository,
  tenantRepository,
  findOrCreateClientUseCase,
  getAvailabilityUseCase,
  bitacoraService,
  emailService
);
const listReservationsUseCase = new ListReservationsUseCase(reservationRepository);
const getReservationUseCase = new GetReservationUseCase(reservationRepository);
const updateReservationUseCase = new UpdateReservationUseCase(
  reservationRepository,
  employeeRepository,
  serviceRepository,
  tenantRepository,
  bitacoraService,
  emailService
);
const cancelReservationUseCase = new CancelReservationUseCase(reservationRepository, bitacoraService);

const configRepository = new PrismaConfigRepository();
const getConfigUseCase = new GetConfigUseCase(configRepository);
const getAllConfigUseCase = new GetAllConfigUseCase(configRepository);
const getConfigByCategoryUseCase = new GetConfigByCategoryUseCase(configRepository);
const upsertConfigUseCase = new UpsertConfigUseCase(configRepository, bitacoraService);
const deleteConfigUseCase = new DeleteConfigUseCase(configRepository, bitacoraService);

const listBitacoraUseCase = new ListBitacoraUseCase(bitacoraRepository);

const getTenantConfigUseCase = new GetTenantConfigUseCase(tenantRepository);
const updateTenantConfigUseCase = new UpdateTenantConfigUseCase(tenantRepository, bitacoraService);
// F4.4a — verificación de email
const verifyEmailUseCase = new VerifyEmailUseCase(tenantRepository);
const resendVerificationUseCase = new ResendVerificationUseCase(tenantRepository, userRepository);

// ── F4.0 superficie A (admin) ─
const listTenantsUseCase = new ListTenantsUseCase(tenantRepository);
const getAdminTenantUseCase = new GetTenantUseCase(tenantRepository);
const createTenantUseCase = new CreateTenantUseCase(tenantRepository, bitacoraService);
const updateTenantUseCase = new UpdateTenantUseCase(tenantRepository, bitacoraService);
const setTenantActiveUseCase = new SetTenantActiveUseCase(tenantRepository, bitacoraService);

// ============================================
// Rate limiters
// ============================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registro público (F4.4a): 5/hora por IP en prod (misma receta que
// loginLimiter: 100 en dev/test para no romper la suite).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================
// Public routes (no auth)
// ============================================

router.post('/auth/login', loginLimiter, async (req, res) => {
  requestLogger.info({}, 'POST /auth/login');

  const { email, password, xUserId } = req.body;
  const result = await loginUseCase.execute({ email, password, xUserId });
  res.json(result);
});

// Registro público de tenant con owner (F4.4a). Sin auth, con rate
// limit propio. Devuelve JWT (auto-login) + user info.
router.post('/auth/register', registerLimiter, async (req, res) => {
  requestLogger.info({}, 'POST /auth/register');

  const { email, password, ownerName, businessName } = req.body;
  const result = await registerUseCase.execute({ email, password, ownerName, businessName });
  res.status(201).json(result);
});

// Cancelación por token (F3.3 #10): sin auth, con rate limit.
router.get('/reservations/cancel/:token', apiLimiter, async (req, res) => {
  const { token } = req.params as { token: string };
  requestLogger.info({ tokenLength: token?.length ?? 0 }, 'GET /reservations/cancel/:token');

  const view = await cancelReservationUseCase.getByToken(token);
  if (!view) {
    throw new NotFoundError('Reservation not found', RESERVATION_NOT_FOUND);
  }
  res.json(reservationResponse(view));
});

router.post('/reservations/cancel/:token', apiLimiter, async (req, res) => {
  const { token } = req.params as { token: string };
  requestLogger.info({ tokenLength: token?.length ?? 0 }, 'POST /reservations/cancel/:token');

  const view = await cancelReservationUseCase.executeByToken(token);
  res.json(reservationResponse(view));
});

// ============================================
// Protected routes (auth required)
// ============================================

router.use(authMiddleware);
router.use(apiLimiter);

// ── Users ───────────────────────────────────

router.get('/users', async (_req, res) => {
  requestLogger.info({}, 'GET /users');

  try {
    const users = await getAllUsersUseCase.execute();
    res.json(users.map((u) => ({
      id: u.id,
      name: u.name.getValue(),
      email: u.email.getValue(),
      role: u.role,
    })));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /users failed');
    res.status(500).json({ error: message });
  }
});

router.get('/users/me', async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  requestLogger.info({ userId }, 'GET /users/me');

  try {
    const user = await userRepository.findById(userId || '');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      id: user.id,
      name: user.name.getValue(),
      email: user.email.getValue(),
      role: user.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /users/me failed');
    res.status(500).json({ error: message });
  }
});

router.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  requestLogger.info({ id }, 'GET /users/:id');

  try {
    const user = await userRepository.findById(id);

    if (!user) {
      requestLogger.warn({ id }, 'GET /users/:id: not found');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      name: user.name.getValue(),
      email: user.email.getValue(),
      role: user.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'GET /users/:id failed');
    res.status(400).json({ error: message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { id, name, email, password } = req.body;
    const user = await createUserUseCase.execute({ id, name, email, password });
    res.status(201).json({
      id: user.id,
      name: user.name.getValue(),
      email: user.email.getValue(),
      role: user.role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'POST /users failed');
    res.status(400).json({ error: message });
  }
});

router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  requestLogger.info({ id }, 'DELETE /users/:id');

  try {
    const existing = await userRepository.findById(id);

    if (!existing) {
      requestLogger.warn({ id }, 'DELETE /users/:id: not found');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await userRepository.delete(id);

    requestLogger.info({ id }, 'DELETE /users/:id: completed');
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'DELETE /users/:id failed');
    res.status(400).json({ error: message });
  }
});

// ── Services (zona tenant — todas con tenantScope) ─

function serviceResponse(service: Service) {
  return {
    id: service.id,
    tenantId: service.tenantId,
    name: service.name.getValue(),
    description: service.description,
    duration: service.duration,
    price: service.price,
    category: service.category,
    isActive: service.isActive,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

router.get('/services', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'GET /services');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const services = await listServicesUseCase.execute(tenantId);
  res.json(services.map(serviceResponse));
});

router.get('/services/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'GET /services/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const service = await getServiceUseCase.execute(id, tenantId);
  if (!service) {
    requestLogger.warn({ id }, 'GET /services/:id: not found');
    throw new NotFoundError('Service not found', SERVICE_NOT_FOUND);
  }

  res.json(serviceResponse(service));
});

router.post('/services', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /services');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { name, description, duration, price, category } = req.body;
  const service = await createServiceUseCase.execute(
    { name, description, duration, price, category },
    tenantId,
    userId,
    { role: req.user?.role, isImpersonating: req.isImpersonating }
  );

  res.status(201).json(serviceResponse(service));
});

router.put('/services/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'PUT /services/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { name, description, duration, price, category, isActive } = req.body;
  const service = await updateServiceUseCase.execute(
    id,
    { name, description, duration, price, category, isActive },
    tenantId,
    userId
  );

  res.json(serviceResponse(service));
});

router.delete('/services/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'DELETE /services/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  await deleteServiceUseCase.execute(id, tenantId, userId);

  requestLogger.info({ id }, 'DELETE /services/:id: completed');
  res.status(204).send();
});

// ── Employees (zona tenant — todas con tenantScope) ─

function employeeResponse(employee: Employee) {
  return {
    id: employee.id,
    tenantId: employee.tenantId,
    userId: employee.userId,
    name: employee.name.getValue(),
    email: employee.email,
    phone: employee.phone,
    offersAllServices: employee.offersAllServices,
    serviceIds: employee.serviceIds,
    customSchedule: employee.customSchedule,
    customHolidays: employee.customHolidays,
    isActive: employee.isActive,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

router.get('/employees', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'GET /employees');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const requesterId = req.user?.id;
  if (!requesterId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const includeInactive = req.query.includeInactive === 'true';
  const employees = await listEmployeesUseCase.execute(tenantId, {
    requesterId,
    requesterRole: req.user?.role,
    includeInactive,
  });
  res.json(employees.map(employeeResponse));
});

router.get('/employees/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'GET /employees/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const requesterId = req.user?.id;
  if (!requesterId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const employee = await getEmployeeUseCase.execute(id, tenantId, {
    id: requesterId,
    role: req.user?.role,
  });

  if (!employee) {
    requestLogger.warn({ id }, 'GET /employees/:id: not found');
    throw new NotFoundError('Employee not found', EMPLOYEE_NOT_FOUND);
  }

  res.json(employeeResponse(employee));
});

router.post('/employees', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /employees');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { name, email, phone, offersAllServices, serviceIds, customSchedule, customHolidays, userId: employeeUserId } = req.body;
  const employee = await createEmployeeUseCase.execute(
    { name, email, phone, offersAllServices, serviceIds, customSchedule, customHolidays, userId: employeeUserId },
    tenantId,
    userId,
    { role: req.user?.role, isImpersonating: req.isImpersonating }
  );

  res.status(201).json(employeeResponse(employee));
});

router.put('/employees/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'PUT /employees/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { name, email, phone, offersAllServices, serviceIds, customSchedule, customHolidays, userId: employeeUserId, isActive } = req.body;
  const employee = await updateEmployeeUseCase.execute(
    id,
    {
      name,
      email,
      phone,
      offersAllServices,
      serviceIds,
      customSchedule,
      customHolidays,
      userId: employeeUserId,
      isActive,
    },
    tenantId,
    userId
  );

  res.json(employeeResponse(employee));
});

router.delete('/employees/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'DELETE /employees/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  await deleteEmployeeUseCase.execute(id, tenantId, userId);

  requestLogger.info({ id }, 'DELETE /employees/:id: completed');
  res.status(204).send();
});

// ── Reservations (zona tenant — todas con tenantScope) ─
// F3.3: CRUD básico sin motor de disponibilidad (F4). La cancelación
// pública por token vive arriba, antes de authMiddleware.

function reservationResponse(view: ReservationWithRelations & { groupTotalPrice?: number }) {
  const r = view.reservation;
  return {
    id: r.id,
    tenantId: r.tenantId,
    clientId: r.clientId,
    employeeId: r.employeeId,
    serviceId: r.serviceId,
    date: r.date.toISOString().slice(0, 10),
    startTimeUTC: r.startTimeUTC.toISOString(),
    endTimeUTC: r.endTimeUTC.toISOString(),
    timezone: r.timezone,
    duration: r.duration,
    status: r.status,
    notes: r.notes,
    activeKey: r.activeKey,
    cancelToken: r.cancelToken,
    // F4.5b: agrupación de multi-servicio. `groupTotalPrice` solo
    // cuando la fila pertenece a un grupo (POST / GET / listado).
    groupBookingId: r.groupBookingId,
    ...(view.groupTotalPrice !== undefined
      ? { groupTotalPrice: view.groupTotalPrice }
      : {}),
    client: view.client,
    employee: view.employee,
    service: view.service,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

router.get('/reservations', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'GET /reservations');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const { status, date, from, to, employeeId, clientId, limit } = req.query as Record<string, string | undefined>;
  const reservations = await listReservationsUseCase.execute(tenantId, {
    status,
    date,
    from,
    to,
    employeeId,
    clientId,
    limit: limit ? Math.min(Number(limit) || 50, 200) : undefined,
  });
  res.json(reservations.map(reservationResponse));
});

router.get('/reservations/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'GET /reservations/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const view = await getReservationUseCase.execute(id, tenantId);
  res.json(reservationResponse(view));
});

router.post('/reservations', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /reservations');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { employeeId, serviceId, serviceIds, date, startTimeUTC, duration, notes, status, timezone, clientId, client } =
    req.body;
  const view = await createReservationUseCase.execute(
    {
      employeeId,
      serviceId,
      // F4.5b: multi-servicio seguido (longitud >1 → grupo con
      // groupBookingId; 1 → reserva simple).
      serviceIds,
      date,
      startTimeUTC,
      duration,
      notes,
      status,
      timezone,
      clientId,
      client,
    },
    tenantId,
    userId
  );

  res.status(201).json(reservationResponse(view));
});

router.put('/reservations/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'PUT /reservations/:id');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  // F4.7a: además de notes/status, el PUT acepta date/startTimeUTC/
  // employeeId → reprogramación (el use case decide el camino, F0 #2).
  const { notes, status, date, startTimeUTC, employeeId } = req.body;
  const view = await updateReservationUseCase.execute(
    id,
    { notes, status, date, startTimeUTC, employeeId },
    tenantId,
    userId
  );
  res.json(reservationResponse(view));
});

// ── Availability (zona tenant — F4.1a) ──────
// GET /availability: slots libres de un empleado. owner/employee y
// admin con X-Tenant-Id (tenantScope).

function availabilityErrorStatus(message: string): number {
  if (message.includes('not found')) return 404;
  if (
    message.includes('required') ||
    message.includes('must') ||
    message.includes('requires') ||
    message.includes('invalid')
  ) {
    return 400;
  }
  return 500;
}

router.get('/availability', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'GET /availability');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const query = req.query as Record<string, string | undefined>;
    const result = await getAvailabilityUseCase.execute(tenantId, {
      employeeId: query.employeeId,
      duration: query.duration,
      // F4.5a: multi-servicio seguido (`svc1,svc2`), exclusivo con
      // duration. Un array (?serviceIds=a&serviceIds=b) lo rechaza el
      // use case con 400.
      serviceIds: query.serviceIds,
      from: query.from,
      to: query.to,
      limit: query.limit,
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /availability failed');
    res.status(availabilityErrorStatus(message)).json({ error: message });
  }
});

// ── Tenant config (zona tenant — F3.4) ──────
// GET /tenants/me: owner o employee (F3.4 #12/#13 — CreateReservation
// como employee lee requireClientPhone/requireClientEmail).
// PUT /tenants/me: solo owner (F3.4 #13 — editTenantConfig).
// F4.0: un admin con X-Tenant-Id (isImpersonating) opera COMO owner →
// también pasa ambos guards. admin sin header cae antes en
// tenantScope → 403 'Tenant scope required'.

const TENANT_CONFIG_READ_ROLES = ['owner', 'employee'];

function tenantConfigResponse(tenant: Tenant) {
  // F4.4a: la clave email_verification (con el token) NUNCA sale al
  // frontend; en su lugar se expone el flag derivado emailVerified.
  const { email_verification: _emailVerification, ...settings } = tenant.settings.getValue();
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    currency: tenant.currency,
    timezone: tenant.timezone,
    isActive: tenant.isActive,
    settings: { ...settings, emailVerified: !tenant.settings.emailVerification },
    schedules: tenant.schedules.map((block) => block.getValue()),
    holidays: tenant.holidays.map((holiday) => holiday.getValue()),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

// ── Email verification (F4.4a) ──────────────
// Reenvío del email al owner del tenant (autenticado, tenantScope).
// No-op silencioso si ya verificado → { sent: false }.
router.post('/auth/resend-verification', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /auth/resend-verification');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const result = await resendVerificationUseCase.execute(tenantId);
  res.json(result);
});

// Verificación (F4.4a): el token viaja SOLO en la URL del email; el
// frontend lo lee de la query y lo envía aquí. Devuelve el tenant
// completo (mismo shape que GET /tenants/me, sin la clave).
router.post('/tenants/verify-email', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /tenants/verify-email');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }

  const { token } = req.body;
  const tenant = await verifyEmailUseCase.execute(tenantId, { token });
  res.json(tenantConfigResponse(tenant));
});

router.get('/tenants/me', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId, role: req.user?.role }, 'GET /tenants/me');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }
  if (
    !TENANT_CONFIG_READ_ROLES.includes(req.user?.role ?? '') &&
    req.isImpersonating !== true
  ) {
    throw new ForbiddenError('Owner or employee access required');
  }

  const tenant = await getTenantConfigUseCase.execute(tenantId);
  res.json(tenantConfigResponse(tenant));
});

router.put('/tenants/me', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId, role: req.user?.role }, 'PUT /tenants/me');

  if (!tenantId) {
    throw new ForbiddenError('Tenant scope required');
  }
  if (req.user?.role !== 'owner' && req.isImpersonating !== true) {
    throw new ForbiddenError('Owner access required');
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { name, currency, timezone, settings, schedules, holidays } = req.body;
  const tenant = await updateTenantConfigUseCase.execute(
    tenantId,
    { name, currency, timezone, settings, schedules, holidays },
    userId,
    { role: req.user?.role, isImpersonating: req.isImpersonating }
  );
  res.json(tenantConfigResponse(tenant));
});

// ── Files (generic presigned URL) ───────────

router.get('/files/:key/url', tenantScope, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'GET /files/:key/url');

  try {
    if (!isR2Configured()) {
      res.json({ url: `/uploads/${key}` });
      return;
    }

    const url = await getFileUrlAsync(key, 7200);
    res.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, key }, 'GET /files/:key/url failed');
    res.status(400).json({ error: message });
  }
});

// ── Config ──────────────────────────────────

router.get('/config', async (_req, res) => {
  requestLogger.info({}, 'GET /config');
  const configs = await getAllConfigUseCase.execute();
  res.json(configs.map((c) => ({
    id: c.id,
    key: c.key,
    value: c.value,
    description: c.description,
    category: c.category,
    updatedBy: c.updatedBy,
    updatedAt: c.updatedAt,
  })));
});

router.get('/config/category/:category', async (req, res) => {
  const { category } = req.params;
  requestLogger.info({ category }, 'GET /config/category/:category');
  const configs = await getConfigByCategoryUseCase.execute(category);
  res.json(configs.map((c) => ({
    id: c.id,
    key: c.key,
    value: c.value,
    description: c.description,
    category: c.category,
    updatedBy: c.updatedBy,
    updatedAt: c.updatedAt,
  })));
});

router.get('/config/:key', async (req, res) => {
  const { key } = req.params;
  requestLogger.info({ key }, 'GET /config/:key');
  const config = await getConfigUseCase.execute(key);
  if (!config) {
    throw new NotFoundError(`Config "${key}" not found`, CONFIG_NOT_FOUND);
  }
  res.json({
    id: config.id,
    key: config.key,
    value: config.value,
    description: config.description,
    category: config.category,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt,
  });
});

router.put('/config/:key', adminMiddleware, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'PUT /config/:key');
  const { value, description, category } = req.body;
  if (value === undefined) {
    throw new ValidationError('value is required');
  }
  const normalizedValue = key === 'logging.level' ? normalizeLogLevel(value) : value;
  const config = await upsertConfigUseCase.execute({
    key,
    value: normalizedValue,
    description,
    category,
    updatedBy: req.user?.id,
  });
  res.status(201).json({
    id: config.id,
    key: config.key,
    value: config.value,
    description: config.description,
    category: config.category,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt,
  });
});

router.patch('/config/:key', adminMiddleware, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'PATCH /config/:key');
  const existing = await getConfigUseCase.execute(key);
  if (!existing) {
    throw new NotFoundError(`Config "${key}" not found`, CONFIG_NOT_FOUND);
  }
  const { value, description, category } = req.body;
  const normalizedValue = key === 'logging.level' && value !== undefined ? normalizeLogLevel(value) : value;
  const config = await upsertConfigUseCase.execute({
    key,
    value: normalizedValue !== undefined ? normalizedValue : existing.value,
    description: description !== undefined ? description : existing.description ?? undefined,
    category: category !== undefined ? category : existing.category ?? undefined,
    updatedBy: req.user?.id,
  });
  res.json({
    id: config.id,
    key: config.key,
    value: config.value,
    description: config.description,
    category: config.category,
    updatedBy: config.updatedBy,
    updatedAt: config.updatedAt,
  });
});

router.delete('/config/:key', adminMiddleware, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'DELETE /config/:key');
  await deleteConfigUseCase.execute(key, req.user?.id);
  res.status(204).send();
});

// ── Event Queue (service-to-service) ────────

router.get('/events/pending', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const events = await prisma.eventQueue.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    if (events.length === 0) {
      res.json({ events: [] });
      return;
    }

    const ids = events.map(e => e.id);
    await prisma.eventQueue.updateMany({
      where: { id: { in: ids } },
      data: { status: 'processing' },
    });

    res.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /events/pending failed');
    res.status(500).json({ error: message });
  }
});

router.patch('/events/:id/complete', async (req, res) => {
  const { id } = req.params;
  try {
    const event = await prisma.eventQueue.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const updated = await prisma.eventQueue.update({
      where: { id },
      data: { status: 'completed', processedAt: new Date() },
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'PATCH /events/:id/complete failed');
    res.status(400).json({ error: message });
  }
});

router.patch('/events/:id/fail', async (req, res) => {
  const { id } = req.params;
  try {
    const event = await prisma.eventQueue.findUnique({ where: { id } });
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const maxAttempts = 3;
    const newAttempts = event.attempts + 1;
    const newStatus = newAttempts >= maxAttempts ? 'failed' : 'pending';

    const updated = await prisma.eventQueue.update({
      where: { id },
      data: {
        status: newStatus,
        attempts: newAttempts,
        lastError: req.body.error || null,
      },
    });

    res.json({ id: updated.id, status: updated.status, attempts: updated.attempts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'PATCH /events/:id/fail failed');
    res.status(400).json({ error: message });
  }
});

// ── Admin routes (admin role required) ────────

// ── Superficie A: tenants admin (F4.0) ────────
// GET    /admin/tenants                    → lista resumida (sin settings)
// GET    /admin/tenants/:tenantId          → detalle con config completa
// POST   /admin/tenants                    → crea SOLO el tenant (sin owner)
// PUT    /admin/tenants/:tenantId          → edición total (mismo payload que PUT /tenants/me)
// PATCH  /admin/tenants/:tenantId/active   → soft delete / reactivación
// GET    /admin/tenants/:tenantId/services|employees|reservations → solo lectura
// Todas con adminMiddleware (DB lookup de rol) + authMiddleware previo.

function tenantSummaryResponse(t: {
  id: string;
  name: string;
  slug: string | null;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    currency: t.currency,
    timezone: t.timezone,
    isActive: t.isActive,
    createdAt: t.createdAt,
  };
}

router.get('/admin/tenants', adminMiddleware, async (req, res) => {
  requestLogger.info({}, 'GET /admin/tenants');
  const tenants = await listTenantsUseCase.execute();
  res.json(tenants.map(tenantSummaryResponse));
});

router.get('/admin/tenants/:tenantId', adminMiddleware, async (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  requestLogger.info({ tenantId }, 'GET /admin/tenants/:tenantId');
  const tenant = await getAdminTenantUseCase.execute(tenantId);
  res.json(tenantConfigResponse(tenant));
});

router.post('/admin/tenants', adminMiddleware, async (req: AuthRequest, res) => {
  requestLogger.info({}, 'POST /admin/tenants');
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }
  const { name, slug, currency, timezone, settings, schedules, holidays } = req.body ?? {};
  const tenant = await createTenantUseCase.execute(
    { name, slug, currency, timezone, settings, schedules, holidays },
    userId
  );
  res.status(201).json(tenantConfigResponse(tenant));
});

router.put('/admin/tenants/:tenantId', adminMiddleware, async (req: AuthRequest, res) => {
  const { tenantId } = req.params as { tenantId: string };
  requestLogger.info({ tenantId }, 'PUT /admin/tenants/:tenantId');
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }
  const { name, currency, timezone, settings, schedules, holidays } = req.body ?? {};
  const tenant = await updateTenantUseCase.execute(
    tenantId,
    { name, currency, timezone, settings, schedules, holidays },
    userId
  );
  res.json(tenantConfigResponse(tenant));
});

router.patch('/admin/tenants/:tenantId/active', adminMiddleware, async (req: AuthRequest, res) => {
  const { tenantId } = req.params as { tenantId: string };
  requestLogger.info({ tenantId }, 'PATCH /admin/tenants/:tenantId/active');
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }
  const isActive = req.body?.isActive;
  if (typeof isActive !== 'boolean') {
    throw new ValidationError('isActive must be a boolean');
  }
  const tenant = await setTenantActiveUseCase.execute(tenantId, isActive, userId);
  res.json(tenantConfigResponse(tenant));
});

// Lectura de recursos de un tenant (F4.0 superficie A): solo listado,
// sin escritura. Valida existencia del tenant con findById (sin
// parsear config, para no fallar por filas corruptas en una lectura).

async function ensureAdminTenant(tenantId: string): Promise<boolean> {
  const record = await tenantRepository.findById(tenantId);
  return record !== null;
}

router.get('/admin/tenants/:tenantId/services', adminMiddleware, async (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  requestLogger.info({ tenantId }, 'GET /admin/tenants/:tenantId/services');
  try {
    if (!(await ensureAdminTenant(tenantId))) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    const services = await listServicesUseCase.execute(tenantId);
    res.json(services.map(serviceResponse));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, tenantId }, 'GET /admin/tenants/:tenantId/services failed');
    res.status(500).json({ error: message });
  }
});

router.get('/admin/tenants/:tenantId/employees', adminMiddleware, async (req: AuthRequest, res) => {
  const { tenantId } = req.params as { tenantId: string };
  requestLogger.info({ tenantId }, 'GET /admin/tenants/:tenantId/employees');
  try {
    const requesterId = req.user?.id;
    if (!requesterId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!(await ensureAdminTenant(tenantId))) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    const includeInactive = req.query.includeInactive === 'true';
    const employees = await listEmployeesUseCase.execute(tenantId, {
      requesterId,
      requesterRole: req.user?.role,
      includeInactive,
    });
    res.json(employees.map(employeeResponse));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, tenantId }, 'GET /admin/tenants/:tenantId/employees failed');
    res.status(500).json({ error: message });
  }
});

router.get('/admin/tenants/:tenantId/reservations', adminMiddleware, async (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  requestLogger.info({ tenantId }, 'GET /admin/tenants/:tenantId/reservations');
  try {
    if (!(await ensureAdminTenant(tenantId))) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    const { status, date, employeeId, clientId, limit } = req.query as Record<string, string | undefined>;
    const reservations = await listReservationsUseCase.execute(tenantId, {
      status,
      date,
      employeeId,
      clientId,
      limit: limit ? Math.min(Number(limit) || 50, 200) : undefined,
    });
    res.json(reservations.map(reservationResponse));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, tenantId }, 'GET /admin/tenants/:tenantId/reservations failed');
    res.status(400).json({ error: message });
  }
});

// ── Bitácora (admin) ─────────────────────────

router.get('/admin/bitacora', adminMiddleware, async (req, res) => {
  requestLogger.info({}, 'GET /admin/bitacora');
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const userId = req.query.userId as string | undefined;
    const actionRaw = req.query.action as string | undefined;
    const actions = actionRaw ? actionRaw.split(',').map((a) => a.trim()).filter(Boolean) : undefined;
    const entityType = req.query.entityType as string | undefined;
    const since = req.query.since as string | undefined;
    const until = req.query.until as string | undefined;
    // F4.0: eventos hechos por un admin en modo owner.
    // `adminAsOwner=any` → todos con la clave; `adminAsOwner=<tenantId>` → de ese tenant.
    const adminAsOwner = req.query.adminAsOwner as string | undefined;

    const result = await listBitacoraUseCase.execute({
      page,
      limit,
      userId,
      actions,
      entityType,
      since,
      until,
      adminAsOwner: adminAsOwner === 'any' ? 'any' : adminAsOwner,
    });

    res.json({
      data: result.data.map((e) => ({
        id: e.id,
        userId: e.userId,
        action: e.action,
        tenantId: e.tenantId,
        entityType: e.entityType,
        entityId: e.entityId,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      total: result.total,
      page,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /admin/bitacora failed');
    res.status(500).json({ error: message });
  }
});

export default router;
