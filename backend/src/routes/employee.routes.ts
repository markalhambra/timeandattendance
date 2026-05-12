import { Router } from 'express';
import * as employeeController from '../controllers/employee.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadsDir, 'documents');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '10')) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|jpg|jpeg|png|doc|docx|xls|xlsx/;
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadsDir, 'profiles');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const profileUpload = multer({
  storage: profileStorage,
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

// Admin/HR operations
employeeRoutes.get('/', authorize('HR', 'ADMIN', 'DEPARTMENT_HEAD'), employeeController.getEmployees);
employeeRoutes.post('/', authorize('HR', 'ADMIN'), employeeController.createEmployee);
employeeRoutes.get('/:id', authorize('HR', 'ADMIN', 'DEPARTMENT_HEAD'), employeeController.getEmployee);
employeeRoutes.put('/:id', authorize('HR', 'ADMIN'), employeeController.updateEmployee);
employeeRoutes.patch('/:id/activate', authorize('ADMIN'), employeeController.toggleActive);
employeeRoutes.patch('/:id/reset-password', authorize('ADMIN', 'HR'), employeeController.adminResetPassword);

// Profile picture
employeeRoutes.post('/:id/profile-picture', authorize('HR', 'ADMIN'), profileUpload.single('picture'), employeeController.uploadProfilePicture);

// Documents
employeeRoutes.post('/:id/documents', authorize('HR', 'ADMIN'), upload.single('file'), employeeController.uploadDocument);
employeeRoutes.get('/:id/documents', authorize('HR', 'ADMIN'), employeeController.getDocuments);
employeeRoutes.delete('/:id/documents/:docId', authorize('HR', 'ADMIN'), employeeController.deleteDocument);
