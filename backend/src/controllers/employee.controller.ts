import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';
import { getSupabaseClient, STORAGE_BUCKET } from '../config/supabase';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx';

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
  const { mobile, address, nickname, gender, birthday, emergencyContact, emergencyContactNumber } = req.body;
  try {
    const employee = await prisma.employee.update({
      where: { userId: req.user!.sub },
      data: { mobile, address, nickname, gender,
              birthday: birthday !== undefined ? (birthday ? new Date(birthday) : null) : undefined,
              emergencyContact, emergencyContactNumber },
    });
    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
}

export async function getEmployees(req: AuthRequest, res: Response): Promise<void> {
  const { search, departmentId, isActive, isArchived, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where: any = {};
    // isArchived param controls which view: default (no param) = active employees only
    if (isArchived === 'true') {
      where.isArchived = true;
    } else {
      where.isArchived = false;
      if (isActive !== undefined) where.isActive = isActive === 'true';
    }
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
        include: { department: true, user: { select: { id: true, email: true, role: true, isActive: true, lastLogin: true } } },
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
  const { email, firstName, lastName, middleName, mobile, address, designation, departmentId, dateHired, role,
          nickname, gender, birthday, emergencyContact, emergencyContactNumber,
          sssNumber, pagibigNumber, philhealthNumber, tinNumber } = req.body;

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
            nickname: nickname || undefined,
            gender: gender || undefined,
            birthday: birthday ? new Date(birthday) : undefined,
            emergencyContact: emergencyContact || undefined,
            emergencyContactNumber: emergencyContactNumber || undefined,
            sssNumber: sssNumber || undefined,
            pagibigNumber: pagibigNumber || undefined,
            philhealthNumber: philhealthNumber || undefined,
            tinNumber: tinNumber || undefined,
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
        { employeeId: empId, year, leaveType: 'PML', totalDays: 7 },
        { employeeId: empId, year, leaveType: 'SML', totalDays: 3 },
        { employeeId: empId, year, leaveType: 'EMERGENCY', totalDays: 3 },
        { employeeId: empId, year, leaveType: 'SOLO_PARENT', totalDays: 7 },
        { employeeId: empId, year, leaveType: 'MATERNITY', totalDays: 105 },
        { employeeId: empId, year, leaveType: 'PATERNITY', totalDays: 7 },
        { employeeId: empId, year, leaveType: 'BEREAVEMENT', totalDays: 5 },
        { employeeId: empId, year, leaveType: 'MAGNA_CARTA_WOMEN', totalDays: 60 },
      ],
    });

    // If created as department head, link them to their department
    if ((role || 'EMPLOYEE') === 'DEPARTMENT_HEAD' && departmentId) {
      await prisma.department.update({
        where: { id: departmentId },
        data: { headId: user.id },
      });
    }

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
  const { firstName, lastName, middleName, mobile, address, designation, departmentId, dateHired, role,
          sssNumber, pagibigNumber, philhealthNumber, tinNumber,
          nickname, gender, birthday, emergencyContact, emergencyContactNumber } = req.body;
  try {
    const existing = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!existing) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }

    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { firstName, lastName, middleName, mobile, address, designation, departmentId,
               dateHired: dateHired ? new Date(dateHired) : undefined,
               sssNumber, pagibigNumber, philhealthNumber, tinNumber,
               nickname, gender,
               birthday: birthday !== undefined ? (birthday ? new Date(birthday) : null) : undefined,
               emergencyContact, emergencyContactNumber },
      include: { department: true },
    });

    // Sync role if provided
    const effectiveRole = role || existing.user.role;
    if (role && role !== existing.user.role) {
      await prisma.user.update({ where: { id: existing.userId }, data: { role } });
    }

    // If this employee is a department head, keep Department.headId in sync
    const targetDeptId = departmentId || existing.departmentId;
    if (effectiveRole === 'DEPARTMENT_HEAD' && targetDeptId) {
      // Clear headId from any old department they headed
      await prisma.department.updateMany({
        where: { headId: existing.userId, id: { not: targetDeptId } },
        data: { headId: null },
      });
      await prisma.department.update({
        where: { id: targetDeptId },
        data: { headId: existing.userId },
      });
    }

    res.json({ success: true, data: employee });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update employee.' });
  }
}

