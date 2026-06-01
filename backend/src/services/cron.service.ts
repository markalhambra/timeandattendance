import cron from 'node-cron';
import { prisma } from '../config/database';
import { notificationService } from './notification.service';
import { logger } from '../config/logger';

export function scheduleCronJobs(): void {
  // Mark absent employees at 2 PM Philippine Time (UTC+8 = 06:00 UTC)
  cron.schedule('0 6 * * 1-5', async () => {
    logger.info('Cron: Checking absent employees...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

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

  // Expire pending overtime credits (3 months) - runs daily at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('Cron: Expiring pending overtime credits...');
    try {
      const expired = await prisma.overtimeRecord.updateMany({
        where: {
          status: 'PENDING',
          pendingExpiry: { lt: new Date() },
        },
        data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 3 months.' },
      });
      if (expired.count > 0) logger.info(`Expired ${expired.count} pending overtime records.`);
    } catch (err) {
      logger.error('Overtime expiry cron error:', err);
    }
  });

  // Expire approved overtime credits (12 months) - runs daily at midnight
  cron.schedule('1 0 * * *', async () => {
    logger.info('Cron: Expiring approved overtime credits...');
    try {
      const expired = await prisma.overtimeRecord.updateMany({
        where: {
          status: 'APPROVED',
          isConverted: false,
          approvedExpiry: { lt: new Date() },
        },
        data: { status: 'REJECTED', reviewerNotes: 'Automatically expired after 12 months.' },
      });
      if (expired.count > 0) logger.info(`Expired ${expired.count} approved overtime records.`);
    } catch (err) {
      logger.error('Approved overtime expiry cron error:', err);
    }
  });

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

      for (const ot of expiring) {
        await notificationService.createNotification(
          ot.employee.userId,
          'EXPIRATION_ALERT',
          'Overtime Credit Expiring Soon',
          `Your overtime credit of ${(ot.minutes / 60).toFixed(1)} hours expires in 7 days.`,
          { overtimeId: ot.id, expiresAt: ot.approvedExpiry },
        );
      }
    } catch (err) {
      logger.error('Expiration alert cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });

  logger.info('✅ Cron jobs scheduled');

  // Expire unfiled overtime records older than 15 days - runs daily at midnight
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
  });

  // Reset all leave balances for all active employees every January 1 at midnight PHT
  cron.schedule('0 0 1 1 *', async () => {
    logger.info('Cron: Resetting all leave balances for new year...');
    try {
      const year = new Date().getFullYear();
      const employees = await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      const defaults: Record<string, number> = {
        SICK: 10,
        VACATION: 15,
        PML: 7,
        SML: 3,
        EMERGENCY: 3,
        SOLO_PARENT: 7,
        MATERNITY: 105,
        PATERNITY: 7,
        BEREAVEMENT: 5,
        MAGNA_CARTA_WOMEN: 60,
      };

      for (const emp of employees) {
        for (const leaveType of ['SICK', 'VACATION', 'PML', 'SML', 'EMERGENCY', 'SOLO_PARENT', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'MAGNA_CARTA_WOMEN'] as const) {
          await prisma.leaveBalance.upsert({
            where: { employeeId_year_leaveType: { employeeId: emp.id, year, leaveType } },
            update: { totalDays: defaults[leaveType], usedDays: 0, pendingDays: 0 },
            create: { employeeId: emp.id, year, leaveType, totalDays: defaults[leaveType], usedDays: 0, pendingDays: 0 },
          });
        }
      }
      logger.info(`Reset all leave balances for ${employees.length} employees for year ${year}.`);
    } catch (err) {
      logger.error('Yearly leave reset cron error:', err);
    }
  }, { timezone: 'Asia/Manila' });
}
