import { Router } from 'express';
import {
  cronAbsentCheck,
  cronExpirePendingOvertime,
  cronExpireApprovedOvertime,
  cronExpirationAlerts,
} from '../controllers/cron.controller';

export const cronRoutes = Router();

// Vercel Cron calls these endpoints via GET on the configured schedule
cronRoutes.get('/absent-check', cronAbsentCheck);
cronRoutes.get('/expire-pending-overtime', cronExpirePendingOvertime);
cronRoutes.get('/expire-approved-overtime', cronExpireApprovedOvertime);
cronRoutes.get('/expiration-alerts', cronExpirationAlerts);