export async function deleteEmployee(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }

    // Soft-delete: deactivate both records and revoke tokens to force logout
    await Promise.all([
      prisma.employee.update({ where: { id: req.params.id }, data: { isActive: false } }),
      prisma.user.update({ where: { id: employee.userId }, data: { isActive: false, refreshToken: null } }),
    ]);

    res.json({ success: true, message: 'Employee deleted (deactivated) successfully.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete employee.' });
  }
}

export async function toggleActive(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    if (employee.isArchived) { res.status(400).json({ success: false, message: 'Archived employees cannot be reactivated. Restore them first.' }); return; }
    await Promise.all([
      prisma.employee.update({ where: { id: req.params.id }, data: { isActive: !employee.isActive } }),
      prisma.user.update({ where: { id: employee.userId }, data: { isActive: !employee.isActive } }),
    ]);
    res.json({ success: true, message: `Employee ${employee.isActive ? 'deactivated' : 'activated'}.` });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to toggle status.' });
  }
}

export async function archiveEmployee(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    if (employee.isArchived) { res.status(400).json({ success: false, message: 'Employee is already archived.' }); return; }
    await Promise.all([
      prisma.employee.update({ where: { id: req.params.id }, data: { isArchived: true, isActive: false, resignedAt: new Date() } }),
      prisma.user.update({ where: { id: employee.userId }, data: { isActive: false, refreshToken: null } }),
    ]);
    res.json({ success: true, message: 'Employee archived (resigned).' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to archive employee.' });
  }
}

export async function restoreEmployee(req: AuthRequest, res: Response): Promise<void> {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    if (!employee.isArchived) { res.status(400).json({ success: false, message: 'Employee is not archived.' }); return; }
    await Promise.all([
      prisma.employee.update({ where: { id: req.params.id }, data: { isArchived: false, isActive: true, resignedAt: null } }),
      prisma.user.update({ where: { id: employee.userId }, data: { isActive: true } }),
    ]);
    res.json({ success: true, message: 'Employee restored.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to restore employee.' });
  }
}

export async function adminResetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' }); return;
    }
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) { res.status(404).json({ success: false, message: 'Employee not found.' }); return; }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: employee.userId }, data: { password: hashed, refreshToken: null } });
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
}

