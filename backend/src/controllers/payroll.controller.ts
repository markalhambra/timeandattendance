import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { getSupabaseClient, STORAGE_BUCKET } from '../config/supabase';
import { logger } from '../config/logger';
import {
  generatePayslipsForRun,
  googleSheetsService,
  isPayrollPeriodSheet,
  readAndMatchSheet,
  resolvePeriodDates,
} from '../services/payslip.service';

function extractSpreadsheetId(input: string): string {
  const raw = input.trim();
  const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]+$/.test(raw)) return raw;
  throw new Error('Invalid Google Spreadsheet ID or URL.');
}

export async function getGoogleStatus(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      configured: googleSheetsService.isConfigured(),
      serviceAccountEmail: googleSheetsService.getServiceAccountEmail(),
    },
  });
}

export async function listWorkbooks(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const workbooks = await prisma.payrollWorkbook.findMany({
      orderBy: { year: 'desc' },
    });
    res.json({
      success: true,
      data: {
        workbooks,
        google: {
          configured: googleSheetsService.isConfigured(),
          serviceAccountEmail: googleSheetsService.getServiceAccountEmail(),
        },
      },
    });
  } catch (err) {
    logger.error('listWorkbooks:', err);
    res.status(500).json({ success: false, message: 'Failed to list payroll workbooks.' });
  }
}

export async function upsertWorkbook(req: AuthRequest, res: Response): Promise<void> {
  try {
    const year = parseInt(String(req.params.year), 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ success: false, message: 'Invalid year.' });
      return;
    }
    const spreadsheetId = extractSpreadsheetId(String(req.body.spreadsheetId || ''));
    const title = req.body.title ? String(req.body.title).trim() : `Payroll ${year}`;

    const workbook = await prisma.payrollWorkbook.upsert({
      where: { year },
      create: {
        year,
        spreadsheetId,
        title,
        updatedBy: req.user!.sub,
      },
      update: {
        spreadsheetId,
        title,
        isActive: true,
        updatedBy: req.user!.sub,
      },
    });

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'UPDATE',
        entity: 'PayrollWorkbook',
        entityId: workbook.id,
        newValues: { year, spreadsheetId, title },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    res.json({ success: true, data: workbook });
  } catch (err: any) {
    logger.error('upsertWorkbook:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to save workbook.' });
  }
}

export async function listSheets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const year = parseInt(String(req.params.year), 10);
    const workbook = await prisma.payrollWorkbook.findUnique({ where: { year } });
    if (!workbook) {
      res.status(404).json({ success: false, message: `No payroll spreadsheet configured for ${year}.` });
      return;
    }

    const titles = await googleSheetsService.listSheetTitles(workbook.spreadsheetId);
    const periodSheets = titles.filter(isPayrollPeriodSheet);
    const defaultSheet = periodSheets.length
      ? periodSheets[periodSheets.length - 1]
      : titles[titles.length - 1] || null;

    res.json({
      success: true,
      data: {
        year,
        spreadsheetId: workbook.spreadsheetId,
        sheets: titles.map((name) => ({
          name,
          isPeriodSheet: isPayrollPeriodSheet(name),
        })),
        periodSheets,
        defaultSheet,
      },
    });
  } catch (err: any) {
    logger.error('listSheets:', err);
    res.status(400).json({ success: false, message: err.message || 'Failed to list sheets.' });
  }
}

