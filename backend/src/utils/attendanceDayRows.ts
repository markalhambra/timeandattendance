import { ApprovalStatus, AttendanceStatus } from '@prisma/client';
import { prisma } from '../config/database';

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  SICK: 'Sick Leave',
  VACATION: 'Vacation Leave',
  PML: 'Pamilya Muna',
  SML: 'Sarili Muna',
  EMERGENCY: 'Emergency Leave',
  SOLO_PARENT: 'Solo Parent Leave',
  MATERNITY: 'Maternity Leave',
  PATERNITY: 'Paternity Leave',
  BEREAVEMENT: 'Bereavement Leave',
  MAGNA_CARTA_WOMEN: 'Special Leave for Women (RA 9170)',
  CALAMITY: 'Calamity Leave (CL)',
  VAWC: 'VAWC Leave',
  LWOP: 'Leave Without Pay',
};

const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  ON_SITE: 'On-Site',
  WFH: 'WFH',
  OB: 'Official Business',
  ABSENT: 'Absent',
};

export function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function eachUtcDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function isWeekday(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}

export function workingDaysBetween(start: Date, end: Date): string[] {
  return eachUtcDay(start, end).filter(isWeekday);
}

function leaveStatusLabel(leaveType: string, leaveDuration?: string | null): string {
  const label = LEAVE_TYPE_LABEL[leaveType] || leaveType;
  if (leaveDuration && leaveDuration !== 'FULL_DAY') return `${label} (Half Day)`;
  return label;
}

export async function loadApprovedLeaveByDay(
  employeeIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, Map<string, string>>> {
  const map = new Map<string, Map<string, string>>();
  if (!employeeIds.length) return map;

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: ApprovalStatus.APPROVED,
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: {
      employeeId: true,
      leaveType: true,
      leaveDuration: true,
      startDate: true,
      endDate: true,
    },
  });

  const rangeStart = isoDate(start);
  const rangeEnd = isoDate(end);
  for (const leave of leaves) {
    if (!map.has(leave.employeeId)) map.set(leave.employeeId, new Map());
    const byDay = map.get(leave.employeeId)!;
    for (const day of eachUtcDay(leave.startDate, leave.endDate)) {
      if (day < rangeStart || day > rangeEnd || !isWeekday(day)) continue;
      const label = leaveStatusLabel(leave.leaveType, leave.leaveDuration);
      const existing = byDay.get(day);
      byDay.set(day, existing ? `${existing} / ${label}` : label);
    }
  }
  return map;
}