export async function uploadProfilePicture(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded.' }); return; }
  try {
    const ext = path.extname(req.file.originalname);
    const storagePath = `profiles/${uuidv4()}${ext}`;
    const sb = getSupabaseClient();
    const { error } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: { profilePicture: publicUrl },
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
    const ext = path.extname(req.file.originalname);
    const storagePath = `documents/${uuidv4()}${ext}`;
    const sb = getSupabaseClient();
    const { error } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
    if (error) throw error;
    const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const doc = await prisma.document.create({
      data: {
        employeeId: req.params.id,
        type: type || 'OTHER',
        filename: storagePath,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: publicUrl,
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
    const doc = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (doc?.filename) {
      await getSupabaseClient().storage.from(STORAGE_BUCKET).remove([doc.filename]);
    }
    await prisma.document.delete({ where: { id: req.params.docId } });
    res.json({ success: true, message: 'Document deleted.' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete document.' });
  }
}

// ─── Export / Import ────────────────────────────────────────────────────────

export async function exportEmployees(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const employees = await prisma.employee.findMany({
      include: { department: true, user: { select: { role: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const rows = employees.map((e) => ({
      'Employee Number': e.employeeNumber,
      'First Name': e.firstName,
      'Last Name': e.lastName,
      'Middle Name': e.middleName ?? '',
      'Nickname': e.nickname ?? '',
      'Gender': e.gender ?? '',
      'Birthday': e.birthday ? (e.birthday as Date).toISOString().split('T')[0] : '',
      'Email Address': e.email,
      'Personal Mobile Number': e.mobile ?? '',
      'Designation': e.designation ?? '',
      'DEPARTMENT': e.department?.name ?? '',
      'Date Hired': e.dateHired ? e.dateHired.toISOString().split('T')[0] : '',
      'Role': e.user?.role ?? 'EMPLOYEE',
      'Present Address': e.address ?? '',
      'Emergency Contact Person': e.emergencyContact ?? '',
      'Contact Number': e.emergencyContactNumber ?? '',
      'SSS': e.sssNumber ?? '',
      'PHILHEALTH': e.philhealthNumber ?? '',
      'HDMF': e.pagibigNumber ?? '',
      'TIN': e.tinNumber ?? '',
      'Status': e.isActive ? 'Active' : 'Inactive',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="employees.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch {
    res.status(500).json({ success: false, message: 'Failed to export employees.' });
  }
}

export async function downloadTemplate(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const sample = [{
      'Employee Number': 'EMP-0001',
      'First Name': 'Juan',
      'Last Name': 'Dela Cruz',
      'Middle Name': 'Santos',
      'Nickname': 'JD',
      'Gender': 'Male',
      'Birthday': '1990-05-15',
      'Email Address': 'juan@company.com',
      'Personal Mobile Number': '09171234567',
      'Designation': 'Software Engineer',
      'DEPARTMENT': 'Engineering',
      'Date Hired': '2024-01-15',
      'Role': 'EMPLOYEE',
      'Present Address': '123 Main St, Manila',
      'Emergency Contact Person': 'Maria Dela Cruz',
      'Contact Number': '09181234567',
      'SSS': '01-2345678-9',
      'PHILHEALTH': '1234-5678-9012',
      'HDMF': '1234-5678-9012',
      'TIN': '123-456-789-000',
    }];

    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch {
    res.status(500).json({ success: false, message: 'Failed to generate template.' });
  }
}

export async function importEmployees(req: AuthRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded.' });
    return;
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });
      return;
    }

    const departments = await prisma.department.findMany();
    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
    // Also track existing codes to avoid collisions when auto-creating departments
    const existingCodes = new Set(departments.map((d) => d.code.toUpperCase()));

    const generateDeptCode = (name: string): string => {
      const base = name
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8) || 'DEPT';
      let code = base;
      let counter = 2;
      while (existingCodes.has(code)) {
        code = `${base}${counter++}`;
      }
      return code;
    };

    const results: { created: number; failed: number; errors: { row: number; error: string }[] } = {
      created: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // account for header row

      const email = String(row['Email Address'] ?? row['Email'] ?? '').trim();
      const firstName = String(row['First Name'] ?? '').trim();
      const lastName = String(row['Last Name'] ?? '').trim();
      const designation = String(row['Designation'] ?? '').trim();
      const dateHiredRaw = row['Date Hired'];

      if (!email || !firstName || !lastName) {
        results.failed++;
        results.errors.push({ row: rowNum, error: 'Missing required fields (Email Address, First Name, Last Name)' });
        continue;
      }

      const roleInput = String(row['Role'] ?? 'EMPLOYEE').trim().toUpperCase();
      const validRoles = ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'];
      const role = validRoles.includes(roleInput) ? roleInput : 'EMPLOYEE';

      const departmentName = String(row['DEPARTMENT'] ?? row['Department'] ?? '').trim();
      let departmentId: string | null = deptMap.get(departmentName.toLowerCase()) ?? null;

      // Auto-create department if it doesn't exist
      if (departmentName && !departmentId) {
        const code = generateDeptCode(departmentName);
        const newDept = await prisma.department.create({
          data: { name: departmentName, code },
        });
        departmentId = newDept.id;
        deptMap.set(departmentName.toLowerCase(), newDept.id);
        existingCodes.add(code);
      }

      let dateHired: Date;
      if (!dateHiredRaw) {
        dateHired = new Date();
      } else if (dateHiredRaw instanceof Date) {
        dateHired = dateHiredRaw;
      } else {
        dateHired = new Date(String(dateHiredRaw));
        if (isNaN(dateHired.getTime())) {
          results.failed++;
          results.errors.push({ row: rowNum, error: `Invalid date format: "${dateHiredRaw}"` });
          continue;
        }
      }

      try {
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) {
          results.failed++;
          results.errors.push({ row: rowNum, error: `Email already in use: ${email}` });
          continue;
        }

        const providedEmpNo = String(row['Employee Number'] ?? '').trim();
        let employeeNumber: string;
        if (providedEmpNo) {
          const empNoExists = await prisma.employee.findUnique({ where: { employeeNumber: providedEmpNo } });
          if (empNoExists) {
            results.failed++;
            results.errors.push({ row: rowNum, error: `Employee number already in use: ${providedEmpNo}` });
            continue;
          }
          employeeNumber = providedEmpNo;
        } else {
          const count = await prisma.employee.count();
          employeeNumber = `EMP-${String(count + 1).padStart(4, '0')}`;
        }
        const tempPassword = crypto.randomBytes(8).toString('hex');
        const hashed = await bcrypt.hash(tempPassword, 12);

        const user = await prisma.user.create({
          data: {
            email,
            password: hashed,
            role: role as 'EMPLOYEE' | 'DEPARTMENT_HEAD' | 'HR' | 'ADMIN',
            employee: {
              create: {
                employeeNumber,
                firstName,
                lastName,
                middleName: String(row['Middle Name'] ?? '').trim() || undefined,
                email,
                mobile: String(row['Personal Mobile Number'] ?? row['Mobile'] ?? '').trim() || undefined,
                address: String(row['Present Address'] ?? row['Address'] ?? '').trim() || undefined,
                designation: designation || undefined,
                departmentId,
                dateHired,
                nickname: String(row['Nickname'] ?? '').trim() || undefined,
                gender: String(row['Gender'] ?? '').trim() || undefined,
                birthday: (() => { const raw = row['Birthday']; if (!raw) return undefined; const d = raw instanceof Date ? raw : new Date(String(raw)); return isNaN(d.getTime()) ? undefined : d; })(),
                emergencyContact: String(row['Emergency Contact Person'] ?? '').trim() || undefined,
                emergencyContactNumber: String(row['Contact Number'] ?? '').trim() || undefined,
                sssNumber: String(row['SSS'] ?? row['SSS Number'] ?? '').trim() || undefined,
                philhealthNumber: String(row['PHILHEALTH'] ?? row['PhilHealth Number'] ?? '').trim() || undefined,
                pagibigNumber: String(row['HDMF'] ?? row['Pag-IBIG Number'] ?? '').trim() || undefined,
                tinNumber: String(row['TIN'] ?? row['TIN Number'] ?? '').trim() || undefined,
              },
            },
          },
          include: { employee: true },
        });

        const year = new Date().getFullYear();
        const empId = user.employee!.id;
        await prisma.leaveBalance.createMany({
          data: [
            { employeeId: empId, year, leaveType: 'SICK', totalDays: 10 },
            { employeeId: empId, year, leaveType: 'VACATION', totalDays: 15 },
            { employeeId: empId, year, leaveType: 'PML', totalDays: 7 },
            { employeeId: empId, year, leaveType: 'SML', totalDays: 3 },
            { employeeId: empId, year, leaveType: 'EMERGENCY', totalDays: 3 },
            { employeeId: empId, year, leaveType: 'SOLO_PARENT', totalDays: 7 },
            { employeeId: empId, year, leaveType: 'MATERNITY', totalDays: 105 },
            { employeeId: empId, year, leaveType: 'PATERNITY', totalDays: 7 },
            { employeeId: empId, year, leaveType: 'BEREAVEMENT', totalDays: 5 },
            { employeeId: empId, year, leaveType: 'MAGNA_CARTA_WOMEN', totalDays: 60 },
          ],
        });

        if (role === 'DEPARTMENT_HEAD' && departmentId) {
          await prisma.department.update({ where: { id: departmentId }, data: { headId: user.id } });
        }

        results.created++;
      } catch (err: unknown) {
        results.failed++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push({ row: rowNum, error: message });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Import complete: ${results.created} created, ${results.failed} failed.`,
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to process import file.' });
  }
}
