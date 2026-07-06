// ─── Core Enums / Types ───────────────────────────────────────────────────────

export type Role = 'EMPLOYEE' | 'DEPARTMENT_HEAD' | 'HR' | 'ADMIN';
export type AttendanceStatus = 'ON_SITE' | 'WFH' | 'OB' | 'ABSENT';
export type LeaveType = 'SICK' | 'VACATION' | 'PML' | 'SML' | 'EMERGENCY' | 'SOLO_PARENT' | 'MATERNITY' | 'PATERNITY' | 'BEREAVEMENT' | 'MAGNA_CARTA_WOMEN' | 'LWOP';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type OvertimeConversionType = 'CTO' | 'CDO';
export type NotificationType =
  | 'LEAVE_REQUEST'
  | 'OVERTIME_REQUEST'
  | 'ATTENDANCE_CORRECTION'
  | 'CTO_REQUEST'
  | 'CDO_REQUEST'
  | 'SYSTEM'
  | 'EXPIRATION_ALERT'
  | 'APPROVAL_RESULT';

// ─── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    designation?: string;
    profilePicture?: string;
    department?: Department;
  };
}

// ─── Department ────────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  headId?: string;
  head?: { user?: { firstName: string; lastName: string }; id?: string };
  _count?: { employees: number };
}

// ─── Employee ──────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  userId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  mobile?: string;
  designation?: string;
  address?: string;
  profilePicture?: string;
  dateHired?: string;
  departmentId?: string;
  isActive: boolean;
  createdAt: string;
  sssNumber?: string;
  pagibigNumber?: string;
  philhealthNumber?: string;
  tinNumber?: string;
  nickname?: string;
  gender?: string;
  birthday?: string;
  emergencyContact?: string;
  emergencyContactNumber?: string;
  department?: Department;
  user?: {
    id: string;
    email: string;
    role: Role;
    lastLogin?: string;
    isActive: boolean;
  };
  documents?: Document[];
}

// ─── Attendance ────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  clockInLat?: number;
  clockInLng?: number;
  clockInAccuracy?: number;
  clockOutLat?: number;
  clockOutLng?: number;
  status?: AttendanceStatus;
  workingMinutes: number;
  overtimeMinutes: number;
  notes?: string;
  isManual: boolean;
  employee?: Employee;
}

export interface AttendanceCorrection {
  id: string;
  employeeId: string;
  attendanceId: string;
  originalClockIn?: string;
  originalClockOut?: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  status: ApprovalStatus;
  reviewedAt?: string;
  reviewerNotes?: string;
  createdAt: string;
  attendance?: AttendanceRecord;
  employee?: Employee;
}

// ─── Leave ─────────────────────────────────────────────────────────────────────

export interface LeaveBalance {
  id: string;
  employeeId: string;
  year: number;
  leaveType: LeaveType;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  leaveDuration: 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: ApprovalStatus;
  deptHeadStatus?: ApprovalStatus | null;
  deptHeadNotes?: string | null;
  deptHeadAt?: string | null;
  hrStatus?: ApprovalStatus | null;
  hrNotes?: string | null;
  hrAt?: string | null;
  createdAt: string;
  employee?: Employee;
}

// ─── Overtime ──────────────────────────────────────────────────────────────────

export interface OvertimeRecord {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  minutes: number;
  reason?: string;
  isFiled: boolean;
  status: ApprovalStatus;
  reviewerNotes?: string | null;
  reviewedAt?: string | null;
  pendingExpiry: string;
  approvedExpiry?: string;
  isConverted: boolean;
  createdAt: string;
  employee?: Employee;
  conversion?: OvertimeConversion;
}

export interface OvertimeConversion {
  id: string;
  employeeId: string;
  overtimeId: string;
  conversionType: OvertimeConversionType;
  minutesToConvert: number;
  status: ApprovalStatus;
  deptHeadStatus?: ApprovalStatus | null;
  deptHeadAt?: string | null;
  hrStatus?: ApprovalStatus | null;
  hrAt?: string | null;
  adminStatus?: string | null;
  adminAt?: string | null;
  reviewerNotes?: string | null;
  scheduledDate?: string;
  createdAt: string;
  overtime?: OvertimeRecord;
  employee?: Employee;
}

// ─── Notifications ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

// ─── Document ──────────────────────────────────────────────────────────────────

export interface Document {
  id: string;
  employeeId: string;
  type: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: string;
}

// ─── API Responses ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: { field: string; message: string }[];
  meta?: { total: number; page: number; limit: number };
}

// ─── Geolocation ───────────────────────────────────────────────────────────────

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}
