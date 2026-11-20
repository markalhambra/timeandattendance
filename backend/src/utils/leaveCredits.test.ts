import assert from 'assert';
import {
  EMERGENCY_LEAVE_CAP,
  SICK_LEAVE_DEFAULT,
  emergencyAvailable,
  evaluateEmergencyFiling,
  presentLeaveBalances,
  remainingDays,
  sumEmergencyUsage,
} from './leaveCredits';

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`fail ${name}`);
    throw error;
  }
}

check('new sick default is 12 and emergency cap is 3', () => {
  assert.strictEqual(SICK_LEAVE_DEFAULT, 12);
  assert.strictEqual(EMERGENCY_LEAVE_CAP, 3);
});

check('rejects emergency above the yearly cap while sick pool remains', () => {
  const result = evaluateEmergencyFiling({
    requestedDays: 4,
    poolRemaining: 12,
    usage: { usedDays: 0, pendingDays: 0 },
  });
  assert.strictEqual(result.ok, false);
});

check('rejects a fourth emergency day after 2.5 already used', () => {
  const result = evaluateEmergencyFiling({
    requestedDays: 1,
    poolRemaining: 9,
    usage: { usedDays: 2.5, pendingDays: 0 },
  });
  assert.strictEqual(result.ok, false);
});

check('allows a half-day that finishes the 3-day cap', () => {
  const result = evaluateEmergencyFiling({
    requestedDays: 0.5,
    poolRemaining: 9.5,
    usage: { usedDays: 2, pendingDays: 0.5 },
  });
  assert.strictEqual(result.ok, true);
});

check('rejects emergency when the sick pool is exhausted', () => {
  const result = evaluateEmergencyFiling({
    requestedDays: 1,
    poolRemaining: 0,
    usage: { usedDays: 0, pendingDays: 0 },
  });
  assert.strictEqual(result.ok, false);
  if (!result.ok) assert.match(result.message, /Sick Leave balance/);
});

check('does not reserve the cap from sick leave', () => {
  assert.strictEqual(remainingDays({ totalDays: 12, usedDays: 0, pendingDays: 0 }), 12);
  assert.strictEqual(emergencyAvailable(12, { usedDays: 0, pendingDays: 0 }), 3);
  assert.strictEqual(emergencyAvailable(1, { usedDays: 0, pendingDays: 0 }), 1);
  assert.strictEqual(emergencyAvailable(9, { usedDays: 3, pendingDays: 0 }), 0);
});

check('counts only this year pending and approved emergency requests', () => {
  const usage = sumEmergencyUsage([
    { totalDays: 1, status: 'APPROVED', startDate: new Date(2026, 0, 2) },
    { totalDays: 0.5, status: 'PENDING', startDate: new Date(2026, 5, 1) },
    { totalDays: 2, status: 'REJECTED', startDate: new Date(2026, 2, 1) },
    { totalDays: 3, status: 'APPROVED', startDate: new Date(2025, 11, 1) },
  ], 2026);
  assert.deepStrictEqual(usage, { usedDays: 1, pendingDays: 0.5 });
});

check('does not copy sick usage onto the emergency display row', () => {
  const [emergency] = presentLeaveBalances([
    { leaveType: 'SICK', totalDays: 12, usedDays: 5, pendingDays: 1 },
    { leaveType: 'EMERGENCY', totalDays: 15, usedDays: 0, pendingDays: 0 },
  ], { usedDays: 2, pendingDays: 0.5 });
  assert.strictEqual(emergency.leaveType, 'SICK');
  const shown = presentLeaveBalances([
    { leaveType: 'EMERGENCY', totalDays: 15, usedDays: 9, pendingDays: 1 },
  ], { usedDays: 2, pendingDays: 0.5 })[0];
  assert.strictEqual(shown.totalDays, 3);
  assert.strictEqual(shown.usedDays, 2);
  assert.strictEqual(shown.pendingDays, 0.5);
});

console.log('leave credit checks passed');
