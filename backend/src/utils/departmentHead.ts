import { prisma } from '../config/database';
import { addRoles, getUserRoles, removeRoles } from './roles';

/** Department IDs where the given user is assigned as head (approver). */
export async function getHeadedDepartmentIds(userId: string): Promise<string[]> {
  const depts = await prisma.department.findMany({
    where: { headId: userId, isActive: true },
    select: { id: true },
  });
  return depts.map((d) => d.id);
}

/** Headed departments with names (for dashboard display). */
export async function getHeadedDepartments(userId: string): Promise<{ id: string; name: string }[]> {
  return prisma.department.findMany({
    where: { headId: userId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** Distinct user IDs assigned as head of at least one active department. */
export async function getDepartmentHeadUserIds(): Promise<string[]> {
  const depts = await prisma.department.findMany({
    where: { isActive: true, headId: { not: null } },
    select: { headId: true },
  });
  return [...new Set(depts.map((d) => d.headId!).filter(Boolean))];
}

/** Whether the user is head of any active department. */
export async function isDepartmentHeadUser(userId: string): Promise<boolean> {
  const count = await prisma.department.count({
    where: { headId: userId, isActive: true },
  });
  return count > 0;
}

/** Count of departments (any status) where this user is head — used for role tally. */
export async function countHeadships(userId: string): Promise<number> {
  return prisma.department.count({ where: { headId: userId } });
}

/**
 * Strict tally: DEPARTMENT_HEAD role IFF user is headId on ≥1 department.
 * Adds role when headships exist; removes when none remain.
 */
export async function syncDepartmentHeadRoleFromHeadships(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, roles: true },
  });
  if (!user) return;

  const existing = getUserRoles(user);
  const headships = await countHeadships(userId);
  const hasDh = existing.includes('DEPARTMENT_HEAD');

  if (headships > 0 && !hasDh) {
    const resolved = addRoles(existing, 'DEPARTMENT_HEAD');
    await prisma.user.update({
      where: { id: userId },
      data: { role: resolved.role, roles: resolved.roles },
    });
  } else if (headships === 0 && hasDh) {
    const resolved = removeRoles(existing, 'DEPARTMENT_HEAD');
    await prisma.user.update({
      where: { id: userId },
      data: { role: resolved.role, roles: resolved.roles },
    });
  }
}

/** Grant DEPARTMENT_HEAD without removing other roles. */
export async function grantDepartmentHeadRole(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, roles: true },
  });
  if (!user) return;
  const resolved = addRoles(getUserRoles(user), 'DEPARTMENT_HEAD');
  await prisma.user.update({
    where: { id: userId },
    data: { role: resolved.role, roles: resolved.roles },
  });
}

/** Clear every headship for the user, then drop DEPARTMENT_HEAD if no headships left. */
export async function clearAllHeadships(userId: string): Promise<void> {
  await prisma.department.updateMany({
    where: { headId: userId },
    data: { headId: null },
  });
  await syncDepartmentHeadRoleFromHeadships(userId);
}

/**
 * Assign or clear department head with strict role tally both ways.
 * - New head gets DEPARTMENT_HEAD
 * - Previous head loses DEPARTMENT_HEAD only if they head no other department
 */
export async function setDepartmentHead(
  departmentId: string,
  userId: string | null,
): Promise<{ id: string; name: string; headId: string | null }> {
  const existing = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, headId: true },
  });
  if (!existing) {
    throw new Error('Department not found');
  }

  const previousHeadId = existing.headId;
  const nextHeadId = userId || null;

  const dept = await prisma.department.update({
    where: { id: departmentId },
    data: { headId: nextHeadId },
    select: { id: true, name: true, headId: true },
  });

  if (nextHeadId) {
    await grantDepartmentHeadRole(nextHeadId);
  }

  if (previousHeadId && previousHeadId !== nextHeadId) {
    await syncDepartmentHeadRoleFromHeadships(previousHeadId);
  }

  return dept;
}

/**
 * Ensure user is head of their home department (HR create/edit with DH role).
 * Demotes the previous head of that dept if replaced and they have no other headships.
 * Does not clear the user's other multi-dept headships.
 */
export async function ensureHomeDepartmentHead(
  userId: string,
  departmentId: string,
): Promise<void> {
  await setDepartmentHead(departmentId, userId);
}

/**
 * Employee IDs visible in Team Overview for a reviewer.
 * - Department head: staff in headed departments (excluding self employee if needed by caller)
 * - Managing director: employees who are department heads
 * - Both: union
 */
export async function getTeamEmployeeFilter(opts: {
  userId: string;
  isDeptHead: boolean;
  isManagingDirector: boolean;
}): Promise<{ employeeWhere: Record<string, unknown>; departmentIds: string[]; labels: string[] } | null> {
  const labels: string[] = [];
  const or: Record<string, unknown>[] = [];
  let departmentIds: string[] = [];

  if (opts.isDeptHead) {
    departmentIds = await getHeadedDepartmentIds(opts.userId);
    if (departmentIds.length) {
      or.push({ departmentId: { in: departmentIds }, userId: { not: opts.userId } });
      const depts = await getHeadedDepartments(opts.userId);
      labels.push(...depts.map((d) => d.name));
    }
  }

  if (opts.isManagingDirector) {
    const headUserIds = await getDepartmentHeadUserIds();
    const otherHeads = headUserIds.filter((id) => id !== opts.userId);
    if (otherHeads.length) {
      or.push({ userId: { in: otherHeads } });
      labels.push('Department Heads');
    }
  }

  if (!or.length) return null;
  return {
    employeeWhere: or.length === 1 ? or[0] : { OR: or },
    departmentIds,
    labels: [...new Set(labels)],
  };
}

/**
 * Prisma employee filter for approval queues.
 * MD: only requests filed by department heads.
 * DH: headed departments, exclude self.
 * Both: union.
 */
export async function getApprovalEmployeeWhere(opts: {
  userId: string;
  isDeptHead: boolean;
  isManagingDirector: boolean;
}): Promise<Record<string, unknown> | null> {
  const or: Record<string, unknown>[] = [];

  if (opts.isDeptHead) {
    const headedIds = await getHeadedDepartmentIds(opts.userId);
    if (headedIds.length) {
      or.push({ departmentId: { in: headedIds }, userId: { not: opts.userId } });
    }
  }

  if (opts.isManagingDirector) {
    const headUserIds = await getDepartmentHeadUserIds();
    const otherHeads = headUserIds.filter((id) => id !== opts.userId);
    if (otherHeads.length) {
      or.push({ userId: { in: otherHeads } });
    }
  }

  if (!or.length) return null;
  return or.length === 1 ? or[0] : { OR: or };
}

/** Can this reviewer act on a request from the given employee (dept-head tier)? */
export async function canReviewAsDeptTier(opts: {
  reviewerUserId: string;
  employeeUserId: string;
  employeeDepartmentId: string | null | undefined;
  isDeptHead: boolean;
  isManagingDirector: boolean;
}): Promise<boolean> {
  if (opts.employeeUserId === opts.reviewerUserId) return false;

  if (opts.isDeptHead && opts.employeeDepartmentId) {
    const headedIds = await getHeadedDepartmentIds(opts.reviewerUserId);
    if (headedIds.includes(opts.employeeDepartmentId)) return true;
  }

  if (opts.isManagingDirector) {
    return isDepartmentHeadUser(opts.employeeUserId);
  }

  return false;
}
