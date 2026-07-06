import { Router } from 'express';
import * as leaveController from '../controllers/leave.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';

export const leaveRoutes = Router();
leaveRoutes.use(authenticate);

leaveRoutes.post('/', auditLog('CREATE', 'LeaveRequest'), leaveController.fileLeave);
leaveRoutes.get('/my', leaveController.getMyLeaves);
leaveRoutes.get('/balances', leaveController.getMyBalances);
leaveRoutes.get('/calendar', leaveController.getLeaveCalendar);
leaveRoutes.delete('/:id', auditLog('DELETE', 'LeaveRequest'), leaveController.cancelLeave);

leaveRoutes.get('/', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), leaveController.getAllLeaves);
leaveRoutes.patch('/:id/review', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), leaveController.reviewLeave);

// HR Leave Management
leaveRoutes.get('/adjustments', authorize('HR', 'ADMIN'), leaveController.getLeaveAdjustments);
leaveRoutes.get('/employee/:employeeId/balances', authorize('HR', 'ADMIN'), leaveController.getEmployeeLeaveBalances);
leaveRoutes.post('/employee/:employeeId/adjust', authorize('HR', 'ADMIN'), auditLog('UPDATE', 'LeaveBalance'), leaveController.adjustLeaveBalance);