export async function previewPayroll(req: AuthRequest, res: Response): Promise<void> {
  try {
    const year = parseInt(String(req.body.year), 10);
    const sheetName = String(req.body.sheetName || '').trim();
    if (!year || !sheetName) {
      res.status(400).json({ success: false, message: 'year and sheetName are required.' });
      return;
    }

    const workbook = await prisma.payrollWorkbook.findUnique({ where: { year } });
    if (!workbook) {
      res.status(404).json({ success: false, message: `No payroll spreadsheet configured for ${year}.` });
      return;
    }

    let period;
    try {
      period = resolvePeriodDates(sheetName, year, req.body.payPeriodStart, req.body.payPeriodEnd);
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
      return;
    }

    const { matched, unmatched } = await readAndMatchSheet({
      spreadsheetId: workbook.spreadsheetId,
      sheetName,
    });

    res.json({
      success: true,
      data: {
        year,
        sheetName,
        periodLabel: period.label,
        payPeriodStart: period.start.toISOString().slice(0, 10),
        payPeriodEnd: period.end.toISOString().slice(0, 10),
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matched: matched.map((m) => ({
          employeeId: m.employeeId,
          employeeNumber: m.employeeNumber,
          name: `${m.firstName} ${m.lastName}`,
          sheetName: m.row.fullName,
          netPay: m.row.netPay ?? null,
          matchMethod: m.matchMethod,
        })),
        unmatched,
      },
    });
  } catch (err: any) {
    logger.error('previewPayroll:', err);
    res.status(400).json({ success: false, message: err.message || 'Preview failed.' });
  }
}

export async function generatePayroll(req: AuthRequest, res: Response): Promise<void> {
  try {
    const year = parseInt(String(req.body.year), 10);
    const sheetName = String(req.body.sheetName || '').trim();
    if (!year || !sheetName) {
      res.status(400).json({ success: false, message: 'year and sheetName are required.' });
      return;
    }

    const workbook = await prisma.payrollWorkbook.findUnique({ where: { year } });
    if (!workbook) {
      res.status(404).json({ success: false, message: `No payroll spreadsheet configured for ${year}.` });
      return;
    }

    let period;
    try {
      period = resolvePeriodDates(sheetName, year, req.body.payPeriodStart, req.body.payPeriodEnd);
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
      return;
    }

    const { matched, unmatched } = await readAndMatchSheet({
      spreadsheetId: workbook.spreadsheetId,
      sheetName,
    });

    if (!matched.length) {
      res.status(400).json({
        success: false,
        message: 'No employees matched. Fix names/employee numbers in the sheet or TAMS, then retry.',
        data: { unmatched },
      });
      return;
    }

    const result = await generatePayslipsForRun({
      workbookId: workbook.id,
      year,
      sheetName,
      payPeriodStart: period.start,
      payPeriodEnd: period.end,
      periodLabel: period.label,
      generatedByUserId: req.user!.sub,
      matched,
      unmatched,
    });

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'FILE_UPLOAD',
        entity: 'PayrollRun',
        entityId: result.runId,
        newValues: {
          year,
          sheetName,
          periodLabel: period.label,
          generatedCount: result.generatedCount,
          failedCount: result.failedCount,
          unmatchedCount: unmatched.length,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: {
        runId: result.runId,
        periodLabel: period.label,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        generatedCount: result.generatedCount,
        failedCount: result.failedCount,
        failures: result.failures,
        unmatched: unmatched.slice(0, 50),
      },
    });
  } catch (err: any) {
    logger.error('generatePayroll:', err);
    res.status(400).json({ success: false, message: err.message || 'Generate failed.' });
  }
}

export async function listRuns(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const runs = await prisma.payrollRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        workbook: { select: { year: true, title: true } },
      },
    });
    res.json({ success: true, data: runs });
  } catch (err) {
    logger.error('listRuns:', err);
    res.status(500).json({ success: false, message: 'Failed to list payroll runs.' });
  }
}

export async function listMyPayslips(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user!.employeeId;
    if (!employeeId) {
      res.status(400).json({ success: false, message: 'Employee profile not found.' });
      return;
    }
    const payslips = await prisma.payslip.findMany({
      where: { employeeId },
      orderBy: [{ payPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      take: 4,
      select: {
        id: true,
        periodLabel: true,
        payPeriodStart: true,
        payPeriodEnd: true,
        netPay: true,
        filename: true,
        size: true,
        createdAt: true,
        year: true,
        sheetName: true,
      },
    });
    res.json({ success: true, data: payslips });
  } catch (err) {
    logger.error('listMyPayslips:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch payslips.' });
  }
}

