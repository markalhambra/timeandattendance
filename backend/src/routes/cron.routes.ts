import { Router } from 'express';
import {
  cronAbsentCheck,
  cronDailyMaintenance,
  cronVlAccrual,
} from '../controllers/cron.controller';

export const cronRoutes = Router();

// Vercel Cron calls these endpoints via GET on the configured schedule
cronRoutes.get('/absent-check', cronAbsentCheck);
cronRoutes.get('/daily-maintenance', cronDailyMaintenance);
cronRoutes.get('/vl-accrual', cronVlAccrual);
