import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import * as XLSX from 'xlsx';

const MAX_REPORT_DAYS = 92; // ~1 quarter; keeps Vercel function within 10s timeout

function parseDateRange(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
    const where: any = { date: { gte: start, lte: end } };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    else if (departmentId) where.employee = { departmentId, isArchived: false };
    else where.employee = { isArchived: false };

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true, designation: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { employee: { lastName: 'asc' } }],
    });

    // chartData: daily grouped by date
    const byDate = new Map<string, { onsite: number; wfh: number; ob: number; total: number }>();
    for (const r of records) {
      const d = r.date.toISOString().split('T')[0];
      if (!byDate.has(d)) byDate.set(d, { onsite: 0, wfh: 0, ob: 0, total: 0 });
      const entry = byDate.get(d)!;
      entry.total++;
      if (r.status === 'ON_SITE') entry.onsite++;
      else if (r.status === 'WFH') entry.wfh++;
      else if (r.status === 'OB') entry.ob++;
    }
    const chartData = Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v }));

    // summary: by department
    const byDept = new Map<string, { dept: string; present: number; onsite: number; wfh: number; ob: number; totalWorkMins: number; totalOTMins: number }>();
    for (const r of records) {
      const dept = r.employee.department?.name ?? 'Unknown';
      if (!byDept.has(dept)) byDept.set(dept, { dept, present: 0, onsite: 0, wfh: 0, ob: 0, totalWorkMins: 0, totalOTMins: 0 });
      const e = byDept.get(dept)!;
      e.present++;
      if (r.status === 'ON_SITE') e.onsite++;
      else if (r.status === 'WFH') e.wfh++;
      else if (r.status === 'OB') e.ob++;
      e.totalWorkMins += r.workingMinutes || 0;
      e.totalOTMins += r.overtimeMinutes || 0;
    }
    const summary = Array.from(byDept.values()).map((e) => ({
      Department: e.dept,
      'Records': e.present,
      'On-Site': e.onsite,
      WFH: e.wfh,
      OB: e.ob,
      'Total Work Hours': (e.totalWorkMins / 60).toFixed(1),
      'Total OT Hours': (e.totalOTMins / 60).toFixed(1),
    }));

    res.json({ success: true, data: { chartData, summary, records } });
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

    const leaveTypeLabel: Record<string, string> = {
      SICK: 'Sick Leave',
      VACATION: 'Vacation',
      PML: 'Pamilya Muna',
      SML: 'Sarili Muna',
      EMERGENCY: 'Emergency Leave',
      SOLO_PARENT: 'Solo Parent Leave',
      MATERNITY: 'Maternity Leave',
      PATERNITY: 'Paternity Leave',
      BEREAVEMENT: 'Bereavement Leave',
      MAGNA_CARTA_WOMEN: 'Magna Carta for Women Leave',
    };

    const summary = leaves.map((l) => ({
      Employee: `${l.employee.firstName} ${l.employee.lastName}`,
      Department: l.employee.department?.name ?? '—',
      'Leave Type': leaveTypeLabel[l.leaveType] || l.leaveType,
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
          select: { date: true, status: true },
        },
      },
    });

    // Build working days list between start and end
    const workingDays: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) workingDays.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    // chartData: daily total absences
    const byDate = new Map<string, number>();
    for (const d of workingDays) byDate.set(d, 0);
    for (const emp of employees) {
      const presentDays = new Set(emp.attendanceRecords.map((r) => r.date.toISOString().split('T')[0]));
      for (const d of workingDays) {
        if (!presentDays.has(d)) byDate.set(d, (byDate.get(d) || 0) + 1);
      }
    }
    const chartData = Array.from(byDate.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    const summary = employees.map((emp) => {
      const presentDays = new Set(emp.attendanceRecords.map((r) => r.date.toISOString().split('T')[0]));
      const absentDays = workingDays.filter((d) => !presentDays.has(d)).length;
      return {
        Employee: `${emp.firstName} ${emp.lastName}`,
        'Emp No.': emp.employeeNumber,
        Department: emp.department?.name ?? '—',
        'Working Days': workingDays.length,
        'Days Present': presentDays.size,
        'Days Absent': absentDays,
        'Attendance Rate': workingDays.length > 0 ? `${((presentDays.size / workingDays.length) * 100).toFixed(0)}%` : '—',
      };
    }).sort((a, b) => b['Days Absent'] - a['Days Absent']);

    res.json({ success: true, data: { chartData, summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function exportAttendance(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);

  try {
    const where: any = { date: { gte: start, lte: end } };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    else if (departmentId) where.employee = { departmentId, isArchived: false };
    else where.employee = { isArchived: false };

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true, designation: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { employee: { lastName: 'asc' } }],
    });

    const rows = records.map((r) => ({
      'Employee No.': r.employee.employeeNumber,
      'Last Name': r.employee.lastName,
      'First Name': r.employee.firstName,
      Department: r.employee.department?.name || '',
      Designation: r.employee.designation || '',
      Date: r.date.toISOString().split('T')[0],
      'Clock In': r.clockIn?.toLocaleTimeString('en-PH') || '',
      'Clock Out': r.clockOut?.toLocaleTimeString('en-PH') || '',
      Status: r.status || '',
      'Working Hours': r.workingMinutes ? (r.workingMinutes / 60).toFixed(2) : '0',
      'Overtime Hours': r.overtimeMinutes ? (r.overtimeMinutes / 60).toFixed(2) : '0',
      'Clock-In Lat': r.clockInLat || '',
      'Clock-In Lng': r.clockInLng || '',
    }));

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
