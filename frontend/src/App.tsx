import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';

// Auth pages (small — keep eager for fast first paint)
import LoginPage from './pages/auth/Login';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';

// All other pages lazy-loaded by role — users only download what they can access
const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard'));
const AttendancePage = lazy(() => import('./pages/employee/Attendance'));
const LeavePage = lazy(() => import('./pages/employee/Leave'));
const OvertimePage = lazy(() => import('./pages/employee/Overtime'));
const CorrectionsPage = lazy(() => import('./pages/employee/Corrections'));
const ProfilePage = lazy(() => import('./pages/employee/Profile'));
const DeptHeadDashboard = lazy(() => import('./pages/department-head/Dashboard'));
const ApprovalsPage = lazy(() => import('./pages/department-head/Approvals'));
const HRDashboard = lazy(() => import('./pages/hr/Dashboard'));
const HRAttendancePage = lazy(() => import('./pages/hr/Attendance'));
const HRReportsPage = lazy(() => import('./pages/hr/Reports'));
const HREmployeesPage = lazy(() => import('./pages/hr/Employees'));
const HREmployeeProfile = lazy(() => import('./pages/hr/EmployeeProfile'));
const HRLeaveManagement = lazy(() => import('./pages/hr/LeaveManagement'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminEmployeesPage = lazy(() => import('./pages/admin/Employees'));
const AdminDepartmentsPage = lazy(() => import('./pages/admin/Departments'));
const AuditLogsPage = lazy(() => import('./pages/admin/AuditLogs'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 border-2 border-black border-t-transparent rounded-full animate-spin" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  const roleRoutes: Record<string, string> = {
    EMPLOYEE: '/dashboard',
    DEPARTMENT_HEAD: '/dept-head/dashboard',
    HR: '/hr/dashboard',
    ADMIN: '/hr/dashboard',
  };
  return <Navigate to={roleRoutes[user?.role || 'EMPLOYEE'] || '/dashboard'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Root redirect */}
          <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />

          {/* Employee routes */}
          <Route path="/dashboard" element={<RequireAuth><Layout><EmployeeDashboard /></Layout></RequireAuth>} />
          <Route path="/attendance" element={<RequireAuth><Layout><AttendancePage /></Layout></RequireAuth>} />
          <Route path="/leave" element={<RequireAuth><Layout><LeavePage /></Layout></RequireAuth>} />
          <Route path="/overtime" element={<RequireAuth><Layout><OvertimePage /></Layout></RequireAuth>} />
          <Route path="/corrections" element={<RequireAuth><Layout><CorrectionsPage /></Layout></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Layout><ProfilePage /></Layout></RequireAuth>} />

          {/* Department Head */}
          <Route path="/dept-head/dashboard" element={<RequireAuth roles={['DEPARTMENT_HEAD', 'HR', 'ADMIN']}><Layout><DeptHeadDashboard /></Layout></RequireAuth>} />
          <Route path="/dept-head/approvals" element={<RequireAuth roles={['DEPARTMENT_HEAD', 'HR', 'ADMIN']}><Layout><ApprovalsPage /></Layout></RequireAuth>} />

          {/* HR */}
          <Route path="/hr/dashboard" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><HRDashboard /></Layout></RequireAuth>} />
          <Route path="/hr/attendance" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><HRAttendancePage /></Layout></RequireAuth>} />
          <Route path="/hr/reports" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><HRReportsPage /></Layout></RequireAuth>} />
          <Route path="/hr/employees" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><HREmployeesPage /></Layout></RequireAuth>} />
          <Route path="/hr/employees/:id" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><HREmployeeProfile /></Layout></RequireAuth>} />
          <Route path="/hr/leave-management" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><HRLeaveManagement /></Layout></RequireAuth>} />

          {/* Admin — /admin/dashboard and /admin/employees redirect to HR equivalents */}
          <Route path="/admin/dashboard" element={<RequireAuth><Navigate to="/hr/dashboard" replace /></RequireAuth>} />
          <Route path="/admin/employees" element={<RequireAuth><Navigate to="/hr/employees" replace /></RequireAuth>} />
          <Route path="/admin/departments" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><AdminDepartmentsPage /></Layout></RequireAuth>} />
          <Route path="/admin/audit" element={<RequireAuth roles={['HR', 'ADMIN']}><Layout><AuditLogsPage /></Layout></RequireAuth>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
