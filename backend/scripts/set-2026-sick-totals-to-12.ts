/**
 * Set every 2026 sick-leave maximum to 12.
 * Used and pending days are kept. 2027 rows are not touched.
 * Rows already at 12 are skipped, so the script is safe to run again.
 *
 *   npx ts-node --transpile-only scripts/set-2026-sick-totals-to-12.ts --dry-run
 *   npx ts-node --transpile-only scripts/set-2026-sick-totals-to-12.ts
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const YEAR = 2026;
const NEW_TOTAL = 12;
const REASON = 'Set 2026 Sick Leave maximum to 12 days. Used and pending days were not changed.';
const DRY_RUN = process.argv.includes('--dry-run');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.leaveBalance.findMany({
    where: { year: YEAR, leaveType: 'SICK', NOT: { totalDays: NEW_TOTAL } },
    select: { id: true, employeeId: true, totalDays: true, usedDays: true, pendingDays: true },
  });

  let daysRemoved = 0;
  let daysAdded = 0;
  for (const row of rows) {
    const delta = NEW_TOTAL - row.totalDays;
    if (delta < 0) daysRemoved += -delta;
    else daysAdded += delta;
  }
  console.log(`${DRY_RUN ? 'Would update' : 'Updating'} ${rows.length} ${YEAR} sick totals to ${NEW_TOTAL}. Days removed from totals: ${daysRemoved}. Days added to totals: ${daysAdded}.`);

  for (const row of rows) {
    const previousBalance = row.totalDays - row.usedDays - row.pendingDays;
    const newBalance = NEW_TOTAL - row.usedDays - row.pendingDays;
    const adjustmentAmount = NEW_TOTAL - row.totalDays;
    if (DRY_RUN) continue;

    const employee = await prisma.employee.findUnique({ where: { id: row.employeeId }, select: { id: true } });
    if (!employee) {
      await prisma.leaveBalance.update({ where: { id: row.id }, data: { totalDays: NEW_TOTAL } });
      console.log('Skipped adjustment history for 1 sick row whose employee record no longer exists.');
      continue;
    }

    await prisma.$transaction([
      prisma.leaveBalance.update({
        where: { id: row.id },
        data: { totalDays: NEW_TOTAL },
      }),
      prisma.leaveAdjustment.create({
        data: {
          employeeId: row.employeeId,
          leaveType: 'SICK',
          year: YEAR,
          adjustmentAmount,
          previousBalance,
          newBalance,
          reason: REASON,
          adjustedBy: null,
          isSystemGenerated: true,
        },
      }),
    ]);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
