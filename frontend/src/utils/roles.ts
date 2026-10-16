import { Role } from '../types';

export const ROLE_PRIORITY: Role[] = [
  'ADMIN',
  'MANAGING_DIRECTOR',
  'HR',
  'DEPARTMENT_HEAD',
  'PAYROLL',
  'EMPLOYEE',
];

export const ALL_ROLES: Role[] = [...ROLE_PRIORITY];

export const ROLE_LABELS: Record<Role, string> = {
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

export function getUserRoles(user: RoleLike | null | undefined): Role[] {
  if (!user) return [];
  if (user.roles && user.roles.length) return user.roles as Role[];
  if (user.role) return [user.role as Role];
  return [];
}

export function hasAnyRole(user: RoleLike | null | undefined, ...allowed: string[]): boolean {
  if (!allowed.length) return true;
  const have = new Set(getUserRoles(user));
  return allowed.some((r) => have.has(r as Role));
}

export function primaryRole(user: RoleLike | null | undefined): Role {
  const have = new Set(getUserRoles(user));
  for (const r of ROLE_PRIORITY) {
    if (have.has(r)) return r;
  }
  return 'EMPLOYEE';
}

export function homePathForRoles(user: RoleLike | null | undefined): string {
  switch (primaryRole(user)) {
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

export function formatRoles(user: RoleLike | null | undefined): string {
  const roles = getUserRoles(user);
  if (!roles.length) return '—';
  return roles.map((r) => ROLE_LABELS[r] || r.replace(/_/g, ' ')).join(', ');
}
