import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { ApprovalStatus, OvertimeConversionType } from '@prisma/client';
import { notificationService } from '../services/notification.service';
import { canReviewAsDeptTier, getApprovalEmployeeWhere, getHeadedDepartmentIds } from '../utils/departmentHead';
import { getReviewerLabel } from '../utils/reviewerLabel';
import { hasAnyRole, isHrOrAdmin } from '../utils/roles';

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

    const totalAvailable = records.reduce((s, r) => s + Math.max(0, r.minutes - (pendingByRecord.get(r.id) ?? 0)), 0);
    const toConvert = requestedMinutes === undefined ? totalAvailable : Number(requestedMinutes);
    const minMinutes = conversionType === 'CTO' ? CTO_MIN_MINUTES : CDO_MIN_MINUTES;

    if (!Number.isInteger(toConvert) || toConvert <= 0) {
      res.status(400).json({ success: false, message: 'Minutes to convert must be a positive whole number.' });
      return;
    }
    if (conversionType === 'CDO' && toConvert !== CDO_MIN_MINUTES) {
      res.status(400).json({ success: false, message: 'CDO conversion requires exactly 8 hours.' });
      return;
    }
    if (toConvert < minMinutes) {
      res.status(400).json({ success: false, message: `Minimum ${minMinutes / 60} hours required for ${conversionType} conversion.` });
      return;
    }
    if (toConvert > totalAvailable) {
      res.status(400).json({ success: false, message: `Cannot convert more than available credits (${(totalAvailable / 60).toFixed(1)}h).` });
      return;
    }

    const allocations: Array<{ overtimeId: string; minutes: number }> = [];
    let remainingToAllocate = toConvert;
    const orderedRecords = [...records].sort((a, b) => {
      const expiryDiff = (a.approvedExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER)
        - (b.approvedExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER);
      if (expiryDiff !== 0) return expiryDiff;
      const dateDiff = a.date.getTime() - b.date.getTime();
      return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
    });

    for (const record of orderedRecords) {
      if (remainingToAllocate <= 0) break;
      const availableMinutes = Math.max(0, record.minutes - (pendingByRecord.get(record.id) ?? 0));
      const allocatedMinutes = Math.min(availableMinutes, remainingToAllocate);
      if (allocatedMinutes <= 0) continue;

      allocations.push({ overtimeId: record.id, minutes: allocatedMinutes });
      remainingToAllocate -= allocatedMinutes;
    }

    if (remainingToAllocate !== 0) {
      res.status(409).json({ success: false, message: 'Available overtime credits changed. Please refresh and try again.' });
      return;
    }

    const conversions = await prisma.$transaction(
      allocations.map((allocation) => prisma.overtimeConversion.create({
        data: {
          employeeId,
          overtimeId: allocation.overtimeId,
          conversionType: conversionType as OvertimeConversionType,
          minutesToConvert: allocation.minutes,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        },
      })),
    );

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
    if (!isHrOrAdmin(req.user) && hasAnyRole(req.user, 'DEPARTMENT_HEAD', 'MANAGING_DIRECTOR')) {
      const empWhere = await getApprovalEmployeeWhere({
        userId: req.user!.sub,
        isDeptHead: hasAnyRole(req.user, 'DEPARTMENT_HEAD'),
        isManagingDirector: hasAnyRole(req.user, 'MANAGING_DIRECTOR'),
      });
      if (!empWhere) { res.json({ success: true, data: [], meta: { total: 0 } }); return; }
      where.employee = empWhere;
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
    const record = await prisma.overtimeRecord.findUnique({ where: { id }, include: { employee: true } });
    if (!record) {
      res.status(404).json({ success: false, message: 'Overtime not found.' }); return;
    }

    // Ensure dept head / MD only reviews within scope, and not their own
    if (!isHrOrAdmin(req.user) && hasAnyRole(req.user, 'DEPARTMENT_HEAD', 'MANAGING_DIRECTOR')) {
      if (record.employee.userId === req.user!.sub) {
        res.status(403).json({ success: false, message: 'You cannot approve your own overtime. Please contact HR.' }); return;
      }
      const allowed = await canReviewAsDeptTier({
        reviewerUserId: req.user!.sub,
        employeeUserId: record.employee.userId,
        employeeDepartmentId: record.employee.departmentId,
        isDeptHead: hasAnyRole(req.user, 'DEPARTMENT_HEAD'),
        isManagingDirector: hasAnyRole(req.user, 'MANAGING_DIRECTOR'),
      });
      if (!allowed) {
        res.status(403).json({ success: false, message: 'You can only review overtime within your approval scope.' }); return;
      }
    }

    // HR/Admin cannot approve their own overtime
    if (isHrOrAdmin(req.user)) {
      if (record.employeeId === req.user!.employeeId) {
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
      reviewer: hasAnyRole(req.user, 'MANAGING_DIRECTOR') && !hasAnyRole(req.user, 'DEPARTMENT_HEAD')
        ? 'Managing Director'
        : hasAnyRole(req.user, 'DEPARTMENT_HEAD')
          ? 'Department Head'
          : req.user!.role,
    }, await getReviewerLabel(req.user!.sub, req.user!.role));

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
    const where: any = {};
    if (status) where.status = status;
    if (conversionType) where.conversionType = conversionType;
    // Dept head / MD: scoped; HR/Admin: all employees
    if (!isHrOrAdmin(req.user) && hasAnyRole(req.user, 'DEPARTMENT_HEAD', 'MANAGING_DIRECTOR')) {
      const empWhere = await getApprovalEmployeeWhere({
        userId: req.user!.sub,
        isDeptHead: hasAnyRole(req.user, 'DEPARTMENT_HEAD'),
        isManagingDirector: hasAnyRole(req.user, 'MANAGING_DIRECTOR'),
      });
      if (empWhere) where.employee = empWhere;
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

    // Dept head / MD: scoped, cannot approve own
    if (!isHrOrAdmin(req.user) && hasAnyRole(req.user, 'DEPARTMENT_HEAD', 'MANAGING_DIRECTOR')) {
      if (existing.employee.userId === req.user!.sub) {
        res.status(403).json({ success: false, message: 'You cannot approve your own conversion. Please contact HR.' }); return;
      }
      const allowed = await canReviewAsDeptTier({
        reviewerUserId: req.user!.sub,
        employeeUserId: existing.employee.userId,
        employeeDepartmentId: existing.employee.departmentId,
        isDeptHead: hasAnyRole(req.user, 'DEPARTMENT_HEAD'),
        isManagingDirector: hasAnyRole(req.user, 'MANAGING_DIRECTOR'),
      });
      if (!allowed) {
        res.status(403).json({ success: false, message: 'You can only review conversions within your approval scope.' }); return;
      }
    }

    // HR/Admin cannot approve their own conversion request
    if (isHrOrAdmin(req.user) && existing.employeeId === req.user!.employeeId) {
      res.status(403).json({ success: false, message: 'You cannot approve your own request.' }); return;
    }

    // Build update data — store reviewer in role-specific field so the log shows who acted
    const updateData: any = {
      status: status as ApprovalStatus,
      reviewerNotes: notes,
    };
    if (hasAnyRole(req.user, 'DEPARTMENT_HEAD', 'MANAGING_DIRECTOR') && !isHrOrAdmin(req.user)) {
      updateData.deptHeadStatus = status as ApprovalStatus;
      updateData.deptHeadAt = new Date();
    } else if (hasAnyRole(req.user, 'HR') && !hasAnyRole(req.user, 'ADMIN')) {
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

    const reviewerLabelRole = hasAnyRole(req.user, 'MANAGING_DIRECTOR') && !hasAnyRole(req.user, 'DEPARTMENT_HEAD')
      ? 'MANAGING_DIRECTOR'
      : hasAnyRole(req.user, 'DEPARTMENT_HEAD')
        ? 'DEPARTMENT_HEAD'
        : role;
    await notificationService.notifyEmployee(conversion.employeeId, 'APPROVAL_RESULT', {
      type: `${conversion.conversionType} Conversion`,
      status,
      reviewer: reviewerLabelRole === 'DEPARTMENT_HEAD'
        ? 'Department Head'
        : reviewerLabelRole === 'MANAGING_DIRECTOR'
          ? 'Managing Director'
          : role,
    }, await getReviewerLabel(req.user!.sub, reviewerLabelRole));

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
