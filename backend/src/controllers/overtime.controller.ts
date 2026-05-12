import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { ApprovalStatus, OvertimeConversionType } from '@prisma/client';
import { notificationService } from '../services/notification.service';

const CTO_MIN_MINUTES = 4 * 60;  // 4 hours
const CDO_MIN_MINUTES = 8 * 60;  // 8 hours

export async function getMyOvertime(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = { employeeId };
    if (status) where.status = status;

    const [records, total] = await Promise.all([
      prisma.overtimeRecord.findMany({
        where,
        include: { conversion: true },
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
    const credits = await prisma.overtimeRecord.findMany({
      where: {
        employeeId,
        status: ApprovalStatus.APPROVED,
        isConverted: false,
        approvedExpiry: { gt: now },
      },
      orderBy: { approvedExpiry: 'asc' },
    });

    const totalMinutes = credits.reduce((s, c) => s + c.minutes, 0);

    res.json({
      success: true,
      data: {
        credits,
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
  const { overtimeId, conversionType, scheduledDate } = req.body;
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  if (!['CTO', 'CDO'].includes(conversionType)) {
    res.status(400).json({ success: false, message: 'Invalid conversion type.' });
    return;
  }

  try {
    const overtime = await prisma.overtimeRecord.findFirst({
      where: { id: overtimeId, employeeId, status: 'APPROVED', isConverted: false },
    });

    if (!overtime) { res.status(404).json({ success: false, message: 'Overtime record not found or not eligible.' }); return; }

    const minMinutes = conversionType === 'CTO' ? CTO_MIN_MINUTES : CDO_MIN_MINUTES;
    if (overtime.minutes < minMinutes) {
      res.status(400).json({
        success: false,
        message: `Minimum ${minMinutes / 60} hours required for ${conversionType} conversion.`,
      });
      return;
    }

    const conversion = await prisma.overtimeConversion.create({
      data: {
        employeeId,
        overtimeId: overtime.id,
        conversionType: conversionType as OvertimeConversionType,
        minutesToConvert: overtime.minutes,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      },
    });

    await notificationService.notifyDeptHead(employeeId, 'CTO_REQUEST', { conversionId: conversion.id });

    res.status(201).json({ success: true, data: conversion });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to submit conversion.' });
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
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const dept = await prisma.department.findFirst({ where: { headId: req.user!.sub } });
      if (dept) where.employee = { departmentId: dept.id };
    } else if (departmentId) {
      where.employee = { departmentId };
    }

    const [records, total] = await Promise.all([
      prisma.overtimeRecord.findMany({
        where,
        include: { employee: { include: { department: true } }, conversion: true },
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
    const updateData: any = {
      status: status as ApprovalStatus,
      reviewedBy: req.user!.sub,
      reviewedAt: new Date(),
      reviewerNotes: notes,
    };

    if (status === 'APPROVED') {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
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
    });

    res.json({ success: true, data: overtime });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review overtime.' });
  }
}

export async function getConversions(req: AuthRequest, res: Response): Promise<void> {
  const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const where: any = {};
    if (status) where.status = status;
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
    const conversion = await prisma.overtimeConversion.update({
      where: { id },
      data: {
        status: status as ApprovalStatus,
        hrStatus: status as ApprovalStatus,
        hrAt: new Date(),
        reviewerNotes: notes,
      },
    });

    if (status === 'APPROVED') {
      await prisma.overtimeRecord.update({
        where: { id: conversion.overtimeId },
        data: { isConverted: true },
      });
    }

    await notificationService.notifyEmployee(conversion.employeeId, 'APPROVAL_RESULT', {
      type: `${conversion.conversionType} Conversion`,
      status,
    });

    res.json({ success: true, data: conversion });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review conversion.' });
  }
}
