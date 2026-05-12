import { Router } from 'express';
import * as deptController from '../controllers/department.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const departmentRoutes = Router();
departmentRoutes.use(authenticate);

departmentRoutes.get('/', deptController.getDepartments);
departmentRoutes.post('/', authorize('ADMIN'), deptController.createDepartment);
departmentRoutes.put('/:id', authorize('ADMIN'), deptController.updateDepartment);
departmentRoutes.delete('/:id', authorize('ADMIN'), deptController.deleteDepartment);
departmentRoutes.patch('/:id/head', authorize('ADMIN'), deptController.assignHead);
