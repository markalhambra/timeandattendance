import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { logger } from './config/logger';
import { prisma } from './config/database';
import { authRoutes } from './routes/auth.routes';
import { employeeRoutes } from './routes/employee.routes';
import { attendanceRoutes } from './routes/attendance.routes';
import { leaveRoutes } from './routes/leave.routes';
import { overtimeRoutes } from './routes/overtime.routes';
import { departmentRoutes } from './routes/department.routes';
import { reportRoutes } from './routes/report.routes';
import { notificationRoutes } from './routes/notification.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { auditRoutes } from './routes/audit.routes';
import { cronRoutes } from './routes/cron.routes';

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Middleware ───────────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 1000,
  message: { success: false, message: 'Too many authentication attempts.' },
});

app.use(globalLimiter);

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// ─── Logging ──────────────────────────────────────────────────────────────
// Use compact format in production to reduce log volume and execution time.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'short' : 'combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Static Files ─────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '1d',
  etag: true,
}));

// ─── Health Check ─────────────────────────────────────────────────────────
// Queries the DB so external uptime monitors (e.g. UptimeRobot) pinging this
// endpoint also keep the Supabase project alive during weekends/long holidays.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/cron', cronRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error.' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────
// Only bind to a port when running directly (not in Vercel serverless).
// node-cron is not imported here — Vercel cron jobs call HTTP endpoints instead.
if (process.env.VERCEL !== '1') {
  const { scheduleCronJobs } = require('./services/cron.service');
  app.listen(PORT, () => {
    logger.info(`🚀 TAMS Backend running on port ${PORT}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    scheduleCronJobs();
  });
}

export default app;
