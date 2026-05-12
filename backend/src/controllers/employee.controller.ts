import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function getMyProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.sub },
      include: { department: true, user: { select: { email: true, role: true, lastLogin: true } } },
    });
    if (!employee) { res.status(404).json({ success: false, message: 'Profile not found.' }); return; }
    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
}

export async function updateMyProfile(req: AuthRequest, res: Response): Promise<void> {
  const { mobile, address } = req.body;
  try {
    const employee = await prisma.employee.update({
      where: { userId: req.user!.sub },
      data: { mobile, address },
    });
    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
}

export async function getEmployees(req: AuthRequest, res: Response): Promise<void> {
  const { search, departmentId, isActive, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (req.user!.role === 'DEPARTMENT_HEAD') {
      const dept = await prisma.department.findFirst({ where: { headId: req.user!.sub } });
      if (dept) where.departmentId = dept.id;
    } else if (departmentId) {
      where.departmentId = departmentId;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: { department: true, user: { select: { role: true, lastLogin: true } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: parseInt(limit),
      }),
      prisma.employee.count({ where }),
    ]);

    res.json({ success: true, data: employees, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch employees.' });
  }
}

export async function createEmployee(req: AuthRequest, res: Response): Promise<void> {
  const { email, firstName, lastName, middleName, mobile, address, designation, departmentId, dateHired, role } = req.body;

  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) { res.status(400).json({ success: false, message: 'Email already exists.' }); return; }

    const count = await prisma.employee.count();
    const employeeNumber = `EMP-${String(count + 1).padStart(4, '0')}`;
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: role || 'EMPLOYEE',
        employee: {
          create: {
            employeeNumber,
            firstName,
            lastName,
            middleName,
            email,
            mobile,
            address,
            designation,
            departmentId,
            dateHired: new Date(dateHired),
          },
        },
      },
      include: { employee: { include: { department: true } } },
    });

    // Seed leave balances
    const year = new Date().getFullYear();
    const empId = user.employee!.id;
    await prisma.leaveBalance.createMany({
      data: [
        { employeeId: empId, year, leaveType: 'SICK', totalDays: 10 },
        { employeeId: empId, year, leaveType: 'VACATION', totalDays: 15 },
        { employeeId: empId, year, leaveType: 'PML', totalDays: 3 },
        { employeeId: empId, year, leaveType: 'SML', totalDays: 3 },
      ],
    });

    res.status(201).json({
      success: true,
      data: { employee: user.employee, tempPassword },
      message: 'Employee created. Share temporary password securely.',
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create employee.' });
  }
}

export async function getEmployee(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        department: true,
        user: { select: { role: true, lastLogin: true, isActive: true } },
        documents: true,
      },
    });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch employee.' });
  }
}

export async function updateEmployee(req: AuthRequest, res: Response): Promise<void> {
  const { firstName, lastName, middleName, mobile, address, designation, departmentId, dateHired } = req.body;
  try {
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { firstName, lastName, middleName, mobile, address, designation, departmentId, dateHired: dateHired ? new Date(dateHired) : undefined },
      include: { department: true },
    });
    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update employee.' });
  }
}

export async function toggleActive(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    await Promise.all([
      prisma.employee.update({ where: { id: req.params.id }, data: { isActive: !employee.isActive } }),
      prisma.user.update({ where: { id: employee.userId }, data: { isActive: !employee.isActive } }),
    ]);
    res.json({ success: true, message: `Employee ${employee.isActive ? 'deactivated' : 'activated'}.` });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to toggle status.' });
  }
}

export async function adminResetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({ where: { id: employee.userId }, data: { password: hashed, refreshToken: null } });
    res.json({ success: true, data: { tempPassword }, message: 'Password reset successfully.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
}

export async function uploadProfilePicture(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded.' }); return; }
  try {
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { profilePicture: `/uploads/profiles/${req.file.filename}` },
    });
    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to upload picture.' });
  }
}

export async function uploadDocument(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded.' }); return; }
  const { type } = req.body;
  try {
    const doc = await prisma.document.create({
      data: {
        employeeId: req.params.id,
        type: type || 'OTHER',
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: `/uploads/documents/${req.file.filename}`,
      },
    });
    res.status(201).json({ success: true, data: doc });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to upload document.' });
  }
}

export async function getDocuments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const docs = await prisma.document.findMany({
      where: { employeeId: req.params.id },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json({ success: true, data: docs });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch documents.' });
  }
}

export async function deleteDocument(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.document.delete({ where: { id: req.params.docId } });
    res.json({ success: true, message: 'Document deleted.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete document.' });
  }
}
