/**
 * @file routes.ts
 * @module infrastructure/api/v1/routes
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CreateUserUseCase } from '../../../application/use-cases/CreateUserUseCase';
import { GetAllUsersUseCase } from '../../../application/use-cases/GetAllUsersUseCase';
import { LoginUseCase } from '../../../application/use-cases/LoginUseCase';
import CreateItemUseCase from '../../../application/use-cases/items/CreateItemUseCase';
import GetItemUseCase from '../../../application/use-cases/items/GetItemUseCase';
import ListItemsUseCase from '../../../application/use-cases/items/ListItemsUseCase';
import UpdateItemUseCase from '../../../application/use-cases/items/UpdateItemUseCase';
import DeleteItemUseCase from '../../../application/use-cases/items/DeleteItemUseCase';
import UploadItemFileUseCase from '../../../application/use-cases/items/UploadItemFileUseCase';
import { GetConfigUseCase, GetAllConfigUseCase, GetConfigByCategoryUseCase } from '../../../application/use-cases/config/GetConfigUseCase';
import { UpsertConfigUseCase } from '../../../application/use-cases/config/UpsertConfigUseCase';
import { DeleteConfigUseCase } from '../../../application/use-cases/config/DeleteConfigUseCase';
import PrismaUserRepository from '../../persistence/PrismaUserRepository';
import PrismaItemRepository from '../../persistence/PrismaItemRepository';
import PrismaBitacoraRepository from '../../persistence/PrismaBitacoraRepository';
import PrismaConfigRepository from '../../persistence/PrismaConfigRepository';
import BitacoraService from '../../logging/BitacoraService';
import HashService from '../../security/HashService';
import requestLogger from '../../logging/requestContext';
import { authMiddleware } from '../../middleware/auth';
import { adminMiddleware } from '../../middleware/admin';
import type { AuthRequest } from '../../middleware/auth';
import ListBitacoraUseCase from '../../../application/use-cases/bitacora/ListBitacoraUseCase';
import prisma from '../../persistence/prismaClient';
import demoFileUpload from '../../storage/demoFileUpload';
import { isR2Configured, getFileUrlAsync, getFileUrl } from '../../storage/storageService';
import Item from '../../../domain/entities/Item';

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

const itemRepository = new PrismaItemRepository();
const createItemUseCase = new CreateItemUseCase(itemRepository, bitacoraService);
const getItemUseCase = new GetItemUseCase(itemRepository);
const listItemsUseCase = new ListItemsUseCase(itemRepository);
const updateItemUseCase = new UpdateItemUseCase(itemRepository, bitacoraService);
const deleteItemUseCase = new DeleteItemUseCase(itemRepository, bitacoraService);
const uploadItemFileUseCase = new UploadItemFileUseCase(itemRepository, bitacoraService);

const configRepository = new PrismaConfigRepository();
const getConfigUseCase = new GetConfigUseCase(configRepository);
const getAllConfigUseCase = new GetAllConfigUseCase(configRepository);
const getConfigByCategoryUseCase = new GetConfigByCategoryUseCase(configRepository);
const upsertConfigUseCase = new UpsertConfigUseCase(configRepository, bitacoraService);
const deleteConfigUseCase = new DeleteConfigUseCase(configRepository, bitacoraService);

const listBitacoraUseCase = new ListBitacoraUseCase(bitacoraRepository);

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

// ── Items ───────────────────────────────────

function itemResponse(item: Item) {
  return {
    id: item.id,
    title: item.title.getValue(),
    description: item.description,
    status: item.status,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    fileKey: item.fileKey,
    mimeType: item.mimeType,
    fileUrl: item.fileKey ? getFileUrl(item.fileKey) : null,
  };
}

router.get('/items', async (_req, res) => {
  requestLogger.info({}, 'GET /items');

  try {
    const items = await listItemsUseCase.execute();
    res.json(items.map(itemResponse));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'GET /items failed');
    res.status(500).json({ error: message });
  }
});

router.get('/items/:id', async (req, res) => {
  const { id } = req.params;
  requestLogger.info({ id }, 'GET /items/:id');

  try {
    const item = await getItemUseCase.execute(id);

    if (!item) {
      requestLogger.warn({ id }, 'GET /items/:id: not found');
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(itemResponse(item));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message, id }, 'GET /items/:id failed');
    res.status(400).json({ error: message });
  }
});

router.post('/items', async (req: AuthRequest, res) => {
  requestLogger.info({}, 'POST /items');

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { title, description } = req.body;
    const item = await createItemUseCase.execute({ title, description }, userId);

    res.status(201).json(itemResponse(item));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    requestLogger.error({ error: message }, 'POST /items failed');
    res.status(400).json({ error: message });
  }
});

router.post('/items/:id/file', demoFileUpload.single('file'), async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  requestLogger.info({ id }, 'POST /items/:id/file');

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const item = await uploadItemFileUseCase.execute(id, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      size: req.file.size,
    }, userId);

    res.json(itemResponse(item));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message }, 'POST /items/:id/file: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'POST /items/:id/file failed');
    res.status(400).json({ error: message });
  }
});

router.patch('/items/:id', async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  requestLogger.info({ id }, 'PATCH /items/:id');

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { title, description, status } = req.body;
    const item = await updateItemUseCase.execute(id, { title, description, status }, userId);

    res.json(itemResponse(item));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message }, 'PATCH /items/:id: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'PATCH /items/:id failed');
    res.status(400).json({ error: message });
  }
});

router.delete('/items/:id', async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  requestLogger.info({ id }, 'DELETE /items/:id');

  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await deleteItemUseCase.execute(id, userId);

    requestLogger.info({ id }, 'DELETE /items/:id: completed');
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('not found')) {
      requestLogger.error({ error: message }, 'DELETE /items/:id: not found');
      res.status(404).json({ error: message });
      return;
    }
    requestLogger.error({ error: message, id }, 'DELETE /items/:id failed');
    res.status(400).json({ error: message });
  }
});

// ── Files (generic presigned URL) ───────────

router.get('/files/:key/url', async (req, res) => {
  const { key } = req.params;
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
