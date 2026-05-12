import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { ApprovalStatus, LeaveType } from '@prisma/client';
import { notificationService } from '../services/notification.service';

export async function fileLeave(req: AuthRequest, res: Response): Promise<void> {
  const { leaveType, startDate, endDate, reason } = req.body;
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const year = start.getFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_year_leaveType: { employeeId, year, leaveType: leaveType as LeaveType } },
    });

    if (!balance || (balance.totalDays - balance.usedDays - balance.pendingDays) < totalDays) {
      res.status(400).json({ success: false, message: 'Insufficient leave balance.' });
      return;
    }

    const leave = await prisma.leaveRequest.create({
      data: { employeeId, leaveType, startDate: start, endDate: end, totalDays, reason },
    });

    await prisma.leaveBalance.update({
      where: { employeeId_year_leaveType: { employeeId, year, leaveType: leaveType as LeaveType } },
      data: { pendingDays: { increment: totalDays } },
    });

    await notificationService.notifyDeptHead(employeeId, 'LEAVE_REQUEST', { leaveId: leave.id });

    res.status(201).json({ success: true, data: leave });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to file leave.' });
  }
}

export async function getMyLeaves(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: leaves });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch leaves.' });
  }
}

export async function getMyBalances(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
  try {
    const balances = await prisma.leaveBalance.findMany({ where: { employeeId, year } });
    res.json({ success: true, data: balances });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch balances.' });
  }
}

export async function getLeaveCalendar(req: AuthRequest, res: Response): Promise<void> {
  const { year, month, departmentId } = req.query as Record<string, string>;
  const y = parseInt(year || String(new Date().getFullYear()));
  const m = parseInt(month || String(new Date().getMonth() + 1));
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);

  try {
    const where: any = {
      startDate: { lte: end },
      endDate: { gte: start },
      status: 'APPROVED',
    };

    const isEmployee = req.user!.role === 'EMPLOYEE';
    if (isEmployee) {
      where.employeeId = req.user!.employeeId;
    } else if (departmentId) {
      where.employee = { departmentId };
    }

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
    });

    res.json({ success: true, data: leaves });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch calendar.' });
  }
}

export async function cancelLeave(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const employeeId = req.user!.employeeId;
  try {
    const leave = await prisma.leaveRequest.findFirst({ where: { id, employeeId } });
    if (!leave) { res.status(404).json({ success: false, message: 'Leave not found.' }); return; }
    if (leave.status !== 'PENDING') { res.status(400).json({ success: false, message: 'Only pending leaves can be cancelled.' }); return; }

    await prisma.leaveRequest.update({ where: { id }, data: { status: ApprovalStatus.CANCELLED } });

    const year = leave.startDate.getFullYear();
    await prisma.leaveBalance.update({
      where: { employeeId_year_leaveType: { employeeId: employeeId!, year, leaveType: leave.leaveType } },
      data: { pendingDays: { decrement: leave.totalDays } },
    });

    res.json({ success: true, message: 'Leave cancelled.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to cancel leave.' });
  }
}

export async function getAllLeaves(req: AuthRequest, res: Response): Promise<void> {
  const { status, departmentId, leaveType, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    if (status) where.status = status;
    if (leaveType) where.leaveType = leaveType;
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const dept = await prisma.department.findFirst({ where: { headId: req.user!.sub } });
      if (dept) where.employee = { departmentId: dept.id };
    } else if (departmentId) {
      where.employee = { departmentId };
    }

    const [leaves, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: { employee: { include: { department: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    res.json({ success: true, data: leaves, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch leaves.' });
  }
}

export async function reviewLeave(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Invalid status.' });
    return;
  }

  try {
    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) { res.status(404).json({ success: false, message: 'Leave not found.' }); return; }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        deptHeadStatus: status as ApprovalStatus,
        deptHeadId: req.user!.sub,
        deptHeadAt: new Date(),
        deptHeadNotes: notes,
        status: status === 'REJECTED' ? ApprovalStatus.REJECTED : ApprovalStatus.PENDING,
      },
    });

    if (status === 'REJECTED') {
      const year = leave.startDate.getFullYear();
      await prisma.leaveBalance.update({
        where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: leave.leaveType } },
        data: { pendingDays: { decrement: leave.totalDays } },
      });
    }

    await notificationService.notifyEmployee(leave.employeeId, 'APPROVAL_RESULT', {
      type: 'Leave Request',
      status,
      reviewer: 'Department Head',
    });

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review leave.' });
  }
}

export async function hrReviewLeave(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body;
  try {
    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) { res.status(404).json({ success: false, message: 'Leave not found.' }); return; }
    if (leave.deptHeadStatus !== 'APPROVED') {
      res.status(400).json({ success: false, message: 'Department head approval is required first.' });
      return;
    }

    const finalStatus = status as ApprovalStatus;
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        hrStatus: finalStatus,
        hrId: req.user!.sub,
        hrAt: new Date(),
        hrNotes: notes,
        status: finalStatus,
      },
    });

    if (finalStatus === 'APPROVED') {
      const year = leave.startDate.getFullYear();
      await prisma.leaveBalance.update({
        where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: leave.leaveType } },
        data: { pendingDays: { decrement: leave.totalDays }, usedDays: { increment: leave.totalDays } },
      });
    } else {
      const year = leave.startDate.getFullYear();
      await prisma.leaveBalance.update({
        where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: leave.leaveType } },
        data: { pendingDays: { decrement: leave.totalDays } },
      });
    }

    await notificationService.notifyEmployee(leave.employeeId, 'APPROVAL_RESULT', {
      type: 'Leave Request',
      status,
      reviewer: 'HR',
    });

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review leave.' });
  }
}
