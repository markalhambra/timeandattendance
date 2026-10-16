import { prisma } from '../config/database';
import { ensureStorageBucket, getSupabaseClient, STORAGE_BUCKET } from '../config/supabase';
import { logger } from '../config/logger';
import { googleSheetsService } from './google-sheets.service';
import {
  PayrollRowAmounts,
  buildEmployeeNameVariants,
  isPayrollPeriodSheet,
  nameKeyWithoutInitials,
  normalizePersonName,
  parsePayrollSheetRows,
  parsePeriodFromSheetName,
} from './payroll-parse.service';
import { buildPayslipPdf } from './payslip-pdf.service';

export const MAX_PAYSLIPS_PER_EMPLOYEE = 4;

export interface MatchedPayrollRow {
  row: PayrollRowAmounts;
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  departmentName?: string;
  designation?: string | null;
  matchMethod: 'employeeNumber' | 'tin' | 'name';
}

export interface UnmatchedPayrollRow {
  fullName: string;
  employeeNumber?: string;
  tin?: string;
  netPay?: number;
  reason: string;
}

function tinKey(t?: string | null): string | null {
  if (!t) return null;
  const d = String(t).replace(/\D/g, '');
  return d.length >= 9 ? d : null;
}

async function loadActiveEmployees() {
  return prisma.employee.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      middleName: true,
      tinNumber: true,
      designation: true,
      department: { select: { name: true } },
    },
  });
}

export function matchPayrollRows(
  rows: PayrollRowAmounts[],
  employees: Awaited<ReturnType<typeof loadActiveEmployees>>,
): { matched: MatchedPayrollRow[]; unmatched: UnmatchedPayrollRow[] } {
  const byEmpNo = new Map<string, (typeof employees)[0]>();
  const byTin = new Map<string, (typeof employees)[0]>();
  const byName = new Map<string, (typeof employees)[0]>();
  const byNameLoose = new Map<string, (typeof employees)[0]>();

  for (const e of employees) {
    byEmpNo.set(e.employeeNumber.trim().toLowerCase(), e);
    const tk = tinKey(e.tinNumber);
    if (tk) byTin.set(tk, e);
    for (const v of buildEmployeeNameVariants(e)) {
      if (!byName.has(v)) byName.set(v, e);
      const loose = nameKeyWithoutInitials(v);
      if (loose && !byNameLoose.has(loose)) byNameLoose.set(loose, e);
    }
  }

  const matched: MatchedPayrollRow[] = [];
  const unmatched: UnmatchedPayrollRow[] = [];
  const usedEmployeeIds = new Set<string>();

  for (const row of rows) {
    let emp = row.employeeNumber
      ? byEmpNo.get(String(row.employeeNumber).trim().toLowerCase())
      : undefined;
    let method: MatchedPayrollRow['matchMethod'] | undefined = emp ? 'employeeNumber' : undefined;

    if (!emp) {
      const tk = tinKey(row.tin);
      if (tk && byTin.has(tk)) {
        emp = byTin.get(tk);
        method = 'tin';
      }
    }

    if (!emp) {
      const nk = normalizePersonName(row.fullName);
      emp = byName.get(nk);
      if (emp) method = 'name';
      if (!emp) {
        const loose = nameKeyWithoutInitials(row.fullName);
        emp = byNameLoose.get(loose);
        if (emp) method = 'name';
      }
    }

    if (!emp || !method) {
      unmatched.push({
        fullName: row.fullName,
        employeeNumber: row.employeeNumber,
        tin: row.tin,
        netPay: row.netPay,
        reason: 'No matching employee in TAMS',
      });
      continue;
    }

    if (usedEmployeeIds.has(emp.id)) {
      unmatched.push({
        fullName: row.fullName,
        employeeNumber: row.employeeNumber,
        tin: row.tin,
        netPay: row.netPay,
        reason: `Duplicate match for ${emp.firstName} ${emp.lastName}`,
      });
      continue;
    }

    usedEmployeeIds.add(emp.id);
    matched.push({
      row,
      employeeId: emp.id,
      employeeNumber: emp.employeeNumber,
      firstName: emp.firstName,
      lastName: emp.lastName,
      departmentName: emp.department?.name,
      designation: emp.designation,
      matchMethod: method,
    });
  }

  return { matched, unmatched };
}

export async function readAndMatchSheet(opts: {
  spreadsheetId: string;
  sheetName: string;
}): Promise<{
  rows: PayrollRowAmounts[];
  matched: MatchedPayrollRow[];
  unmatched: UnmatchedPayrollRow[];
}> {
  const values = await googleSheetsService.getSheetValues(opts.spreadsheetId, opts.sheetName);
  const rows = parsePayrollSheetRows(values);
  const employees = await loadActiveEmployees();
  const { matched, unmatched } = matchPayrollRows(rows, employees);
  return { rows, matched, unmatched };
}

