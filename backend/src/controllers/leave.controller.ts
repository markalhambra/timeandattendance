import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { ApprovalStatus, LeaveType, LeaveDuration } from '@prisma/client';
import { notificationService } from '../services/notification.service';
import { phtYear, phtMonth } from '../utils/timezone';

const LEAVE_BALANCE_DEFAULTS: Record<LeaveType, number> = {
  SICK: 15,
  VACATION: 15,
  PML: 7,
  SML: 3,
  EMERGENCY: 15,
  SOLO_PARENT: 7,
  MATERNITY: 105,
  PATERNITY: 7,
  BEREAVEMENT: 5,
  MAGNA_CARTA_WOMEN: 60,
  LWOP: 0, // no balance tracking — unpaid leave
};

const LEAVE_TYPES = Object.keys(LEAVE_BALANCE_DEFAULTS) as LeaveType[];

// SICK and EMERGENCY share one 15-day pool; all balance ops use the SICK row.
function poolLeaveType(lt: LeaveType): LeaveType {
  return lt === 'EMERGENCY' ? 'SICK' : lt;
}

async function ensureLeaveBalances(employeeId: string, year: number): Promise<void> {
  const existing = await prisma.leaveBalance.count({ where: { employeeId, year } });
  if (existing >= LEAVE_TYPES.length) return;

  // Carry forward remaining balance from previous year if it exists; otherwise use defaults (new employee)
  const prevBalances = await prisma.leaveBalance.findMany({ where: { employeeId, year: year - 1 } });
  const prevMap = new Map(prevBalances.map((b) => [b.leaveType, b]));

  await prisma.leaveBalance.createMany({
    data: LEAVE_TYPES.map((leaveType) => {
      const prev = prevMap.get(leaveType);
      const totalDays = prev
        ? Math.max(0, prev.totalDays - prev.usedDays - prev.pendingDays)
        : LEAVE_BALANCE_DEFAULTS[leaveType];
      return { employeeId, year, leaveType, totalDays };
    }),
    skipDuplicates: true,
  });
}

