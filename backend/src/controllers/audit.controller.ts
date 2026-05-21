import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';

export async function getAuditLogs(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '50', search, action } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};

    if (action) where.action = action;

    if (search) {
      where.OR = [
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { employee: { firstName: { contains: search, mode: 'insensitive' } } },
              { employee: { lastName: { contains: search, mode: 'insensitive' } } },
            ],
          },
        },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    const formatted = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      oldValues: log.oldValues,
      newValues: log.newValues,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      user: log.user
        ? {
            firstName: log.user.employee?.firstName ?? log.user.email.split('@')[0],
            lastName: log.user.employee?.lastName ?? '',
            email: log.user.email,
          }
        : null,
    }));

    const totalPages = Math.max(1, Math.ceil(total / parseInt(limit)));

    res.json({
      success: true,
      data: {
        logs: formatted,
        total,
        page: parseInt(page),
        totalPages,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
}
