import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';

export async function employeeDashboard(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

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
        leaveBalances,
        pendingLeaves,
        overtimeCredit,
        pendingCorrections,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
}

export async function deptHeadDashboard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const dept = await prisma.department.findFirst({ where: { headId: req.user!.sub } });
    const deptId = dept?.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = deptId ? { departmentId: deptId, isActive: true } : { isActive: true };

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
        employees,
        todayAttendance,
        todayStats: {
          total: todayAttendance.length,
          onsite: todayAttendance.filter((r) => r.status === 'ON_SITE').length,
          wfh: todayAttendance.filter((r) => r.status === 'WFH').length,
          ob: todayAttendance.filter((r) => r.status === 'OB').length,
        },
        pendingApprovals: { leaves: pendingLeaves, overtime: pendingOvertime, corrections: pendingCorrections },
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
}

export async function hrDashboard(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalEmployees, todayAttendance, pendingLeaves, pendingCorrections, departments] = await Promise.all([
      prisma.employee.count({ where: { isActive: true } }),
      prisma.attendanceRecord.findMany({
        where: { date: today },
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, employeeNumber: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.attendanceCorrection.count({ where: { status: 'PENDING' } }),
      prisma.department.findMany({
        where: { isActive: true },
        include: { _count: { select: { employees: { where: { isActive: true } } } } },
      }),
    ]);

    const absentCount = totalEmployees - todayAttendance.length;

    res.json({
      success: true,
      data: {
        totalEmployees,
        todayStats: {
          total: todayAttendance.length,
          onsite: todayAttendance.filter((r) => r.status === 'ON_SITE').length,
          wfh: todayAttendance.filter((r) => r.status === 'WFH').length,
          ob: todayAttendance.filter((r) => r.status === 'OB').length,
          absent: absentCount,
        },
        todayAttendance,
        pendingLeaves,
        pendingCorrections,
        departments,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load HR dashboard.' });
  }
}

export async function adminDashboard(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [totalUsers, totalEmployees, totalDepts, todayClockIns, monthLeaves, monthOvertime, recentAudit] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.employee.count({ where: { isActive: true } }),
      prisma.department.count({ where: { isActive: true } }),
      prisma.attendanceRecord.count({ where: { date: today } }),
      prisma.leaveRequest.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.overtimeRecord.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.auditLog.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } },
      }),
    ]);

    res.json({
      success: true,
      data: {
        stats: { totalUsers, totalEmployees, totalDepts, todayClockIns, monthLeaves, monthOvertime },
        recentAudit,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load admin dashboard.' });
  }
}
