import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { ApprovalStatus, OvertimeConversionType } from '@prisma/client';
import { notificationService } from '../services/notification.service';
import { getHeadedDepartmentIds } from '../utils/departmentHead';

const CTO_MIN_MINUTES = 4 * 60;  // 4 hours
const CDO_MIN_MINUTES = 8 * 60;  // 8 hours
const MIN_FILEABLE_OT_MINUTES = 60; // 1 hour minimum to file OT

export async function getMyOvertime(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Unfiled records older than 15 days are considered expired and hidden
  const filingDeadline = new Date();
  filingDeadline.setDate(filingDeadline.getDate() - 15);

  try {
    const where: any = {
      employeeId,
      // Hide expired unfiled drafts and unfiled OT under the 1-hour filing minimum
      NOT: [
        { isFiled: false, createdAt: { lt: filingDeadline } },
        { isFiled: false, minutes: { lt: MIN_FILEABLE_OT_MINUTES } },
      ],
    };
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      prisma.overtimeRecord.findMany({
        where,
        include: { conversions: true },
        orderBy: { date: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.overtimeRecord.count({ where }),
    ]);

    res.json({ success: true, data: records, meta: { total } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch overtime.' });
  }
}

export async function getOvertimeCredits(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    const now = new Date();
    const [rawCredits, pendingConversions] = await Promise.all([
      prisma.overtimeRecord.findMany({
        where: { employeeId, status: ApprovalStatus.APPROVED, isConverted: false, approvedExpiry: { gt: now } },
        orderBy: { approvedExpiry: 'asc' },
      }),
      prisma.overtimeConversion.findMany({
        where: { employeeId, status: 'PENDING' },
        select: { overtimeId: true, minutesToConvert: true },
      }),
    ]);

    // Sum pending committed minutes per OT record to compute true available balance
    const pendingByRecord = new Map<string, number>();
    for (const p of pendingConversions) {
      pendingByRecord.set(p.overtimeId, (pendingByRecord.get(p.overtimeId) ?? 0) + p.minutesToConvert);
    }

    const credits = rawCredits
      .map((r) => ({ ...r, minutes: r.minutes - (pendingByRecord.get(r.id) ?? 0) }))
      .filter((r) => r.minutes > 0);

    const totalMinutes = credits.reduce((s, c) => s + c.minutes, 0);

    res.json({
      success: true,
      data: {
        records: credits,
        totalMinutes,
        totalHours: (totalMinutes / 60).toFixed(2),
        canConvertCTO: totalMinutes >= CTO_MIN_MINUTES,
        canConvertCDO: totalMinutes >= CDO_MIN_MINUTES,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch credits.' });
  }
}

export async function convertOvertime(req: AuthRequest, res: Response): Promise<void> {
  const { conversionType, overtimeIds, minutesToConvert: requestedMinutes, scheduledDate } = req.body;
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  if (!['CTO', 'CDO'].includes(conversionType)) {
    res.status(400).json({ success: false, message: 'Invalid conversion type.' });
    return;
  }

  const ids: string[] = Array.isArray(overtimeIds) ? overtimeIds : (overtimeIds ? [overtimeIds] : []);
  if (!ids.length) {
    res.status(400).json({ success: false, message: 'No overtime records selected.' });
    return;
  }

  try {
    const records = await prisma.overtimeRecord.findMany({
      where: { id: { in: ids }, employeeId, status: 'APPROVED', isConverted: false },
    });

    if (records.length !== ids.length) {
      res.status(404).json({ success: false, message: 'One or more overtime records not found or not eligible.' });
      return;
    }

    // Sum pending committed minutes per record to compute true available balance
    const pendingConversions = await prisma.overtimeConversion.findMany({
      where: { overtimeId: { in: ids }, status: 'PENDING' },
      select: { overtimeId: true, minutesToConvert: true },
    });
    const pendingByRecord = new Map<string, number>();
    for (const p of pendingConversions) {
      pendingByRecord.set(p.overtimeId, (pendingByRecord.get(p.overtimeId) ?? 0) + p.minutesToConvert);
    }

    const totalAvailable = records.reduce((s, r) => s + r.minutes - (pendingByRecord.get(r.id) ?? 0), 0);
    const toConvert = requestedMinutes ?? totalAvailable;
    const minMinutes = conversionType === 'CTO' ? CTO_MIN_MINUTES : CDO_MIN_MINUTES;

    if (toConvert < minMinutes) {
      res.status(400).json({ success: false, message: `Minimum ${minMinutes / 60} hours required for ${conversionType} conversion.` });
      return;
    }
    if (toConvert > totalAvailable) {
      res.status(400).json({ success: false, message: `Cannot convert more than available credits (${(totalAvailable / 60).toFixed(1)}h).` });
      return;
    }

    // Single record → allow partial conversion (user-specified minutesToConvert)
    // Multiple records → convert each record in full
    const conversions = [];
    if (records.length === 1) {
      const conversion = await prisma.overtimeConversion.create({
        data: {
          employeeId,
          overtimeId: records[0].id,
          conversionType: conversionType as OvertimeConversionType,
          minutesToConvert: toConvert,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        },
      });
      conversions.push(conversion);
    } else {
      for (const record of records) {
        const conversion = await prisma.overtimeConversion.create({
          data: {
            employeeId,
            overtimeId: record.id,
            conversionType: conversionType as OvertimeConversionType,
            minutesToConvert: record.minutes,
            scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
          },
        });
        conversions.push(conversion);
      }
    }

    await notificationService.notifyDeptHead(employeeId, 'CTO_REQUEST', { conversionIds: conversions.map((c) => c.id) });

    res.status(201).json({ success: true, data: conversions });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to submit conversion.' });
  }
}

export async function fileOvertimeRequest(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { reason } = req.body;
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }
  if (!reason?.trim()) { res.status(400).json({ success: false, message: 'Reason is required.' }); return; }

  try {
    const record = await prisma.overtimeRecord.findUnique({ where: { id } });
    if (!record || record.employeeId !== employeeId) {
      res.status(404).json({ success: false, message: 'Overtime record not found.' }); return;
    }
    if (record.isFiled) {
      res.status(400).json({ success: false, message: 'Overtime already filed for approval.' }); return;
    }
    if (record.minutes < MIN_FILEABLE_OT_MINUTES) {
      res.status(400).json({ success: false, message: 'Overtime must be at least 1 hour to file.' }); return;
    }

    // Check 15-day filing window
    const filingDeadline = new Date(record.createdAt);
    filingDeadline.setDate(filingDeadline.getDate() + 15);
    if (new Date() > filingDeadline) {
      res.status(400).json({ success: false, message: 'Filing window has expired. Overtime records must be filed within 15 days.' }); return;
    }

    const updated = await prisma.overtimeRecord.update({
      where: { id },
      data: { isFiled: true, reason: reason.trim(), status: 'PENDING' },
    });

    await notificationService.notifyDeptHead(employeeId, 'OVERTIME_REQUEST', { overtimeId: id });

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to file overtime request.' });
  }
}

export async function getMyConversions(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }
  try {
    const conversions = await prisma.overtimeConversion.findMany({
      where: { employeeId },
      include: { overtime: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: conversions });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch conversions.' });
  }
}

export async function getAllOvertime(req: AuthRequest, res: Response): Promise<void> {
  const { status, departmentId, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    if (status) where.status = status;
    // Always filter to formally filed records only — drafts are private to the employee
    where.isFiled = true;
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const headedIds = await getHeadedDepartmentIds(req.user!.sub);
      if (!headedIds.length) { res.json({ success: true, data: [], meta: { total: 0 } }); return; }
      // Exclude the dept head's own overtime — those go to HR
      where.employee = { departmentId: { in: headedIds }, userId: { not: req.user!.sub } };
    } else if (departmentId) {
      where.employee = { departmentId };
    }

    const [records, total] = await Promise.all([
      prisma.overtimeRecord.findMany({
        where,
        include: { employee: { include: { department: true } }, conversions: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.overtimeRecord.count({ where }),
    ]);

    res.json({ success: true, data: records, meta: { total } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch overtime records.' });
  }
}

export async function reviewOvertime(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid status.' });
    return;
  }

  try {
    // Ensure dept head only reviews headed departments' overtime, and not their own
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const headedIds = await getHeadedDepartmentIds(req.user!.sub);
      const record = await prisma.overtimeRecord.findUnique({ where: { id }, include: { employee: true } });
      if (!record || !record.employee.departmentId || !headedIds.includes(record.employee.departmentId)) {
        res.status(403).json({ success: false, message: 'You can only review overtime from your department.' }); return;
      }
      if (record.employee.userId === req.user!.sub) {
        res.status(403).json({ success: false, message: 'You cannot approve your own overtime. Please contact HR.' }); return;
      }
    }

    // HR/Admin cannot approve their own overtime
    if (req.user!.role === 'HR' || req.user!.role === 'ADMIN') {
      const record = await prisma.overtimeRecord.findUnique({ where: { id }, select: { employeeId: true } });
      if (record?.employeeId === req.user!.employeeId) {
        res.status(403).json({ success: false, message: 'You cannot approve your own request.' }); return;
      }
    }

    const updateData: any = {
      status: status as ApprovalStatus,
      reviewedBy: req.user!.sub,
      reviewedAt: new Date(),
      reviewerNotes: notes,
    };

    if (status === 'APPROVED') {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 6);
      updateData.approvedExpiry = expiry;
    }

    const overtime = await prisma.overtimeRecord.update({
      where: { id },
      data: updateData,
      include: { employee: true },
    });

    await notificationService.notifyEmployee(overtime.employeeId, 'APPROVAL_RESULT', {
      type: 'Overtime Request',
      status,
      reviewer: req.user!.role === 'DEPARTMENT_HEAD' ? 'Department Head' : req.user!.role,
    });

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
        entity: 'OvertimeRecord',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    res.json({ success: true, data: overtime });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review overtime.' });
  }
}

export async function getConversions(req: AuthRequest, res: Response): Promise<void> {
  const { status, departmentId, conversionType, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const role = req.user!.role;
    const where: any = {};
    if (status) where.status = status;
    if (conversionType) where.conversionType = conversionType;
    // Dept head: scoped to headed departments; HR/Admin: all employees
    if (role === 'DEPARTMENT_HEAD') {
      const headedIds = await getHeadedDepartmentIds(req.user!.sub);
      // Exclude the dept head's own conversions — those go to HR
      if (headedIds.length) where.employee = { departmentId: { in: headedIds }, userId: { not: req.user!.sub } };
      else where.employee = { departmentId: { in: [] } };
    } else if (departmentId) {
      where.employee = { departmentId };
    }
    const [conversions, total] = await Promise.all([
      prisma.overtimeConversion.findMany({
        where,
        include: { employee: { include: { department: true } }, overtime: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.overtimeConversion.count({ where }),
    ]);
    res.json({ success: true, data: conversions, meta: { total } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch conversions.' });
  }
}

export async function reviewConversion(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body;
  try {
    const existing = await prisma.overtimeConversion.findUnique({
      where: { id },
      include: { overtime: true, employee: true },
    });
    if (!existing) { res.status(404).json({ success: false, message: 'Conversion not found.' }); return; }
    if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
      res.status(400).json({ success: false, message: 'Conversion already reviewed.' }); return;
    }

    const role = req.user!.role;

    // Dept head: scoped to headed departments only, and cannot approve their own
    if (role === 'DEPARTMENT_HEAD') {
      const headedIds = await getHeadedDepartmentIds(req.user!.sub);
      if (!existing.employee.departmentId || !headedIds.includes(existing.employee.departmentId)) {
        res.status(403).json({ success: false, message: 'You can only review conversions from your department.' }); return;
      }
      if (existing.employee.userId === req.user!.sub) {
        res.status(403).json({ success: false, message: 'You cannot approve your own conversion. Please contact HR.' }); return;
      }
    }

    // HR/Admin cannot approve their own conversion request
    if ((role === 'HR' || role === 'ADMIN') && existing.employeeId === req.user!.employeeId) {
      res.status(403).json({ success: false, message: 'You cannot approve your own request.' }); return;
    }

    // Build update data — store reviewer in role-specific field so the log shows who acted
    const updateData: any = {
      status: status as ApprovalStatus,
      reviewerNotes: notes,
    };
    if (role === 'DEPARTMENT_HEAD') {
      updateData.deptHeadStatus = status as ApprovalStatus;
      updateData.deptHeadAt = new Date();
    } else if (role === 'HR') {
      updateData.hrStatus = status as ApprovalStatus;
      updateData.hrAt = new Date();
    } else {
      updateData.adminStatus = status as ApprovalStatus;
      updateData.adminAt = new Date();
    }

    const conversion = await prisma.overtimeConversion.update({ where: { id }, data: updateData });

    if (status === 'APPROVED') {
      const overtime = await prisma.overtimeRecord.findUnique({ where: { id: conversion.overtimeId } });
      if (overtime) {
        const remaining = overtime.minutes - conversion.minutesToConvert;
        await prisma.overtimeRecord.update({
          where: { id: conversion.overtimeId },
          data: { minutes: Math.max(0, remaining), isConverted: remaining <= 0 },
        });
      }
    }
    // On REJECTED: credits untouched at submission — nothing to restore.

    await notificationService.notifyEmployee(conversion.employeeId, 'APPROVAL_RESULT', {
      type: `${conversion.conversionType} Conversion`,
      status,
      reviewer: role === 'DEPARTMENT_HEAD' ? 'Department Head' : role,
    });

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
        entity: 'OvertimeConversion',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    res.json({ success: true, data: conversion });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review conversion.' });
  }
}
