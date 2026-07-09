# Administrator User Manual
## ALPAS Time & Attendance System

As an Administrator, you have full access to the entire system — including all Employee, Department Head, and HR features — plus exclusive tools for managing departments, viewing audit logs, and overseeing the whole organization.

> **Also see:** The Employee, Department Head, and HR Manuals for features shared with those roles.

---

## Table of Contents
1. [Admin Dashboard](#1-admin-dashboard)
2. [Employee Management](#2-employee-management)
3. [Department Management](#3-department-management)
4. [Audit Logs](#4-audit-logs)
5. [Approvals and Reports](#5-approvals-and-reports)
6. [System Reference](#6-system-reference)
7. [Frequently Asked Questions](#7-frequently-asked-questions)

---

## 1. Admin Dashboard

![Admin Dashboard — system-wide headcount, department breakdown, and recent audit activity](/screenshots/admin-dashboard.png)
*Admin Dashboard — system-wide headcount, department breakdown, and recent audit activity*


**Navigation:** Sidebar → **Admin Dashboard**

| Section | What It Shows |
|---------|--------------|
| Total Users | Active users out of all registered |
| Departments | Number of active departments |
| Present Today | Employees clocked in |
| Absent Today | Employees with no clock-in (red) |
| Pending Total | Combined count of pending leaves, OT, corrections, and conversions |
| Recent Audit Logs | Last 6 system actions with actor and timestamp |

Click **View all** under the audit log preview to open the full Audit Logs page.

[Insert Screenshot: Admin Dashboard]

---

## 2. Employee Management

**Navigation:** Sidebar → **Employees** (Admin section)

Identical to the HR Employees page. As Admin, you can:
- Add, edit, archive, restore, and delete employees
- Reset passwords
- Import and export employee lists
- Upload and manage employee documents
- Assign any role, including HR and Admin

See the **HR Manual, Section 2** for full step-by-step instructions.

> **Admin-only:** Only Administrators can assign the **Admin** role to another user.

[Insert Screenshot: Admin Employees Page]

---

## 3. Department Management

![Department List — view all departments, their heads, and headcount](/screenshots/admin-departments.png)
*Department List — view all departments, their heads, and headcount*

![Create/Edit Department — name, optional description, and assign a department head](/screenshots/admin-dept-form.png)
*Create/Edit Department — name, optional description, and assign a department head*


**Navigation:** Sidebar → **Departments**

This page is exclusive to Administrators.

### Viewing Departments
Departments appear as cards showing the department name, description, staff count, and the assigned Department Head (or "Unassigned" in red if none is set).

[Insert Screenshot: Departments Page]

---

### Creating a Department
1. Click **+ New Department**.
2. Enter the **Department Name** (required) and an optional **Description**.
3. Click **Create**.
4. A department code is auto-generated from the name initials.

After creating, assign a head and add members.

---

### Editing a Department
1. Click **Edit** on the department card.
2. A panel opens with two sections:
   - **Left:** Name and description (editable). Click **Save** when done.
   - **Right:** Current members list. Use the search box to find and add employees. Click **Remove** to remove a member.

---

### Assigning a Department Head
1. Click **Assign Head** on the department card.
2. Select the employee to designate as head.
3. Click **Assign**.
4. Their role is automatically updated to **Department Head**.

> **Important:** The employee must already be a member of the department. Add them via Edit first if needed.

---

### Deleting a Department
1. Click **Delete** on the department card.
2. Confirm the deletion.

> **Blocked:** A department cannot be deleted if it has active employees. Move or archive the employees first.

---

## 4. Audit Logs

![Audit Logs — timestamped record of every action taken in the system](/screenshots/admin-audit-logs.png)
*Audit Logs — timestamped record of every action taken in the system*


**Navigation:** Sidebar → **Audit Logs**

Audit Logs record every significant action in the system — who did what, when, and from which IP address. These logs cannot be deleted.

**What you will see:**

| Column | What It Shows |
|--------|--------------|
| Action | Color-coded badge: CREATE, UPDATE, DELETE, LOGIN, LOGOUT, APPROVE, REJECT, PASSWORD_RESET |
| User | Who performed the action |
| Entity | Which record was affected |
| Timestamp | When the action occurred |
| IP Address | Where the request came from |

**Filtering:**
- Use the **Search** bar to find logs by user name, email, or entity ID.
- Use the **Action** dropdown to filter by action type.

**Viewing Details:**
Click the expand button on any row to see:
- **Before** (red) — the record's previous values
- **After** (green) — the record's updated values

[Insert Screenshot: Audit Logs Page]
[Insert Screenshot: Expanded Audit Log Row]

---

## 5. Approvals and Reports

![System-Wide Approvals — filter by department; approve or reject leaves, OT, and corrections](/screenshots/admin-approvals.png)
*System-Wide Approvals — filter by department; approve or reject leaves, OT, and corrections*


As Administrator, you have full approval authority across all departments — including approving requests from HR users. You are the final step in OT Conversion multi-step approvals (after Department Head and HR).

For Reports, you have access to the same Attendance, Leave, Overtime, and Absence reports as HR.

See the **HR Manual, Sections 5 and 6** for detailed instructions on Approvals and Reports.

> **Note:** You cannot approve your own requests.

---

## 6. System Reference

### Automated Background Jobs
The system runs two scheduled tasks automatically — no action required from you:

| Job | Schedule (Philippine Time) | Purpose |
|-----|---------------------------|---------|
| Absent Check | 2:00 PM on weekdays | Notifies employees who have not clocked in |
| Daily Maintenance | 8:00 AM every day | Expires outdated OT records, sends 7-day expiry warnings, runs monthly VL accrual on the 1st of each month |

### Vacation Leave Accrual
Every **1st of the month**, Regular employees automatically receive **1.25 days** of Vacation Leave. This runs as part of Daily Maintenance.

### Overtime Rules
- Overtime is auto-calculated when an employee works more than **9 hours** in a single day.
- Employees must file overtime within **15 days** of the shift, or the record expires.
- Approved OT credits are valid for **6 months**.
- CTO conversion minimum: **4 hours**. CDO minimum: **8 hours**.

### Overnight Shift Support
- Employees can clock out until **6:00 AM** the next day and the system matches it to the prior day's clock-in.
- For attendance corrections on overnight shifts, employees use the "Clock-out is on the next day (overnight)" checkbox.

### Office GPS Radius
The system detects whether an employee is within **200 meters** of the office. If within range, status is automatically set to On-Site. Outside the range, employees must choose WFH, OB, or On-Site manually.

### Session Security
- Access tokens expire after **15 minutes** and are silently refreshed.
- Refresh tokens expire after **7 days** — users must log in again after that.
- Archiving or deactivating an employee immediately ends their session.

### Password Policy
All passwords must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, and one number.

### Leave Balance Rules
- Emergency Leave and Sick Leave share a **15-day pool** per year.
- LWOP (Leave Without Pay) does not require any balance and is always available.
- New employees cannot file most leave types until they have **6 months of tenure**.

---

## 7. Frequently Asked Questions

**Q: How do I give someone Admin access?**
A: Go to Employees, find the user, click Edit, change their Role to Admin, and click Save.

**Q: Can I undo an approval?**
A: No — approvals are final. Use the Leave Balance Adjustment tool to manually correct balances if needed.

**Q: A department has no Department Head. What happens?**
A: Leave, OT, and correction requests from that department go directly to HR for approval.

**Q: How do I trace who made a change to a specific record?**
A: Go to Audit Logs, search by the employee name or entity ID, and expand the row to see before and after values.

**Q: Can audit logs be deleted?**
A: No — audit logs are permanent by design for compliance and accountability.

**Q: What is the difference between archiving and deleting an employee?**
A: Archive (recommended for resignations) soft-deletes the employee and keeps all their data but prevents login. Delete permanently removes the user account — use only for test accounts.
