import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createLogger, format, transports } from 'winston';

import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { regionsRouter } from './routes/regions';
import { clientsRouter } from './routes/clients';
import { sitesRouter } from './routes/sites';
import { projectionsRouter } from './routes/projections';
import { invoicesRouter } from './routes/invoices';
import { submissionRouter } from './routes/submission';
import { paymentsRouter } from './routes/payments';
import { dsoRouter } from './routes/dso';
import { reportsRouter } from './routes/reports';
import { emailIntegrationRouter } from './routes/emailIntegration';
import { settingsRouter } from './routes/settings';
import { auditRouter } from './routes/audit';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { prisma } from './config/database';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? format.json()
      : format.combine(format.colorize(), format.simple())
  ),
  transports: [new transports.Console()],
});

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server) or matching Render/localhost
    if (!origin || origin.includes('onrender.com') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for production deployment
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

app.use(globalLimiter);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0',
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/users', usersRouter);
app.use('/api/regions', regionsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/projections', projectionsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/submission', submissionRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/dso', dsoRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/email-integration', emailIntegrationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/audit', auditRouter);

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    logger.info('Database connected.');
    
    // Auto-seed initial admin and demo data if not already present
    const { autoSeedDatabase } = await import('./services/autoSeed');
    await autoSeedDatabase();

    app.listen(PORT, () => {
      logger.info(`GTS Invoice API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