async function streamPayslipDownload(
  res: Response,
  payslipId: string,
  employeeIdFilter?: string,
): Promise<void> {
  const payslip = await prisma.payslip.findUnique({ where: { id: payslipId } });
  if (!payslip) {
    res.status(404).json({ success: false, message: 'Payslip not found.' });
    return;
  }
  if (employeeIdFilter && payslip.employeeId !== employeeIdFilter) {
    res.status(403).json({ success: false, message: 'Not allowed to download this payslip.' });
    return;
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).download(payslip.storagePath);
  if (error || !data) {
    logger.error('Payslip download failed:', error);
    res.status(404).json({ success: false, message: 'Payslip file not found in storage.' });
    return;
  }

  const buf = Buffer.from(await data.arrayBuffer());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payslip.filename}"`);
  res.setHeader('Content-Length', String(buf.length));
  res.send(buf);
}

export async function downloadMyPayslip(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user!.employeeId;
    if (!employeeId) {
      res.status(400).json({ success: false, message: 'Employee profile not found.' });
      return;
    }
    await streamPayslipDownload(res, req.params.id, employeeId);
  } catch (err) {
    logger.error('downloadMyPayslip:', err);
    res.status(500).json({ success: false, message: 'Failed to download payslip.' });
  }
}

export async function downloadPayslipHr(req: AuthRequest, res: Response): Promise<void> {
  try {
    await streamPayslipDownload(res, req.params.id);
  } catch (err) {
    logger.error('downloadPayslipHr:', err);
    res.status(500).json({ success: false, message: 'Failed to download payslip.' });
  }
}

/** HR/Admin: list all employee payslips (search, year filter, pagination). */
export async function listAllPayslips(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10) || 25));
    const search = String(req.query.search || '').trim();
    const yearRaw = req.query.year != null && req.query.year !== '' ? parseInt(String(req.query.year), 10) : null;

    const where: any = {};
    if (yearRaw != null && Number.isFinite(yearRaw)) {
      where.year = yearRaw;
    }
    if (search) {
      where.OR = [
        { periodLabel: { contains: search, mode: 'insensitive' } },
        { sheetName: { contains: search, mode: 'insensitive' } },
        { filename: { contains: search, mode: 'insensitive' } },
        {
          employee: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { employeeNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, payslips] = await Promise.all([
      prisma.payslip.count({ where }),
      prisma.payslip.findMany({
        where,
        orderBy: [{ payPeriodEnd: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          periodLabel: true,
          payPeriodStart: true,
          payPeriodEnd: true,
          netPay: true,
          filename: true,
          size: true,
          createdAt: true,
          year: true,
          sheetName: true,
          employeeId: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        payslips,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (err) {
    logger.error('listAllPayslips:', err);
    res.status(500).json({ success: false, message: 'Failed to list payslips.' });
  }
}

/** HR/Admin: delete a payslip (storage + DB) — e.g. typo / wrong cut-off. */
export async function deletePayslip(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    const payslip = await prisma.payslip.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, employeeNumber: true, firstName: true, lastName: true },
        },
      },
    });
    if (!payslip) {
      res.status(404).json({ success: false, message: 'Payslip not found.' });
      return;
    }

    if (payslip.storagePath) {
      try {
        await getSupabaseClient().storage.from(STORAGE_BUCKET).remove([payslip.storagePath]);
      } catch (err) {
        logger.warn('Payslip storage delete failed (continuing with DB delete):', err);
      }
    }

    await prisma.payslip.delete({ where: { id } });

    prisma.auditLog
      .create({
        data: {
          userId: req.user!.sub,
          action: 'DELETE',
          entity: 'Payslip',
          entityId: id,
          oldValues: {
            employeeId: payslip.employeeId,
            employeeNumber: payslip.employee.employeeNumber,
            name: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
            periodLabel: payslip.periodLabel,
            year: payslip.year,
            sheetName: payslip.sheetName,
            filename: payslip.filename,
            netPay: payslip.netPay,
            storagePath: payslip.storagePath,
          },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      })
      .catch(() => {});

    res.json({ success: true, message: 'Payslip deleted.' });
  } catch (err) {
    logger.error('deletePayslip:', err);
    res.status(500).json({ success: false, message: 'Failed to delete payslip.' });
  }
}
