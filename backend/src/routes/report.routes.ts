import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const reportRoutes = Router();
reportRoutes.use(authenticate);
reportRoutes.use(authorize('HR', 'ADMIN'));

reportRoutes.get('/attendance', reportController.attendanceReport);
reportRoutes.get('/leave', reportController.leaveReport);
reportRoutes.get('/overtime', reportController.overtimeReport);
reportRoutes.get('/absence', reportController.absenceReport);
reportRoutes.get('/attendance/export', reportController.exportAttendance);
