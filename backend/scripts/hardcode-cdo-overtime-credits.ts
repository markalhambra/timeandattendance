/**
 * One-shot backfill of CDO overtime credits from HR spreadsheet.
 *
 * Reads: Employee Number, Employee Name, Overtime Credits (hours)
 * Creates one approved OvertimeRecord per matched employee; credits are
 * immediately available (status=APPROVED, isConverted=false, approvedExpiry=now+6mo).
 * Idempotent: skips rows where a record with the same backfill reason already exists.
 * Inactive/archived employees are skipped and reported.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/hardcode-cdo-overtime-credits.ts --dry-run
 *   npx ts-node --transpile-only scripts/hardcode-cdo-overtime-credits.ts
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const BACKFILL_REASON = 'CDO credit backfill 2026-08-12';
const HOURS_TO_MINUTES = 60;
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DRY_RUN = process.argv.includes('--dry-run');

// Force-apply for confirmed employees whose DB name differs from sheet spelling
const FORCE_EMP_NOS = new Set(['2025081', '2025092', '2026095', '2026100']);

const FILE_PATH =
  process.argv.find((a) => a.startsWith('--file='))?.slice(7) ??
  '/Users/mark/Desktop/CDO LEAVE CREDITS TO PROMPT.xlsx';

// ─── Name-matching helpers (same algorithm as hardcode-leave-credits.ts) ───────

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dbNameVariants(firstName: string, lastName: string, middleName?: string | null): string[] {
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  const middle = middleName ? normalizeName(middleName) : '';
  const mi = middle ? middle.charAt(0) : '';
  const variants = new Set<string>();
  variants.add(`${last} ${first}`);
  variants.add(`${first} ${last}`);
  if (middle) {
    variants.add(`${last} ${first} ${middle}`);
    variants.add(`${last} ${first} ${mi}`);
    variants.add(`${first} ${middle} ${last}`);
    variants.add(`${first} ${mi} ${last}`);
  }
  return [...variants];
}

function namesMatch(sheetName: string, firstName: string, lastName: string, middleName?: string | null): boolean {
  const sheet = normalizeName(sheetName);
  if (!sheet) return false;
  if (dbNameVariants(firstName, lastName, middleName).includes(sheet)) return true;

  const blob = normalizeName([lastName, firstName, middleName || ''].filter(Boolean).join(' '));
  const sheetTokens = sheet.split(' ').filter((t) => t.length > 1 || /^[a-z]$/.test(t));
  const blobTokens = new Set(blob.split(' ').filter(Boolean));

  const allPresent = sheetTokens.every((tok) => {
    if (blobTokens.has(tok)) return true;
    if (tok.length === 1) return [...blobTokens].some((b) => b.startsWith(tok));
    return [...blobTokens].some((b) => b === tok || b.startsWith(tok) || tok.startsWith(b));
  });
  const last = normalizeName(lastName);
  const lastOk =
    sheetTokens.includes(last) || sheet.startsWith(last + ' ') || sheet.endsWith(' ' + last);
  return allPresent && lastOk;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetRow = {
  rowNum: number;
  employeeNumber: string;
  name: string;
  hours: number;
  parseError?: string;
};

type ErrorRow = { rowNum: number; employeeNumber: string; name: string; reason: string };

// ─── Sheet parsing ─────────────────────────────────────────────────────────────

function loadSheet(filePath: string): SheetRow[] {
  if (!fs.existsSync(filePath)) throw new Error(`Spreadsheet not found: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Locate header row and column indices
  let colEmpNo = -1, colName = -1, colCredits = -1, dataStartRow = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = (matrix[i] || []).map((c) => String(c ?? '').toLowerCase().trim());
    const eno = cells.findIndex((c) => c.includes('employee') && c.includes('number'));
    const nm = cells.findIndex((c) => c.includes('employee') && c.includes('name'));
    const ot = cells.findIndex((c) => c.includes('overtime') && c.includes('credit'));
    if (eno !== -1 && nm !== -1 && ot !== -1) {
      colEmpNo = eno; colName = nm; colCredits = ot; dataStartRow = i + 1;
      break;
    }
  }
  if (dataStartRow === -1) throw new Error('Could not locate header row with Employee Number / Employee Name / Overtime Credits');

  const rows: SheetRow[] = [];
  for (let i = dataStartRow; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const empRaw = cells[colEmpNo];
    const nameRaw = cells[colName];
    const credRaw = cells[colCredits];

    if (empRaw === '' || empRaw === null || empRaw === undefined) continue;

    const employeeNumber = String(empRaw).trim();
    const name = String(nameRaw ?? '').trim();
    if (!employeeNumber && !name) continue;

    const h = typeof credRaw === 'number' ? credRaw : Number(String(credRaw ?? '').trim());
    const parseError =
      !Number.isFinite(h) || h <= 0
        ? `Invalid Overtime Credits value: ${JSON.stringify(credRaw)}`
        : undefined;

    rows.push({ rowNum: i + 1, employeeNumber, name, hours: h, parseError });
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode:  ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`File:  ${FILE_PATH}`);
  console.log(`Reason: ${BACKFILL_REASON}`);
  console.log('---');

  const sheetRows = loadSheet(FILE_PATH);
  console.log(`Sheet rows: ${sheetRows.length}`);

  const employees = await prisma.employee.findMany({
    select: {
      id: true, employeeNumber: true, firstName: true, lastName: true,
      middleName: true, isActive: true, isArchived: true,
    },
  });
  const byEmpNo = new Map(employees.map((e) => [e.employeeNumber.trim(), e]));

  // Pre-fetch existing backfill records for idempotency check
  const existing = await prisma.overtimeRecord.findMany({
    where: { reason: BACKFILL_REASON },
    select: { employeeId: true },
  });
  const alreadyDone = new Set(existing.map((r) => r.employeeId));

  const errors: ErrorRow[] = [];
  let applied = 0;
  let skippedIdempotent = 0;

  // approvedExpiry = 6 months from today PHT
  const now = new Date();
  const approvedExpiry = new Date(now);
  approvedExpiry.setMonth(approvedExpiry.getMonth() + 6);

  // Synthetic date fields: run date at midnight PHT
  const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
  const runDate = new Date(Date.UTC(phtNow.getUTCFullYear(), phtNow.getUTCMonth(), phtNow.getUTCDate()));

  for (const row of sheetRows) {
    const tag = `Row ${row.rowNum} | ${row.employeeNumber} | ${row.name}`;

    if (!row.employeeNumber) {
      errors.push({ rowNum: row.rowNum, employeeNumber: '', name: row.name, reason: 'Missing employee number' });
      continue;
    }
    if (!row.name) {
      errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: '', reason: 'Missing name' });
      continue;
    }
    if (row.parseError) {
      errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name, reason: row.parseError });
      continue;
    }

    const matched =
      byEmpNo.get(row.employeeNumber) ?? byEmpNo.get(String(Number(row.employeeNumber)));
    if (!matched) {
      errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name, reason: 'Employee number not found in database' });
      continue;
    }

    if (
      !FORCE_EMP_NOS.has(row.employeeNumber) &&
      !namesMatch(row.name, matched.firstName, matched.lastName, matched.middleName)
    ) {
      errors.push({
        rowNum: row.rowNum,
        employeeNumber: row.employeeNumber,
        name: row.name,
        reason: `Name mismatch — sheet "${row.name}" vs DB "${matched.lastName}, ${matched.firstName}${matched.middleName ? ' ' + matched.middleName : ''}"`,
      });
      continue;
    }

    if (!matched.isActive || matched.isArchived) {
      errors.push({
        rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name,
        reason: `Skipped — employee is ${matched.isArchived ? 'archived' : 'inactive'}`,
      });
      continue;
    }

    if (alreadyDone.has(matched.id)) {
      console.log(`[SKIP] ${tag} — backfill record already exists (idempotent)`);
      skippedIdempotent++;
      continue;
    }

    const minutes = Math.round(row.hours * HOURS_TO_MINUTES);
    // startTime and endTime are required fields; use midnight to midnight+minutes on run date
    const startTime = runDate;
    const endTime = new Date(runDate.getTime() + minutes * 60 * 1000);

    if (DRY_RUN) {
      console.log(`[DRY] ${tag} → ${row.hours}h = ${minutes}min, expiry ${approvedExpiry.toISOString().slice(0, 10)}`);
      applied++;
      continue;
    }

    await prisma.overtimeRecord.create({
      data: {
        employeeId: matched.id,
        date: runDate,
        startTime,
        endTime,
        minutes,
        isFiled: true,
        status: 'APPROVED',
        isConverted: false,
        reason: BACKFILL_REASON,
        pendingExpiry: now,
        approvedExpiry,
      },
    });

    console.log(`[OK]  ${tag} → ${row.hours}h = ${minutes}min, expiry ${approvedExpiry.toISOString().slice(0, 10)}`);
    applied++;
  }

  console.log('---');
  console.log(`Summary (${DRY_RUN ? 'dry-run' : 'live'}):`);
  console.log(`  ${DRY_RUN ? 'Would create' : 'Created'}:    ${applied}`);
  console.log(`  Skipped (idempotent): ${skippedIdempotent}`);
  console.log(`  Errors:              ${errors.length}`);
  if (!DRY_RUN && applied > 0) {
    console.log(`  approvedExpiry:      ${approvedExpiry.toISOString().slice(0, 10)}`);
  }

  if (errors.length) {
    console.log('\n=== ERRORS (not applied) ===');
    for (const e of errors) {
      console.log(`  Row ${e.rowNum} | ${e.employeeNumber || '(no emp#)'} | ${e.name || '(no name)'} | ${e.reason}`);
    }
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
