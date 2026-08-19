import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as settingsController from '../controllers/settings.controller';

export const settingsRoutes = Router();
const archiveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Any authenticated user — office coords for clock widget
settingsRoutes.get('/office', authenticate, settingsController.getOfficeSettings);

// Admin only
settingsRoutes.get('/', authenticate, authorize('ADMIN'), settingsController.getSettings);
settingsRoutes.put('/', authenticate, authorize('ADMIN'), settingsController.updateSettings);
settingsRoutes.get('/approver-candidates', authenticate, authorize('ADMIN'), settingsController.getApproverCandidates);
settingsRoutes.get('/archive-attendance/preview', authenticate, authorize('ADMIN'), settingsController.archiveAttendancePreview);
settingsRoutes.post('/archive-attendance', authenticate, authorize('ADMIN'), settingsController.archiveAttendance);
settingsRoutes.get('/backup', authenticate, authorize('ADMIN'), settingsController.backupDatabase);
settingsRoutes.post('/restore-attendance', authenticate, authorize('ADMIN'), archiveUpload.single('file'), settingsController.restoreAttendance);
