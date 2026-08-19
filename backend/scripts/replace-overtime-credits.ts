/**
 * One-shot replacement of available overtime credits from HR spreadsheet.
 *
 * For each matched employee:
 *   1. Retires ALL currently available credits (approved, unconverted, unexpired)
 *      by back-dating approvedExpiry so they no longer appear as available.
 *   2. Creates one new approved record with the sheet value (hours → minutes).
 *      Employees with 0 credits get their balance zeroed — no new record.
 *
 * Idempotent: if a record with OVERRIDE_REASON already exists for the employee,
 * the creation step is skipped (retirement still runs if credits are still live).
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/replace-overtime-credits.ts --dry-run
 *   npx ts-node --transpile-only scripts/replace-overtime-credits.ts
 */
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const OVERRIDE_REASON = 'Credit override 2026-08-12';
const RETIRE_NOTE = 'Retired: replaced by credit override 2026-08-12';
const HOURS_TO_MINUTES = 60;
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DRY_RUN = process.argv.includes('--dry-run');

const FILE_PATH =
  process.argv.find((a) => a.startsWith('--file='))?.slice(7) ??
  '/Users/mark/Desktop/CREDITS TO PROMPT.xlsx';

// Known name mismatches confirmed against DB — bypass name check for these emp#s
const FORCE_EMP_NOS = new Set(['2026095', '2026100', '2026107']);

// ─── Name-matching helpers ────────────────────────────────────────────────────

