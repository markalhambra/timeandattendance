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
