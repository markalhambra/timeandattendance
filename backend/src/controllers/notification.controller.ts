import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';

export async function getNotifications(req: AuthRequest, res: Response): Promise<void> {
  const { page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: req.user!.sub },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.notification.count({ where: { recipientId: req.user!.sub } }),
    ]);
    res.json({ success: true, data: notifications, meta: { total } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
}

export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, recipientId: req.user!.sub },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to mark as read.' });
  }
}

export async function markAllRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { recipientId: req.user!.sub, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
}

export async function getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const count = await prisma.notification.count({
      where: { recipientId: req.user!.sub, isRead: false },
    });
    res.json({ success: true, data: { count } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch count.' });
  }
}
