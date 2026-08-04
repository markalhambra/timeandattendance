import { prisma } from '../config/database';
import { logger } from '../config/logger';

export const SETTING_KEYS = {
  OFFICE_LAT: 'office.lat',
  OFFICE_LNG: 'office.lng',
  OFFICE_RADIUS: 'office.radiusMeters',
  OT_THRESHOLD_HOURS: 'attendance.otThresholdHours',
  MAX_FAILED_LOGINS: 'security.maxFailedLoginAttempts',
  LOCKOUT_DURATION_MINUTES: 'security.lockoutDurationMinutes',
  DEPT_HEAD_APPROVER_USER_ID: 'approvals.deptHeadApproverUserId',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<SettingKey, string> = {
  [SETTING_KEYS.OFFICE_LAT]: process.env.OFFICE_LAT || '14.5995',
  [SETTING_KEYS.OFFICE_LNG]: process.env.OFFICE_LNG || '120.9842',
  [SETTING_KEYS.OFFICE_RADIUS]: process.env.OFFICE_RADIUS_METERS || '200',
  [SETTING_KEYS.OT_THRESHOLD_HOURS]: '9',
  [SETTING_KEYS.MAX_FAILED_LOGINS]: '5',
  [SETTING_KEYS.LOCKOUT_DURATION_MINUTES]: '0',
  [SETTING_KEYS.DEPT_HEAD_APPROVER_USER_ID]: '',
};

let cache: Map<string, string> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30_000;

async function loadCache(force = false): Promise<Map<string, string>> {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  try {
    const rows = await prisma.systemSetting.findMany();
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(DEFAULTS)) map.set(k, v);
    for (const row of rows) map.set(row.key, row.value);
    cache = map;
    cacheAt = Date.now();
    return map;
  } catch (err) {
    logger.error('Failed to load system settings:', err);
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(DEFAULTS)) map.set(k, v);
    return map;
  }
}

function invalidateCache(): void {
  cache = null;
  cacheAt = 0;
}

async function ensureDefaults(): Promise<void> {
  const existing = await prisma.systemSetting.findMany({ select: { key: true } });
  const have = new Set(existing.map((r) => r.key));
  const missing = Object.entries(DEFAULTS).filter(([k]) => !have.has(k));
  if (!missing.length) return;
  await prisma.systemSetting.createMany({
    data: missing.map(([key, value]) => ({ key, value })),
    skipDuplicates: true,
  });
  invalidateCache();
}

function parseNum(raw: string | undefined, fallback: number): number {
  const n = parseFloat(raw ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function parseIntSafe(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const settingsService = {
  async getRaw(key: SettingKey): Promise<string> {
    const map = await loadCache();
    return map.get(key) ?? DEFAULTS[key];
  },

  async getAll(): Promise<Record<SettingKey, string>> {
    await ensureDefaults();
    const map = await loadCache(true);
    const out = {} as Record<SettingKey, string>;
    for (const key of Object.values(SETTING_KEYS)) {
      out[key] = map.get(key) ?? DEFAULTS[key];
    }
    return out;
  },

  async setMany(
    updates: Partial<Record<SettingKey, string>>,
    updatedBy?: string,
  ): Promise<Record<SettingKey, string>> {
    const entries = Object.entries(updates).filter(
      ([k, v]) => k in DEFAULTS && v !== undefined,
    ) as [SettingKey, string][];

    for (const [key, value] of entries) {
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedBy },
        update: { value, updatedBy },
      });
    }
    invalidateCache();
    return this.getAll();
  },

  async getOfficeSettings(): Promise<{ lat: number; lng: number; radiusMeters: number }> {
    const map = await loadCache();
    return {
      lat: parseNum(map.get(SETTING_KEYS.OFFICE_LAT), parseNum(DEFAULTS[SETTING_KEYS.OFFICE_LAT], 14.5995)),
      lng: parseNum(map.get(SETTING_KEYS.OFFICE_LNG), parseNum(DEFAULTS[SETTING_KEYS.OFFICE_LNG], 120.9842)),
      radiusMeters: parseNum(map.get(SETTING_KEYS.OFFICE_RADIUS), parseNum(DEFAULTS[SETTING_KEYS.OFFICE_RADIUS], 200)),
    };
  },

  async getOtThresholdMinutes(): Promise<number> {
    const map = await loadCache();
    const hours = parseNum(map.get(SETTING_KEYS.OT_THRESHOLD_HOURS), 9);
    return Math.max(0, hours) * 60;
  },

  async getMaxFailedLoginAttempts(): Promise<number> {
    const map = await loadCache();
    return Math.max(1, parseIntSafe(map.get(SETTING_KEYS.MAX_FAILED_LOGINS), 5));
  },

  async getLockoutDurationMinutes(): Promise<number> {
    const map = await loadCache();
    return Math.max(0, parseIntSafe(map.get(SETTING_KEYS.LOCKOUT_DURATION_MINUTES), 0));
  },

  /** Designated user id for DH self-requests, or null → fall back to all HR. */
  async getDeptHeadApproverUserId(): Promise<string | null> {
    const map = await loadCache();
    const id = (map.get(SETTING_KEYS.DEPT_HEAD_APPROVER_USER_ID) || '').trim();
    return id || null;
  },
};
