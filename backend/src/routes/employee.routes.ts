import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { auditLog } from '../middleware/audit.middleware';
import multer from 'multer';
import path from 'path';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '10')) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx/;
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/jpg|jpeg|png|webp/.test(path.extname(file.originalname).toLowerCase().substring(1))) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

export const employeeRoutes = Router();
employeeRoutes.use(authenticate);

// All employees can view their own profile
employeeRoutes.get('/me', employeeController.getMyProfile);
employeeRoutes.put('/me', employeeController.updateMyProfile);

// Import / Export (must be before /:id)
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (/csv|xlsx|xls/.test(ext)) cb(null, true);
    else cb(new Error('Only CSV or Excel files are allowed'));
  },
});
employeeRoutes.get('/export', authorize('HR', 'ADMIN'), employeeController.exportEmployees);
employeeRoutes.get('/template', authorize('HR', 'ADMIN'), employeeController.downloadTemplate);
employeeRoutes.post('/import', authorize('HR', 'ADMIN'), importUpload.single('file'), auditLog('CREATE', 'Employee'), employeeController.importEmployees);

// Admin/HR operations
employeeRoutes.get('/', authorize('HR', 'ADMIN', 'DEPARTMENT_HEAD'), employeeController.getEmployees);
employeeRoutes.post('/', authorize('HR', 'ADMIN'), auditLog('CREATE', 'Employee'), employeeController.createEmployee);
employeeRoutes.get('/:id', authorize('HR', 'ADMIN', 'DEPARTMENT_HEAD'), employeeController.getEmployee);
employeeRoutes.put('/:id', authorize('HR', 'ADMIN'), auditLog('UPDATE', 'Employee'), employeeController.updateEmployee);
employeeRoutes.delete('/:id', authorize('HR', 'ADMIN'), auditLog('DELETE', 'Employee'), employeeController.deleteEmployee);
employeeRoutes.patch('/:id/toggle-active', authorize('ADMIN', 'HR'), auditLog('UPDATE', 'Employee'), employeeController.toggleActive);
employeeRoutes.patch('/:id/archive', authorize('ADMIN', 'HR'), auditLog('UPDATE', 'Employee'), employeeController.archiveEmployee);
employeeRoutes.patch('/:id/reset-password', authorize('ADMIN', 'HR'), auditLog('PASSWORD_RESET', 'Employee'), employeeController.adminResetPassword);

// Profile picture
employeeRoutes.post('/:id/profile-picture', authorize('HR', 'ADMIN'), profileUpload.single('picture'), employeeController.uploadProfilePicture);

// Documents
employeeRoutes.post('/:id/documents', authorize('HR', 'ADMIN'), upload.single('file'), employeeController.uploadDocument);
employeeRoutes.get('/:id/documents', authorize('HR', 'ADMIN'), employeeController.getDocuments);
employeeRoutes.delete('/:id/documents/:docId', authorize('HR', 'ADMIN'), employeeController.deleteDocument);