export async function fileLeave(req: AuthRequest, res: Response): Promise<void> {
  const { leaveType, startDate, endDate, reason, leaveDuration = 'FULL_DAY' } = req.body;
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }

  try {
    // Enforce 6-month minimum tenure for EMPLOYEE role — LWOP is always allowed
    if (req.user!.role === 'EMPLOYEE' && leaveType !== 'LWOP') {
      const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { dateHired: true } });
      if (emp?.dateHired) {
        const eligibleAt = new Date(emp.dateHired);
        eligibleAt.setMonth(eligibleAt.getMonth() + 6);
        if (new Date() < eligibleAt) {
          const eligibleOn = eligibleAt.toISOString().split('T')[0];
          res.status(403).json({ success: false, message: `Leave filing is available after 6 months of service. You will be eligible on ${eligibleOn}. You may file Leave Without Pay (LWOP) in the meantime.` });
          return;
        }
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate half-day: only allowed for VL, SL, EMERGENCY
    const HALF_DAY_TYPES: LeaveType[] = ['SICK', 'VACATION', 'EMERGENCY'];
    const isHalfDay = leaveDuration !== 'FULL_DAY';
    if (isHalfDay && !HALF_DAY_TYPES.includes(leaveType as LeaveType)) {
      res.status(400).json({ success: false, message: 'Half-day leave is only allowed for Vacation, Sick, and Emergency Leave.' });
      return;
    }
    // Half-day must be a single day (start === end)
    if (isHalfDay && startDate !== endDate) {
      res.status(400).json({ success: false, message: 'Half-day leave must be for a single day (start and end date must be the same).' });
      return;
    }

    const totalDays = isHalfDay ? 0.5 : Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const year = start.getFullYear();

    // LWOP has no balance to check or deduct — skip balance logic entirely
    if (leaveType !== 'LWOP') {
      await ensureLeaveBalances(employeeId, year);
      const poolType = poolLeaveType(leaveType as LeaveType);
      const balance = await prisma.leaveBalance.findUnique({
        where: { employeeId_year_leaveType: { employeeId, year, leaveType: poolType } },
      });

      if (!balance || (balance.totalDays - balance.usedDays - balance.pendingDays) < totalDays) {
        res.status(400).json({ success: false, message: 'Insufficient leave balance.' });
        return;
      }
    }

    const leave = await prisma.leaveRequest.create({
      data: { employeeId, leaveType, leaveDuration: leaveDuration as LeaveDuration, startDate: start, endDate: end, totalDays, reason },
    });

    if (leaveType !== 'LWOP') {
      const poolType = poolLeaveType(leaveType as LeaveType);
      await prisma.leaveBalance.update({
        where: { employeeId_year_leaveType: { employeeId, year, leaveType: poolType } },
        data: { pendingDays: { increment: totalDays } },
      });
    }

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

// SICK and EMERGENCY share one pool — mirror SICK values onto the EMERGENCY row
function mirrorEmergencyBalance(balances: any[]): any[] {
  const sick = balances.find((b) => b.leaveType === 'SICK');
  if (!sick) return balances;
  return balances.map((b) =>
    b.leaveType === 'EMERGENCY'
      ? { ...b, totalDays: sick.totalDays, usedDays: sick.usedDays, pendingDays: sick.pendingDays }
      : b,
  );
}

export async function getMyBalances(req: AuthRequest, res: Response): Promise<void> {
  const employeeId = req.user!.employeeId;
  if (!employeeId) { res.status(400).json({ success: false, message: 'Employee not found.' }); return; }
  const year = parseInt((req.query.year as string) || String(phtYear()));
  try {
    await ensureLeaveBalances(employeeId, year);
    const balances = await prisma.leaveBalance.findMany({ where: { employeeId, year } });
    res.json({ success: true, data: mirrorEmergencyBalance(balances) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch balances.' });
  }
}

export async function getLeaveCalendar(req: AuthRequest, res: Response): Promise<void> {
  const { year, month, departmentId } = req.query as Record<string, string>;
  const y = parseInt(year || String(phtYear()));
  const m = parseInt(month || String(phtMonth()));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));

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

    if (leave.leaveType !== 'LWOP') {
      const year = leave.startDate.getFullYear();
      await prisma.leaveBalance.update({
        where: { employeeId_year_leaveType: { employeeId: employeeId!, year, leaveType: poolLeaveType(leave.leaveType) } },
        data: { pendingDays: { decrement: leave.totalDays } },
      });
    }

    res.json({ success: true, message: 'Leave cancelled.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to cancel leave.' });
  }
}

