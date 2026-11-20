export const EMERGENCY_LEAVE_CAP = 3;

type CreditRow = {
  leaveType?: string;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
};

export function poolRemaining(balance: CreditRow | undefined): number {
  if (!balance) return 0;
  return balance.totalDays - balance.usedDays - balance.pendingDays;
}

/**
 * Available days shown for a leave type.
 * Emergency shows only remaining cap out of 3. It is not reduced by the sick pool;
 * filing still rejects emergency leave when sick credits are insufficient.
 */
export function displayedLeaveCredit(
  leaveType: string,
  balance: CreditRow | undefined,
  _sickBalance?: CreditRow,
): { available: number; total: number; used: number; pending: number } {
  if (leaveType === 'EMERGENCY') {
    const used = balance?.usedDays ?? 0;
    const pending = balance?.pendingDays ?? 0;
    const available = Math.max(0, EMERGENCY_LEAVE_CAP - used - pending);
    return { available, total: EMERGENCY_LEAVE_CAP, used, pending };
  }
  return {
    available: poolRemaining(balance),
    total: balance?.totalDays ?? 0,
    used: balance?.usedDays ?? 0,
    pending: balance?.pendingDays ?? 0,
  };
}
