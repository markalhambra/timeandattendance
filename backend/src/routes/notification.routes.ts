import { Router } from 'express';
import * as notifController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

export const notificationRoutes = Router();
notificationRoutes.use(authenticate);

notificationRoutes.get('/', notifController.getNotifications);
notificationRoutes.patch('/:id/read', notifController.markRead);
notificationRoutes.patch('/read-all', notifController.markAllRead);
notificationRoutes.get('/unread-count', notifController.getUnreadCount);
