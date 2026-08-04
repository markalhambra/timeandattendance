import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as settingsController from '../controllers/settings.controller';

export const settingsRoutes = Router();

// Any authenticated user — office coords for clock widget
settingsRoutes.get('/office', authenticate, settingsController.getOfficeSettings);

// Admin only
settingsRoutes.get('/', authenticate, authorize('ADMIN'), settingsController.getSettings);
settingsRoutes.put('/', authenticate, authorize('ADMIN'), settingsController.updateSettings);
settingsRoutes.get('/approver-candidates', authenticate, authorize('ADMIN'), settingsController.getApproverCandidates);
