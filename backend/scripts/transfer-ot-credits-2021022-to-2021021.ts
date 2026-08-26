/**
 * One-shot transfer of OT credits:
 *   Danielle Terese Escuadra (2021022) 25.00h → Jasmine Mae Martin (2021021)
 *
 * - Retires Danielle's live approved unconverted credits
 * - Retires Jasmine's existing live credits (replace, not additive)
 * - Creates one new approved credit for Jasmine: 1500 min, expiry 2027-02-12
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/transfer-ot-credits-2021022-to-2021021.ts --dry-run
 *   npx ts-node --transpile-only scripts/transfer-ot-credits-2021022-to-2021021.ts
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const FROM_EMP = '2021022';
const TO_EMP = '2021021';
const TARGET_HOURS = 25;
const TARGET_MINUTES = TARGET_HOURS * 60; // 1500
const TARGET_EXPIRY = new Date(Date.UTC(2027, 1, 12)); // 2027-02-12
const TRANSFER_REASON = 'OT transfer 2026-08-26: 2021022 → 2021021';
const RETIRE_NOTE = 'Retired: OT transfer 2026-08-26 2021022 → 2021021';
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DRY_RUN = process.argv.includes('--dry-run');

type EmpRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  isActive: boolean;
  isArchived: boolean;
  department: { name: string } | null;
};

function fullName(e: EmpRow): string {
  return `${e.firstName}${e.middleName ? ` ${e.middleName}` : ''} ${e.lastName}`;
}

async function loadEmployee(employeeNumber: string): Promise<EmpRow> {
  const e = await prisma.employee.findUnique({
    where: { employeeNumber },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
      isArchived: true,
      department: { select: { name: true } },
    },
  });
  if (!e) throw new Error(`Employee not found: ${employeeNumber}`);
  return e;
}

async function liveCredits(employeeId: string, now: Date) {
  return prisma.overtimeRecord.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      isConverted: false,
      approvedExpiry: { gt: now },
    },
    select: {
      id: true,
      minutes: true,
      reason: true,
      approvedExpiry: true,
      reviewerNotes: true,
      date: true,
    },
    orderBy: { approvedExpiry: 'asc' },
  });
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`From: ${FROM_EMP} → To: ${TO_EMP}`);
  console.log(`Target: ${TARGET_HOURS}h = ${TARGET_MINUTES}min, expiry ${TARGET_EXPIRY.toISOString().slice(0, 10)}`);
  console.log(`Reason: ${TRANSFER_REASON}`);
  console.log('---');

  const now = new Date();
  const from = await loadEmployee(FROM_EMP);
  const to = await loadEmployee(TO_EMP);

  console.log(
    `Source: ${from.employeeNumber} | ${fullName(from)} | ${from.department?.name ?? '—'} | active=${from.isActive} archived=${from.isArchived}`,
  );
  console.log(
    `Target: ${to.employeeNumber} | ${fullName(to)} | ${to.department?.name ?? '—'} | active=${to.isActive} archived=${to.isArchived}`,
  );

  if (!from.isActive || from.isArchived) {
    throw new Error(`Source employee ${FROM_EMP} is ${from.isArchived ? 'archived' : 'inactive'}`);
  }
  if (!to.isActive || to.isArchived) {
    throw new Error(`Target employee ${TO_EMP} is ${to.isArchived ? 'archived' : 'inactive'}`);
  }

  const [fromLive, toLive, fromPending, toPending, existingTransfer] = await Promise.all([
    liveCredits(from.id, now),
    liveCredits(to.id, now),
    prisma.overtimeConversion.findMany({
      where: { employeeId: from.id, status: 'PENDING' },
      select: { id: true, overtimeId: true, minutesToConvert: true },
    }),
    prisma.overtimeConversion.findMany({
      where: { employeeId: to.id, status: 'PENDING' },
      select: { id: true, overtimeId: true, minutesToConvert: true },
    }),
    prisma.overtimeRecord.findFirst({
      where: { employeeId: to.id, reason: TRANSFER_REASON },
      select: { id: true, minutes: true, approvedExpiry: true },
    }),
  ]);

  const fromTotal = fromLive.reduce((s, r) => s + r.minutes, 0);
  const toTotal = toLive.reduce((s, r) => s + r.minutes, 0);

  console.log('\nBefore:');
  console.log(
    `  ${FROM_EMP} live: ${fromLive.length} record(s), ${(fromTotal / 60).toFixed(2)}h (${fromTotal} min)`,
  );
  for (const r of fromLive) {
    console.log(
      `    - ${r.id} | ${r.minutes}min | exp ${r.approvedExpiry?.toISOString().slice(0, 10) ?? '—'} | ${r.reason ?? ''}`,
    );
  }
  console.log(
    `  ${TO_EMP} live: ${toLive.length} record(s), ${(toTotal / 60).toFixed(2)}h (${toTotal} min)`,
  );
  for (const r of toLive) {
    console.log(
      `    - ${r.id} | ${r.minutes}min | exp ${r.approvedExpiry?.toISOString().slice(0, 10) ?? '—'} | ${r.reason ?? ''}`,
    );
  }

  if (fromPending.length > 0) {
    throw new Error(
      `Abort: source ${FROM_EMP} has ${fromPending.length} PENDING overtime conversion(s). Resolve first.`,
    );
  }
  if (toPending.length > 0) {
    throw new Error(
      `Abort: target ${TO_EMP} has ${toPending.length} PENDING overtime conversion(s). Resolve first.`,
    );
  }

  if (Math.abs(fromTotal - TARGET_MINUTES) > 1) {
    throw new Error(
      `Abort: source live total is ${fromTotal} min (${(fromTotal / 60).toFixed(2)}h), expected ${TARGET_MINUTES} min (${TARGET_HOURS}h).`,
    );
  }

  const retireExpiry = new Date(now);
  retireExpiry.setDate(retireExpiry.getDate() - 1);

  const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
  const runDate = new Date(Date.UTC(phtNow.getUTCFullYear(), phtNow.getUTCMonth(), phtNow.getUTCDate()));

  console.log('\nPlan:');
  console.log(`  Retire ${fromLive.length} record(s) for ${FROM_EMP}`);
  console.log(`  Retire ${toLive.length} record(s) for ${TO_EMP}`);
  if (existingTransfer) {
    console.log(`  Skip create — transfer record already exists for ${TO_EMP} (${existingTransfer.id})`);
  } else {
    console.log(
      `  Create ${TARGET_MINUTES}min for ${TO_EMP}, expiry ${TARGET_EXPIRY.toISOString().slice(0, 10)}, reason "${TRANSFER_REASON}"`,
    );
  }

  if (DRY_RUN) {
    console.log('\nDRY-RUN complete — no writes.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (fromLive.length > 0) {
      await tx.overtimeRecord.updateMany({
        where: { id: { in: fromLive.map((r) => r.id) } },
        data: { approvedExpiry: retireExpiry, reviewerNotes: RETIRE_NOTE },
      });
    }

    if (toLive.length > 0) {
      await tx.overtimeRecord.updateMany({
        where: { id: { in: toLive.map((r) => r.id) } },
        data: { approvedExpiry: retireExpiry, reviewerNotes: RETIRE_NOTE },
      });
    }

    if (!existingTransfer) {
      await tx.overtimeRecord.create({
        data: {
          employeeId: to.id,
          date: runDate,
          startTime: runDate,
          endTime: new Date(runDate.getTime() + TARGET_MINUTES * 60 * 1000),
          minutes: TARGET_MINUTES,
          isFiled: true,
          status: 'APPROVED',
          isConverted: false,
          reason: TRANSFER_REASON,
          pendingExpiry: now,
          approvedExpiry: TARGET_EXPIRY,
        },
      });
    }
  });

  const afterFrom = await liveCredits(from.id, new Date());
  const afterTo = await liveCredits(to.id, new Date());
  const afterFromTotal = afterFrom.reduce((s, r) => s + r.minutes, 0);
  const afterToTotal = afterTo.reduce((s, r) => s + r.minutes, 0);

  console.log('\nAfter:');
  console.log(
    `  ${FROM_EMP} live: ${afterFrom.length} record(s), ${(afterFromTotal / 60).toFixed(2)}h (${afterFromTotal} min)`,
  );
  console.log(
    `  ${TO_EMP} live: ${afterTo.length} record(s), ${(afterToTotal / 60).toFixed(2)}h (${afterToTotal} min)`,
  );
  for (const r of afterTo) {
    console.log(
      `    - ${r.id} | ${r.minutes}min | exp ${r.approvedExpiry?.toISOString().slice(0, 10) ?? '—'} | ${r.reason ?? ''}`,
    );
  }

  if (afterFromTotal !== 0) {
    throw new Error(`Post-check failed: ${FROM_EMP} still has ${afterFromTotal} live minutes`);
  }
  if (afterToTotal !== TARGET_MINUTES) {
    throw new Error(
      `Post-check failed: ${TO_EMP} has ${afterToTotal} live minutes, expected ${TARGET_MINUTES}`,
    );
  }

  console.log('\nTransfer complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