/** Approved CTO/CDO conversions keyed by employee → scheduled date → status label. */
export async function loadApprovedCtoCdoByDay(
  employeeIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, Map<string, string>>> {
  const map = new Map<string, Map<string, string>>();
  if (!employeeIds.length) return map;

  const conversions = await prisma.overtimeConversion.findMany({
    where: {
      employeeId: { in: employeeIds },
      status: ApprovalStatus.APPROVED,
      scheduledDate: { gte: start, lte: end, not: null },
    },
    select: {
      employeeId: true,
      conversionType: true,
      scheduledDate: true,
    },
  });

  for (const conversion of conversions) {
    if (!conversion.scheduledDate) continue;
    const day = isoDate(conversion.scheduledDate);
    if (!isWeekday(day)) continue;

    if (!map.has(conversion.employeeId)) map.set(conversion.employeeId, new Map());
    const byDay = map.get(conversion.employeeId)!;
    const label = conversion.conversionType; // CTO | CDO
    const existing = byDay.get(day);
    if (!existing) {
      byDay.set(day, label);
    } else if (!existing.split(' / ').includes(label)) {
      byDay.set(day, `${existing} / ${label}`);
    }
  }
  return map;
}

export function offDayStatus(leaveLabel?: string, ctoCdoLabel?: string): string {
  if (leaveLabel && ctoCdoLabel) return `${leaveLabel} / ${ctoCdoLabel}`;
  return leaveLabel || ctoCdoLabel || 'Absent';
}

export type DailyAttendanceRow = {
  Date: string;
  Name: string;
  'Employee Number': string;
  Department: string;
  Status: string;
  'Clock In': string;
  'Clock Out': string;
  'Working Hours': string;
  'Overtime Hours': string;
};

function formatTime(d?: Date | null): string {
  return d ? d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
}

export async function buildDailyAttendanceRows(
  start: Date,
  end: Date,
  employeeId?: string,
  departmentId?: string,
  status?: string,
): Promise<DailyAttendanceRow[]> {
  const employees = await prisma.employee.findMany({
    where: employeeId
      ? { id: employeeId }
      : { isActive: true, isArchived: false, ...(departmentId ? { departmentId } : {}) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
      department: { select: { name: true } },
    },
  });

  const ids = employees.map((e) => e.id);
  const records = ids.length
    ? await prisma.attendanceRecord.findMany({
        where: {
          employeeId: { in: ids },
          date: { gte: start, lte: end },
          ...(status ? { status: status as AttendanceStatus } : {}),
        },
        select: {
          employeeId: true,
          date: true,
          status: true,
          clockIn: true,
          clockOut: true,
          workingMinutes: true,
          overtimeMinutes: true,
        },
      })
    : [];

  const presentByEmp = new Map<string, Set<string>>();
  for (const record of records) {
    const day = isoDate(record.date);
    if (!presentByEmp.has(record.employeeId)) presentByEmp.set(record.employeeId, new Set());
    presentByEmp.get(record.employeeId)!.add(day);
  }

  const leaveByEmp = status
    ? new Map<string, Map<string, string>>()
    : await loadApprovedLeaveByDay(ids, start, end);
  const ctoCdoByEmp = status
    ? new Map<string, Map<string, string>>()
    : await loadApprovedCtoCdoByDay(ids, start, end);
  const workingDays = workingDaysBetween(start, end);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const rows: DailyAttendanceRow[] = [];

  for (const record of records) {
    const emp = empById.get(record.employeeId);
    if (!emp) continue;
    rows.push({
      Date: isoDate(record.date),
      Name: `${emp.firstName} ${emp.lastName}`,
      'Employee Number': emp.employeeNumber,
      Department: emp.department?.name ?? '—',
      Status: ATTENDANCE_STATUS_LABEL[record.status || ''] || record.status || '—',
      'Clock In': formatTime(record.clockIn),
      'Clock Out': formatTime(record.clockOut),
      'Working Hours': record.workingMinutes ? (record.workingMinutes / 60).toFixed(2) : '0',
      'Overtime Hours': record.overtimeMinutes ? (record.overtimeMinutes / 60).toFixed(2) : '0',
    });
  }

  if (!status) {
    for (const emp of employees) {
      const present = presentByEmp.get(emp.id) ?? new Set<string>();
      const leaves = leaveByEmp.get(emp.id) ?? new Map<string, string>();
      const ctoCdo = ctoCdoByEmp.get(emp.id) ?? new Map<string, string>();
      for (const day of workingDays) {
        if (present.has(day)) continue;
        rows.push({
          Date: day,
          Name: `${emp.firstName} ${emp.lastName}`,
          'Employee Number': emp.employeeNumber,
          Department: emp.department?.name ?? '—',
          Status: offDayStatus(leaves.get(day), ctoCdo.get(day)),
          'Clock In': '',
          'Clock Out': '',
          'Working Hours': '',
          'Overtime Hours': '',
        });
      }
    }
  }

  rows.sort((a, b) => a.Date.localeCompare(b.Date) || a.Name.localeCompare(b.Name) || a['Employee Number'].localeCompare(b['Employee Number']));
  return rows;
}

function chartBucket(status: string): 'onsite' | 'wfh' | 'ob' | 'leave' | 'cto' | 'cdo' | 'absent' {
  if (status === 'On-Site') return 'onsite';
  if (status === 'WFH') return 'wfh';
  if (status === 'Official Business') return 'ob';
  if (status === 'Absent') return 'absent';
  // Pure or combined CTO/CDO labels (clock-in still wins and never reaches here)
  const parts = status.split(' / ').map((p) => p.trim());
  const onlyCtoCdo = parts.every((p) => p === 'CTO' || p === 'CDO');
  if (onlyCtoCdo) {
    if (parts.includes('CDO') && !parts.includes('CTO')) return 'cdo';
    if (parts.includes('CTO') && !parts.includes('CDO')) return 'cto';
    return 'cto'; // mixed CTO+CDO same day — chart under CTO
  }
  return 'leave';
}

export function chartFromDailyRows(rows: DailyAttendanceRow[]) {
  const byDate = new Map<string, { onsite: number; wfh: number; ob: number; leave: number; cto: number; cdo: number; absent: number }>();
  for (const row of rows) {
    if (!byDate.has(row.Date)) byDate.set(row.Date, { onsite: 0, wfh: 0, ob: 0, leave: 0, cto: 0, cdo: 0, absent: 0 });
    const entry = byDate.get(row.Date)!;
    entry[chartBucket(row.Status)]++;
  }
  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