export async function getAllLeaves(req: AuthRequest, res: Response): Promise<void> {
  const { status, departmentId, leaveType, startDate, endDate, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    if (status) where.status = status;
    if (leaveType) where.leaveType = leaveType;
    if (startDate || endDate) {
      where.startDate = {};
      if (endDate) where.startDate.lte = new Date(endDate);
      where.endDate = {};
      if (startDate) where.endDate.gte = new Date(startDate);
    }
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const deptId = req.user!.departmentId;
      if (!deptId) { res.json({ success: true, data: [], meta: { total: 0, page: parseInt(page), limit: parseInt(limit) } }); return; }
      // Exclude the dept head's own leave — those go to HR
      where.employee = { departmentId: deptId, userId: { not: req.user!.sub } };
      if (req.query.reviewed === 'true') {
        // History: leaves already finalized
        delete where.status;
        where.status = { not: 'PENDING' };
      } else {
        // Pending queue: leaves not yet finalized
        where.status = 'PENDING';
      }
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
    const leave = await prisma.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!leave) { res.status(404).json({ success: false, message: 'Leave not found.' }); return; }

    const role = req.user!.role;
    const isHrOrAdmin = role === 'HR' || role === 'ADMIN';

    // HR/Admin cannot approve their own leave
    if (isHrOrAdmin && leave.employeeId === req.user!.employeeId) {
      res.status(403).json({ success: false, message: 'You cannot approve your own request.' });
      return;
    }

    // Dept head: only own department, and only if not yet finalized
    if (role === 'DEPARTMENT_HEAD') {
      if (leave.status !== 'PENDING') {
        res.status(400).json({ success: false, message: 'Leave has already been reviewed.' }); return;
      }
      if (leave.employee.userId === req.user!.sub) {
        res.status(403).json({ success: false, message: 'You cannot approve your own leave. Please contact HR.' }); return;
      }
      const deptId = req.user!.departmentId;
      if (!deptId || leave.employee.departmentId !== deptId) {
        res.status(403).json({ success: false, message: 'You can only review leaves from your department.' }); return;
      }
    }

    // HR/Admin: can act as both dept head and final approver in one step
    if (isHrOrAdmin && status === 'APPROVED') {
      const year = leave.startDate.getFullYear();
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: {
          deptHeadStatus: ApprovalStatus.APPROVED,
          deptHeadId: req.user!.sub,
          deptHeadAt: new Date(),
          hrStatus: ApprovalStatus.APPROVED,
          hrId: req.user!.sub,
          hrAt: new Date(),
          hrNotes: notes,
          status: ApprovalStatus.APPROVED,
        },
      });
      if (leave.leaveType !== 'LWOP') {
        await prisma.leaveBalance.update({
          where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: poolLeaveType(leave.leaveType) } },
          data: { pendingDays: { decrement: leave.totalDays }, usedDays: { increment: leave.totalDays } },
        });
      }
      await notificationService.notifyEmployee(leave.employeeId, 'APPROVAL_RESULT', { type: 'Leave Request', status, reviewer: role });
      prisma.auditLog.create({ data: { userId: req.user!.sub, action: 'APPROVE', entity: 'LeaveRequest', entityId: id, ipAddress: req.ip, userAgent: req.headers['user-agent'] } }).catch(() => {});
      res.json({ success: true, data: updated }); return;
    }

    if (isHrOrAdmin && status === 'REJECTED') {
      const year = leave.startDate.getFullYear();
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: {
          deptHeadStatus: leave.deptHeadStatus ?? ApprovalStatus.REJECTED,
          hrStatus: ApprovalStatus.REJECTED,
          hrId: req.user!.sub,
          hrAt: new Date(),
          hrNotes: notes,
          status: ApprovalStatus.REJECTED,
        },
      });
      if (leave.leaveType !== 'LWOP') {
        await prisma.leaveBalance.update({
          where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: poolLeaveType(leave.leaveType) } },
          data: { pendingDays: { decrement: leave.totalDays } },
        });
      }
      await notificationService.notifyEmployee(leave.employeeId, 'APPROVAL_RESULT', { type: 'Leave Request', status, reviewer: role });
      prisma.auditLog.create({ data: { userId: req.user!.sub, action: 'REJECT', entity: 'LeaveRequest', entityId: id, ipAddress: req.ip, userAgent: req.headers['user-agent'] } }).catch(() => {});
      res.json({ success: true, data: updated }); return;
    }

    // Dept head finalizes in one step
    const year = leave.startDate.getFullYear();
    const finalStatus = status as ApprovalStatus;
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        deptHeadStatus: finalStatus,
        deptHeadId: req.user!.sub,
        deptHeadAt: new Date(),
        deptHeadNotes: notes,
        status: finalStatus,
      },
    });

    if (finalStatus === 'APPROVED') {
      if (leave.leaveType !== 'LWOP') {
        await prisma.leaveBalance.update({
          where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: poolLeaveType(leave.leaveType) } },
          data: { pendingDays: { decrement: leave.totalDays }, usedDays: { increment: leave.totalDays } },
        });
      }
    } else {
      if (leave.leaveType !== 'LWOP') {
        await prisma.leaveBalance.update({
          where: { employeeId_year_leaveType: { employeeId: leave.employeeId, year, leaveType: poolLeaveType(leave.leaveType) } },
          data: { pendingDays: { decrement: leave.totalDays } },
        });
      }
    }

    await notificationService.notifyEmployee(leave.employeeId, 'APPROVAL_RESULT', {
      type: 'Leave Request',
      status,
      reviewer: role === 'DEPARTMENT_HEAD' ? 'Department Head' : role,
    });

    prisma.auditLog.create({ data: { userId: req.user!.sub, action: finalStatus === 'APPROVED' ? 'APPROVE' : 'REJECT', entity: 'LeaveRequest', entityId: id, ipAddress: req.ip, userAgent: req.headers['user-agent'] } }).catch(() => {});

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to review leave.' });
  }
}

