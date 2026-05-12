import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/validate.middleware';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validateRequest,
  authController.login,
);

authRoutes.post('/refresh', authController.refreshToken);
authRoutes.post('/logout', authenticate, authController.logout);
authRoutes.get('/me', authenticate, authController.me);
authRoutes.post('/forgot-password', body('email').isEmail().normalizeEmail(), validateRequest, authController.forgotPassword);
authRoutes.post('/reset-password', authController.resetPassword);
authRoutes.put(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  validateRequest,
  authController.changePassword,
);
