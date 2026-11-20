import { LeaveType } from '@prisma/client';
import { prisma } from '../config/database';
import {
  EMERGENCY_LEAVE_CAP,
  EmergencyUsage,
  LEAVE_BALANCE_DEFAULTS,
  TRACKED_LEAVE_TYPES,
  presentLeaveBalances,
  remainingDays,
  sumEmergencyUsage,
} from '../utils/leaveCredits';

export async function ensureLeaveBalances(employeeId: string, year: number): Promise<void> {
  const existing = await prisma.leaveBalance.count({ where: { employeeId, year } });
  if (existing >= TRACKED_LEAVE_TYPES.length) return;

  const prevBalances = await prisma.leaveBalance.findMany({ where: { employeeId, year: year - 1 } });
  const prevMap = new Map(prevBalances.map((balance) => [balance.leaveType, balance]));

  await prisma.leaveBalance.createMany({
    data: TRACKED_LEAVE_TYPES.map((leaveType) => {
      const prev = prevMap.get(leaveType);
      // Emergency is a yearly cap inside the sick pool, not a balance to carry forward.
      const totalDays = leaveType === 'EMERGENCY'
        ? EMERGENCY_LEAVE_CAP
        : prev
          ? Math.max(0, remainingDays(prev))
          : LEAVE_BALANCE_DEFAULTS[leaveType];
      return { employeeId, year, leaveType, totalDays };
    }),
    skipDuplicates: true,
  });
}

export function initialLeaveBalanceRows(employeeId: string, year: number) {
  return TRACKED_LEAVE_TYPES
    .filter((leaveType) => leaveType !== 'LWOP')
    .map((leaveType) => ({
      employeeId,
      year,
      leaveType,
      totalDays: LEAVE_BALANCE_DEFAULTS[leaveType],
    }));
}

export async function emergencyUsageForYear(employeeId: string, year: number): Promise<EmergencyUsage> {
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      leaveType: 'EMERGENCY',
      status: { in: ['PENDING', 'APPROVED'] },
    },
    select: { totalDays: true, status: true, startDate: true },
  });
  return sumEmergencyUsage(requests, year);
}

export async function presentEmployeeLeaveBalances<T extends { leaveType: LeaveType | string; totalDays: number; usedDays: number; pendingDays: number }>(
  employeeId: string,
  year: number,
  balances: T[],
): Promise<T[]> {
  const usage = await emergencyUsageForYear(employeeId, year);
  return presentLeaveBalances(balances, usage);
}
