import { Router } from 'express';
import * as attendanceController from '../controllers/attendance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const attendanceRoutes = Router();
attendanceRoutes.use(authenticate);

// Employee
attendanceRoutes.post('/clock-in', attendanceController.clockIn);
attendanceRoutes.post('/clock-out', attendanceController.clockOut);
attendanceRoutes.get('/today', attendanceController.getTodayAttendance);
attendanceRoutes.get('/my', attendanceController.getMyAttendance);
attendanceRoutes.get('/monthly-summary', attendanceController.getMonthlySummary);

// Corrections
attendanceRoutes.post('/corrections', attendanceController.requestCorrection);
attendanceRoutes.get('/corrections/my', attendanceController.getMyCorrections);
attendanceRoutes.get('/corrections', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), attendanceController.getCorrections);
attendanceRoutes.patch('/corrections/:id/review', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), attendanceController.reviewCorrection);

// HR/Admin
attendanceRoutes.get('/', authorize('HR', 'ADMIN', 'DEPARTMENT_HEAD'), attendanceController.getAllAttendance);
attendanceRoutes.get('/employee/:employeeId', authorize('HR', 'ADMIN', 'DEPARTMENT_HEAD'), attendanceController.getEmployeeAttendance);
attendanceRoutes.get('/absent-today', authorize('HR', 'ADMIN'), attendanceController.getAbsentToday);
