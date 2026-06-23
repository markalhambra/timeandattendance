# Time and Attendance System - User Guidelines and Manual

This manual explains how to use the app for each role:
- Employee
- Department Head
- HR
- Admin

It covers all implemented screens, features, and workflows in the current system.

## 1. Getting Started

### 1.1 Login and Session
1. Open the app URL.
2. Sign in with your company email and password.
3. After login, the system redirects you to your role-based dashboard.
4. Use the sidebar to navigate role-specific modules.
5. Use Sign Out from the sidebar to safely end your session.

### 1.2 Password Functions
- Forgot password:
  - Use the Forgot Password screen from login.
  - Enter your email and follow reset instructions.
- Reset password:
  - Use the Reset Password page from the reset link.
- Change password (while logged in):
  - Go to My Profile > Change Password.
  - Enter current password, then new password.
  - New password must be at least 8 characters.

### 1.3 Notifications
- Use the bell icon in the header to view recent notifications.
- Click Mark all read to clear unread badges.
- Notifications include leave/overtime/correction actions, approval outcomes, and system alerts.

### 1.4 Time Zone and Work Date
- The app displays date and time in Philippine Time (PHT / Asia-Manila).
- Attendance and dashboard summaries use the same timezone basis.

---

## 2. Core Features Available Across Roles

### 2.1 My Profile
All roles can access My Profile to:
- View personal and employment details
- View government IDs and emergency contact information
- Change account password

### 2.2 Attendance Modules (Shared Visibility)
Users with permission can access:
- Attendance records
- Attendance corrections and review queue (role-based)
- Status tagging (On-site, WFH, OB, Absent)

### 2.3 Leave Modules (Shared Visibility)
- Leave filing and balances
- Multi-stage approvals
- Leave history and current status

### 2.4 Overtime Modules (Shared Visibility)
- Overtime records
- Filing OT for approval
- OT-to-CTO/CDO conversion requests
- Conversion review queue (role-based)

---

## 3. Employee Manual

### 3.1 Employee Navigation
Employee menu includes:
- Dashboard
- Attendance
- Leave
- Overtime
- Corrections
- My Profile

### 3.2 Employee Dashboard
Shows:
- Time Clock widget
- Monthly attendance summary
- Leave balances
- Pending leave/correction counts
- Overtime credits and eligibility hints

### 3.3 Clock In and Clock Out
1. Open Dashboard and use Time Clock.
2. Click Clock In to start your day.
3. System reads GPS location and distance from office.
4. If inside office radius, status is set as ON_SITE.
5. If outside office radius, choose one of:
   - WFH (Work From Home)
   - OB (Official Business)
   - ON_SITE (manual override)
6. Click Clock Out to end your day.

Notes:
- If you miss clock-out, a warning appears and prompts you to file a correction.
- Working time runs live while clocked in.
- Overtime minutes are computed after clock-out.

### 3.4 Attendance Records
In Attendance page, employees can:
- Filter records by month
- View date, clock-in/out, status, hours, overtime
- Request correction per record using Correct action

### 3.5 Attendance Correction Request
1. Open Attendance page.
2. Click Correct beside a record.
3. Enter corrected clock-in/out time and reason.
4. Submit for review.

Rules:
- Correction reason is required.
- Correction times are constrained to the selected attendance date.

### 3.6 Correction Tracking
In Corrections page, employees can monitor:
- Pending / Approved / Rejected status
- Requested in/out values
- Reviewer notes
- Submission date

### 3.7 Leave Filing and Tracking
In Leave page, employees can:
- View balances per leave type
- File leave request with start date, end date, and reason
- View leave history and status details
- Cancel pending leave requests

Supported leave types:
- Sick Leave
- Vacation Leave
- Pamilya Muna Leave (PML)
- Sarili Muna Leave (SML)
- Emergency Leave
- Solo Parent Leave
- Maternity Leave
- Paternity Leave
- Bereavement Leave
- Magna Carta for Women Leave

Approval flow:
1. Department Head review
2. HR review
3. Final status shown in employee history