function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dbNameVariants(firstName: string, lastName: string, middleName?: string | null): string[] {
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  const middle = middleName ? normalizeName(middleName) : '';
  const mi = middle ? middle.charAt(0) : '';
  const v = new Set<string>();
  v.add(`${last} ${first}`); v.add(`${first} ${last}`);
  if (middle) {
    v.add(`${last} ${first} ${middle}`); v.add(`${last} ${first} ${mi}`);
    v.add(`${first} ${middle} ${last}`); v.add(`${first} ${mi} ${last}`);
  }
  return [...v];
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
  const lastOk = sheetTokens.includes(last) || sheet.startsWith(last + ' ') || sheet.endsWith(' ' + last);
  return allPresent && lastOk;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SheetRow = { rowNum: number; employeeNumber: string; name: string; hours: number; parseError?: string };
type ErrorRow = { rowNum: number; employeeNumber: string; name: string; reason: string };

// ─── Sheet parsing ─────────────────────────────────────────────────────────────

function loadSheet(filePath: string): SheetRow[] {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let colEmpNo = -1, colName = -1, colCredits = -1, dataStart = -1;
  for (let i = 0; i < matrix.length; i++) {
    const cells = (matrix[i] || []).map((c) => String(c ?? '').toLowerCase().trim());
    const eno = cells.findIndex((c) => c.includes('employee') && c.includes('number'));
    const nm  = cells.findIndex((c) => c.includes('employee') && c.includes('name'));
    const ot  = cells.findIndex((c) => c.includes('overtime') && c.includes('credit'));
    if (eno !== -1 && nm !== -1 && ot !== -1) { colEmpNo = eno; colName = nm; colCredits = ot; dataStart = i + 1; break; }
  }
  if (dataStart === -1) throw new Error('Header row not found (need Employee Number / Employee Name / Overtime Credits)');

  const rows: SheetRow[] = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const empRaw = cells[colEmpNo];
    if (empRaw === '' || empRaw === null || empRaw === undefined) continue;
    const employeeNumber = String(empRaw).trim();
    const name = String(cells[colName] ?? '').trim();
    if (!employeeNumber && !name) continue;
    const h = typeof cells[colCredits] === 'number' ? cells[colCredits] as number : Number(String(cells[colCredits] ?? '').trim());
    const parseError = !Number.isFinite(h) || h < 0 ? `Invalid Overtime Credits: ${JSON.stringify(cells[colCredits])}` : undefined;
    rows.push({ rowNum: i + 1, employeeNumber, name, hours: h, parseError });
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode:  ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`File:  ${FILE_PATH}`);
  console.log(`Override reason: ${OVERRIDE_REASON}`);
  console.log('---');

  const sheetRows = loadSheet(FILE_PATH);
  console.log(`Sheet rows: ${sheetRows.length}\n`);

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, middleName: true, isActive: true, isArchived: true },
  });
  const byEmpNo = new Map(employees.map((e) => [e.employeeNumber.trim(), e]));

  // Pre-fetch override records already created (idempotency on the create step)
  const existingOverrides = await prisma.overtimeRecord.findMany({
    where: { reason: OVERRIDE_REASON },
    select: { employeeId: true },
  });
  const alreadyCreated = new Set(existingOverrides.map((r) => r.employeeId));

  const errors: ErrorRow[] = [];
  let retired = 0;
  let created = 0;
  let zeroed = 0;

  const now = new Date();
  // expire-by = yesterday so the cron won't re-process them as fresh expiries
  const retireExpiry = new Date(now);
  retireExpiry.setDate(retireExpiry.getDate() - 1);

  const approvedExpiry = new Date(now);
  approvedExpiry.setMonth(approvedExpiry.getMonth() + 6);

  const phtNow = new Date(Date.now() + PHT_OFFSET_MS);
  const runDate = new Date(Date.UTC(phtNow.getUTCFullYear(), phtNow.getUTCMonth(), phtNow.getUTCDate()));

  for (const row of sheetRows) {
    const tag = `Row ${row.rowNum} | ${row.employeeNumber} | ${row.name}`;

    if (!row.employeeNumber) { errors.push({ rowNum: row.rowNum, employeeNumber: '', name: row.name, reason: 'Missing employee number' }); continue; }
    if (!row.name)            { errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: '', reason: 'Missing name' }); continue; }
    if (row.parseError)       { errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name, reason: row.parseError }); continue; }

    const matched = byEmpNo.get(row.employeeNumber) ?? byEmpNo.get(String(Number(row.employeeNumber)));
    if (!matched) { errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name, reason: 'Employee number not found in database' }); continue; }

    if (!FORCE_EMP_NOS.has(row.employeeNumber) && !namesMatch(row.name, matched.firstName, matched.lastName, matched.middleName)) {
      errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name,
        reason: `Name mismatch — sheet "${row.name}" vs DB "${matched.lastName}, ${matched.firstName}${matched.middleName ? ' ' + matched.middleName : ''}"` });
      continue;
    }

    if (!matched.isActive || matched.isArchived) {
      errors.push({ rowNum: row.rowNum, employeeNumber: row.employeeNumber, name: row.name, reason: `Skipped — employee is ${matched.isArchived ? 'archived' : 'inactive'}` });
      continue;
    }

    const minutes = Math.round(row.hours * HOURS_TO_MINUTES);

    // Find all currently available credits to retire
    const liveCredits = await prisma.overtimeRecord.findMany({
      where: {
        employeeId: matched.id,
        status: 'APPROVED',
        isConverted: false,
        approvedExpiry: { gt: now },
      },
      select: { id: true, minutes: true, reason: true },
    });

    const currentTotal = liveCredits.reduce((s, r) => s + r.minutes, 0);

    if (DRY_RUN) {
      const newHours = (minutes / 60).toFixed(1);
      const oldHours = (currentTotal / 60).toFixed(1);
      const createLine = minutes > 0
        ? `→ CREATE ${row.hours}h = ${minutes}min, expiry ${approvedExpiry.toISOString().slice(0, 10)}`
        : `→ ZERO (no new record)`;
      console.log(`[DRY] ${tag}`);
      console.log(`      Retire ${liveCredits.length} record(s) (${oldHours}h) ${createLine}`);
      retired += liveCredits.length;
      if (minutes > 0 && !alreadyCreated.has(matched.id)) created++;
      else if (minutes === 0) zeroed++;
      continue;
    }

    // Retire existing live credits
    if (liveCredits.length > 0) {
      await prisma.overtimeRecord.updateMany({
        where: { id: { in: liveCredits.map((r) => r.id) } },
        data: { approvedExpiry: retireExpiry, reviewerNotes: RETIRE_NOTE },
      });
      retired += liveCredits.length;
      console.log(`  Retired ${liveCredits.length} record(s) (${(currentTotal / 60).toFixed(1)}h) for ${row.employeeNumber}`);
    }

    if (minutes === 0) {
      console.log(`[OK]  ${tag} → zeroed (no new record)`);
      zeroed++;
      continue;
    }

    if (alreadyCreated.has(matched.id)) {
      console.log(`[SKIP] ${tag} — override record already exists (idempotent)`);
      continue;
    }

    await prisma.overtimeRecord.create({
      data: {
        employeeId: matched.id,
        date: runDate,
        startTime: runDate,
        endTime: new Date(runDate.getTime() + minutes * 60 * 1000),
        minutes,
        isFiled: true,
        status: 'APPROVED',
        isConverted: false,
        reason: OVERRIDE_REASON,
        pendingExpiry: now,
        approvedExpiry,
      },
    });

    console.log(`[OK]  ${tag} → ${row.hours}h = ${minutes}min, expiry ${approvedExpiry.toISOString().slice(0, 10)}`);
    created++;
  }

  console.log('\n---');
  console.log(`Summary (${DRY_RUN ? 'dry-run' : 'live'}):`);
  console.log(`  Records retired:          ${retired}`);
  console.log(`  New credit records:       ${DRY_RUN ? '~' : ''}${created}`);
  console.log(`  Employees zeroed (0h):    ${zeroed}`);
  console.log(`  Errors:                   ${errors.length}`);
  if (!DRY_RUN && created > 0) console.log(`  approvedExpiry:           ${approvedExpiry.toISOString().slice(0, 10)}`);

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
