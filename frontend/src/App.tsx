import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/auth/Login';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';
import EmployeeDashboard from './pages/employee/Dashboard';
import AttendancePage from './pages/employee/Attendance';
import LeavePage from './pages/employee/Leave';
import OvertimePage from './pages/employee/Overtime';
import CorrectionsPage from './pages/employee/Corrections';
import ProfilePage from './pages/employee/Profile';
import DeptHeadDashboard from './pages/department-head/Dashboard';
import ApprovalsPage from './pages/department-head/Approvals';
import HRDashboard from './pages/hr/Dashboard';
import HRAttendancePage from './pages/hr/Attendance';
import HRReportsPage from './pages/hr/Reports';
import HREmployeesPage from './pages/hr/Employees';
import HREmployeeProfile from './pages/hr/EmployeeProfile';
import AdminDashboard from './pages/admin/Dashboard';
import AdminEmployeesPage from './pages/admin/Employees';
import AdminDepartmentsPage from './pages/admin/Departments';
import AuditLogsPage from './pages/admin/AuditLogs';
import NotFoundPage from './pages/NotFound';

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
    ADMIN: '/admin/dashboard',
  };
  return <Navigate to={roleRoutes[user?.role || 'EMPLOYEE'] || '/dashboard'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
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
        <Route path="/hr/employees/:id" element={<RequireAuth roles={['HR']}><Layout><HREmployeeProfile /></Layout></RequireAuth>} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<RequireAuth roles={['ADMIN']}><Layout><AdminDashboard /></Layout></RequireAuth>} />
        <Route path="/admin/employees" element={<RequireAuth roles={['ADMIN']}><Layout><AdminEmployeesPage /></Layout></RequireAuth>} />
        <Route path="/admin/departments" element={<RequireAuth roles={['ADMIN']}><Layout><AdminDepartmentsPage /></Layout></RequireAuth>} />
        <Route path="/admin/audit" element={<RequireAuth roles={['ADMIN']}><Layout><AuditLogsPage /></Layout></RequireAuth>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
