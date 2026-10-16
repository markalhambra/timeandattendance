import { Role } from '@prisma/client';

/** Highest privilege first — used for primary `User.role` display/legacy. */
export const ROLE_PRIORITY: Role[] = [
  'ADMIN',
  'MANAGING_DIRECTOR',
  'HR',
  'DEPARTMENT_HEAD',
  'PAYROLL',
  'EMPLOYEE',
];

export const ALL_ROLES: Role[] = [...ROLE_PRIORITY];

export const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Employee',
  DEPARTMENT_HEAD: 'Department Head',
  HR: 'HR',
  ADMIN: 'Admin',
  PAYROLL: 'Payroll',
  MANAGING_DIRECTOR: 'Managing Director',
};

export type RoleLike = {
  role?: string | null;
  roles?: string[] | null;
};

export function normalizeRoles(input?: string[] | string | null): Role[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? [input.trim()]
      : [];

  const allowed = new Set(ALL_ROLES as string[]);
  const unique: Role[] = [];
  for (const r of raw) {
    const role = String(r).trim().toUpperCase() as Role;
    if (!allowed.has(role)) continue;
    if (!unique.includes(role)) unique.push(role);
  }
  if (!unique.length) unique.push('EMPLOYEE');
  return unique;
}

export function primaryRole(roles: string[]): Role {
  const set = new Set(roles);
  for (const r of ROLE_PRIORITY) {
    if (set.has(r)) return r;
  }
  return 'EMPLOYEE';
}

/** Normalize roles + primary for User create/update. */
export function resolveUserRoles(input?: {
  roles?: string[] | null;
  role?: string | null;
}): { roles: Role[]; role: Role } {
  let roles: Role[];
  if (input?.roles != null) {
    roles = normalizeRoles(input.roles);
  } else if (input?.role) {
    roles = normalizeRoles([input.role]);
  } else {
    roles = ['EMPLOYEE'];
  }
  // Ensure EMPLOYEE is present when user has only elevated roles? Plan: not required —
  // PAYROLL-only is intentional. Keep as-is.
  return { roles, role: primaryRole(roles) };
}

/** Add role(s) without removing existing. */
export function addRoles(existing: string[] | null | undefined, ...toAdd: string[]): {
  roles: Role[];
  role: Role;
} {
  return resolveUserRoles({ roles: [...(existing || []), ...toAdd] });
}

export function getUserRoles(user: RoleLike | null | undefined): string[] {
  if (!user) return [];
  if (user.roles && user.roles.length) return user.roles;
  if (user.role) return [user.role];
  return [];
}

export function hasAnyRole(user: RoleLike | null | undefined, ...allowed: string[]): boolean {
  if (!allowed.length) return true;
  const have = new Set(getUserRoles(user));
  return allowed.some((r) => have.has(r));
}

export function hasAllRoles(user: RoleLike | null | undefined, ...required: string[]): boolean {
  const have = new Set(getUserRoles(user));
  return required.every((r) => have.has(r));
}

export function isHrOrAdmin(user: RoleLike | null | undefined): boolean {
  return hasAnyRole(user, 'HR', 'ADMIN');
}

export function isManagingDirector(user: RoleLike | null | undefined): boolean {
  return hasAnyRole(user, 'MANAGING_DIRECTOR');
}

export function isDepartmentHeadRole(user: RoleLike | null | undefined): boolean {
  return hasAnyRole(user, 'DEPARTMENT_HEAD');
}

export function isPayroll(user: RoleLike | null | undefined): boolean {
  return hasAnyRole(user, 'PAYROLL');
}

/** Home path by highest role. */
export function homePathForRoles(user: RoleLike | null | undefined): string {
  const roles = getUserRoles(user);
  const primary = primaryRole(roles as Role[]);
  switch (primary) {
    case 'ADMIN':
    case 'HR':
      return '/hr/dashboard';
    case 'MANAGING_DIRECTOR':
    case 'DEPARTMENT_HEAD':
      return '/dept-head/dashboard';
    case 'PAYROLL':
      return '/hr/payslips';
    default:
      return '/dashboard';
  }
}
