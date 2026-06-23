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
- Archive/Restore employee records
- Reset passwords
- Import/Export/template actions
- Role assignment (Employee / Department Head / HR / Admin)

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
# Time and Attendance System - User Guidelines and Manual

This manual explains how to use the app by role:
- Employee
- Department Head
- HR
- Admin

It includes key workflows, approvals, reports, and best practices.

---

## 1. System Overview

The app supports end-to-end workforce attendance and request management:
- GPS-based clock-in/clock-out
- Attendance statuses: On-Site, WFH, OB, Absent
- Attendance correction requests and approvals
- Leave filing and multi-level approvals
- Overtime filing, approval, and conversion to CTO/CDO
- Notifications (in-app bell and unread counter)
- Employee master data and 201 file document management
- Department structure and department-head assignment
- HR reporting and XLSX export
- Admin audit logs and system-level oversight

---

## 2. Login, Account, and Session Basics

### 2.1 Login
1. Open the app login page.
2. Enter your email and password.
3. After successful login, you are redirected to the dashboard based on your role.

### 2.2 Forgot/Reset Password
1. Use Forgot Password from login if you cannot access your account.
2. Use the reset link/token flow to set a new password.

### 2.3 Change Password (for logged-in users)
1. Go to My Profile.
2. Open Change Password tab.
3. Enter current password and new password.
4. New password must be at least 8 characters and follow password policy.

### 2.4 Notifications
- Click the bell icon in the header.
- View latest notifications.
- Mark individual notifications as read or Mark all read.
- Unread count is auto-refreshed.

---

## 3. Roles and Access Summary

| Module / Function | Employee | Department Head | HR | Admin |
|---|---|---|---|---|
| Personal Dashboard | Yes | Yes | Yes | Yes |
| Team Dashboard | No | Yes | Yes | Yes |
| HR Dashboard | No | No | Yes | Yes |
| Admin Dashboard | No | No | No | Yes |
| Clock In / Clock Out | Yes | Yes | Yes | Yes |
| My Attendance | Yes | Yes | Yes | Yes |
| All Attendance Monitoring | No | Yes (dept scope) | Yes | Yes |
| File Leave | Yes | Yes | Yes | Yes |
| Review Leave | No | Yes (dept scope) | Yes | Yes |
| File OT reason (unfiled OT records) | Yes | Yes | Yes | Yes |
| Review Overtime | No | Yes (dept scope) | Yes | Yes |
| Convert OT to CTO/CDO | Yes | Yes | Yes | Yes |
| Review OT Conversion | No | Yes (dept scope) | Yes | Yes |
| Attendance Correction Request | Yes | Yes | Yes | Yes |
| Attendance Correction Review | No | Yes (dept scope) | Yes | Yes |
| Employee CRUD (add/edit/archive/restore/delete) | No | No | Yes | Yes |
| Employee import/export/template | No | No | Yes | Yes |
| Employee profile photo/document management | No | No | Yes | Yes |
| Department CRUD and assign head | No | No | No | Yes |
| Reports and XLSX export | No | No | Yes | Yes |
| Audit logs | No | No | No | Yes |

Note: Some pages are shared across elevated roles, but actions still follow backend authorization.

---

## 4. Employee Manual

## 4.1 Employee Dashboard
Use Dashboard to monitor:
- Today record and current clock status
- Monthly attendance summary (present, onsite, WFH, OB)
- Total hours and overtime this month
- Leave balances with pending counts
- Overtime credits and conversion eligibility
- Pending leave/correction indicators

## 4.2 Clock In / Clock Out
1. Open Dashboard Time Clock widget.
2. Ensure browser location permission is enabled.
3. Click Clock In.
4. If inside office radius: status becomes ON_SITE.
5. If outside office radius: choose one status:
   - WFH (Work From Home)
   - OB (Official Business)
   - ON_SITE (manual selection when applicable)
6. At end of day, click Clock Out.

Important behavior:
- GPS distance from office is shown.
- Missed clock-out warning appears in widget; use Attendance Correction if needed.
- Working timer runs live while clocked in.

## 4.3 My Attendance
1. Go to Attendance page.
2. Select month.
3. Review daily records (in/out, status, hours, overtime).
4. For incorrect entries, click Correct on a row and submit correction details.

