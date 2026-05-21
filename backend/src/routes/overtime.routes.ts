import { Router } from 'express';
import * as overtimeController from '../controllers/overtime.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

export const overtimeRoutes = Router();
overtimeRoutes.use(authenticate);

overtimeRoutes.get('/my', overtimeController.getMyOvertime);
overtimeRoutes.get('/credits', overtimeController.getOvertimeCredits);
overtimeRoutes.patch('/:id/file', auditLog('UPDATE', 'OvertimeRecord'), overtimeController.fileOvertimeRequest);
overtimeRoutes.post('/convert', auditLog('CREATE', 'OvertimeConversion'), overtimeController.convertOvertime);
overtimeRoutes.get('/conversions/my', overtimeController.getMyConversions);

overtimeRoutes.get('/', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), overtimeController.getAllOvertime);
overtimeRoutes.patch('/:id/review', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), overtimeController.reviewOvertime);
overtimeRoutes.get('/conversions', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), overtimeController.getConversions);
overtimeRoutes.patch('/conversions/:id/review', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), overtimeController.reviewConversion);
