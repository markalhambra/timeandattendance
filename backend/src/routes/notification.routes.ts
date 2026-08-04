import { Router } from 'express';
import * as notifController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

export const notificationRoutes = Router();
notificationRoutes.use(authenticate);

notificationRoutes.get('/', notifController.getNotifications);
// Static paths must be registered before /:id/read so "read-all" is not captured as an id
notificationRoutes.get('/unread-count', notifController.getUnreadCount);
notificationRoutes.patch('/read-all', notifController.markAllRead);
notificationRoutes.patch('/:id/read', notifController.markRead);
