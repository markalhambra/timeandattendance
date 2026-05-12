import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { prisma } from '../config/database';
import { AuditAction } from '@prisma/client';

export function auditLog(action: AuditAction, entity?: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user?.sub,
              action,
              entity,
              entityId: req.params.id,
              newValues: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
              ipAddress: req.ip || req.socket.remoteAddress,
              userAgent: req.headers['user-agent'],
            },
          });
        } catch {
          // Audit log failure should not break the request
        }
      }
    });
    next();
  };
}