// ─── HR Leave Management ───────────────────────────────────────────────────────

/** GET /api/leave/employee/:employeeId/balances — HR views any employee's leave balances */
export async function getEmployeeLeaveBalances(req: AuthRequest, res: Response): Promise<void> {
  const { employeeId } = req.params;
  const year = parseInt((req.query.year as string) || String(phtYear()));
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, department: { select: { name: true } } },
    });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }

    await ensureLeaveBalances(employeeId, year);
    const balances = await prisma.leaveBalance.findMany({ where: { employeeId, year } });
    res.json({ success: true, data: mirrorEmergencyBalance(balances), employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch employee leave balances.' });
  }
}

/** POST /api/leave/employee/:employeeId/adjust — HR manually adds or deducts leave credits */
export async function adjustLeaveBalance(req: AuthRequest, res: Response): Promise<void> {
  const { employeeId } = req.params;
  const { leaveType, adjustmentAmount, reason } = req.body;

  if (!leaveType || adjustmentAmount === undefined || !reason?.trim()) {
    res.status(400).json({ success: false, message: 'leaveType, adjustmentAmount, and reason are required.' });
    return;
  }
  if (leaveType === 'LWOP') {
    res.status(400).json({ success: false, message: 'LWOP has no balance to adjust.' });
    return;
  }
  if (adjustmentAmount === 0) {
    res.status(400).json({ success: false, message: 'Adjustment amount cannot be zero.' });
    return;
  }

  const year = phtYear();
  try {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }

    await ensureLeaveBalances(employeeId, year);

    // SICK and EMERGENCY share a pool — adjust SICK row for both
    const targetType = poolLeaveType(leaveType as LeaveType);

    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_year_leaveType: { employeeId, year, leaveType: targetType } },
    });
    if (!balance) { res.status(404).json({ success: false, message: 'Leave balance not found.' }); return; }

    const previousBalance = balance.totalDays - balance.usedDays - balance.pendingDays;
    const newTotalDays = Math.max(0, balance.totalDays + adjustmentAmount);
    const newBalance = newTotalDays - balance.usedDays - balance.pendingDays;

    await prisma.leaveBalance.update({
      where: { employeeId_year_leaveType: { employeeId, year, leaveType: targetType } },
      data: { totalDays: newTotalDays },
    });

    await prisma.leaveAdjustment.create({
      data: {
        employeeId,
        leaveType: leaveType as LeaveType,
        year,
        adjustmentAmount,
        previousBalance,
        newBalance,
        reason: reason.trim(),
        adjustedBy: req.user!.sub,
        isSystemGenerated: false,
      },
    });

    res.json({ success: true, message: 'Leave balance adjusted successfully.', previousBalance, newBalance, adjustmentAmount });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to adjust leave balance.' });
  }
}

/** GET /api/leave/adjustments — HR views adjustment history */
export async function getLeaveAdjustments(req: AuthRequest, res: Response): Promise<void> {
  const { employeeId, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;

    const [adjustments, total] = await Promise.all([
      prisma.leaveAdjustment.findMany({
        where,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.leaveAdjustment.count({ where }),
    ]);

    // Enrich with adjustedBy user name
    const userIds = [...new Set(adjustments.filter((a) => a.adjustedBy).map((a) => a.adjustedBy!))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          include: { employee: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = adjustments.map((a) => ({
      ...a,
      adjustedByUser: a.adjustedBy ? userMap.get(a.adjustedBy) ?? null : null,
    }));

    res.json({ success: true, data: enriched, total, page: parseInt(page), limit: parseInt(limit) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch leave adjustments.' });
  }
}
