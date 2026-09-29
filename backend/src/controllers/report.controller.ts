import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import * as XLSX from 'xlsx';
import { ApprovalStatus } from '@prisma/client';
import { phtYear, phtMonth } from '../utils/timezone';
import {
  buildDailyAttendanceRows,
  chartFromDailyRows,
  isoDate,
  LEAVE_TYPE_LABEL,
  loadApprovedLeaveByDay,
  workingDaysBetween,
} from '../utils/attendanceDayRows';

const MAX_REPORT_DAYS = 92; // ~1 quarter; keeps Vercel function within 10s timeout

function parseDateRange(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(Date.UTC(phtYear(), phtMonth() - 1, 1));
  const end = endDate ? new Date(endDate) : new Date();
  return { start, end };
}

function validateDateRange(start: Date, end: Date, res: Response): boolean {
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  if (diffDays > MAX_REPORT_DAYS) {
    res.status(400).json({
      success: false,
      message: `Date range cannot exceed ${MAX_REPORT_DAYS} days (approx. 1 quarter). Please narrow your selection.`,
    });
    return false;
  }
  return true;
}

export async function attendanceReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);
  if (!validateDateRange(start, end, res)) return;

  try {
    const rows = await buildDailyAttendanceRows(start, end, employeeId, departmentId, status);
    const summary = rows.map((r) => ({
      Date: r.Date,
      Name: r.Name,
      'Employee Number': r['Employee Number'],
      Department: r.Department,
      Status: r.Status,
    }));
    res.json({ success: true, data: { chartData: chartFromDailyRows(rows), summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function leaveReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, leaveType, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);
  if (!validateDateRange(start, end, res)) return;

  try {
    const where: any = { startDate: { gte: start }, endDate: { lte: end } };
    if (leaveType) where.leaveType = leaveType;
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    else if (departmentId) where.employee = { departmentId, isArchived: false };
    else where.employee = { isArchived: false };

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // chartData: daily approved leave count
    const byDate = new Map<string, number>();
    for (const l of leaves) {
      const d = l.startDate.toISOString().split('T')[0];
      byDate.set(d, (byDate.get(d) || 0) + 1);
    }
    const chartData = Array.from(byDate.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const summary = leaves.map((l) => ({
      Employee: `${l.employee.firstName} ${l.employee.lastName}`,
      Department: l.employee.department?.name ?? '—',
      'Leave Type': LEAVE_TYPE_LABEL[l.leaveType] || l.leaveType,
      'Start Date': l.startDate.toISOString().split('T')[0],
      'End Date': l.endDate.toISOString().split('T')[0],
      Days: l.totalDays,
      Status: l.status,
    }));

    res.json({ success: true, data: { chartData, summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function overtimeReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);
  if (!validateDateRange(start, end, res)) return;

  try {
    const where: any = { date: { gte: start, lte: end } };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    else if (departmentId) where.employee = { departmentId, isArchived: false };
    else where.employee = { isArchived: false };

    const records = await prisma.overtimeRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    // chartData: daily OT count
    const byDate = new Map<string, number>();
    for (const r of records) {
      const d = r.date.toISOString().split('T')[0];
      byDate.set(d, (byDate.get(d) || 0) + 1);
    }
    const chartData = Array.from(byDate.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const summary = records.map((r) => ({
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Department: r.employee.department?.name ?? '—',
      Date: r.date.toISOString().split('T')[0],
      'OT Hours': (r.minutes / 60).toFixed(2),
      Status: r.status,
      Converted: r.isConverted ? 'Yes' : 'No',
    }));

    res.json({ success: true, data: { chartData, summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function absenceReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);
  if (!validateDateRange(start, end, res)) return;

  try {
    const empWhere: any = { isActive: true, isArchived: false };
    if (employeeId) { empWhere.id = employeeId; delete empWhere.isArchived; }
    else if (departmentId) empWhere.departmentId = departmentId;

    const employees = await prisma.employee.findMany({
      where: empWhere,
      select: {
        id: true, firstName: true, lastName: true, employeeNumber: true,
        department: { select: { name: true } },
        attendanceRecords: {
          where: { date: { gte: start, lte: end } },
          select: { date: true },
        },
      },
    });

    const workingDays = workingDaysBetween(start, end);
    const leaveByEmp = await loadApprovedLeaveByDay(employees.map((e) => e.id), start, end);

    const byDate = new Map<string, number>();
    for (const d of workingDays) byDate.set(d, 0);
    for (const emp of employees) {
      const presentDays = new Set(emp.attendanceRecords.map((r) => isoDate(r.date)));
      const leaveDays = leaveByEmp.get(emp.id) ?? new Map<string, string>();
      for (const d of workingDays) {
        if (!presentDays.has(d) && !leaveDays.has(d)) byDate.set(d, (byDate.get(d) || 0) + 1);
      }
    }
    const chartData = Array.from(byDate.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const summary = employees.map((emp) => {
      const presentDays = new Set(emp.attendanceRecords.map((r) => isoDate(r.date)));
      const leaveDays = leaveByEmp.get(emp.id) ?? new Map<string, string>();
      const daysOnLeave = workingDays.filter((d) => leaveDays.has(d) && !presentDays.has(d)).length;
      const absentDays = workingDays.filter((d) => !presentDays.has(d) && !leaveDays.has(d)).length;
      const covered = workingDays.length - absentDays;
      return {
        Employee: `${emp.firstName} ${emp.lastName}`,
        'Emp No.': emp.employeeNumber,
        Department: emp.department?.name ?? '—',
        'Working Days': workingDays.length,
        'Days Present': presentDays.size,
        'Days on Leave': daysOnLeave,
        'Days Absent': absentDays,
        'Attendance Rate': workingDays.length > 0 ? `${((covered / workingDays.length) * 100).toFixed(0)}%` : '—',
      };
    }).sort((a, b) => b['Days Absent'] - a['Days Absent']);

    res.json({ success: true, data: { chartData, summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function otCreditsReport(req: AuthRequest, res: Response): Promise<void> {
  const { departmentId, employeeId } = req.query as Record<string, string>;

  try {
    const now = new Date();
    const where: any = {
      status: ApprovalStatus.APPROVED,
      isConverted: false,
      approvedExpiry: { gt: now },
    };
    if (employeeId) where.employeeId = employeeId;
    else if (departmentId) where.employee = { departmentId, isArchived: false };
    else where.employee = { isArchived: false };

    const records = await prisma.overtimeRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { approvedExpiry: 'asc' }],
    });

    // chart: available OT hours per department
    const byDeptChart = new Map<string, number>();
    for (const r of records) {
      const dept = r.employee.department?.name ?? 'Unknown';
      byDeptChart.set(dept, (byDeptChart.get(dept) || 0) + r.minutes);
    }
    const chartData = Array.from(byDeptChart.entries())
      .map(([date, minutes]) => ({ date, count: parseFloat((minutes / 60).toFixed(2)) }))
      .sort((a, b) => b.count - a.count);

    // summary: one row per employee, sorted by most available hours
    const byEmp = new Map<string, {
      name: string; empNo: string; dept: string;
      records: number; totalMinutes: number; earliestExpiry: Date;
    }>();
    for (const r of records) {
      if (!byEmp.has(r.employeeId)) {
        byEmp.set(r.employeeId, {
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          empNo: r.employee.employeeNumber ?? '—',
          dept: r.employee.department?.name ?? '—',
          records: 0,
          totalMinutes: 0,
          earliestExpiry: r.approvedExpiry!,
        });
      }
      const e = byEmp.get(r.employeeId)!;
      e.records++;
      e.totalMinutes += r.minutes;
      if (r.approvedExpiry && r.approvedExpiry < e.earliestExpiry) e.earliestExpiry = r.approvedExpiry;
    }

    const summary = Array.from(byEmp.values())
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .map((e) => ({
        Employee: e.name,
        'Emp No.': e.empNo,
        Department: e.dept,
        'OT Records': e.records,
        'Total OT Hours': (e.totalMinutes / 60).toFixed(2),
        'Earliest Expiry': e.earliestExpiry.toISOString().split('T')[0],
      }));

    res.json({ success: true, data: { chartData, summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate OT credits report.' });
  }
}

export async function exportAttendance(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);
  if (!validateDateRange(start, end, res)) return;

  try {
    const rows = await buildDailyAttendanceRows(start, end, employeeId, departmentId, status);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch {
    res.status(500).json({ success: false, message: 'Failed to export.' });
  }
}
