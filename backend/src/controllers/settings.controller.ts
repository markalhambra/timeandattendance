import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { SETTING_KEYS, settingsService, SettingKey } from '../services/settings.service';

function numInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function intInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function getOfficeSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const office = await settingsService.getOfficeSettings();
    res.json({ success: true, data: office });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load office settings.' });
  }
}

export async function getSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const raw = await settingsService.getAll();
    const approverId = raw[SETTING_KEYS.DEPT_HEAD_APPROVER_USER_ID]?.trim() || null;
    let deptHeadApprover: { id: string; email: string; role: string; name: string } | null = null;
    if (approverId) {
      const user = await prisma.user.findUnique({
        where: { id: approverId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      });
      if (user) {
        deptHeadApprover = {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.employee
            ? `${user.employee.firstName} ${user.employee.lastName}`
            : user.email,
        };
      }
    }

    res.json({
      success: true,
      data: {
        officeLat: parseFloat(raw[SETTING_KEYS.OFFICE_LAT]),
        officeLng: parseFloat(raw[SETTING_KEYS.OFFICE_LNG]),
        officeRadiusMeters: parseFloat(raw[SETTING_KEYS.OFFICE_RADIUS]),
        otThresholdHours: parseFloat(raw[SETTING_KEYS.OT_THRESHOLD_HOURS]),
        maxFailedLoginAttempts: parseInt(raw[SETTING_KEYS.MAX_FAILED_LOGINS], 10),
        lockoutDurationMinutes: parseInt(raw[SETTING_KEYS.LOCKOUT_DURATION_MINUTES], 10),
        deptHeadApproverUserId: approverId,
        deptHeadApprover,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const updates: Partial<Record<SettingKey, string>> = {};

    if (body.officeLat !== undefined) {
      const n = numInRange(body.officeLat, -90, 90);
      if (n === null) { res.status(400).json({ success: false, message: 'Invalid office latitude.' }); return; }
      updates[SETTING_KEYS.OFFICE_LAT] = String(n);
    }
    if (body.officeLng !== undefined) {
      const n = numInRange(body.officeLng, -180, 180);
      if (n === null) { res.status(400).json({ success: false, message: 'Invalid office longitude.' }); return; }
      updates[SETTING_KEYS.OFFICE_LNG] = String(n);
    }
    if (body.officeRadiusMeters !== undefined) {
      const n = numInRange(body.officeRadiusMeters, 10, 50000);
      if (n === null) { res.status(400).json({ success: false, message: 'Office radius must be between 10 and 50000 meters.' }); return; }
      updates[SETTING_KEYS.OFFICE_RADIUS] = String(n);
    }
    if (body.otThresholdHours !== undefined) {
      const n = numInRange(body.otThresholdHours, 1, 24);
      if (n === null) { res.status(400).json({ success: false, message: 'OT threshold must be between 1 and 24 hours.' }); return; }
      updates[SETTING_KEYS.OT_THRESHOLD_HOURS] = String(n);
    }
    if (body.maxFailedLoginAttempts !== undefined) {
      const n = intInRange(body.maxFailedLoginAttempts, 1, 50);
      if (n === null) { res.status(400).json({ success: false, message: 'Max failed attempts must be between 1 and 50.' }); return; }
      updates[SETTING_KEYS.MAX_FAILED_LOGINS] = String(n);
    }
    if (body.lockoutDurationMinutes !== undefined) {
      const n = intInRange(body.lockoutDurationMinutes, 0, 10080);
      if (n === null) { res.status(400).json({ success: false, message: 'Lockout duration must be 0–10080 minutes.' }); return; }
      updates[SETTING_KEYS.LOCKOUT_DURATION_MINUTES] = String(n);
    }
    if (body.deptHeadApproverUserId !== undefined) {
      const id = body.deptHeadApproverUserId === null || body.deptHeadApproverUserId === ''
        ? ''
        : String(body.deptHeadApproverUserId).trim();
      if (id) {
        const user = await prisma.user.findUnique({
          where: { id },
          select: { id: true, role: true, isActive: true },
        });
        if (!user || !user.isActive || !['HR', 'ADMIN'].includes(user.role)) {
          res.status(400).json({ success: false, message: 'Approver must be an active HR or ADMIN user.' });
          return;
        }
      }
      updates[SETTING_KEYS.DEPT_HEAD_APPROVER_USER_ID] = id;
    }

    if (!Object.keys(updates).length) {
      res.status(400).json({ success: false, message: 'No valid settings provided.' });
      return;
    }

    await settingsService.setMany(updates, req.user!.sub);

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'UPDATE',
        entity: 'SystemSetting',
        newValues: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    }).catch(() => {});

    // Reuse getSettings response shape
    req.body = {};
    await getSettings(req, res);
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
}

export async function getApproverCandidates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['HR', 'ADMIN'] } },
      select: {
        id: true,
        email: true,
        role: true,
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { email: 'asc' },
    });
    res.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        name: u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.email,
      })),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load approver candidates.' });
  }
}
