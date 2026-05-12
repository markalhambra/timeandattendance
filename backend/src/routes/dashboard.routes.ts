import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate);

dashboardRoutes.get('/employee', dashboardController.employeeDashboard);
dashboardRoutes.get('/department-head', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), dashboardController.deptHeadDashboard);
dashboardRoutes.get('/hr', authorize('HR', 'ADMIN'), dashboardController.hrDashboard);
dashboardRoutes.get('/admin', authorize('ADMIN'), dashboardController.adminDashboard);
