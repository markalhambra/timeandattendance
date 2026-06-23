import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { phtToday, phtYear, phtMonth, phtMonthBounds } from '../utils/timezone';
import { logger } from '../config/logger';

const LEAVE_BALANCE_DEFAULTS = {
  SICK: 15,
  VACATION: 15,
  PML: 7,
  SML: 3,
  EMERGENCY: 15,
  SOLO_PARENT: 7,
  MATERNITY: 105,
  PATERNITY: 7,
  BEREAVEMENT: 5,
  MAGNA_CARTA_WOMEN: 60,
} as const;

const LEAVE_TYPES = Object.keys(LEAVE_BALANCE_DEFAULTS) as Array<keyof typeof LEAVE_BALANCE_DEFAULTS>;

// SICK and EMERGENCY share one pool — mirror SICK values onto the EMERGENCY row
function mirrorEmergencyBalance(balances: any[]): any[] {
  const sick = balances.find((b: any) => b.leaveType === 'SICK');
  if (!sick) return balances;
  return balances.map((b: any) =>
    b.leaveType === 'EMERGENCY'
      ? { ...b, totalDays: sick.totalDays, usedDays: sick.usedDays, pendingDays: sick.pendingDays }
      : b,
  );
}

async function ensureLeaveBalances(employeeId: string, year: number): Promise<void> {
  // Check if all balances exist before running createMany
  const existing = await prisma.leaveBalance.count({ where: { employeeId, year } });
  if (existing >= LEAVE_TYPES.length) return; // already initialized
  // Use createMany with skipDuplicates — single query, safe with connection_limit=1
  await prisma.leaveBalance.createMany({
    data: LEAVE_TYPES.map((leaveType) => ({
      employeeId,
      year,
      leaveType,
      totalDays: LEAVE_BALANCE_DEFAULTS[leaveType],
    })),
    skipDuplicates: true,
  });
}

export async function employeeDashboard(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    const today = phtToday();
    const year = phtYear();
    const month = phtMonth();
    const [monthStart, monthEnd] = phtMonthBounds(year, month);

    await ensureLeaveBalances(employeeId, year);

    const [todayRecord, monthRecords, leaveBalances, pendingLeaves, overtimeCredits, pendingCorrections] = await Promise.all([
      prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date: today } } }),
      prisma.attendanceRecord.findMany({ where: { employeeId, date: { gte: monthStart, lte: monthEnd } } }),
      prisma.leaveBalance.findMany({ where: { employeeId, year } }),
      prisma.leaveRequest.count({ where: { employeeId, status: 'PENDING' } }),
      prisma.overtimeRecord.findMany({
        where: { employeeId, status: 'APPROVED', isConverted: false, approvedExpiry: { gt: new Date() } },
      }),
      prisma.attendanceCorrection.count({ where: { employeeId, status: 'PENDING' } }),
    ]);

    const monthlySummary = {
      totalDays: monthRecords.length,
      onsite: monthRecords.filter((r) => r.status === 'ON_SITE').length,
      wfh: monthRecords.filter((r) => r.status === 'WFH').length,
      ob: monthRecords.filter((r) => r.status === 'OB').length,
      totalWorkingMinutes: monthRecords.reduce((s, r) => s + r.workingMinutes, 0),
      totalOvertimeMinutes: monthRecords.reduce((s, r) => s + r.overtimeMinutes, 0),
    };

    const overtimeCredit = {
      totalMinutes: overtimeCredits.reduce((s, o) => s + o.minutes, 0),
      count: overtimeCredits.length,
      records: overtimeCredits,
    };

    res.json({
      success: true,
      data: {
        todayRecord,
        monthlySummary,
        leaveBalances: mirrorEmergencyBalance(leaveBalances),
        pendingLeaves,
        overtimeCredit,
        pendingCorrections,
      },
    });
  } catch (err: any) {
    logger.error('employeeDashboard error:', err?.message, err?.code);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
}

