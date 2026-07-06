import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { AttendanceStatus, ApprovalStatus } from '@prisma/client';
import { notificationService } from '../services/notification.service';
import { phtToday, phtYear, phtMonth } from '../utils/timezone';

const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT || '14.5995');
const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG || '120.9842');
const OFFICE_RADIUS = parseFloat(process.env.OFFICE_RADIUS_METERS || '200');
const OVERTIME_THRESHOLD_MINUTES = 9 * 60; // 9 hours

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDeviceInfo(userAgent: string): string {
  return userAgent.substring(0, 200);
}

// Parse datetime strings as Philippine Standard Time (UTC+8).
// Vercel runs in UTC, so we must explicitly apply +08:00 for naive strings.
function parsePhilippineDateTime(s?: string | null): Date | undefined {
  if (!s) return undefined;
  // If timezone info is already present (Z or ±hh:mm), parse directly
  if (/[zZ]$/.test(s) || /[+\-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  // For naive datetime strings (e.g. "2026-05-21T08:00"), assume Philippine time (UTC+8)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    // Appending +08:00 lets JS correctly convert to UTC regardless of server timezone
    return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+08:00`);
  }
  return new Date(s);
}

export async function clockIn(req: AuthRequest, res: Response): Promise<void> {
  const { latitude, longitude, accuracy, status } = req.body;
  const employeeId = req.user!.employeeId;

  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee profile not found.' }); return; }
  if (!latitude || !longitude) { res.status(400).json({ success: false, message: 'Location is required.' }); return; }

  try {
    const today = phtToday();

    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (existing?.clockIn) {
      res.status(400).json({ success: false, message: 'Already clocked in today.' });
      return;
    }

    const distance = haversineDistance(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
    const isOnsite = distance <= OFFICE_RADIUS;

    let attendanceStatus: AttendanceStatus;
    if (isOnsite) {
      attendanceStatus = AttendanceStatus.ON_SITE;
    } else if (status && ['WFH', 'OB', 'ON_SITE'].includes(status)) {
      attendanceStatus = status as AttendanceStatus;
    } else {
      // Must select status when outside radius
      res.status(400).json({
        success: false,
        message: 'You are outside office radius. Please select attendance type.',
        data: { distance: Math.round(distance), isOnsite: false },
      });
      return;
    }

    const now = new Date();
    const record = existing
      ? await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            clockIn: now,
            clockInLat: latitude,
            clockInLng: longitude,
            clockInAccuracy: accuracy,
            clockInDevice: getDeviceInfo(req.headers['user-agent'] || ''),
            status: attendanceStatus,
          },
        })
      : await prisma.attendanceRecord.create({
          data: {
            employeeId,
            date: today,
            clockIn: now,
            clockInLat: latitude,
            clockInLng: longitude,
            clockInAccuracy: accuracy,
            clockInDevice: getDeviceInfo(req.headers['user-agent'] || ''),
            status: attendanceStatus,
          },
        });

    // Fire-and-forget audit log — don't block the response
    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'CLOCK_IN',
        entity: 'AttendanceRecord',
        entityId: record.id,
        newValues: { lat: latitude, lng: longitude, status: attendanceStatus },
        ipAddress: req.ip,
        latitude,
        longitude,
      },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Clock-in recorded successfully.',
      data: { ...record, distance: Math.round(distance), isOnsite },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Clock-in failed.' });
  }
}

export async function clockOut(req: AuthRequest, res: Response): Promise<void> {
  const { latitude, longitude, accuracy } = req.body;
  const employeeId = req.user!.employeeId;

  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee profile not found.' }); return; }
  if (!latitude || !longitude) { res.status(400).json({ success: false, message: 'Location is required.' }); return; }

  try {
    const today = phtToday();

    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });

    if (!record?.clockIn) { res.status(400).json({ success: false, message: 'No clock-in found for today.' }); return; }
    if (record.clockOut) { res.status(400).json({ success: false, message: 'Already clocked out today.' }); return; }

    const now = new Date();
    const workingMinutes = Math.floor((now.getTime() - record.clockIn.getTime()) / 60000);
    const overtimeMinutes = Math.max(0, workingMinutes - OVERTIME_THRESHOLD_MINUTES);

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        clockOutLat: latitude,
        clockOutLng: longitude,
        clockOutAccuracy: accuracy,
        clockOutDevice: getDeviceInfo(req.headers['user-agent'] || ''),
        workingMinutes,
        overtimeMinutes,
      },
    });

    // Auto-generate overtime record (draft — employee must click "File OT" before HR/dept head can see it)
    if (overtimeMinutes > 0) {
      const pendingExpiry = new Date();
      pendingExpiry.setMonth(pendingExpiry.getMonth() + 3);
      await prisma.overtimeRecord.create({
        data: {
          employeeId,
          attendanceId: record.id,
          date: today,
          startTime: record.clockIn,
          endTime: now,
          minutes: overtimeMinutes,
          reason: 'Auto-generated from attendance',
          pendingExpiry,
        },
      });
    }

    // Fire-and-forget audit log — don't block the response
    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'CLOCK_OUT',
        entity: 'AttendanceRecord',
        entityId: record.id,
        newValues: { lat: latitude, lng: longitude, workingMinutes, overtimeMinutes },
        ipAddress: req.ip,
        latitude,
        longitude,
      },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Clock-out recorded successfully.',
      data: { ...updated, overtimeMinutes },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Clock-out failed.' });
  }
}

export async function getTodayAttendance(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    const today = phtToday();

    const [record, missedClockOut] = await Promise.all([
      prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date: today } },
      }),
      // Find the most recent open record from a previous day (forgot to clock out)
      prisma.attendanceRecord.findFirst({
        where: { employeeId, date: { lt: today }, clockIn: { not: null }, clockOut: null },
        orderBy: { date: 'desc' },
      }),
    ]);

    res.json({ success: true, data: record, missedClockOut: missedClockOut || null });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch attendance.' });
  }
}

export async function getMyAttendance(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  const { startDate, endDate, page = '1', limit = '30' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = { employeeId };
    if (startDate) where.date = { gte: new Date(startDate) };
    if (endDate) where.date = { ...where.date, lte: new Date(endDate) };

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({ where, orderBy: { date: 'desc' }, skip, take: parseInt(limit) }),
      prisma.attendanceRecord.count({ where }),
    ]);

    res.json({ success: true, data: records, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch attendance.' });
  }
}

export async function getMonthlySummary(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  const { year, month } = req.query as Record<string, string>;
  const y = parseInt(year || String(phtYear()));
  const m = parseInt(month || String(phtMonth()));

  try {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));

    const records = await prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const summary = {
      totalDays: records.length,
      onsite: records.filter((r) => r.status === 'ON_SITE').length,
      wfh: records.filter((r) => r.status === 'WFH').length,
      ob: records.filter((r) => r.status === 'OB').length,
      totalWorkingMinutes: records.reduce((s, r) => s + r.workingMinutes, 0),
      totalOvertimeMinutes: records.reduce((s, r) => s + r.overtimeMinutes, 0),
    };

    res.json({ success: true, data: { records, summary } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch summary.' });
  }
}

export async function requestCorrection(req: AuthRequest, res: Response): Promise<void> {
  const { attendanceId, requestedClockIn, requestedClockOut, reason } = req.body;
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    const attendance = await prisma.attendanceRecord.findFirst({
      where: { id: attendanceId, employeeId },
    });
    if (!attendance) { res.status(404).json({ success: false, message: 'Attendance record not found.' }); return; }

    // Block corrections for today or future dates — must wait until the next working day
    const today = phtToday();
    if (attendance.date >= today) {
      res.status(400).json({ success: false, message: "You cannot file a correction for today's or a future attendance record. Please wait until the next working day." });
      return;
    }

    // Validate that requested times are within ±1 day of the attendance date
    // (guards against wrong-date entries that inflate overtime by 24h)
    const parsedClockIn = requestedClockIn ? parsePhilippineDateTime(requestedClockIn) : undefined;
    const parsedClockOut = requestedClockOut ? parsePhilippineDateTime(requestedClockOut) : undefined;

    const attendanceDateMs = attendance.date.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (parsedClockIn && Math.abs(parsedClockIn.getTime() - attendanceDateMs) > 2 * oneDayMs) {
      res.status(400).json({ success: false, message: 'Corrected clock-in date is too far from the attendance date.' });
      return;
    }
    if (parsedClockOut && Math.abs(parsedClockOut.getTime() - attendanceDateMs) > 2 * oneDayMs) {
      res.status(400).json({ success: false, message: 'Corrected clock-out date is too far from the attendance date.' });
      return;
    }

    const correction = await prisma.attendanceCorrection.create({
      data: {
        employeeId,
        attendanceId,
        originalClockIn: attendance.clockIn,
        originalClockOut: attendance.clockOut,
        requestedClockIn: parsedClockIn,
        requestedClockOut: parsedClockOut,
        reason,
      },
    });

    await notificationService.notifyDeptHead(employeeId, 'ATTENDANCE_CORRECTION', {
      correctionId: correction.id,
      message: 'New attendance correction request.',
    });

    res.status(201).json({ success: true, data: correction });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to submit correction.' });
  }
}

export async function getMyCorrections(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  const { page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const [corrections, total] = await Promise.all([
      prisma.attendanceCorrection.findMany({
        where: { employeeId },
        include: { attendance: { select: { date: true, clockIn: true, clockOut: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.attendanceCorrection.count({ where: { employeeId } }),
    ]);
    res.json({ success: true, data: corrections, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch corrections.' });
  }
}

export async function getCorrections(req: AuthRequest, res: Response): Promise<void> {
  const { status, departmentId, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    if (status) where.status = status;

    // Dept heads only see their department
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const deptId = req.user!.departmentId;
      if (!deptId) { res.json({ success: true, data: [], meta: { total: 0, page: parseInt(page), limit: parseInt(limit) } }); return; }
      where.employee = { departmentId: deptId };
    } else if (departmentId) {
      where.employee = { departmentId };
    }

    const [corrections, total] = await Promise.all([
      prisma.attendanceCorrection.findMany({
        where,
        include: { employee: { include: { department: true } }, attendance: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.attendanceCorrection.count({ where }),
    ]);

    res.json({ success: true, data: corrections, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch corrections.' });
  }
}

export async function reviewCorrection(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid status.' });
    return;
  }

  try {
    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id },
      include: { attendance: true, employee: true },
    });
    if (!correction) { res.status(404).json({ success: false, message: 'Correction not found.' }); return; }

    // HR/Admin cannot approve their own correction request
    if ((req.user!.role === 'HR' || req.user!.role === 'ADMIN') && correction.employeeId === req.user!.employeeId) {
      res.status(403).json({ success: false, message: 'You cannot approve your own request.' }); return;
    }

    // Ensure dept head only reviews their own department's corrections
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const deptId = req.user!.departmentId;
      if (!deptId || correction.employee.departmentId !== deptId) {
        res.status(403).json({ success: false, message: 'You can only review corrections from your department.' }); return;
      }
    }

    const updated = await prisma.attendanceCorrection.update({
      where: { id },
      data: {
        status: status as ApprovalStatus,
        reviewedBy: req.user!.sub,
        reviewedAt: new Date(),
        reviewerNotes: notes,
      },
    });

    // Apply correction if approved
    if (status === 'APPROVED') {
      const updateData: any = {};
      if (correction.requestedClockIn) updateData.clockIn = correction.requestedClockIn;
      if (correction.requestedClockOut) updateData.clockOut = correction.requestedClockOut;

      // Use corrected values where provided, fall back to existing record values
      const effectiveClockIn = updateData.clockIn ?? correction.attendance.clockIn;
      const effectiveClockOut = updateData.clockOut ?? correction.attendance.clockOut;

      if (effectiveClockIn && effectiveClockOut) {
        const workingMinutes = Math.floor(
          (effectiveClockOut.getTime() - effectiveClockIn.getTime()) / 60000,
        );
        updateData.workingMinutes = workingMinutes;
        updateData.overtimeMinutes = Math.max(0, workingMinutes - OVERTIME_THRESHOLD_MINUTES);
      }

      // mark attendance as manually corrected
      updateData.isManual = true;
      await prisma.attendanceRecord.update({ where: { id: correction.attendanceId }, data: updateData });

      // Sync OvertimeRecord — remove old entry and recreate with corrected hours
      await prisma.overtimeRecord.deleteMany({ where: { attendanceId: correction.attendanceId } });

      const newOvertimeMinutes = updateData.overtimeMinutes ?? 0;
      if (newOvertimeMinutes > 0 && effectiveClockIn && effectiveClockOut) {
        const pendingExpiry = new Date();
        pendingExpiry.setMonth(pendingExpiry.getMonth() + 3);
        await prisma.overtimeRecord.create({
          data: {
            employeeId: correction.employeeId,
            attendanceId: correction.attendanceId,
            date: correction.attendance.date,
            startTime: effectiveClockIn,
            endTime: effectiveClockOut,
            minutes: newOvertimeMinutes,
            reason: 'Updated via attendance correction',
            pendingExpiry,
          },
        });
      }
    }

    await notificationService.notifyEmployee(correction.employeeId, 'APPROVAL_RESULT', {
      type: 'Attendance Correction',
      status,
    });

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
        entity: 'AttendanceCorrection',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review correction.' });
  }
}

export async function getAllAttendance(req: AuthRequest, res: Response): Promise<void> {
  const { startDate, endDate, departmentId, employeeId, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (employeeId) where.employeeId = employeeId;
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const dept = await prisma.department.findFirst({ where: { headId: req.user!.sub } });
      if (dept) where.employee = { departmentId: dept.id };
    } else if (departmentId) {
      where.employee = { departmentId };
    }

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } } } },
        orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
        skip,
        take: parseInt(limit),
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    res.json({ success: true, data: records, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch attendance records.' });
  }
}

export async function getEmployeeAttendance(req: AuthRequest, res: Response): Promise<void> {
  const { employeeId } = req.params;
  const { startDate, endDate } = req.query as Record<string, string>;

  try {
    const where: any = { employeeId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const records = await prisma.attendanceRecord.findMany({ where, orderBy: { date: 'desc' } });
    res.json({ success: true, data: records });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch attendance.' });
  }
}

export async function getAbsentToday(req: AuthRequest, res: Response): Promise<void> {
  try {
    const today = phtToday();

    const absent = await prisma.employee.findMany({
      where: {
        isActive: true,
        isArchived: false,
        NOT: { attendanceRecords: { some: { date: today } } },
      },
      select: {
        id: true, firstName: true, lastName: true, employeeNumber: true,
        department: { select: { name: true } },
      },
    });

    res.json({ success: true, data: absent });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch absent employees.' });
  }
}
