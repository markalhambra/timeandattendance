/**
 * One-shot backfill after CALAMITY/VAWC enum migration:
 * - Ensure CALAMITY (3) and VAWC (10) leave_balances for all active employees (current year)
 * - Raise SML totalDays to at least 7 for current year
 *
 * Usage: npx ts-node --transpile-only scripts/backfill-calamity-vawc-sml.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const year = new Date().getFullYear();
  const employees = await prisma.employee.findMany({
    where: { isActive: true, isArchived: false },
    select: { id: true },
  });

  console.log(`Backfilling ${employees.length} employees for year ${year}...`);

  const balanceRows = employees.flatMap((e) => [
    { employeeId: e.id, year, leaveType: 'CALAMITY' as const, totalDays: 3 },
    { employeeId: e.id, year, leaveType: 'VAWC' as const, totalDays: 10 },
  ]);

  const created = await prisma.leaveBalance.createMany({
    data: balanceRows,
    skipDuplicates: true,
  });
  console.log(`Created ${created.count} CALAMITY/VAWC balance rows (skipDuplicates).`);

  const smlUpdated = await prisma.$executeRaw`
    UPDATE leave_balances
    SET "totalDays" = GREATEST("totalDays", 7)
    WHERE "leaveType" = 'SML' AND year = ${year}
  `;
  console.log(`Updated SML rows (GREATEST totalDays, 7): ${smlUpdated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
