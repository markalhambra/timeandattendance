import { prisma } from '../config/database';

const ROLE_LABELS: Record<string, string> = {
  DEPARTMENT_HEAD: 'Department Head',
  HR: 'HR',
  ADMIN: 'Admin',
};

export async function getReviewerLabel(userId: string, role: string): Promise<string> {
  const roleLabel = ROLE_LABELS[role] ?? role;
  const employee = await prisma.employee.findUnique({
    where: { userId },
    select: { firstName: true, lastName: true },
  });
  return employee ? `${roleLabel} - ${employee.firstName} ${employee.lastName}` : roleLabel;
}