## 4.4 Attendance Corrections
1. Submit from Attendance page.
2. Track request status in Corrections page.
3. View reviewer notes and final decision.

## 4.5 Leave Management
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

How to file leave:
1. Go to Leave page.
2. Click File Leave.
3. Select leave type.
4. Select start and end date.
5. Enter reason.
6. Submit.

How approval works:
1. Department Head review (approve/reject).
2. If approved by Department Head, HR review.
3. Final status shown in history with notes and timestamps.

You can cancel leave only while status is PENDING.

## 4.6 Overtime and Conversion
### Overtime records
- Overtime records are generated from attendance overtime logic.
- Unfiled records must be filed with a reason before review.

### Filing OT request
1. Go to Overtime page.
2. Find a Not Filed/Draft overtime row.
3. Click File OT.
4. Enter reason and submit.

### Convert OT to CTO/CDO
1. Click Convert OT.
2. Select conversion type:
   - CTO: minimum 4 hours
   - CDO: minimum 8 hours
3. Select eligible OT record(s).
4. Enter hours (when partial conversion is allowed) and scheduled date.
5. Submit for approval.

Track status in Conversion History.

## 4.7 My Profile
- View personal info, job info, and government IDs.
- Change account password from Profile page.

---

## 5. Department Head Manual

Department Head has all employee capabilities plus team monitoring and approvals.

## 5.1 Team Overview Dashboard
Monitor:
- Total staff
- Present/absent counts
- On-site/WFH/OB distribution
- Pending approvals (leaves, overtime, corrections)
- Today team attendance table

## 5.2 Approvals Page
Tabs available:
- Leaves
- Overtime
- Corrections
- OT Conversions

For each request type:
1. Review employee details and reason.
2. Click Approve or Reject.
3. Add notes (required on rejection).
4. Submit decision.

History visibility:
- Reviewed items are shown in historical tables for transparency.

Department Head decision impact:
- Leaves: forwards to HR if approved.
- Overtime and Corrections: may be finalized by authorized reviewer flow.
- OT Conversions: staged approvals continue to next authorized reviewer.

---

## 6. HR Manual

HR has employee-level capabilities plus HR operations.

## 6.1 HR Dashboard
Use HR Dashboard to monitor:
- Active/total employee counts
- Present, absent, not-yet-clocked-in stats
- Pending approvals totals
- Attendance composition visualization
- Department attendance performance
- Employee Schedule Summary for approved leaves and approved CTO/CDO schedules

Filter Schedule Summary by:
- Month
- Department
- Type (Leave types, CTO, CDO)

## 6.2 HR Attendance Monitoring
1. Open HR Attendance.
2. Filter by month, department, and search employee.
3. Review attendance records across employees.
4. Export attendance to XLSX.

## 6.3 HR Employee Management
Capabilities:
- Add employee
- Edit employee details
- Activate/deactivate account
- Reset password
- Archive resigned employee
- Restore archived employee
- Delete employee
- Export employee list
- Download import template
- Import employees from CSV/XLSX

### Add Employee
1. Click Add Employee.
2. Fill required fields (name, designation, department, date hired, role, email for new account).
3. Save.
4. Temporary password is generated; share securely.

### Import Employees
1. Download template.
2. Fill required columns.
3. Upload CSV/XLSX.
4. Review import results modal (created, failed, row errors).

## 6.4 HR Employee Profile and 201 File
In HR Employee Profile:
- View full employee information
- Edit personal/employment/government ID details
- Upload or change profile picture
- Manage documents:
  - Upload (PDF, image, DOC/DOCX, XLS/XLSX)
  - Download
  - Delete
- Assign document type (example: 201, Contract, ID, Other)

## 6.5 HR Reports
Report modules:
- Attendance
- Leave
- Overtime
- Absence

Common filters:
- Date range
- Department
- Employee
- Work type (attendance report)

Outputs:
- Charts (bar/line depending on report type)
- Summary table by department
- XLSX export

---

## 7. Admin Manual

Admin has highest access and can perform governance-level actions.

## 7.1 Admin Dashboard
Monitor:
- Total and active users
- Department count
- Today attendance high-level stats
- Pending requests summary (leave, OT, corrections, conversions)
- Recent audit activity

