import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { notificationService } from '../services/notification.service';
import { logger } from '../config/logger';
import { phtToday, phtYear } from '../utils/timezone';

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
    const today = phtToday();
    const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 6 = Saturday (stored as midnight UTC of PHT date)
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
      // Ping DB to keep Supabase active during weekends/holidays
      await prisma.employee.count({ where: { isActive: true } });
      logger.info('Cron absent-check: weekend ping — DB kept alive.');
      res.json({ success: true, notified: 0, note: 'Weekend — DB pinged only.' });
      return;
    }

    today.setUTCHours(0, 0, 0, 0); // already at midnight UTC from phtToday()
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
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 1 month.' },
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
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 6 months.' },
    });
    logger.info(`Cron expire-approved-overtime: expired ${expired.count} records.`);
    res.json({ success: true, expired: expired.count });
  } catch (err) {
    logger.error('Cron expire-approved-overtime error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}

// GET /api/cron/daily-maintenance  — runs daily at 00:00 UTC (= 08:00 PHT)
// Combines: expire-pending OT, expire-approved OT, expiration-alerts, and monthly VL accrual (1st of month PHT)
export async function cronDailyMaintenance(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  const results: Record<string, number> = { expiredPending: 0, expiredApproved: 0, alerted: 0, vlAccrued: 0 };
  try {
    // 1. Expire pending overtime (>1 month)
    const expiredPending = await prisma.overtimeRecord.updateMany({
      where: { status: 'PENDING', pendingExpiry: { lt: new Date() } },
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 1 month.' },
    });
    results.expiredPending = expiredPending.count;

    // 2. Expire approved overtime (>6 months)
    const expiredApproved = await prisma.overtimeRecord.updateMany({
      where: { status: 'APPROVED', isConverted: false, approvedExpiry: { lt: new Date() } },
      data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 6 months.' },
    });
    results.expiredApproved = expiredApproved.count;

    // 3. Expiration alerts (7-day warning) — parallel to stay within 10s Hobby limit
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const expiring = await prisma.overtimeRecord.findMany({
      where: { status: 'APPROVED', isConverted: false, approvedExpiry: { lte: in7Days, gt: new Date() } },
      include: { employee: { include: { user: true } } },
    });
    await Promise.allSettled(
      expiring.map(async (ot) => {
        await notificationService.createNotification(
          ot.employee.userId,
          'EXPIRATION_ALERT',
          'Overtime Credit Expiring Soon',
          `Your overtime credit of ${(ot.minutes / 60).toFixed(1)} hours expires in 7 days.`,
          { overtimeId: ot.id, expiresAt: ot.approvedExpiry },
        );
        try {
          await notificationService.sendExpirationAlertEmail(ot.employee.user.email, ot.minutes, ot.approvedExpiry!);
        } catch { /* already logged inside sendEmail */ }
      }),
    );
    results.alerted = expiring.length;

    // 4. Monthly VL accrual — runs only on the 1st of the month (PHT)
    //    Merged here to stay within Vercel Hobby's 2-cron limit.
    const phtNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    if (phtNow.getDate() === 1) {
      const year = phtNow.getFullYear();
      const monthStr = String(phtNow.getMonth() + 1).padStart(2, '0');
      const accrualReason = `VL Monthly Accrual — ${year}-${monthStr}`;
      const ACCRUAL_AMOUNT = 1.25;

      const employees = await prisma.employee.findMany({
        where: { employmentType: 'REGULAR', isActive: true, isArchived: false },
        select: { id: true },
      });

      let accrued = 0;
      for (const emp of employees) {
        const alreadyRan = await prisma.leaveAdjustment.count({
          where: { employeeId: emp.id, isSystemGenerated: true, leaveType: 'VACATION', year, reason: accrualReason },
        });
        if (alreadyRan > 0) continue;

        const balance = await prisma.leaveBalance.findUnique({
          where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: 'VACATION' } },
        });
        const previousBalance = balance ? balance.totalDays - balance.usedDays - balance.pendingDays : 0;

        await prisma.leaveBalance.upsert({
          where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: 'VACATION' } },
          update: { totalDays: { increment: ACCRUAL_AMOUNT } },
          create: { employeeId: emp.id, year, leaveType: 'VACATION', totalDays: ACCRUAL_AMOUNT },
        });
        await prisma.leaveAdjustment.create({
          data: {
            employeeId: emp.id, leaveType: 'VACATION', year,
            adjustmentAmount: ACCRUAL_AMOUNT, previousBalance,
            newBalance: previousBalance + ACCRUAL_AMOUNT,
            reason: accrualReason, adjustedBy: null, isSystemGenerated: true,
          },
        });
        accrued++;
      }
      results.vlAccrued = accrued;
      logger.info(`VL accrual (via daily-maintenance): ${accrued}/${employees.length} employees credited.`);
    }

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

    await Promise.allSettled(
      expiring.map(async (ot) => {
        await notificationService.createNotification(
          ot.employee.userId,
          'EXPIRATION_ALERT',
          'Overtime Credit Expiring Soon',
          `Your overtime credit of ${(ot.minutes / 60).toFixed(1)} hours expires in 7 days.`,
          { overtimeId: ot.id, expiresAt: ot.approvedExpiry },
        );
        try {
          await notificationService.sendExpirationAlertEmail(ot.employee.user.email, ot.minutes, ot.approvedExpiry!);
        } catch { /* already logged inside sendEmail */ }
      }),
    );
    logger.info(`Cron expiration-alerts: alerted ${expiring.length} employees.`);
    res.json({ success: true, alerted: expiring.length });
  } catch (err) {
    logger.error('Cron expiration-alerts error:', err);
    res.status(500).json({ success: false, message: 'Cron job failed.' });
  }
}

