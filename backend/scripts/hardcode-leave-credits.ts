/**
 * One-shot hardcode of leave balances from HR spreadsheet.
 *
 * Updates only: VACATION, SICK, SML (Sarili Muna), PML (Pamilya Muna)
 * Match: employeeNumber + name (must both match)
 * Year: current PHT year
 * Semantics: set available balance to spreadsheet value
 *   totalDays = sheetValue + usedDays + pendingDays
 * No LeaveAdjustment rows.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/hardcode-leave-credits.ts --dry-run
 *   npx ts-node --transpile-only scripts/hardcode-leave-credits.ts
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import { LeaveType, PrismaClient } from '@prisma/client';

// Load repo-root .env then backend/.env (later wins only if already unset — dotenv default)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const TARGET_TYPES: LeaveType[] = ['VACATION', 'SICK', 'SML', 'PML'];
const COL = {
  empNo: 0,
  name: 1,
  vacation: 2,
  sick: 3,
  sml: 4,
  pml: 5,
} as const;

const DRY_RUN = process.argv.includes('--dry-run');
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

function phtYear(): number {
  return new Date(Date.now() + PHT_OFFSET_MS).getUTCFullYear();
}

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build comparable tokens from DB name parts. */
function dbNameVariants(firstName: string, lastName: string, middleName?: string | null): string[] {
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  const middle = middleName ? normalizeName(middleName) : '';
  const middleInitial = middle ? middle.charAt(0) : '';

  const variants = new Set<string>();
  // last first
  variants.add(`${last} ${first}`);
  // first last
  variants.add(`${first} ${last}`);
  if (middle) {
    variants.add(`${last} ${first} ${middle}`);
    variants.add(`${last} ${first} ${middleInitial}`);
    variants.add(`${first} ${middle} ${last}`);
    variants.add(`${first} ${middleInitial} ${last}`);
  }
  return [...variants];
}

function namesMatch(
  sheetName: string,
  firstName: string,
  lastName: string,
  middleName?: string | null,
): boolean {
  const sheet = normalizeName(sheetName);
  if (!sheet) return false;

  const variants = dbNameVariants(firstName, lastName, middleName);
  if (variants.includes(sheet)) return true;

  // Loose: all significant tokens from sheet appear in "last first middle" blob
  const blob = normalizeName([lastName, firstName, middleName || ''].filter(Boolean).join(' '));
  const sheetTokens = sheet.split(' ').filter((t) => t.length > 1 || /^[a-z]$/.test(t));
  const blobTokens = new Set(blob.split(' ').filter(Boolean));

  // Every sheet token must match a blob token (exact or single-letter initial)
  const allPresent = sheetTokens.every((tok) => {
    if (blobTokens.has(tok)) return true;
    if (tok.length === 1) {
      return [...blobTokens].some((b) => b.startsWith(tok));
    }
    // allow first token of multi-part first names etc.
    return [...blobTokens].some((b) => b === tok || b.startsWith(tok) || tok.startsWith(b));
  });

  // Also require last name present in sheet
  const last = normalizeName(lastName);
  const lastOk = sheetTokens.includes(last) || sheet.startsWith(last + ' ') || sheet.endsWith(' ' + last);
  return allPresent && lastOk;
}

function parseNumber(value: unknown, label: string): { ok: true; value: number } | { ok: false; error: string } {
  if (value === '' || value === null || value === undefined) {
    return { ok: false, error: `Missing ${label}` };
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `Invalid ${label}: ${JSON.stringify(value)}` };
  }
  return { ok: true, value: n };
}

type SheetRow = {
  rowNum: number;
  employeeNumber: string;
  name: string;
  balances: Record<'VACATION' | 'SICK' | 'SML' | 'PML', number>;
  parseError?: string;
};

type ErrorRow = { rowNum: number; employeeNumber: string; name: string; reason: string };

function loadSheet(filePath: string): SheetRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Spreadsheet not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Skip header row(s) — first data row has numeric emp no
  const rows: SheetRow[] = [];
  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const empRaw = cells[COL.empNo];
    const nameRaw = cells[COL.name];

    // Header or empty
    if (empRaw === '' || empRaw === null || empRaw === undefined) continue;
    if (typeof empRaw === 'string' && /leave|summary|employee|name/i.test(empRaw)) continue;

    const employeeNumber = String(empRaw).trim();
    const name = String(nameRaw ?? '').trim();
    if (!employeeNumber && !name) continue;

    const vl = parseNumber(cells[COL.vacation], 'Vacation Leave');
    const sl = parseNumber(cells[COL.sick], 'Sick Leave');
    const sml = parseNumber(cells[COL.sml], 'Sarili Muna Leave');
    const pml = parseNumber(cells[COL.pml], 'Pamilya Muna Leave');

    const parseParts = [
      !vl.ok ? vl.error : null,
      !sl.ok ? sl.error : null,
      !sml.ok ? sml.error : null,
      !pml.ok ? pml.error : null,
    ].filter(Boolean) as string[];

    rows.push({
      rowNum: i + 1,
      employeeNumber,
      name,
      balances: {
        VACATION: vl.ok ? vl.value : Number.NaN,
        SICK: sl.ok ? sl.value : Number.NaN,
        SML: sml.ok ? sml.value : Number.NaN,
        PML: pml.ok ? pml.value : Number.NaN,
      },
      parseError: parseParts.length ? parseParts.join('; ') : undefined,
    });
  }
  return rows;
}