## 7.2 Employee Management (Admin)
Admin employee module includes all HR employee management functions:
- Create, edit, activate/deactivate
- Reset password
- Archive/restore/delete
- Import/export/template
- Role assignment (Employee, Department Head, HR, Admin)

## 7.3 Department Management
Admin-only capabilities:
- Create department
- Edit department name/description
- Delete department (if constraints allow)
- Assign department head
- Manage department members:
  - View members
  - Add member
  - Remove member

Assign Head options:
- Choose from current department members
- Or assign from outside department using search

## 7.4 Audit Logs
Admin-only system audit trail with:
- Filters (action type and search)
- Pagination
- Expandable entry details
- Before/After JSON snapshots for change tracking

Typical audited actions include:
- CREATE, UPDATE, DELETE
- LOGIN, LOGOUT
- APPROVE, REJECT
- PASSWORD_RESET

Use this for compliance, investigation, and accountability.

---

## 8. Approval and Workflow Reference

## 8.1 Leave Workflow
1. Employee files leave.
2. Department Head reviews.
3. If approved, HR reviews.
4. Final status becomes Approved/Rejected.

## 8.2 Attendance Correction Workflow
1. Employee files correction request.
2. Authorized reviewer (Department Head/HR/Admin) approves or rejects.
3. Record updates according to decision and notes.

## 8.3 Overtime Workflow
1. Overtime record exists (derived from attendance overtime logic).
2. Employee files overtime reason (if record is unfiled).
3. Authorized reviewer approves/rejects.
4. Approved OT becomes available for conversion (subject to rules/expiry).

## 8.4 OT Conversion Workflow (CTO/CDO)
1. Employee submits conversion request with scheduled date and selected OT records.
2. Department Head review.
3. Next-level review by HR/Admin as configured.
4. Final status becomes Approved/Rejected.

---

## 9. Business Rules and Operational Notes

- Attendance statuses: ON_SITE, WFH, OB, ABSENT.
- GPS location is required for clock actions.
- On-site auto-detection is based on office coordinates and configured radius.
- CTO minimum conversion threshold: 4 hours.
- CDO minimum conversion threshold: 8 hours.
- Overtime records and conversions have expiry logic managed by the system.
- Cron jobs support daily maintenance and absent checks.
- Notifications are generated for requests, approvals, and expiration alerts.

---

## 10. Troubleshooting and Best Practices

## 10.1 Common Issues
- Cannot clock in/out:
  - Check browser location permission.
  - Check internet connection.
  - Refresh and retry.
- Missing data in dashboards:
  - Verify date filters/month selection.
  - Check if user is active and assigned to correct department.
- Import failures:
  - Use template file.
  - Check required columns and valid role/department values.
  - Review row-level errors after import.
- Export not downloading:
  - Allow browser downloads/popups.
  - Retry with smaller filter scope.

## 10.2 Best Practices
- Employees: clock in/out on time and file corrections promptly.
- Department Heads: process approvals daily to avoid bottlenecks.
- HR: keep employee master data updated and archive resigned personnel.
- Admin: review audit logs regularly and enforce role-based least privilege.

---

## 11. Quick Start by Role

## Employee
1. Dashboard -> Clock In.
2. Attendance -> check daily records.
3. Leave -> file requests.
4. Overtime -> file OT reason and convert to CTO/CDO when eligible.
5. Corrections -> track approval status.
6. Profile -> maintain account password.

## Department Head
1. Team Overview -> check attendance and pending items.
2. Approvals -> review Leaves, OT, Corrections, Conversions.
3. Add notes for all reject decisions.

## HR
1. HR Dashboard -> monitor workforce status and schedules.
2. HR Attendance -> review and export attendance.
3. HR Employees -> maintain employee records.
4. Employee Profile -> manage profile picture and documents.
5. Reports -> generate analytics and export XLSX.

## Admin
1. Admin Dashboard -> system overview and pending totals.
2. Employees -> enterprise-wide employee administration.
3. Departments -> maintain structure and assign heads.
4. Audit Logs -> inspect all critical actions and changes.

---

If you want, this manual can be split into separate files per role (Employee, Department Head, HR, Admin) for easier onboarding handouts.