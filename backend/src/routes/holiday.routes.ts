import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as holidayController from '../controllers/holiday.controller';

export const holidayRoutes = Router();
holidayRoutes.use(authenticate);

holidayRoutes.get('/today', holidayController.todayHoliday);
holidayRoutes.get('/', authorize('HR', 'ADMIN'), holidayController.listHolidays);
holidayRoutes.post('/', authorize('HR', 'ADMIN'), holidayController.createHoliday);
holidayRoutes.put('/:id', authorize('HR', 'ADMIN'), holidayController.updateHoliday);
holidayRoutes.delete('/:id', authorize('HR', 'ADMIN'), holidayController.deleteHoliday);
