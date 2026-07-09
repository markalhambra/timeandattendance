# HR User Manual
## ALPAS Time & Attendance System

As an HR user, you have all Employee and Department Head features, plus tools to manage employees, monitor attendance system-wide, adjust leave balances, and generate reports.

> **Also see:** The Employee Manual and Department Head Manual for features shared with those roles.

---

## Table of Contents
1. [HR Dashboard](#1-hr-dashboard)
2. [Employee Management](#2-employee-management)
3. [Attendance Monitoring](#3-attendance-monitoring)
4. [Leave Management and Balance Adjustments](#4-leave-management-and-balance-adjustments)
5. [Approvals](#5-approvals)
6. [Reports](#6-reports)
7. [Frequently Asked Questions](#7-frequently-asked-questions)

---

## 1. HR Dashboard

**Navigation:** Sidebar → **HR Dashboard**

| Section | What It Shows |
|---------|--------------|
| Active Employees | Total employees in the system |
| Present Today | Breakdown: On-Site, WFH, OB |
| Absent Today | Employees with no clock-in (shown in red) |
| Pending Approvals | Total requests waiting for review across all departments |
| Attendance Breakdown Chart | Bar chart of today's statuses |
| Department Attendance | Progress bars: present vs. total per department |
| Schedule Summary | Approved leaves and OT conversions for the current period |

[Insert Screenshot: HR Dashboard]

---

## 2. Employee Management

**Navigation:** Sidebar → **HR Employees**

### Viewing Employees
- Use the **Search** bar to find employees by name, employee number, or email.
- Use the **Department** dropdown to filter by department.
- Toggle between the **Active** and **Archived** tabs to see resigned or archived employees.

[Insert Screenshot: Employee List]

---

### Adding a New Employee
1. Click **+ Add Employee**.
2. Fill in the form:
   - First Name, Last Name, Email (required)
   - Middle Name, Nickname, Gender, Birthday
   - Mobile, Address, Department, Designation, Date Hired
   - Role: Employee, Department Head, HR, or Admin
   - Employment Type: Regular, Probationary, Contractual, or Intern
   - Emergency Contact details
   - Government IDs: SSS, PhilHealth, Pag-IBIG, TIN
3. Click **Save**.
4. A **temporary password** is shown — share it with the employee so they can log in.
5. Leave balance records are created automatically for the new employee.

> **Tip:** The employee number (EMP-XXXX) is generated automatically.

[Insert Screenshot: Add Employee Form]

---

### Editing an Employee
1. Click **Edit** on the employee's row.
2. Update any fields as needed.
3. Click **Save**.

> **Note:** Changing an employee's role to Department Head automatically links them to their department.

---

### Resetting an Employee's Password
1. Find the employee.
2. Click **Reset Password** in their actions.
3. Enter a new password (min 8 characters).
4. Click **Reset**. The employee is logged out and must sign in again.

---

### Archiving an Employee (Resignation or Termination)
1. Click **Archive** on the employee's row.
2. Confirm the action.
3. The employee is marked as Archived and can no longer log in. Their historical data remains in the system.

To restore: go to the **Archived** tab and click **Restore**.

---

### Importing Employees in Bulk
1. Click **Template** to download the Excel template.
2. Fill it in with employee data.
3. Click **Import** and upload your file.
4. A summary shows how many were created and any errors.

---

### Exporting Employees
Click **Export** to download the current employee list as an Excel file.

---

### Managing Employee Documents
1. Click an employee's name to open their profile.
2. Go to the **Documents** section.
3. Select a document type (201 File, Contract, ID, Other).
4. Click **Upload** and choose a file (max 10 MB; PDF, Word, Excel, and image formats accepted).
5. To download: click the document name.
6. To delete: click **Delete** on the document row.

---

## 3. Attendance Monitoring

**Navigation:** Sidebar → **HR Attendance**

This page shows all employees' attendance records in one table.

**Columns:** Employee | Date | Department | Clock In | Clock Out | Status | Hours | OT

**Filtering:**
- Use the **month selector** to change the period.
- Use the **Department** dropdown to filter.
- Use the **Employee search** to find a specific person.

**Exporting:**
Click **Export** to download the filtered records as an Excel file.

[Insert Screenshot: HR Attendance Page]

---

## 4. Leave Management and Balance Adjustments

**Navigation:** Sidebar → **Leave Management**

This page lets you view and manually adjust any employee's leave balance for any year.

### Viewing a Leave Balance
1. Search for an employee in the left panel and click their name.
2. Their leave balances for the selected year appear on the right.

### Adjusting a Leave Balance
1. Click **Adjust** next to the leave type you want to change.
2. Fill in the adjustment form:
   - **Action** — Add or Deduct
   - **Amount** — number of days
   - **Reason** — required explanation
3. Click **Submit Adjustment**.
4. The change is recorded in the **Adjustment History** table below.

> **Note:** Emergency Leave and Sick Leave share one balance pool of 15 days. Adjusting one affects both.

> **Tip:** Use adjustments for special grants (birthday leave, loyalty leave) or to correct errors after payroll processing.

[Insert Screenshot: Leave Management Page]

---

## 5. Approvals

**Navigation:** Sidebar → **Approvals**

As HR, you act as both Department Head and final approver. You can approve requests from any department, including requests that were already reviewed by a Department Head.

The Approvals page has four tabs:

### Leaves
Shows all pending leave requests system-wide. Review the type, dates, reason, and the employee's available balance. Click **Approve** or **Reject**, enter notes, and click **Submit**. On approval, the leave balance is deducted automatically.

### Overtime
Shows all filed overtime requests. Approve to credit the overtime (valid for 6 months), or reject with a note.

### Corrections
Shows all pending attendance correction requests. Approving one updates the attendance record and recalculates the employee's hours automatically.

### OT Conversions
Shows all CTO/CDO conversion requests. Approve or reject per the minimum hour rules:
- CTO requires at least 4 hours
- CDO requires at least 8 hours

> **Note:** You cannot approve your own requests.

> **Tip:** Toggle "Show Review History" on any tab to see requests you have already reviewed.

[Insert Screenshot: Approvals Page]

---

## 6. Reports

**Navigation:** Sidebar → **Reports**

Generate and export data reports for management and compliance.

**Report Types:**

| Report | What It Shows |
|--------|--------------|
| Attendance | Daily attendance counts by status (On-Site, WFH, OB, Absent) |
| Leave | Daily approved leave counts by type |
| Overtime | Daily approved overtime counts |
| Absence | Attendance rate by employee and department |

**How to Generate a Report:**
1. Click **Reports** in the sidebar.
2. Select a **Report Type** tab.
3. Set the **Date Range**. Maximum: 92 days (approximately one quarter).
4. Optionally filter by **Department** or **Employee**.
5. View the **chart** and the **summary table** below it.
6. Click **Export** to download as an Excel file.

[Insert Screenshot: Reports Page]

---

## 7. Frequently Asked Questions

**Q: An employee's hours show as negative.**
A: The clock-out was saved before the clock-in (common with overnight shift corrections filed without the overnight checkbox). Review their attendance and approve a correction with the correct next-day clock-out time.

**Q: How do I see all pending approvals at once?**
A: The HR Dashboard shows a Pending Approvals counter. You can also go directly to **Approvals** in the sidebar.

**Q: Can I delete a leave request?**
A: Leave requests cannot be deleted. Use the balance adjustment tool to correct a balance manually if needed.

**Q: What happens when I archive an employee?**
A: Their account is deactivated and they cannot log in. All historical data (attendance, leave, overtime) remains in the system. They appear in the Archived tab.

**Q: How do I correct an attendance record directly?**
A: Approve the employee's correction request from the Approvals page. You can also view the HR Attendance page and filter to that employee's records to check.
