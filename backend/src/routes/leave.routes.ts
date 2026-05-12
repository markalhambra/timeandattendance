import { Router } from 'express';
import * as leaveController from '../controllers/leave.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const leaveRoutes = Router();
leaveRoutes.use(authenticate);

leaveRoutes.post('/', leaveController.fileLeave);
leaveRoutes.get('/my', leaveController.getMyLeaves);
leaveRoutes.get('/balances', leaveController.getMyBalances);
leaveRoutes.get('/calendar', leaveController.getLeaveCalendar);
leaveRoutes.delete('/:id', leaveController.cancelLeave);

leaveRoutes.get('/', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), leaveController.getAllLeaves);
leaveRoutes.patch('/:id/review', authorize('DEPARTMENT_HEAD', 'HR', 'ADMIN'), leaveController.reviewLeave);
leaveRoutes.patch('/:id/hr-review', authorize('HR', 'ADMIN'), leaveController.hrReviewLeave);
