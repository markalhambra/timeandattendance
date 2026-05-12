import { Router } from 'express';
import * as overtimeController from '../controllers/overtime.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const overtimeRoutes = Router();
overtimeRoutes.use(authenticate);

overtimeRoutes.get('/my', overtimeController.getMyOvertime);
overtimeRoutes.get('/credits', overtimeController.getOvertimeCredits);
overtimeRoutes.post('/convert', overtimeController.convertOvertime);
overtimeRoutes.get('/conversions/my', overtimeController.getMyConversions);

overtimeRoutes.get('/', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), overtimeController.getAllOvertime);
overtimeRoutes.patch('/:id/review', authorize('DEPARTMENT_HEAD'), overtimeController.reviewOvertime);
overtimeRoutes.get('/conversions', authorize('HR', 'ADMIN'), overtimeController.getConversions);
overtimeRoutes.patch('/conversions/:id/review', authorize('HR', 'ADMIN'), overtimeController.reviewConversion);
