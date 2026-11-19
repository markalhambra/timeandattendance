import { ApprovalStatus, LeaveType } from '@prisma/client';
import { prisma } from '../config/database';
import { settingsService } from './settings.service';

/** Company holidays that are not a regular workday. SPECIAL_WORKING is excluded. */
export const NON_WORKING_HOLIDAY_TYPES = ['REGULAR', 'SPECIAL_NON_WORKING'] as const;

const MIN_FILEABLE_OT_MINUTES = 60;
/** Inclusive cap so a typo cannot mark months as a holiday. Covers a Christmas break. */
export const MAX_HOLIDAY_RANGE_DAYS = 45;

export type HolidayEffectResult = {
  attendanceUpdated: number;
  overtimeCreated: number;
  overtimeUpdated: number;
  overtimeRemoved: number;
  overtimeSkipped: number;
  leaveAdjusted: number;
  warnings: string[];
};

export function emptyHolidayEffect(): HolidayEffectResult {
  return {
    attendanceUpdated: 0,
    overtimeCreated: 0,
    overtimeUpdated: 0,
    overtimeRemoved: 0,
    overtimeSkipped: 0,
    leaveAdjusted: 0,
    warnings: [],
  };
}

export function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as midnight UTC, matching other date-only columns. */
export function parseDateOnly(input: string): Date | null {
  const match = String(input).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function eachUtcDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function inclusiveDayCount(start: Date, end: Date): number {
  return eachUtcDay(start, end).length;
}

/** Midnight-UTC dates from start through end, inclusive. */
export function datesInRange(start: Date, end: Date): Date[] {
  return eachUtcDay(start, end).map((iso) => parseDateOnly(iso)!);
}

function poolLeaveType(leaveType: LeaveType): LeaveType {
  return leaveType === 'EMERGENCY' ? 'SICK' : leaveType;
}

export function isNonWorkingHolidayType(type: string): boolean {
  return (NON_WORKING_HOLIDAY_TYPES as readonly string[]).includes(type);
}

export async function getNonWorkingHoliday(date: Date) {
  return prisma.holiday.findFirst({
    where: {
      date: { lte: date },
      endDate: { gte: date },
      type: { in: [...NON_WORKING_HOLIDAY_TYPES] },
    },
    orderBy: { name: 'asc' },
  });
}

export async function isNonWorkingHoliday(date: Date): Promise<boolean> {
  const row = await getNonWorkingHoliday(date);
  return !!row;
}

/** Non-working holidays in range, keyed by YYYY-MM-DD. First name wins if dates collide. */
export async function nonWorkingHolidayNamesBetween(start: Date, end: Date): Promise<Map<string, string>> {
  const rows = await prisma.holiday.findMany({
    where: {
      date: { lte: end },
      endDate: { gte: start },
      type: { in: [...NON_WORKING_HOLIDAY_TYPES] },
    },
    orderBy: { name: 'asc' },
  });
  const map = new Map<string, string>();
  const windowStart = isoDateOnly(start);
  const windowEnd = isoDateOnly(end);
  for (const row of rows) {
    for (const day of eachUtcDay(row.date, row.endDate)) {
      if (day < windowStart || day > windowEnd || map.has(day)) continue;
      map.set(day, row.name);
    }
  }
  return map;
}

/**
 * Overtime minutes for a completed shift.
 * Weekends and non-working holidays count the full worked time.
 */
export async function overtimeMinutesForWorkedDay(date: Date, workingMinutes: number): Promise<number> {
  const minutes = Math.max(0, workingMinutes);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  if (weekend || await isNonWorkingHoliday(date)) return minutes;
  const threshold = await settingsService.getOtThresholdMinutes();
  return Math.max(0, minutes - threshold);
}

/**
 * Inclusive calendar days, minus non-working holidays.
 * Weekends stay included so this matches the existing leave charge formula.
 */
export function leaveDaysAfterHolidays(start: Date, end: Date, isHalfDay: boolean, holidayIsos: Set<string>): number {
  if (isHalfDay) return holidayIsos.has(isoDateOnly(start)) ? 0 : 0.5;
  return eachUtcDay(start, end).filter((day) => !holidayIsos.has(day)).length;
}

export async function countLeaveDays(start: Date, end: Date, isHalfDay: boolean): Promise<number> {
  const holidays = await nonWorkingHolidayNamesBetween(start, end);
  return leaveDaysAfterHolidays(start, end, isHalfDay, new Set(holidays.keys()));
}

function mergeEffects(into: HolidayEffectResult, extra: HolidayEffectResult): void {
  into.attendanceUpdated += extra.attendanceUpdated;
  into.overtimeCreated += extra.overtimeCreated;
  into.overtimeUpdated += extra.overtimeUpdated;
  into.overtimeRemoved += extra.overtimeRemoved;
  into.overtimeSkipped += extra.overtimeSkipped;
  into.leaveAdjusted += extra.leaveAdjusted;
  into.warnings.push(...extra.warnings);
}

function workedMinutes(record: { workingMinutes: number; clockIn: Date | null; clockOut: Date | null }): number {
  if (record.workingMinutes > 0) return record.workingMinutes;
  if (!record.clockIn || !record.clockOut) return 0;
  return Math.max(0, Math.floor((record.clockOut.getTime() - record.clockIn.getTime()) / 60000));
}

async function recalculateAttendanceForDate(date: Date): Promise<HolidayEffectResult> {
  const result = emptyHolidayEffect();
  const records = await prisma.attendanceRecord.findMany({
    where: { date, clockIn: { not: null }, clockOut: { not: null } },
    include: {
      overtimeRecords: true,
      employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
    },
  });

  for (const record of records) {
    const workingMinutes = workedMinutes(record);
    const expectedOt = await overtimeMinutesForWorkedDay(date, workingMinutes);
    if (record.overtimeMinutes !== expectedOt) {
      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { overtimeMinutes: expectedOt },
      });
      result.attendanceUpdated += 1;
    }

    const label = `${record.employee.firstName} ${record.employee.lastName} (${record.employee.employeeNumber})`;
    const protectedOt = record.overtimeRecords.some(
      (ot) => ot.isFiled || ot.isConverted || ot.status === ApprovalStatus.APPROVED || ot.status === ApprovalStatus.REJECTED,
    );
    if (protectedOt) {
      result.overtimeSkipped += 1;
      result.warnings.push(`${label}: overtime credit was already filed, approved, rejected, or converted and was not changed.`);
      continue;
    }

    const pending = record.overtimeRecords.filter(
      (ot) => ot.status === ApprovalStatus.PENDING && !ot.isFiled && !ot.isConverted,
    );

    if (expectedOt >= MIN_FILEABLE_OT_MINUTES && record.clockIn && record.clockOut) {
      if (pending.length) {
        const [keep, ...extras] = pending;
        if (
          keep.minutes !== expectedOt
          || keep.startTime.getTime() !== record.clockIn.getTime()
          || keep.endTime.getTime() !== record.clockOut.getTime()
        ) {
          await prisma.overtimeRecord.update({
            where: { id: keep.id },
            data: {
              minutes: expectedOt,
              startTime: record.clockIn,
              endTime: record.clockOut,
            },
          });
          result.overtimeUpdated += 1;
        }
        if (extras.length) {
          await prisma.overtimeRecord.deleteMany({ where: { id: { in: extras.map((ot) => ot.id) } } });
          result.overtimeRemoved += extras.length;
        }
      } else {
        const pendingExpiry = new Date();
        pendingExpiry.setMonth(pendingExpiry.getMonth() + 1);
        await prisma.overtimeRecord.create({
          data: {
            employeeId: record.employeeId,
            attendanceId: record.id,
            date: record.date,
            startTime: record.clockIn,
            endTime: record.clockOut,
            minutes: expectedOt,
            reason: 'Auto-generated from holiday attendance',
            pendingExpiry,
          },
        });
        result.overtimeCreated += 1;
      }
    } else if (pending.length) {
      await prisma.overtimeRecord.deleteMany({ where: { id: { in: pending.map((ot) => ot.id) } } });
      result.overtimeRemoved += pending.length;
    }
  }

  return result;
}