async function enforcePayslipRetention(employeeId: string): Promise<void> {
  const slips = await prisma.payslip.findMany({
    where: { employeeId },
    orderBy: [{ payPeriodEnd: 'desc' }, { createdAt: 'desc' }],
  });
  if (slips.length <= MAX_PAYSLIPS_PER_EMPLOYEE) return;

  const toDelete = slips.slice(MAX_PAYSLIPS_PER_EMPLOYEE);
  const paths = toDelete.map((s) => s.storagePath).filter(Boolean);
  if (paths.length) {
    try {
      await getSupabaseClient().storage.from(STORAGE_BUCKET).remove(paths);
    } catch (err) {
      logger.warn('Payslip storage cleanup failed:', err);
    }
  }
  await prisma.payslip.deleteMany({
    where: { id: { in: toDelete.map((s) => s.id) } },
  });
}

export async function generatePayslipsForRun(opts: {
  workbookId: string;
  year: number;
  sheetName: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  periodLabel: string;
  generatedByUserId: string;
  matched: MatchedPayrollRow[];
  unmatched: UnmatchedPayrollRow[];
}): Promise<{
  runId: string;
  generatedCount: number;
  failedCount: number;
  failures: { name: string; error: string }[];
}> {
  const run = await prisma.payrollRun.create({
    data: {
      workbookId: opts.workbookId,
      year: opts.year,
      sheetName: opts.sheetName,
      periodLabel: opts.periodLabel,
      payPeriodStart: opts.payPeriodStart,
      payPeriodEnd: opts.payPeriodEnd,
      status: 'GENERATED',
      matchedCount: opts.matched.length,
      unmatchedCount: opts.unmatched.length,
      generatedByUserId: opts.generatedByUserId,
      unmatchedRows: opts.unmatched as any,
    },
  });

  let generatedCount = 0;
  let failedCount = 0;
  const failures: { name: string; error: string }[] = [];
  await ensureStorageBucket();
  const sb = getSupabaseClient();

  // Process sequentially to stay within serverless memory/time; batch small
  for (const m of opts.matched) {
    try {
      const pdf = await buildPayslipPdf({
        companyName: 'ALPAS',
        employeeName: `${m.firstName} ${m.lastName}`,
        employeeNumber: m.employeeNumber,
        department: m.departmentName,
        designation: m.designation || undefined,
        periodLabel: opts.periodLabel,
        row: m.row,
      });

      const periodKey = opts.payPeriodEnd.toISOString().slice(0, 10);
      const storagePath = `payslips/${m.employeeId}/${periodKey}.pdf`;
      const filename = `payslip-${m.employeeNumber}-${periodKey}.pdf`;

      const { error: upErr } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;

      const existing = await prisma.payslip.findUnique({
        where: {
          employeeId_payPeriodStart_payPeriodEnd: {
            employeeId: m.employeeId,
            payPeriodStart: opts.payPeriodStart,
            payPeriodEnd: opts.payPeriodEnd,
          },
        },
      });

      if (existing && existing.storagePath !== storagePath) {
        try {
          await sb.storage.from(STORAGE_BUCKET).remove([existing.storagePath]);
        } catch { /* ignore */ }
      }

      await prisma.payslip.upsert({
        where: {
          employeeId_payPeriodStart_payPeriodEnd: {
            employeeId: m.employeeId,
            payPeriodStart: opts.payPeriodStart,
            payPeriodEnd: opts.payPeriodEnd,
          },
        },
        create: {
          employeeId: m.employeeId,
          payrollRunId: run.id,
          year: opts.year,
          sheetName: opts.sheetName,
          periodLabel: opts.periodLabel,
          payPeriodStart: opts.payPeriodStart,
          payPeriodEnd: opts.payPeriodEnd,
          netPay: m.row.netPay ?? null,
          storagePath,
          filename,
          mimeType: 'application/pdf',
          size: pdf.length,
        },
        update: {
          payrollRunId: run.id,
          year: opts.year,
          sheetName: opts.sheetName,
          periodLabel: opts.periodLabel,
          netPay: m.row.netPay ?? null,
          storagePath,
          filename,
          mimeType: 'application/pdf',
          size: pdf.length,
        },
      });

      await enforcePayslipRetention(m.employeeId);
      generatedCount += 1;
    } catch (err: any) {
      failedCount += 1;
      failures.push({
        name: `${m.firstName} ${m.lastName}`,
        error: err?.message || 'PDF/storage failed',
      });
      logger.error(`Payslip generate failed for ${m.employeeId}:`, err);
    }
  }

  await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      generatedCount,
      failedCount,
      status: failedCount && !generatedCount ? 'FAILED' : 'GENERATED',
    },
  });

  return { runId: run.id, generatedCount, failedCount, failures };
}

export function resolvePeriodDates(
  sheetName: string,
  year: number,
  payPeriodStart?: string,
  payPeriodEnd?: string,
): { start: Date; end: Date; label: string } {
  if (payPeriodStart && payPeriodEnd) {
    const start = new Date(payPeriodStart);
    const end = new Date(payPeriodEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Invalid pay period dates.');
    }
    const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
    return { start, end, label };
  }

  const parsed = parsePeriodFromSheetName(sheetName, year);
  if (!parsed) {
    throw new Error(
      `Could not parse pay period from sheet name "${sheetName}". Provide payPeriodStart and payPeriodEnd (YYYY-MM-DD).`,
    );
  }
  return parsed;
}

export { isPayrollPeriodSheet, googleSheetsService };