### 3.8 Overtime and Conversion
In Overtime page, employees can:
- View overtime records (filed and unfiled)
- File unfiled OT record by adding reason
- Track OT status and expiry
- View available OT credits
- Convert credits to:
  - CTO (minimum 4 hours)
  - CDO (minimum 8 hours)

Conversion flow:
1. Select conversion type and schedule date.
2. Select OT records (or partial hours for a single record).
3. Submit conversion request.
4. Track status in conversion history.

---

## 4. Department Head Manual

### 4.1 Department Head Navigation
In addition to employee modules, Department Head can access:
- Team Overview
- Approvals

### 4.2 Team Overview Dashboard
Shows:
- Department identity and date
- Total staff and today attendance stats
- On-site, WFH, OB, and absent breakdown
- Pending approvals count and quick link to Approvals
- Team attendance table for today

### 4.3 Approvals Module
Department Heads can review team requests in tabs:
- Leaves
- Overtime
- Corrections
- OT Conversions

### 4.4 Approving or Rejecting Requests
1. Open Approvals.
2. Select tab by request type.
3. Click Approve or Reject.
4. Add notes (required for rejection).
5. Confirm decision.

### 4.5 Department Head Review History
Approvals page also shows history sections (where available):
- Reviewed corrections
- Reviewed OT conversions
- Reviewed leaves/overtime with decision remarks and dates

---

## 5. HR Manual

### 5.1 HR Navigation
HR has employee modules plus HR modules:
- HR Dashboard
- HR Attendance
- HR Employees
- Reports
- Team Overview / Approvals (shared with department-head access)

### 5.2 HR Dashboard
Shows:
- Active and total employees
- Department count
- Today attendance distribution (present/absent/on-site/WFH/OB/not yet clocked in)
- Pending approval counts
- Department attendance performance
- Employee schedule summary (approved leaves and approved CTO/CDO)

Filters in schedule summary:
- Month
- Department
- Type (leave type / CTO / CDO)

### 5.3 HR Attendance Management
In HR Attendance page, HR can:
- View all attendance records
- Filter by month, department, and employee search
- Export attendance records to XLSX

### 5.4 HR Employee Master Data
In HR Employees page, HR can:
- Add employee (auto-generates temporary password)
- Edit employee details
- Activate/Deactivate employee
- Archive resigned employee
- Restore archived employee
- Delete employee
- Reset employee password
- Import employees (CSV/XLS/XLSX)
- Export employees
- Download import template

Fields supported include:
- Personal identity and contact
- Employment details (role, department, designation, date hired)
- Emergency contacts
- Government numbers (SSS, PhilHealth, Pag-IBIG, TIN)

### 5.5 HR Detailed Employee Profile
HR can open an employee profile to:
- View full profile data
- Edit profile data
- Upload profile picture
- Upload documents (201, Contract, ID, Other)
- Download employee documents
- Delete employee documents

Supported document file types include PDF, image, Word, and Excel formats.

### 5.6 Reports and Analytics
In Reports page, HR can generate:
- Attendance report
- Leave report
- Overtime report
- Absence report

Filters:
- Date range
- Department
- Employee
- Work type (for attendance)

Export:
- Attendance export uses server-generated XLSX
- Other report summaries export as XLSX from current report data

### 5.7 HR in Approvals
HR can access approval queues and finalize requests based on workflow stage:
- Leaves after department-head review
- Overtime requests
- Attendance corrections
- OT conversions (as configured by workflow state)

---

## 6. Admin Manual

### 6.1 Admin Navigation
Admin has full system modules:
- Admin Dashboard
- Employees
- Departments
- Audit Logs
- All shared employee and management modules

### 6.2 Admin Dashboard
Shows:
- Total and active users
- Department count
- Today attendance totals
- Pending requests summary (leave, OT, corrections, conversions)
- Recent audit log stream

### 6.3 Employee Management (Admin)
Admin Employees module functions are equivalent to HR Employees, including:
- Create/Edit/Delete employees
- Activate/Deactivate employees
- Archive resigned employee
- Restore archived employee
- Delete employee
- Reset password
- Import employees (CSV/XLS/XLSX)
- Export employees
- Download import template

