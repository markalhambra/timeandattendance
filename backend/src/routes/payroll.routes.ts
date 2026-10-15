import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as payrollController from '../controllers/payroll.controller';

export const payrollRoutes = Router();

payrollRoutes.use(authenticate);

// Employee self-service
payrollRoutes.get('/me', payrollController.listMyPayslips);
payrollRoutes.get('/me/:id/download', payrollController.downloadMyPayslip);

// HR / Admin generator
payrollRoutes.get('/google-status', authorize('HR', 'ADMIN'), payrollController.getGoogleStatus);
payrollRoutes.get('/workbooks', authorize('HR', 'ADMIN'), payrollController.listWorkbooks);
payrollRoutes.put('/workbooks/:year', authorize('HR', 'ADMIN'), payrollController.upsertWorkbook);
payrollRoutes.get('/workbooks/:year/sheets', authorize('HR', 'ADMIN'), payrollController.listSheets);
payrollRoutes.post('/preview', authorize('HR', 'ADMIN'), payrollController.previewPayroll);
payrollRoutes.post('/generate', authorize('HR', 'ADMIN'), payrollController.generatePayroll);
payrollRoutes.get('/runs', authorize('HR', 'ADMIN'), payrollController.listRuns);
payrollRoutes.get('/payslips', authorize('HR', 'ADMIN'), payrollController.listAllPayslips);
// Static path segments before /:id so "payslips" is not treated as an id
payrollRoutes.get('/:id/download', authorize('HR', 'ADMIN'), payrollController.downloadPayslipHr);
payrollRoutes.delete('/:id', authorize('HR', 'ADMIN'), payrollController.deletePayslip);