async function reconcileLeaveForDate(date: Date): Promise<HolidayEffectResult> {
  const result = emptyHolidayEffect();
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: { in: [ApprovalStatus.PENDING, ApprovalStatus.APPROVED] },
      startDate: { lte: date },
      endDate: { gte: date },
    },
    include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
  });

  for (const leave of leaves) {
    const holidays = await nonWorkingHolidayNamesBetween(leave.startDate, leave.endDate);
    const expected = leaveDaysAfterHolidays(
      leave.startDate,
      leave.endDate,
      leave.leaveDuration !== 'FULL_DAY',
      new Set(holidays.keys()),
    );
    const delta = leave.totalDays - expected;
    if (Math.abs(delta) < 0.001) continue;

    const label = `${leave.employee.firstName} ${leave.employee.lastName} (${leave.employee.employeeNumber})`;
    if (leave.leaveType !== 'LWOP') {
      const year = leave.startDate.getUTCFullYear();
      const poolType = poolLeaveType(leave.leaveType);
      const balance = await prisma.leaveBalance.findUnique({
        where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: poolType } },
      });
      if (!balance) {
        result.warnings.push(`${label}: leave dates were updated, but no ${year} ${poolType} balance row was found.`);
      } else {
        const field = leave.status === ApprovalStatus.APPROVED ? 'usedDays' : 'pendingDays';
        const next = balance[field] - delta;
        if (next < -0.001) {
          result.warnings.push(`${label}: ${field} could not be reduced by ${delta} day(s) and was set to 0.`);
        }
        await prisma.leaveBalance.update({
          where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: poolType } },
          data: { [field]: Math.max(0, next) },
        });
      }
    }

    await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { totalDays: expected },
    });
    result.leaveAdjusted += 1;
  }

  return result;
}

/** Recalculate attendance overtime and overlapping leave charges for the given dates. */
export async function syncHolidayEffects(dates: Date[]): Promise<HolidayEffectResult> {
  const result = emptyHolidayEffect();
  const seen = new Set<string>();
  for (const date of dates) {
    const key = isoDateOnly(date);
    if (seen.has(key)) continue;
    seen.add(key);
    mergeEffects(result, await recalculateAttendanceForDate(date));
    mergeEffects(result, await reconcileLeaveForDate(date));
  }
  return result;
}

export function serializeHoliday<T extends { date: Date; endDate: Date }>(holiday: T) {
  return { ...holiday, date: isoDateOnly(holiday.date), endDate: isoDateOnly(holiday.endDate) };
}
