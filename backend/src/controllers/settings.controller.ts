import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import * as XLSX from 'xlsx';
import { AttendanceStatus } from '@prisma/client';
import { SETTING_KEYS, settingsService, SettingKey } from '../services/settings.service';
import { phtToday } from '../utils/timezone';

function numInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function getOfficeSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const office = await settingsService.getOfficeSettings();
    res.json({ success: true, data: office });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load office settings.' });
  }
}

export async function getSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const raw = await settingsService.getAll();
    const approverId = raw[SETTING_KEYS.DEPT_HEAD_APPROVER_USER_ID]?.trim() || null;
    let deptHeadApprover: { id: string; email: string; role: string; name: string } | null = null;
    if (approverId) {
      const user = await prisma.user.findUnique({
        where: { id: approverId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      });
      if (user) {
        deptHeadApprover = {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.employee
            ? `${user.employee.firstName} ${user.employee.lastName}`
            : user.email,
        };
      }
    }

    res.json({
      success: true,
      data: {
        officeLat: parseFloat(raw[SETTING_KEYS.OFFICE_LAT]),
        officeLng: parseFloat(raw[SETTING_KEYS.OFFICE_LNG]),
        officeRadiusMeters: parseFloat(raw[SETTING_KEYS.OFFICE_RADIUS]),
        otThresholdHours: parseFloat(raw[SETTING_KEYS.OT_THRESHOLD_HOURS]),
        maxFailedLoginAttempts: parseInt(raw[SETTING_KEYS.MAX_FAILED_LOGINS], 10),
        lockoutDurationMinutes: parseInt(raw[SETTING_KEYS.LOCKOUT_DURATION_MINUTES], 10),
        deptHeadApproverUserId: approverId,
        deptHeadApprover,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const updates: Partial<Record<SettingKey, string>> = {};

    if (body.officeLat !== undefined) {
      const n = numInRange(body.officeLat, -90, 90);
      if (n === null) { res.status(400).json({ success: false, message: 'Invalid office latitude.' }); return; }
      updates[SETTING_KEYS.OFFICE_LAT] = String(n);
    }
    if (body.officeLng !== undefined) {
      const n = numInRange(body.officeLng, -180, 180);
      if (n === null) { res.status(400).json({ success: false, message: 'Invalid office longitude.' }); return; }
      updates[SETTING_KEYS.OFFICE_LNG] = String(n);
    }
    if (body.officeRadiusMeters !== undefined) {
      const n = numInRange(body.officeRadiusMeters, 10, 50000);
      if (n === null) { res.status(400).json({ success: false, message: 'Office radius must be between 10 and 50000 meters.' }); return; }
      updates[SETTING_KEYS.OFFICE_RADIUS] = String(n);
    }
    if (body.otThresholdHours !== undefined) {
      const n = numInRange(body.otThresholdHours, 1, 24);
      if (n === null) { res.status(400).json({ success: false, message: 'OT threshold must be between 1 and 24 hours.' }); return; }
      updates[SETTING_KEYS.OT_THRESHOLD_HOURS] = String(n);
    }
    if (body.maxFailedLoginAttempts !== undefined) {
      const n = intInRange(body.maxFailedLoginAttempts, 1, 50);
      if (n === null) { res.status(400).json({ success: false, message: 'Max failed attempts must be between 1 and 50.' }); return; }
      updates[SETTING_KEYS.MAX_FAILED_LOGINS] = String(n);
    }
    if (body.lockoutDurationMinutes !== undefined) {
      const n = intInRange(body.lockoutDurationMinutes, 0, 10080);
      if (n === null) { res.status(400).json({ success: false, message: 'Lockout duration must be 0–10080 minutes.' }); return; }
      updates[SETTING_KEYS.LOCKOUT_DURATION_MINUTES] = String(n);
    }
    if (body.deptHeadApproverUserId !== undefined) {
      const id = body.deptHeadApproverUserId === null || body.deptHeadApproverUserId === ''
        ? ''
        : String(body.deptHeadApproverUserId).trim();
      if (id) {
        const user = await prisma.user.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });
        if (!user || !user.isActive || !['HR', 'ADMIN'].includes(user.role)) {
          res.status(400).json({ success: false, message: 'Approver must be an active HR or ADMIN user.' });
          return;
        }
      }
      updates[SETTING_KEYS.DEPT_HEAD_APPROVER_USER_ID] = id;
    }

    if (!Object.keys(updates).length) {
      res.status(400).json({ success: false, message: 'No valid settings provided.' });
      return;
    }

    await settingsService.setMany(updates, req.user!.sub);

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'UPDATE',
        entity: 'SystemSetting',
        newValues: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    // Reuse getSettings response shape
    req.body = {};
    await getSettings(req, res);
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
}

export async function getApproverCandidates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['HR', 'ADMIN'] } },
      select: {
        id: true,
        email: true,
        role: true,
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { email: 'asc' },
    });
    res.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.email,
      })),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load approver candidates.' });
  }
}

