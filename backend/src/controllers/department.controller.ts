import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';

export async function getDepartments(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const departments = await prisma.department.findMany({
      include: {
        head: { select: { employee: { select: { firstName: true, lastName: true } } } },
        _count: { select: { employees: { where: { isActive: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: departments });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch departments.' });
  }
}

export async function createDepartment(req: AuthRequest, res: Response): Promise<void> {
  const { name, code, description } = req.body;
  try {
    const dept = await prisma.department.create({ data: { name, code: code.toUpperCase(), description } });
    res.status(201).json({ success: true, data: dept });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(400).json({ success: false, message: 'Department name or code already exists.' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to create department.' });
    }
  }
}

export async function updateDepartment(req: AuthRequest, res: Response): Promise<void> {
  const { name, code, description } = req.body;
  try {
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data: { name, code: code?.toUpperCase(), description },
    });
    res.json({ success: true, data: dept });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update department.' });
  }
}

export async function deleteDepartment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const count = await prisma.employee.count({ where: { departmentId: req.params.id, isActive: true } });
    if (count > 0) {
      res.status(400).json({ success: false, message: 'Cannot delete department with active employees.' });
      return;
    }
    await prisma.department.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: 'Department deactivated.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete department.' });
  }
}

export async function assignHead(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.body;
  try {
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data: { headId: userId },
      include: { head: { select: { employee: { select: { firstName: true, lastName: true } } } } },
    });

    if (userId) {
      await prisma.user.update({ where: { id: userId }, data: { role: 'DEPARTMENT_HEAD' } });
    }

    res.json({ success: true, data: dept });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to assign department head.' });
  }
}
