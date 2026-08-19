/**
 * Force-apply leave credits for emp numbers that matched but names mismatched.
 * One-shot; safe to delete after use.
 */
import path from 'path';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import { LeaveType, PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const TARGET_EMP_NOS = ['2025081', '2025092'];
const TYPES: LeaveType[] = ['VACATION', 'SICK', 'SML', 'PML'];
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

async function main() {
  const year = new Date(Date.now() + PHT_OFFSET_MS).getUTCFullYear();
  const filePath = path.resolve(__dirname, 'data/leave-credits.xlsx');
  const wb = XLSX.readFile(filePath);
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  });

  const byEmp = new Map<string, { name: string; balances: Record<string, number> }>();
  for (const row of matrix) {
    const empRaw = row[0];
    if (empRaw === '' || empRaw === null || empRaw === undefined) continue;
    const empNo = String(empRaw).trim();
    if (/leave|summary|employee|name/i.test(empNo)) continue;
    byEmp.set(empNo, {
      name: String(row[1] ?? '').trim(),
      balances: {
        VACATION: Number(row[2]),
        SICK: Number(row[3]),
        SML: Number(row[4]),
        PML: Number(row[5]),
      },
    });
  }

  for (const empNo of TARGET_EMP_NOS) {
    const sheet = byEmp.get(empNo);
    if (!sheet) {
      console.error(`Sheet row missing for ${empNo}`);
      continue;
    }
    for (const [lt, v] of Object.entries(sheet.balances)) {
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`Invalid ${lt} for ${empNo}: ${v}`);
      }
    }

    const emp = await prisma.employee.findUnique({
      where: { employeeNumber: empNo },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        employeeNumber: true,
      },
    });
    if (!emp) {
      console.error(`Employee not found: ${empNo}`);
      continue;
    }

    console.log(
      `Force apply ${empNo} | sheet "${sheet.name}" | DB "${emp.lastName}, ${emp.firstName}${emp.middleName ? ' ' + emp.middleName : ''}"`,
    );

    for (const leaveType of TYPES) {
      const available = sheet.balances[leaveType];
      const existing = await prisma.leaveBalance.findUnique({
        where: {
          employeeId_year_leaveType: { employeeId: emp.id, year, leaveType },
        },
      });
      const usedDays = existing?.usedDays ?? 0;
      const pendingDays = existing?.pendingDays ?? 0;
      const totalDays = available + usedDays + pendingDays;

      if (existing) {
        await prisma.leaveBalance.update({
          where: { id: existing.id },
          data: { totalDays },
        });
        console.log(`  updated ${leaveType}`, { available, usedDays, pendingDays, totalDays });
      } else {
        await prisma.leaveBalance.create({
          data: {
            employeeId: emp.id,
            year,
            leaveType,
            totalDays,
            usedDays: 0,
            pendingDays: 0,
          },
        });
        console.log(`  created ${leaveType}`, { available, totalDays });
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
