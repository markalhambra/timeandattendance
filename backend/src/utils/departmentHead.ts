import { prisma } from '../config/database';

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
