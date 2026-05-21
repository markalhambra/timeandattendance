import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';

export async function getDepartments(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
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
      res.status(400).json({ success: false, message: 'Cannot delete a department with active employees.' });
      return;
    }
    // Null out departmentId for any inactive employees still referencing this department
    await prisma.employee.updateMany({ where: { departmentId: req.params.id }, data: { departmentId: null } });
    // Clear headId to remove the unique FK before deletion
    await prisma.department.update({ where: { id: req.params.id }, data: { headId: null } });
    await prisma.department.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Department deleted.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete department.' });
  }
}

export async function assignHead(req: AuthRequest, res: Response): Promise<void> {  const { userId } = req.body;
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

export async function getDepartmentMembers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employees = await prisma.employee.findMany({
      where: { departmentId: req.params.id, isActive: true },
      include: { user: { select: { id: true, role: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json({ success: true, data: employees });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch department members.' });
  }
}

export async function addMember(req: AuthRequest, res: Response): Promise<void> {
  const { employeeId } = req.body;
  if (!employeeId) { res.status(400).json({ success: false, message: 'employeeId is required.' }); return; }
  try {
    await prisma.employee.update({ where: { id: employeeId }, data: { departmentId: req.params.id } });
    res.json({ success: true, message: 'Employee added to department.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to add employee.' });
  }
}

export async function removeMember(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.employee.update({ where: { id: req.params.employeeId }, data: { departmentId: null } });
    res.json({ success: true, message: 'Employee removed from department.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to remove employee.' });
  }
}