export async function deptHeadDashboard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const dept = await prisma.department.findFirst({ where: { headId: req.user!.sub } });
    if (!dept) {
      res.json({ success: true, data: { department: null, totalEmployees: 0, todayStats: { total: 0, present: 0, absent: 0, onsite: 0, wfh: 0, ob: 0 }, todayRecords: [], pendingLeaves: 0, pendingOvertimes: 0, pendingCorrections: 0 } });
      return;
    }
    const deptId = dept.id;

    const today = phtToday();

    const where = { departmentId: deptId, isActive: true, isArchived: false };

    const [employees, todayAttendance, pendingLeaves, pendingOvertime, pendingCorrections] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.attendanceRecord.findMany({
        where: { date: today, employee: where },
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING', deptHeadStatus: null, employee: where } }),
      prisma.overtimeRecord.count({ where: { status: 'PENDING', employee: where } }),
      prisma.attendanceCorrection.count({ where: { status: 'PENDING', employee: where } }),
    ]);

    res.json({
      success: true,
      data: {
        department: dept,
        totalEmployees: employees,
        todayStats: {
          total: todayAttendance.length,
          present: todayAttendance.length,
          absent: Math.max(0, employees - todayAttendance.length),
          onsite: todayAttendance.filter((r) => r.status === 'ON_SITE').length,
          wfh: todayAttendance.filter((r) => r.status === 'WFH').length,
          ob: todayAttendance.filter((r) => r.status === 'OB').length,
        },
        todayRecords: todayAttendance,
        pendingLeaves,
        pendingOvertimes: pendingOvertime,
        pendingCorrections,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
}

export async function hrDashboard(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const today = phtToday();

    const [totalEmployees, todayAttendance, pendingLeaves, pendingCorrections, departments] = await Promise.all([
      prisma.employee.count({ where: { isActive: true, isArchived: false } }),
      prisma.attendanceRecord.findMany({
        where: { date: today, employee: { isArchived: false } },
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, employeeNumber: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING', employee: { isArchived: false } } }),
      prisma.attendanceCorrection.count({ where: { status: 'PENDING', employee: { isArchived: false } } }),
      prisma.department.findMany({
        where: { isActive: true },
        include: { _count: { select: { employees: { where: { isActive: true, isArchived: false } } } } },
      }),
    ]);

    const absentCount = totalEmployees - todayAttendance.length;
    const notYetIn = Math.max(0, totalEmployees - todayAttendance.length);

    res.json({
      success: true,
      data: {
        totalEmployees,
        activeEmployees: totalEmployees,
        totalDepartments: departments.length,
        todayStats: {
          total: todayAttendance.length,
          present: todayAttendance.length,
          onsite: todayAttendance.filter((r) => r.status === 'ON_SITE').length,
          wfh: todayAttendance.filter((r) => r.status === 'WFH').length,
          ob: todayAttendance.filter((r) => r.status === 'OB').length,
          absent: absentCount,
          notYetIn,
        },
        pendingLeaves,
        pendingOvertimes: 0,
        pendingConversions: 0,
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name,
          count: d._count.employees,
          presentToday: todayAttendance.filter((r) =>
            (r.employee as any)?.department?.name === d.name
          ).length,
        })),
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load HR dashboard.' });
  }
}

export async function adminDashboard(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const today = phtToday();

    const [totalUsers, activeUsers, totalDepartments, totalEmployees, todayAttendance, pendingLeaves, pendingOvertime, pendingCorrections, pendingConversions, recentAuditLogs] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.department.count({ where: { isActive: true } }),
      prisma.employee.count({ where: { isActive: true, isArchived: false } }),
      prisma.attendanceRecord.findMany({ where: { date: today } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.overtimeRecord.count({ where: { status: 'PENDING' } }),
      prisma.attendanceCorrection.count({ where: { status: 'PENDING' } }),
      prisma.overtimeConversion.count({ where: { status: 'PENDING' } }),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: { employee: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
    ]);

    const absentCount = totalEmployees - todayAttendance.length;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalDepartments,
        todayAttendance: {
          total: todayAttendance.length,
          present: todayAttendance.length,
          absent: absentCount,
        },
        pendingRequests: {
          leaves: pendingLeaves,
          overtime: pendingOvertime,
          corrections: pendingCorrections,
          conversions: pendingConversions,
        },
        recentAuditLogs: recentAuditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          createdAt: log.createdAt,
          user: {
            firstName: log.user?.employee?.firstName ?? log.user?.email?.split('@')[0] ?? 'System',
            lastName: log.user?.employee?.lastName ?? '',
          },
        })),
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load admin dashboard.' });
  }
}
