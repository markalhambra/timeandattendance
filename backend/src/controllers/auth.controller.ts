import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../config/jwt';
import { AuthRequest } from '../middleware/auth.middleware';
import { notificationService } from '../services/notification.service';
import { logger } from '../config/logger';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: { include: { department: true } } },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'Invalid credentials.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ success: false, message: 'Invalid credentials.' });
      return;
    }

    const payload = {
      sub: user.id,
      role: user.role,
      employeeId: user.employee?.id,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Store hashed refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(refreshToken, 10),
        lastLogin: new Date(),
        lastLoginIp: req.ip,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          employee: user.employee
            ? {
                id: user.employee.id,
                firstName: user.employee.firstName,
                lastName: user.employee.lastName,
                employeeNumber: user.employee.employeeNumber,
                designation: user.employee.designation,
                profilePicture: user.employee.profilePicture,
                department: user.employee.department,
              }
            : null,
        },
      },
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ success: false, message: 'Refresh token required.' });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.refreshToken || !user.isActive) {
      res.status(401).json({ success: false, message: 'Invalid refresh token.' });
      return;
    }

    const valid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!valid) {
      res.status(401).json({ success: false, message: 'Invalid refresh token.' });
      return;
    }

    const newPayload = { sub: user.id, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(newRefreshToken, 10) },
    });

    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: req.user!.sub },
      data: { refreshToken: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'LOGOUT',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch {
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { employee: { include: { department: true } } },
      omit: { password: true, refreshToken: true, passwordResetToken: true, passwordResetExpires: true },
    });
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    await notificationService.sendPasswordResetEmail(email, token);

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'PASSWORD_RESET', ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    });

    res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'Invalid request.' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpires: null, refreshToken: null },
    });

    res.json({ success: true, message: 'Password reset successful.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) { res.status(404).json({ success: false, message: 'User not found.' }); return; }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) { res.status(400).json({ success: false, message: 'Current password is incorrect.' }); return; }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, refreshToken: null },
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
}
