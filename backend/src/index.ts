/**
 * @file index.ts
 * @module backend
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import pinoHttp from 'pino-http';
import { fileURLToPath } from 'url';
import logger from './infrastructure/logging/logger';
import { startLogLevelSync } from './infrastructure/logging/logger';
import { requestContextMiddleware, getRequestId } from './infrastructure/logging/requestContext';
import v1Router from './infrastructure/api/v1/routes';
import { startAutoReload } from './infrastructure/config/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// 📌 Habilita trust proxy para que req.ip sea la IP real del cliente
// "1" significa que confía en el primer proxy que está delante de la aplicación
// De no hacerlo asi, los intentos los computa siempre sobre la IP del proxy
app.set('trust proxy', 1);

const port = process.env.PORT || 3000;

// CORS: configurable via CORS_ORIGIN env var (comma-separated for multiple origins)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(helmet({
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

app.use(requestContextMiddleware);

app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} ${err.message}`,
  customProps: () => {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  customAttributeKeys: { req: 'request', res: 'response' },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});

app.use(httpLogger);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1', v1Router);

export default app;

// Solo inicia el servidor si se ejecuta directamente (no en tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  startAutoReload().then(() => {
    startLogLevelSync();
    app.listen(port, () => {
      logger.info({ port }, 'Server started');
    });
  });
}