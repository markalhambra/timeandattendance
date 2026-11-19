import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { phtToday, phtYear } from '../utils/timezone';
import {
  MAX_HOLIDAY_RANGE_DAYS,
  datesInRange,
  getNonWorkingHoliday,
  inclusiveDayCount,
  isoDateOnly,
  parseDateOnly,
  serializeHoliday,
  syncHolidayEffects,
} from '../services/holiday.service';

const NAME_MAX = 120;

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > NAME_MAX) return null;
  return name;
}

function formatRange(start: Date, end: Date): string {
  const from = isoDateOnly(start);
  const to = isoDateOnly(end);
  return from === to ? from : `${from} to ${to}`;
}

function readRange(body: { date?: unknown; endDate?: unknown }): { start: Date; end: Date } | string {
  const start = parseDateOnly(String(body?.date || ''));
  const end = parseDateOnly(String(body?.endDate || body?.date || ''));
  if (!start || !end) return 'A holiday name and a valid start date (YYYY-MM-DD) are required.';
  if (end < start) return 'The end date must be on or after the start date.';
  const days = inclusiveDayCount(start, end);
  if (days > MAX_HOLIDAY_RANGE_DAYS) {
    return `A holiday range can cover at most ${MAX_HOLIDAY_RANGE_DAYS} days. Split a longer break into more than one holiday.`;
  }
  return { start, end };
}

export async function listHolidays(req: AuthRequest, res: Response): Promise<void> {
  try {
    const year = Number(req.query.year) || phtYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    const holidays = await prisma.holiday.findMany({
      where: { date: { lte: end }, endDate: { gte: start } },
      orderBy: { date: 'asc' },
    });
    res.json({ success: true, data: holidays.map(serializeHoliday) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load holidays.' });
  }
}

export async function todayHoliday(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const holiday = await getNonWorkingHoliday(phtToday());
    res.json({
      success: true,
      data: holiday
        ? { id: holiday.id, name: holiday.name, date: isoDateOnly(holiday.date), endDate: isoDateOnly(holiday.endDate) }
        : null,
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load today\'s holiday.' });
  }
}

export async function createHoliday(req: AuthRequest, res: Response): Promise<void> {
  const name = readName(req.body?.name);
  const range = readRange(req.body || {});
  if (!name || typeof range === 'string') {
    res.status(400).json({ success: false, message: typeof range === 'string' ? range : 'A holiday name and a valid start date (YYYY-MM-DD) are required.' });
    return;
  }
  const { start, end } = range;

  try {
    const clash = await prisma.holiday.findFirst({
      where: { date: { lte: end }, endDate: { gte: start } },
    });
    if (clash) {
      res.status(409).json({ success: false, message: `${clash.name} already covers ${formatRange(clash.date, clash.endDate)}.` });
      return;
    }

    const holiday = await prisma.holiday.create({
      data: { name, date: start, endDate: end, type: 'SPECIAL_NON_WORKING', isRecurring: false },
    });
    const effects = await syncHolidayEffects(datesInRange(start, end));

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'CREATE',
        entity: 'Holiday',
        entityId: holiday.id,
        newValues: { name, date: isoDateOnly(start), endDate: isoDateOnly(end), effects },
        ipAddress: req.ip,
      },
    }).catch(() => {});

    res.status(201).json({ success: true, data: serializeHoliday(holiday), effects });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create holiday.' });
  }
}

export async function updateHoliday(req: AuthRequest, res: Response): Promise<void> {
  const name = readName(req.body?.name);
  const range = readRange(req.body || {});
  if (!name || typeof range === 'string') {
    res.status(400).json({ success: false, message: typeof range === 'string' ? range : 'A holiday name and a valid start date (YYYY-MM-DD) are required.' });
    return;
  }
  const { start, end } = range;

  try {
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Holiday not found.' });
      return;
    }

    const clash = await prisma.holiday.findFirst({
      where: { date: { lte: end }, endDate: { gte: start }, NOT: { id: existing.id } },
    });
    if (clash) {
      res.status(409).json({ success: false, message: `${clash.name} already covers ${formatRange(clash.date, clash.endDate)}.` });
      return;
    }

    const holiday = await prisma.holiday.update({
      where: { id: existing.id },
      data: { name, date: start, endDate: end },
    });
    const effects = await syncHolidayEffects([
      ...datesInRange(existing.date, existing.endDate),
      ...datesInRange(start, end),
    ]);

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'UPDATE',
        entity: 'Holiday',
        entityId: holiday.id,
        oldValues: { name: existing.name, date: isoDateOnly(existing.date), endDate: isoDateOnly(existing.endDate), type: existing.type },
        newValues: { name, date: isoDateOnly(start), endDate: isoDateOnly(end), effects },
        ipAddress: req.ip,
      },
    }).catch(() => {});

    res.json({ success: true, data: serializeHoliday(holiday), effects });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update holiday.' });
  }
}

export async function deleteHoliday(req: AuthRequest, res: Response): Promise<void> {
  try {
    const existing = await prisma.holiday.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Holiday not found.' });
      return;
    }

    await prisma.holiday.delete({ where: { id: existing.id } });
    const effects = await syncHolidayEffects(datesInRange(existing.date, existing.endDate));

    prisma.auditLog.create({
      data: {
        userId: req.user!.sub,
        action: 'DELETE',
        entity: 'Holiday',
        entityId: existing.id,
        oldValues: { name: existing.name, date: isoDateOnly(existing.date), endDate: isoDateOnly(existing.endDate), type: existing.type, effects },
        ipAddress: req.ip,
      },
    }).catch(() => {});

    res.json({ success: true, message: 'Holiday removed.', effects });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete holiday.' });
  }
}
