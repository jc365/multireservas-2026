/**
 * @file routes.ts
 * @module infrastructure/api/v1/routes
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CreateUserUseCase } from '../../../application/use-cases/CreateUserUseCase';
import { GetAllUsersUseCase } from '../../../application/use-cases/GetAllUsersUseCase';
import { LoginUseCase } from '../../../application/use-cases/LoginUseCase';
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
import prisma from '../../persistence/prismaClient';
import { isR2Configured, getFileUrlAsync } from '../../storage/storageService';
import Service from '../../../domain/entities/Service';
import Employee from '../../../domain/entities/Employee';
import Tenant from '../../../domain/entities/Tenant';
import type { ReservationWithRelations } from '../../../application/interfaces/IReservationRepository';
import { emailService } from '../../email/EmailService';

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
const createServiceUseCase = new CreateServiceUseCase(serviceRepository, tenantRepository, bitacoraService);
const getServiceUseCase = new GetServiceUseCase(serviceRepository);
const listServicesUseCase = new ListServicesUseCase(serviceRepository);
const updateServiceUseCase = new UpdateServiceUseCase(serviceRepository, tenantRepository, bitacoraService);
const deleteServiceUseCase = new DeleteServiceUseCase(serviceRepository, bitacoraService);

const employeeRepository = new PrismaEmployeeRepository();
const createEmployeeUseCase = new CreateEmployeeUseCase(employeeRepository, serviceRepository, userRepository, bitacoraService);
const getEmployeeUseCase = new GetEmployeeUseCase(employeeRepository);
const listEmployeesUseCase = new ListEmployeesUseCase(employeeRepository);
const updateEmployeeUseCase = new UpdateEmployeeUseCase(employeeRepository, serviceRepository, userRepository, bitacoraService);
const deleteEmployeeUseCase = new DeleteEmployeeUseCase(employeeRepository, bitacoraService);

const clientRepository = new PrismaClientRepository();
const reservationRepository = new PrismaReservationRepository();
const findOrCreateClientUseCase = new FindOrCreateClientUseCase(clientRepository, tenantRepository);
const createReservationUseCase = new CreateReservationUseCase(
  reservationRepository,
  employeeRepository,
  serviceRepository,
  clientRepository,
  tenantRepository,
  findOrCreateClientUseCase,
  bitacoraService,
  emailService
);
const listReservationsUseCase = new ListReservationsUseCase(reservationRepository);
const getReservationUseCase = new GetReservationUseCase(reservationRepository);
const updateReservationUseCase = new UpdateReservationUseCase(reservationRepository, bitacoraService);
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

  try {
    const { email, password, xUserId } = req.body;
    const result = await loginUseCase.execute({ email, password, xUserId });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'POST /auth/login failed');
    res.status(401).json({ error: message });
  }
});

// Cancelación por token (F3.3 #10): sin auth, con rate limit.
router.get('/reservations/cancel/:token', apiLimiter, async (req, res) => {
  const { token } = req.params as { token: string };
  requestLogger.info({ tokenLength: token?.length ?? 0 }, 'GET /reservations/cancel/:token');

  try {
    const view = await cancelReservationUseCase.getByToken(token);
    if (!view) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }
    res.json(reservationResponse(view));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /reservations/cancel/:token failed');
    res.status(500).json({ error: message });
  }
});

router.post('/reservations/cancel/:token', apiLimiter, async (req, res) => {
  const { token } = req.params as { token: string };
  requestLogger.info({ tokenLength: token?.length ?? 0 }, 'POST /reservations/cancel/:token');

  try {
    const view = await cancelReservationUseCase.executeByToken(token);
    res.json(reservationResponse(view));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'POST /reservations/cancel/:token failed');
    res.status(reservationErrorStatus(message)).json({ error: message });
  }
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
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const services = await listServicesUseCase.execute(tenantId);
    res.json(services.map(serviceResponse));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /services failed');
    res.status(500).json({ error: message });
  }
});

router.get('/services/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'GET /services/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const service = await getServiceUseCase.execute(id, tenantId);

    if (!service) {
      requestLogger.warn({ id }, 'GET /services/:id: not found');
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    res.json(serviceResponse(service));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'GET /services/:id failed');
    res.status(400).json({ error: message });
  }
});

router.post('/services', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /services');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name, description, duration, price, category } = req.body;
    const service = await createServiceUseCase.execute(
      { name, description, duration, price, category },
      tenantId,
      userId
    );

    res.status(201).json(serviceResponse(service));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message }, 'POST /services: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message }, 'POST /services failed');
    res.status(400).json({ error: message });
  }
});

router.put('/services/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'PUT /services/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name, description, duration, price, category, isActive } = req.body;
    const service = await updateServiceUseCase.execute(
      id,
      { name, description, duration, price, category, isActive },
      tenantId,
      userId
    );

    res.json(serviceResponse(service));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message, id }, 'PUT /services/:id: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'PUT /services/:id failed');
    res.status(400).json({ error: message });
  }
});

router.delete('/services/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'DELETE /services/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await deleteServiceUseCase.execute(id, tenantId, userId);

    requestLogger.info({ id }, 'DELETE /services/:id: completed');
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message, id }, 'DELETE /services/:id: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'DELETE /services/:id failed');
    res.status(400).json({ error: message });
  }
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
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const requesterId = req.user?.id;
    if (!requesterId) {
      res.status(401).json({ error: 'Unauthorized' });
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
    requestLogger.error({ error: message }, 'GET /employees failed');
    res.status(500).json({ error: message });
  }
});

router.get('/employees/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'GET /employees/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const requesterId = req.user?.id;
    if (!requesterId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const employee = await getEmployeeUseCase.execute(id, tenantId, {
      id: requesterId,
      role: req.user?.role,
    });

    if (!employee) {
      requestLogger.warn({ id }, 'GET /employees/:id: not found');
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    res.json(employeeResponse(employee));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'GET /employees/:id failed');
    res.status(400).json({ error: message });
  }
});

router.post('/employees', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /employees');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name, email, phone, offersAllServices, serviceIds, customSchedule, customHolidays, userId: employeeUserId } = req.body;
    const employee = await createEmployeeUseCase.execute(
      { name, email, phone, offersAllServices, serviceIds, customSchedule, customHolidays, userId: employeeUserId },
      tenantId,
      userId
    );

    res.status(201).json(employeeResponse(employee));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message }, 'POST /employees: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message }, 'POST /employees failed');
    res.status(400).json({ error: message });
  }
});

router.put('/employees/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'PUT /employees/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message, id }, 'PUT /employees/:id: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'PUT /employees/:id failed');
    res.status(400).json({ error: message });
  }
});

router.delete('/employees/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'DELETE /employees/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await deleteEmployeeUseCase.execute(id, tenantId, userId);

    requestLogger.info({ id }, 'DELETE /employees/:id: completed');
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message, id }, 'DELETE /employees/:id: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'DELETE /employees/:id failed');
    res.status(400).json({ error: message });
  }
});

// ── Reservations (zona tenant — todas con tenantScope) ─
// F3.3: CRUD básico sin motor de disponibilidad (F4). La cancelación
// pública por token vive arriba, antes de authMiddleware.

function reservationResponse(view: ReservationWithRelations) {
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
    client: view.client,
    employee: view.employee,
    service: view.service,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function reservationErrorStatus(message: string): number {
  if (message.includes('not found')) return 404;
  if (message.includes('overlap')) return 409;
  if (message.includes('already')) return 409;
  return 400;
}

router.get('/reservations', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'GET /reservations');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
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
    requestLogger.error({ error: message }, 'GET /reservations failed');
    res.status(reservationErrorStatus(message)).json({ error: message });
  }
});

router.get('/reservations/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'GET /reservations/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const view = await getReservationUseCase.execute(id, tenantId);
    res.json(reservationResponse(view));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'GET /reservations/:id failed');
    res.status(reservationErrorStatus(message)).json({ error: message });
  }
});

router.post('/reservations', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId }, 'POST /reservations');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { employeeId, serviceId, date, startTimeUTC, duration, notes, status, timezone, clientId, client } = req.body;
    const view = await createReservationUseCase.execute(
      { employeeId, serviceId, date, startTimeUTC, duration, notes, status, timezone, clientId, client },
      tenantId,
      userId
    );

    res.status(201).json(reservationResponse(view));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'POST /reservations failed');
    res.status(reservationErrorStatus(message)).json({ error: message });
  }
});

router.put('/reservations/:id', tenantScope, async (req: TenantRequest, res) => {
  const { id } = req.params as { id: string };
  const tenantId = req.tenantId;
  requestLogger.info({ id }, 'PUT /reservations/:id');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { notes, status } = req.body;
    const view = await updateReservationUseCase.execute(id, { notes, status }, tenantId, userId);
    res.json(reservationResponse(view));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'PUT /reservations/:id failed');
    res.status(reservationErrorStatus(message)).json({ error: message });
  }
});

// ── Tenant config (zona tenant — F3.4) ──────
// GET /tenants/me: owner o employee (F3.4 #12/#13 — CreateReservation
// como employee lee requireClientPhone/requireClientEmail).
// PUT /tenants/me: solo owner (F3.4 #13 — editTenantConfig).
// admin ya cae antes en tenantScope → 403 'Tenant scope required'.

const TENANT_CONFIG_READ_ROLES = ['owner', 'employee'];

function tenantConfigResponse(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    currency: tenant.currency,
    timezone: tenant.timezone,
    isActive: tenant.isActive,
    settings: tenant.settings.getValue(),
    schedules: tenant.schedules.map((block) => block.getValue()),
    holidays: tenant.holidays.map((holiday) => holiday.getValue()),
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

router.get('/tenants/me', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId, role: req.user?.role }, 'GET /tenants/me');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }
  if (!req.user?.role || !TENANT_CONFIG_READ_ROLES.includes(req.user.role)) {
    res.status(403).json({ error: 'Owner or employee access required' });
    return;
  }

  try {
    const tenant = await getTenantConfigUseCase.execute(tenantId);
    res.json(tenantConfigResponse(tenant));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Tenant not found') {
      requestLogger.warn({ tenantId }, 'GET /tenants/me: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message }, 'GET /tenants/me failed');
    res.status(500).json({ error: message });
  }
});

router.put('/tenants/me', tenantScope, async (req: TenantRequest, res) => {
  const tenantId = req.tenantId;
  requestLogger.info({ tenantId, role: req.user?.role }, 'PUT /tenants/me');

  if (!tenantId) {
    res.status(403).json({ error: 'Tenant scope required' });
    return;
  }
  if (req.user?.role !== 'owner') {
    res.status(403).json({ error: 'Owner access required' });
    return;
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name, currency, timezone, settings, schedules, holidays } = req.body;
    const tenant = await updateTenantConfigUseCase.execute(
      tenantId,
      { name, currency, timezone, settings, schedules, holidays },
      userId
    );
    res.json(tenantConfigResponse(tenant));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Tenant not found') {
      requestLogger.warn({ tenantId }, 'PUT /tenants/me: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, tenantId }, 'PUT /tenants/me failed');
    res.status(400).json({ error: message });
  }
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
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /config failed');
    res.status(500).json({ error: message });
  }
});

router.get('/config/category/:category', async (req, res) => {
  const { category } = req.params;
  requestLogger.info({ category }, 'GET /config/category/:category');
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, category }, 'GET /config/category/:category failed');
    res.status(500).json({ error: message });
  }
});

router.get('/config/:key', async (req, res) => {
  const { key } = req.params;
  requestLogger.info({ key }, 'GET /config/:key');
  try {
    const config = await getConfigUseCase.execute(key);
    if (!config) {
      res.status(404).json({ error: `Config "${key}" not found` });
      return;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, key }, 'GET /config/:key failed');
    res.status(500).json({ error: message });
  }
});

router.put('/config/:key', adminMiddleware, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'PUT /config/:key');
  try {
    const { value, description, category } = req.body;
    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, key }, 'PUT /config/:key failed');
    res.status(400).json({ error: message });
  }
});

router.patch('/config/:key', adminMiddleware, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'PATCH /config/:key');
  try {
    const existing = await getConfigUseCase.execute(key);
    if (!existing) {
      res.status(404).json({ error: `Config "${key}" not found` });
      return;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, key }, 'PATCH /config/:key failed');
    res.status(400).json({ error: message });
  }
});

router.delete('/config/:key', adminMiddleware, async (req: AuthRequest, res) => {
  const { key } = req.params as { key: string };
  requestLogger.info({ key }, 'DELETE /config/:key');
  try {
    await deleteConfigUseCase.execute(key, req.user?.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, key }, 'DELETE /config/:key failed');
    res.status(400).json({ error: message });
  }
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

    const result = await listBitacoraUseCase.execute({
      page,
      limit,
      userId,
      actions,
      entityType,
      since,
      until,
    });

    res.json({
      data: result.data.map((e) => ({
        id: e.id,
        userId: e.userId,
        action: e.action,
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
