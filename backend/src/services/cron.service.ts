import cron from 'node-cron';
import { prisma } from '../config/database';
import { notificationService } from './notification.service';
import { logger } from '../config/logger';
import { phtToday, phtYear } from '../utils/timezone';

// Days credited to REGULAR employees per month — single source of truth for all VL accrual logic
const VL_ACCRUAL_AMOUNT = 1.25;

export function scheduleCronJobs(): void {
  // Mark absent employees at 2 PM Philippine Time (UTC+8 = 06:00 UTC)
  cron.schedule('0 6 * * 1-5', async () => {
    logger.info('Cron: Checking absent employees...');
    try {
      const today = phtToday();

      const employees = await prisma.employee.findMany({
        where: { isActive: true },
        include: {
          attendanceRecords: { where: { date: today } },
          user: { select: { id: true } },
        },
      });

      const absent = employees.filter((e) => e.attendanceRecords.length === 0);
      logger.info(`Found ${absent.length} absent employees today.`);

      for (const emp of absent) {
        await notificationService.createNotification(
          emp.userId,
          'SYSTEM',
          'Attendance Reminder',
          'No clock-in recorded for today. Please contact HR if this is an error.',
        );
      }
    } catch (err) {
      logger.error('Absent check cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });

  // Expire pending overtime credits (3 months) - runs daily at midnight PHT
  cron.schedule('0 0 * * *', async () => {
    logger.info('Cron: Expiring pending overtime credits...');
    try {
      const expired = await prisma.overtimeRecord.updateMany({
        where: {
          status: 'PENDING',
          pendingExpiry: { lt: new Date() },
        },
        data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 1 month.' },
      });
      if (expired.count > 0) logger.info(`Expired ${expired.count} pending overtime records.`);
    } catch (err) {
      logger.error('Overtime expiry cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });

  // Expire approved overtime credits (12 months) - runs daily at midnight PHT
  cron.schedule('1 0 * * *', async () => {
    logger.info('Cron: Expiring approved overtime credits...');
    try {
      const expired = await prisma.overtimeRecord.updateMany({
        where: {
          status: 'APPROVED',
          isConverted: false,
          approvedExpiry: { lt: new Date() },
        },
        data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 6 months.' },
      });
      if (expired.count > 0) logger.info(`Expired ${expired.count} approved overtime records.`);
    } catch (err) {
      logger.error('Approved overtime expiry cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });

  // Send expiration alerts 7 days before - runs daily at 8 AM PHT
  cron.schedule('0 0 * * *', async () => {
    logger.info('Cron: Sending expiration alerts...');
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
    } catch (err) {
      logger.error('Expiration alert cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });

  logger.info('✅ Cron jobs scheduled');

  // Expire unfiled overtime records older than 15 days - runs daily at midnight PHT
  cron.schedule('2 0 * * *', async () => {
    logger.info('Cron: Expiring unfiled overtime records (15-day window)...');
    try {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() - 15);
      const expired = await prisma.overtimeRecord.updateMany({
        where: { isFiled: false, createdAt: { lt: deadline } },
        data: { status: 'REJECTED', reviewerNotes: 'Filing window expired. Must be filed within 15 days of creation.' },
      });
      if (expired.count > 0) logger.info(`Expired ${expired.count} unfiled overtime records (15-day window).`);
    } catch (err) {
      logger.error('Unfiled OT expiry cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });

  // Monthly VL accrual for Regular employees on 1st of every month at midnight PHT
  cron.schedule('0 0 1 * *', async () => {
    logger.info('Cron: Running monthly VL accrual...');
    try {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const year = now.getFullYear();
      const monthStr = String(now.getMonth() + 1).padStart(2, '0');
      const accrualReason = `VL Monthly Accrual — ${year}-${monthStr}`;

      const employees = await prisma.employee.findMany({
        where: { employmentType: 'REGULAR', isActive: true, isArchived: false },
        select: { id: true },
      });

      let accrued = 0;
      for (const emp of employees) {
        // Idempotency: skip if accrual already ran for this employee this month
        const alreadyRan = await prisma.leaveAdjustment.count({
          where: { employeeId: emp.id, isSystemGenerated: true, leaveType: 'VACATION', year, reason: accrualReason },
        });
        if (alreadyRan > 0) continue;

        const balance = await prisma.leaveBalance.findUnique({
          where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: 'VACATION' } },
        });

        // previousBalance = gross totalDays before this accrual (audit trail shows allocation growth)
        const previousBalance = balance?.totalDays ?? 0;

        await prisma.leaveBalance.upsert({
          where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType: 'VACATION' } },
          update: { totalDays: { increment: VL_ACCRUAL_AMOUNT } },
          create: { employeeId: emp.id, year, leaveType: 'VACATION', totalDays: VL_ACCRUAL_AMOUNT },
        });

        await prisma.leaveAdjustment.create({
          data: {
            employeeId: emp.id,
            leaveType: 'VACATION',
            year,
            adjustmentAmount: VL_ACCRUAL_AMOUNT,
            previousBalance,
            newBalance: previousBalance + VL_ACCRUAL_AMOUNT,
            reason: accrualReason,
            adjustedBy: null,
            isSystemGenerated: true,
          },
        });

        accrued++;
      }
      logger.info(`VL accrual complete: ${accrued} of ${employees.length} employees credited.`);
    } catch (err) {
      logger.error('VL accrual cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });
}
