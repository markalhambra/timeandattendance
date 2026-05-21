import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getAuditLogs } from '../controllers/audit.controller';

export const auditRoutes = Router();

auditRoutes.get('/', authenticate, authorize('ADMIN'), getAuditLogs);
