import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { notificationService } from '../services/notification.service';
import { logger } from '../config/logger';

/**
 * Vercel cron jobs call these endpoints via HTTP GET with an Authorization header.
 * CRON_SECRET must match the value set in Vercel's environment variables.
 */
function verifyCronAuth(req: Request, res: Response): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    if (process.env.NODE_ENV !== 'production') return true; // allow in dev without secret
    res.status(500).json({ success: false, message: 'CRON_SECRET not configured.' });
    return false;
  }
  if (req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return false;
  }
  return true;
}

// GET /api/cron/absent-check  — runs DAILY at 06:00 UTC (2 PM PHT)
// Weekdays: checks absences and sends notifications.
// Weekends: skips notifications but still queries DB to prevent Supabase auto-pause.
export async function cronAbsentCheck(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
      // Ping DB to keep Supabase active during weekends/holidays
      await prisma.employee.count({ where: { isActive: true } });
      logger.info('Cron absent-check: weekend ping — DB kept alive.');
      res.json({ success: true, notified: 0, note: 'Weekend — DB pinged only.' });
      return;
    }

    today.setHours(0, 0, 0, 0);
    const employees = await prisma.employee.findMany({
      where: { isActive: true, isArchived: false },
      include: {
        attendanceRecords: { where: { date: today } },
        user: { select: { id: true } },
      },
    });

    const absent = employees.filter((e) => e.attendanceRecords.length === 0);
    for (const emp of absent) {
      await notificationService.createNotification(
        emp.userId,
        'SYSTEM',
        'Attendance Reminder',
        'No clock-in recorded for today. Please contact HR if this is an error.',
      );
    }
    logger.info(`Cron absent-check: notified ${absent.length} employees.`);
    res.json({ success: true, notified: absent.length });
  } catch (err) {
    logger.error('Cron absent-check error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}

// GET /api/cron/expire-pending-overtime  — runs daily at 00:00 UTC
export async function cronExpirePendingOvertime(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  try {
    const expired = await prisma.overtimeRecord.updateMany({
      where: { status: 'PENDING', pendingExpiry: { lt: new Date() } },
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 3 months.' },
    });
    logger.info(`Cron expire-pending-overtime: expired ${expired.count} records.`);
    res.json({ success: true, expired: expired.count });
  } catch (err) {
    logger.error('Cron expire-pending-overtime error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}

// GET /api/cron/expire-approved-overtime  — runs daily at 00:01 UTC
export async function cronExpireApprovedOvertime(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  try {
    const expired = await prisma.overtimeRecord.updateMany({
      where: { status: 'APPROVED', isConverted: false, approvedExpiry: { lt: new Date() } },
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 12 months.' },
    });
    logger.info(`Cron expire-approved-overtime: expired ${expired.count} records.`);
    res.json({ success: true, expired: expired.count });
  } catch (err) {
    logger.error('Cron expire-approved-overtime error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}

// GET /api/cron/daily-maintenance  — runs daily at 00:00 UTC (combines expire-pending, expire-approved, expiration-alerts)
export async function cronDailyMaintenance(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  const results = { expiredPending: 0, expiredApproved: 0, alerted: 0 };
  try {
    // 1. Expire pending overtime (>3 months)
    const expiredPending = await prisma.overtimeRecord.updateMany({
      where: { status: 'PENDING', pendingExpiry: { lt: new Date() } },
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 3 months.' },
    });
    results.expiredPending = expiredPending.count;

    // 2. Expire approved overtime (>12 months)
    const expiredApproved = await prisma.overtimeRecord.updateMany({
      where: { status: 'APPROVED', isConverted: false, approvedExpiry: { lt: new Date() } },
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 12 months.' },
    });
    results.expiredApproved = expiredApproved.count;

    // 3. Expiration alerts (7-day warning)
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const expiring = await prisma.overtimeRecord.findMany({
      where: { status: 'APPROVED', isConverted: false, approvedExpiry: { lte: in7Days, gt: new Date() } },
      include: { employee: { include: { user: true } } },
    });
    for (const ot of expiring) {
      await notificationService.createNotification(
        ot.employee.userId,
        'EXPIRATION_ALERT',
        'Overtime Credit Expiring Soon',
        `Your overtime credit of ${(ot.minutes / 60).toFixed(1)} hours expires in 7 days.`,
        { overtimeId: ot.id, expiresAt: ot.approvedExpiry },
      );
    }
    results.alerted = expiring.length;

    logger.info(`Cron daily-maintenance: ${JSON.stringify(results)}`);
    res.json({ success: true, ...results });
  } catch (err) {
    logger.error('Cron daily-maintenance error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}

// GET /api/cron/expiration-alerts  — runs daily at 00:00 UTC
export async function cronExpirationAlerts(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  try {
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);

    const expiring = await prisma.overtimeRecord.findMany({
      where: {
        status: 'APPROVED',
        isConverted: false,
        approvedExpiry: { lte: in7Days, gt: new Date() },
      },
      include: { employee: { include: { user: true } } },
    });

    for (const ot of expiring) {
      await notificationService.createNotification(
        ot.employee.userId,
        'EXPIRATION_ALERT',
        'Overtime Credit Expiring Soon',
        `Your overtime credit of ${(ot.minutes / 60).toFixed(1)} hours expires in 7 days.`,
        { overtimeId: ot.id, expiresAt: ot.approvedExpiry },
      );
    }
    logger.info(`Cron expiration-alerts: alerted ${expiring.length} employees.`);
    res.json({ success: true, alerted: expiring.length });
  } catch (err) {
    logger.error('Cron expiration-alerts error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}