async function main() {
  const filePath = path.resolve(__dirname, 'data/leave-credits.xlsx');
  const year = phtYear();
  const sheetRows = loadSheet(filePath);

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`File: ${filePath}`);
  console.log(`Year: ${year}`);
  console.log(`Sheet rows: ${sheetRows.length}`);
  console.log(`Types: ${TARGET_TYPES.join(', ')}`);
  console.log('---');

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isActive: true,
      isArchived: true,
    },
  });
  const byEmpNo = new Map(employees.map((e) => [e.employeeNumber.trim(), e]));

  const errors: ErrorRow[] = [];
  let wouldUpdate = 0;
  let updated = 0;
  let created = 0;

  for (const row of sheetRows) {
    if (!row.employeeNumber) {
      errors.push({ rowNum: row.rowNum, employeeNumber: '', name: row.name, reason: 'Missing employee number' });
      continue;
    }
    if (!row.name) {
      errors.push({
        rowNum: row.rowNum,
        employeeNumber: row.employeeNumber,
        name: '',
        reason: 'Missing name',
      });
      continue;
    }
    if (row.parseError) {
      errors.push({
        rowNum: row.rowNum,
        employeeNumber: row.employeeNumber,
        name: row.name,
        reason: row.parseError,
      });
      continue;
    }

    const matched =
      byEmpNo.get(row.employeeNumber) ??
      byEmpNo.get(String(Number(row.employeeNumber)));
    if (!matched) {
      errors.push({
        rowNum: row.rowNum,
        employeeNumber: row.employeeNumber,
        name: row.name,
        reason: 'Employee number not found in database',
      });
      continue;
    }

    if (!namesMatch(row.name, matched.firstName, matched.lastName, matched.middleName)) {
      errors.push({
        rowNum: row.rowNum,
        employeeNumber: row.employeeNumber,
        name: row.name,
        reason: `Name mismatch — sheet "${row.name}" vs DB "${matched.lastName}, ${matched.firstName}${matched.middleName ? ' ' + matched.middleName : ''}" (empNo matched ${matched.employeeNumber})`,
      });
      continue;
    }

    if (DRY_RUN) {
      wouldUpdate++;
      console.log(
        `[DRY] ${row.employeeNumber} | ${row.name} → VL=${row.balances.VACATION} SL=${row.balances.SICK} SML=${row.balances.SML} PML=${row.balances.PML}` +
          (matched.isArchived || !matched.isActive ? ' [inactive/archived]' : ''),
      );
      continue;
    }

    for (const leaveType of TARGET_TYPES) {
      const available = row.balances[leaveType];
      const existing = await prisma.leaveBalance.findUnique({
        where: {
          employeeId_year_leaveType: {
            employeeId: matched.id,
            year,
            leaveType,
          },
        },
      });

      // Exact available balance = sheet value → totalDays = available + used + pending
      const usedDays = existing?.usedDays ?? 0;
      const pendingDays = existing?.pendingDays ?? 0;
      const totalDays = available + usedDays + pendingDays;

      if (existing) {
        await prisma.leaveBalance.update({
          where: { id: existing.id },
          data: { totalDays },
        });
        updated++;
      } else {
        await prisma.leaveBalance.create({
          data: {
            employeeId: matched.id,
            year,
            leaveType,
            totalDays,
            usedDays: 0,
            pendingDays: 0,
          },
        });
        created++;
      }
    }

    console.log(
      `[OK] ${row.employeeNumber} | ${row.name} → VL=${row.balances.VACATION} SL=${row.balances.SICK} SML=${row.balances.SML} PML=${row.balances.PML}`,
    );
  }

  console.log('---');
  console.log(`Summary (${DRY_RUN ? 'dry-run' : 'live'}):`);
  if (DRY_RUN) {
    console.log(`  Would update employees: ${wouldUpdate}`);
  } else {
    console.log(`  Balance rows updated: ${updated}`);
    console.log(`  Balance rows created: ${created}`);
    console.log(`  Employees applied: ${(updated + created) / TARGET_TYPES.length}`);
  }
  console.log(`  Errors: ${errors.length}`);

  if (errors.length) {
    console.log('\n=== ERRORS (not applied) ===');
    for (const e of errors) {
      console.log(
        `  Row ${e.rowNum} | ${e.employeeNumber || '(no emp#)'} | ${e.name || '(no name)'} | ${e.reason}`,
      );
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
