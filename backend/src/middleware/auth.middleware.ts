import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { prisma } from '../config/database';
import { getUserRoles, hasAnyRole, primaryRole } from '../utils/roles';
import { Role } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Verify user still exists, is active, and is not locked out.
    // Reload roles from DB so role changes apply without waiting for token expiry.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, roles: true, lockedAt: true },
    });

    if (!user || !user.isActive || user.lockedAt) {
      res.status(401).json({
        success: false,
        message: user?.lockedAt
          ? 'Account locked due to too many failed login attempts. Please contact HR to unlock your account.'
          : 'Account inactive or not found.',
      });
      return;
    }

    const roles = getUserRoles(user);
    req.user = {
      ...payload,
      role: user.role || primaryRole(roles as Role[]),
      roles,
    };
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, message: 'Token expired.', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid token.' });
    }
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }
    if (!hasAnyRole(req.user, ...roles)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}
