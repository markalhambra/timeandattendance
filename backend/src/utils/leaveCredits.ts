import { LeaveType } from '@prisma/client';

/** Annual sick-leave pool for a newly created balance row. */
export const SICK_LEAVE_DEFAULT = 12;

/** Emergency leave may use at most this many days of the sick pool per year. Not reserved. */
export const EMERGENCY_LEAVE_CAP = 3;

const BALANCE_EPSILON = 0.001;

export const LEAVE_BALANCE_DEFAULTS: Record<LeaveType, number> = {
  SICK: SICK_LEAVE_DEFAULT,
  VACATION: 15,
  PML: 7,
  SML: 7,
  EMERGENCY: EMERGENCY_LEAVE_CAP,
  SOLO_PARENT: 7,
  MATERNITY: 105,
  PATERNITY: 7,
  BEREAVEMENT: 5,
  MAGNA_CARTA_WOMEN: 60,
  CALAMITY: 3,
  VAWC: 10,
  LWOP: 0,
};

export const TRACKED_LEAVE_TYPES = Object.keys(LEAVE_BALANCE_DEFAULTS) as LeaveType[];

export function poolLeaveType(leaveType: LeaveType): LeaveType {
  return leaveType === 'EMERGENCY' ? 'SICK' : leaveType;
}

export function remainingDays(balance: { totalDays: number; usedDays: number; pendingDays: number }): number {
  return balance.totalDays - balance.usedDays - balance.pendingDays;
}

export function requestedExceeds(requestedDays: number, availableDays: number): boolean {
  return requestedDays > availableDays + BALANCE_EPSILON;
}

export interface EmergencyUsage {
  usedDays: number;
  pendingDays: number;
}

export function sumEmergencyUsage(
  requests: { totalDays: number; status: string; startDate: Date }[],
  year: number,
): EmergencyUsage {
  let usedDays = 0;
  let pendingDays = 0;
  for (const request of requests) {
    if (request.startDate.getFullYear() !== year) continue;
    if (request.status === 'APPROVED') usedDays += request.totalDays;
    else if (request.status === 'PENDING') pendingDays += request.totalDays;
  }
  return { usedDays, pendingDays };
}

export function emergencyCapRemaining(usage: EmergencyUsage, cap = EMERGENCY_LEAVE_CAP): number {
  return cap - usage.usedDays - usage.pendingDays;
}

/**
 * Emergency days come out of the sick pool and cannot exceed the yearly cap.
 * Unused cap days stay available as sick leave.
 */
export function evaluateEmergencyFiling(input: {
  requestedDays: number;
  poolRemaining: number;
  usage: EmergencyUsage;
  cap?: number;
}): { ok: true } | { ok: false; message: string } {
  const cap = input.cap ?? EMERGENCY_LEAVE_CAP;
  if (requestedExceeds(input.requestedDays, emergencyCapRemaining(input.usage, cap))) {
    return {
      ok: false,
      message: `Emergency Leave is limited to ${cap} days per year. Those days are taken from Sick Leave.`,
    };
  }
  if (requestedExceeds(input.requestedDays, input.poolRemaining)) {
    return {
      ok: false,
      message: 'Insufficient Sick Leave balance. Emergency Leave is taken from Sick Leave credits.',
    };
  }
  return { ok: true };
}

export function emergencyAvailable(poolRemaining: number, usage: EmergencyUsage, cap = EMERGENCY_LEAVE_CAP): number {
  return Math.min(Math.max(0, emergencyCapRemaining(usage, cap)), Math.max(0, poolRemaining));
}

type BalanceRow = {
  leaveType: LeaveType | string;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
};

/** Show the sick pool as stored, and emergency as its own cap and usage. */
export function presentLeaveBalances<T extends BalanceRow>(balances: T[], usage: EmergencyUsage): T[] {
  return balances.map((balance) =>
    balance.leaveType === 'EMERGENCY'
      ? { ...balance, totalDays: EMERGENCY_LEAVE_CAP, usedDays: usage.usedDays, pendingDays: usage.pendingDays }
      : balance,
  );
}
