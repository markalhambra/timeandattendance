import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import * as XLSX from 'xlsx';

function parseDateRange(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = endDate ? new Date(endDate) : new Date();
  return { start, end };
}

export async function attendanceReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);

  try {
    const where: any = { date: { gte: start, lte: end } };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (departmentId) where.employee = { departmentId };

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
      orderBy: [{ date: 'desc' }, { employee: { lastName: 'asc' } }],
    });

    res.json({ success: true, data: records });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function leaveReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, leaveType, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);

  try {
    const where: any = { startDate: { gte: start }, endDate: { lte: end } };
    if (leaveType) where.leaveType = leaveType;
    if (status) where.status = status;
    if (departmentId) where.employee = { departmentId };

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
      orderBy: { startDate: 'desc' },
    });

    res.json({ success: true, data: leaves });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function overtimeReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, status } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);

  try {
    const where: any = { date: { gte: start, lte: end } };
    if (status) where.status = status;
    if (departmentId) where.employee = { departmentId };

    const records = await prisma.overtimeRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true,
            department: { select: { name: true } },
          },
        },
        conversion: true,
      },
      orderBy: { date: 'desc' },
    });

    res.json({ success: true, data: records });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function absenceReport(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);

  try {
    const empWhere: any = { isActive: true };
    if (departmentId) empWhere.departmentId = departmentId;

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

    res.json({ success: true, data: employees });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
}

export async function exportAttendance(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId } = req.query as Record<string, string>;
  const { start, end } = parseDateRange(startDate, endDate);

  try {
    const where: any = { date: { gte: start, lte: end } };
    if (departmentId) where.employee = { departmentId };

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