// ── Database Management ────────────────────────────────────────────────────

function archiveCutoff(): Date {
  const d = new Date(phtToday().getTime());
  d.setMonth(d.getMonth() - 6);
  return d;
}

export async function archiveAttendancePreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cutoff = archiveCutoff();
    const count = await prisma.attendanceRecord.count({ where: { date: { lt: cutoff } } });
    res.json({ success: true, data: { count, cutoffDate: cutoff.toISOString().split('T')[0] } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to get archive preview.' });
  }
}

export async function archiveAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cutoff = archiveCutoff();
    const records = await prisma.attendanceRecord.findMany({
      where: { date: { lt: cutoff } },
      include: {
        employee: {
          select: {
            firstName: true, lastName: true, employeeNumber: true,
            department: { select: { name: true } },
          },
        },
        overtimeRecords: true,
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { date: 'asc' }],
    });

    if (!records.length) {
      res.status(404).json({ success: false, message: 'No attendance records older than 6 months found.' });
      return;
    }

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(records.map((r) => ({
      'Emp No.': r.employee.employeeNumber,
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Department: r.employee.department?.name ?? '—',
      Date: r.date.toISOString().split('T')[0],
      'Clock In (UTC)': r.clockIn?.toISOString() ?? '',
      'Clock Out (UTC)': r.clockOut?.toISOString() ?? '',
      Status: r.status ?? '',
      'Work Min': r.workingMinutes,
      'OT Min': r.overtimeMinutes,
      'Is Manual': r.isManual ? 'Y' : 'N',
    }))), 'Attendance');

    const otRows = records.flatMap((r) => r.overtimeRecords.map((o) => ({
      'Emp No.': r.employee.employeeNumber,
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Date: o.date.toISOString().split('T')[0],
      'Start (UTC)': o.startTime.toISOString(),
      'End (UTC)': o.endTime.toISOString(),
      Minutes: o.minutes,
      Reason: o.reason ?? '',
      Status: o.status,
      'Is Filed': o.isFiled ? 'Y' : 'N',
      'Is Converted': o.isConverted ? 'Y' : 'N',
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      otRows.length ? otRows : [{ Note: 'No overtime records in this archive' }],
    ), 'Overtime');

    const ids = records.map((r) => r.id);
    // OvertimeRecord has no onDelete cascade from AttendanceRecord — must delete first
    await prisma.overtimeRecord.deleteMany({ where: { attendanceId: { in: ids } } });
    await prisma.attendanceRecord.deleteMany({ where: { id: { in: ids } } });

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'DELETE',
        entity: 'AttendanceRecord',
        newValues: { archived: ids.length, cutoffDate: cutoff.toISOString().split('T')[0] },
        ipAddress: req.ip,
      },
    }).catch(() => {});

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=attendance_archive_before_${cutoff.toISOString().split('T')[0]}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch {
    res.status(500).json({ success: false, message: 'Archive failed.' });
  }
}