### 6.4 Department Management
In Departments module, admin can:
- Create department
- Edit department details
- Delete department (if allowed by constraints)
- Assign department head
- Manage members inside department:
  - Add member
  - Remove member

Department head assignment supports:
- Selecting from current department members
- Selecting from outside department via search

### 6.5 Audit Logs
Admin can access complete audit trail with:
- Search by user/entity
- Filter by action type
- Pagination
- Expand each row to inspect before/after value snapshots

Typical audited actions include:
- CREATE
- UPDATE
- DELETE
- LOGIN
- LOGOUT
- APPROVE
- REJECT
- PASSWORD_RESET

---

## 7. Approval and Workflow Summary

### 7.1 Leave Workflow
1. Employee files leave.
2. Department Head reviews.
3. HR reviews.
4. Final status becomes Approved/Rejected/Cancelled.

### 7.2 Overtime Workflow
1. OT record exists (often from worked overtime).
2. Employee files OT with reason.
3. Department Head/HR/Admin reviews based on role permissions.
4. Approved OT becomes usable credit.

### 7.3 Attendance Correction Workflow
1. Employee submits correction request.
2. Reviewer (Dept Head, HR, or Admin) approves/rejects.
3. Status and notes become visible to employee.

### 7.4 OT Conversion Workflow (CTO/CDO)
1. Employee selects approved OT credits.
2. Employee submits CTO/CDO conversion request with schedule date.
3. Review proceeds through configured approvers.
4. Final status and reviewer notes are recorded.

---

## 8. Data Operations and File Handling

### 8.1 Employee Import
- Accepted file types: CSV, XLSX, XLS
- Use provided template for best compatibility
- Import result shows created count, failed count, and row-level errors

### 8.2 Employee Export
- HR/Admin can export employee list to XLSX

### 8.3 Attendance Export
- HR/Admin can export attendance records to XLSX with selected date range and filters

### 8.4 Document Upload Limits
- Employee supporting documents: allowed file extensions enforced
- Profile pictures: image files only
- File size limits are enforced by backend configuration

---

## 9. Operational Guidelines

### 9.1 For Employees
- Clock in/out on time and keep GPS/location services enabled.
- File leave requests in advance when possible.
- File OT immediately after overtime to avoid expiry risk.
- Submit corrections promptly for missed or incorrect logs.

### 9.2 For Department Heads
- Review pending requests daily to avoid bottlenecks.
- Add clear notes for rejections.
- Monitor team attendance early in the day.

### 9.3 For HR
- Keep employee master records updated.
- Use archive instead of delete for resigned employees when history must be retained.
- Regularly review reports and schedule summaries.

### 9.4 For Admin
- Use audit logs for verification and governance.
- Restrict role assignment to least privilege needed.
- Review pending request trends and unusual activity patterns.

---

## 10. Troubleshooting

### 10.1 Cannot Clock In
- Check browser GPS permission.
- Ensure device location is enabled.
- If outside office radius, choose WFH/OB/ON_SITE in status modal.

### 10.2 Forgot Password
- Use Forgot Password from login.
- If no reset access, request HR/Admin password reset.

### 10.3 Import Failures
- Download and use the template.
- Verify required columns and value formats.
- Review row-level errors in Import Results modal.

### 10.4 Missing Access to a Screen
- Access is role-based.
- Confirm your assigned role with HR/Admin.

---

## 11. Quick Access by Role

### Employee
- Dashboard, Attendance, Leave, Overtime, Corrections, My Profile

### Department Head
- All Employee modules
- Team Overview
- Approvals

### HR
- All Employee modules
- Team Overview and Approvals
- HR Dashboard, HR Attendance, HR Employees, Reports, Employee Profile management

### Admin
- Full system access
- Admin Dashboard, Employees, Departments, Audit Logs
- All shared modules

---

## 12. Notes for System Owners

If features are expanded later (new leave types, approval stages, or policy rules), update this manual immediately to keep user guidance aligned with system behavior.