/** POST /api/cron/vl-accrual — monthly VL accrual for Regular employees (Vercel cron) */
export async function cronVlAccrual(req: Request, res: Response): Promise<void> {
  if (!verifyCronAuth(req, res)) return;
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const year = now.getFullYear();
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const accrualReason = `VL Monthly Accrual — ${year}-${monthStr}`;
    const ACCRUAL_AMOUNT = 1.25;

    const employees = await prisma.employee.findMany({
      where: { employmentType: 'REGULAR', isActive: true, isArchived: false },
      select: { id: true },
    });

    let accrued = 0;
    for (const emp of employees) {
      const alreadyRan = await prisma.leaveAdjustment.count({
        where: { employeeId: emp.id, isSystemGenerated: true, leaveType: 'VACATION', year, reason: accrualReason },
      });
      if (alreadyRan > 0) continue;

      const balance = await prisma.leaveBalance.findUnique({
        where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: 'VACATION' } },
      });
      const previousBalance = balance ? balance.totalDays - balance.usedDays - balance.pendingDays : 0;

      await prisma.leaveBalance.upsert({
        where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: 'VACATION' } },
        update: { totalDays: { increment: ACCRUAL_AMOUNT } },
        create: { employeeId: emp.id, year, leaveType: 'VACATION', totalDays: ACCRUAL_AMOUNT },
      });

      await prisma.leaveAdjustment.create({
        data: {
          employeeId: emp.id,
          leaveType: 'VACATION',
          year,
          adjustmentAmount: ACCRUAL_AMOUNT,
          previousBalance,
          newBalance: previousBalance + ACCRUAL_AMOUNT,
          reason: accrualReason,
          adjustedBy: null,
          isSystemGenerated: true,
        },
      });

      accrued++;
    }

    logger.info(`Cron VL accrual: ${accrued} of ${employees.length} employees credited.`);
    res.json({ success: true, accrued, total: employees.length });
  } catch (err) {
    logger.error('Cron VL accrual error:', err);
    res.status(500).json({ success: false, message: 'VL accrual cron job failed.' });
  }
}