export async function backupDatabase(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [employees, attendance, leaves, overtime] = await Promise.all([
      prisma.employee.findMany({
        include: { department: { select: { name: true } } },
        orderBy: { lastName: 'asc' },
      }),
      prisma.attendanceRecord.findMany({
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
        orderBy: { date: 'desc' },
      }),
      prisma.leaveRequest.findMany({
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
        orderBy: { startDate: 'desc' },
      }),
      prisma.overtimeRecord.findMany({
        include: { employee: { select: { employeeNumber: true, firstName: true, lastName: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees.map((e) => ({
      'Emp No.': e.employeeNumber,
      'Last Name': e.lastName,
      'First Name': e.firstName,
      Department: e.department?.name ?? '—',
      Designation: e.designation ?? '',
      'Employment Type': e.employmentType ?? '',
      'Date Hired': e.dateHired?.toISOString().split('T')[0] ?? '',
      Email: e.workEmail ?? '',
      'Is Active': e.isActive ? 'Y' : 'N',
    }))), 'Employees');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendance.map((r) => ({
      'Emp No.': r.employee.employeeNumber,
      Employee: `${r.employee.firstName} ${r.employee.lastName}`,
      Date: r.date.toISOString().split('T')[0],
      'Clock In (UTC)': r.clockIn?.toISOString() ?? '',
      'Clock Out (UTC)': r.clockOut?.toISOString() ?? '',
      Status: r.status ?? '',
      'Work Min': r.workingMinutes,
      'OT Min': r.overtimeMinutes,
    }))), 'Attendance');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaves.map((l) => ({
      'Emp No.': l.employee.employeeNumber,
      Employee: `${l.employee.firstName} ${l.employee.lastName}`,
      'Leave Type': l.leaveType,
      'Start Date': l.startDate.toISOString().split('T')[0],
      'End Date': l.endDate.toISOString().split('T')[0],
      Days: l.totalDays,
      Status: l.status,
    }))), 'Leave Requests');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overtime.map((o) => ({
      'Emp No.': o.employee.employeeNumber,
      Employee: `${o.employee.firstName} ${o.employee.lastName}`,
      Date: o.date.toISOString().split('T')[0],
      Minutes: o.minutes,
      Status: o.status,
      'Is Converted': o.isConverted ? 'Y' : 'N',
    }))), 'Overtime');

    const today = new Date().toISOString().split('T')[0];
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=tams_backup_${today}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch {
    res.status(500).json({ success: false, message: 'Backup failed.' });
  }
}

export async function restoreAttendance(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded.' }); return; }

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets['Attendance'];
    if (!sheet) {
      res.status(400).json({ success: false, message: 'File must contain an "Attendance" sheet.' });
      return;
    }

    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    if (!rows.length) {
      res.status(400).json({ success: false, message: 'Attendance sheet is empty.' });
      return;
    }

    const empNos = [...new Set(rows.map((r) => String(r['Emp No.'] ?? '')).filter(Boolean))];
    const empList = await prisma.employee.findMany({
      where: { employeeNumber: { in: empNos } },
      select: { id: true, employeeNumber: true },
    });
    const empMap = new Map(empList.map((e) => [e.employeeNumber, e.id]));

    let upserted = 0;
    let skipped = 0;
    const validStatuses = new Set<string>(Object.values(AttendanceStatus));

    for (const row of rows) {
      const empNo = String(row['Emp No.'] ?? '');
      const employeeId = empMap.get(empNo);
      if (!employeeId) { skipped++; continue; }

      const rawDate = row['Date'];
      const dateStr = typeof rawDate === 'string' ? rawDate : (rawDate instanceof Date ? rawDate.toISOString().split('T')[0] : '');
      if (!dateStr) { skipped++; continue; }

      const date = new Date(`${dateStr}T00:00:00.000Z`);
      const clockIn = row['Clock In (UTC)'] ? new Date(row['Clock In (UTC)']) : null;
      const clockOut = row['Clock Out (UTC)'] ? new Date(row['Clock Out (UTC)']) : null;
      const status = validStatuses.has(String(row['Status'])) ? row['Status'] as AttendanceStatus : null;

      await prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId, date } },
        update: { clockIn, clockOut, status, workingMinutes: Number(row['Work Min']) || 0, overtimeMinutes: Number(row['OT Min']) || 0, isManual: row['Is Manual'] === 'Y' },
        create: { employeeId, date, clockIn, clockOut, status, workingMinutes: Number(row['Work Min']) || 0, overtimeMinutes: Number(row['OT Min']) || 0, isManual: row['Is Manual'] === 'Y' },
      });
      upserted++;
    }

    const message = `Restored ${upserted} record${upserted !== 1 ? 's' : ''}.${skipped > 0 ? ` ${skipped} skipped (employee not found or invalid date).` : ''}`;
    res.json({ success: true, data: { upserted, skipped, message } });
  } catch {
    res.status(500).json({ success: false, message: 'Restore failed. Ensure the file is a valid archive XLSX.' });
  }
}
