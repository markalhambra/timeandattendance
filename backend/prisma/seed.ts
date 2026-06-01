import { PrismaClient, Role, AttendanceStatus, LeaveType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Departments
  const departments = [
    { name: 'IBS', code: 'IBS', description: 'Integrated Business Solutions' },
    { name: 'PR', code: 'PR', description: 'Public Relations' },
    { name: 'MR', code: 'MR', description: 'Media Relations' },
    { name: 'Digital', code: 'DIG', description: 'Digital Department' },
    { name: 'GovRel', code: 'GVR', description: 'Government Relations' },
    { name: 'Creatives', code: 'CRE', description: 'Creative Department' },
    { name: 'Crisis & Comms', code: 'CRC', description: 'Crisis and Communications' },
    { name: 'Executive Office', code: 'EXO', description: 'Executive Office' },
    { name: 'Analytics', code: 'ANA', description: 'Analytics Department' },
  ];

  const createdDepartments: Record<string, string> = {};
  for (const dept of departments) {
    const d = await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
    createdDepartments[dept.code] = d.id;
  }
  console.log('✅ Departments seeded');

  const hash = (pw: string) => bcrypt.hashSync(pw, 12);

  // Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@tams.com' },
    update: {},
    create: {
      email: 'admin@tams.com',
      password: hash('Admin@123456'),
      role: Role.ADMIN,
      employee: {
        create: {
          employeeNumber: 'EMP-0001',
          firstName: 'System',
          lastName: 'Administrator',
          email: 'admin@tams.com',
          designation: 'System Administrator',
          departmentId: createdDepartments['EXO'],
          dateHired: new Date('2020-01-01'),
        },
      },
    },
  });

  // HR user
  const hrUser = await prisma.user.upsert({
    where: { email: 'hr@tams.com' },
    update: {},
    create: {
      email: 'hr@tams.com',
      password: hash('Hr@123456'),
      role: Role.HR,
      employee: {
        create: {
          employeeNumber: 'EMP-0002',
          firstName: 'HR',
          lastName: 'Manager',
          email: 'hr@tams.com',
          designation: 'HR Manager',
          departmentId: createdDepartments['EXO'],
          dateHired: new Date('2020-03-01'),
        },
      },
    },
  });

  // Department Head - Digital
  const deptHead = await prisma.user.upsert({
    where: { email: 'head.digital@tams.com' },
    update: {},
    create: {
      email: 'head.digital@tams.com',
      password: hash('Head@123456'),
      role: Role.DEPARTMENT_HEAD,
      employee: {
        create: {
          employeeNumber: 'EMP-0003',
          firstName: 'Diana',
          lastName: 'Cruz',
          email: 'head.digital@tams.com',
          designation: 'Digital Department Head',
          departmentId: createdDepartments['DIG'],
          dateHired: new Date('2021-01-15'),
        },
      },
    },
  });

  // Link dept head to department
  await prisma.department.update({
    where: { id: createdDepartments['DIG'] },
    data: { headId: deptHead.id },
  });

  // Sample employees
  const employeeSamples = [
    { num: 'EMP-0004', first: 'Juan', last: 'Dela Cruz', email: 'juan@tams.com', dept: 'DIG', designation: 'Digital Analyst' },
    { num: 'EMP-0005', first: 'Maria', last: 'Santos', email: 'maria@tams.com', dept: 'DIG', designation: 'Content Strategist' },
    { num: 'EMP-0006', first: 'Pedro', last: 'Reyes', email: 'pedro@tams.com', dept: 'PR', designation: 'PR Specialist' },
    { num: 'EMP-0007', first: 'Ana', last: 'Garcia', email: 'ana@tams.com', dept: 'CRE', designation: 'Graphic Designer' },
    { num: 'EMP-0008', first: 'Luis', last: 'Torres', email: 'luis@tams.com', dept: 'ANA', designation: 'Data Analyst' },
  ];

  for (const emp of employeeSamples) {
    const u = await prisma.user.upsert({
      where: { email: emp.email },
      update: {},
      create: {
        email: emp.email,
        password: hash('Employee@123'),
        role: Role.EMPLOYEE,
        employee: {
          create: {
            employeeNumber: emp.num,
            firstName: emp.first,
            lastName: emp.last,
            email: emp.email,
            designation: emp.designation,
            departmentId: createdDepartments[emp.dept],
            dateHired: new Date('2022-06-01'),
          },
        },
      },
    });

    // Seed leave balances for current year
    const currentYear = new Date().getFullYear();
    for (const lt of [
      LeaveType.SICK,
      LeaveType.VACATION,
      LeaveType.PML,
      LeaveType.SML,
      LeaveType.EMERGENCY,
      LeaveType.SOLO_PARENT,
      LeaveType.MATERNITY,
      LeaveType.PATERNITY,
      LeaveType.BEREAVEMENT,
      LeaveType.MAGNA_CARTA_WOMEN,
    ]) {
      const days = lt === LeaveType.VACATION ? 15 : lt === LeaveType.SICK ? 10 : lt === LeaveType.PML ? 7 : lt === LeaveType.SML ? 3 : lt === LeaveType.EMERGENCY ? 3 : lt === LeaveType.SOLO_PARENT ? 7 : lt === LeaveType.MATERNITY ? 105 : lt === LeaveType.PATERNITY ? 7 : lt === LeaveType.BEREAVEMENT ? 5 : 60;
      const emp2 = await prisma.employee.findUnique({ where: { userId: u.id } });
      if (emp2) {
        await prisma.leaveBalance.upsert({
          where: { employeeId_year_leaveType: { employeeId: emp2.id, year: currentYear, leaveType: lt } },
          update: {},
          create: { employeeId: emp2.id, year: currentYear, leaveType: lt, totalDays: days },
        });
      }
    }
  }

  // Seed holidays
  const holidays = [
    { name: "New Year's Day", date: new Date('2025-01-01'), type: 'REGULAR', isRecurring: true },
    { name: 'Araw ng Kagitingan', date: new Date('2025-04-09'), type: 'REGULAR', isRecurring: true },
    { name: 'Labor Day', date: new Date('2025-05-01'), type: 'REGULAR', isRecurring: true },
    { name: 'Independence Day', date: new Date('2025-06-12'), type: 'REGULAR', isRecurring: true },
    { name: 'National Heroes Day', date: new Date('2025-08-25'), type: 'REGULAR', isRecurring: true },
    { name: 'Bonifacio Day', date: new Date('2025-11-30'), type: 'REGULAR', isRecurring: true },
    { name: 'Christmas Day', date: new Date('2025-12-25'), type: 'REGULAR', isRecurring: true },
    { name: 'Rizal Day', date: new Date('2025-12-30'), type: 'REGULAR', isRecurring: true },
  ];

  for (const h of holidays) {
    await prisma.holiday.upsert({
      where: { id: h.name.replace(/\s/g, '_') },
      update: {},
      create: { id: h.name.replace(/\s/g, '_'), ...h },
    });
  }

  console.log('✅ Seed completed!');
  console.log('\n📋 Default credentials:');
  console.log('  Admin:       admin@tams.com     / Admin@123456');
  console.log('  HR:          hr@tams.com         / Hr@123456');
  console.log('  Dept Head:   head.digital@tams.com / Head@123456');
  console.log('  Employee:    juan@tams.com       / Employee@123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
