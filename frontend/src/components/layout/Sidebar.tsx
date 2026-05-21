import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Role } from '../../types';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  // Employee
  { label: 'Dashboard', path: '/dashboard', icon: '⊞', roles: ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  { label: 'Attendance', path: '/attendance', icon: '◷', roles: ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  { label: 'Leave', path: '/leave', icon: '◈', roles: ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  { label: 'Overtime', path: '/overtime', icon: '⊕', roles: ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  { label: 'Corrections', path: '/corrections', icon: '✎', roles: ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  { label: 'My Profile', path: '/profile', icon: '◯', roles: ['EMPLOYEE', 'DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  // Dept Head
  { label: 'Team Overview', path: '/dept-head/dashboard', icon: '◉', roles: ['DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  { label: 'Approvals', path: '/dept-head/approvals', icon: '✓', roles: ['DEPARTMENT_HEAD', 'HR', 'ADMIN'] },
  // HR
  { label: 'HR Dashboard', path: '/hr/dashboard', icon: '⊛', roles: ['HR', 'ADMIN'] },
  { label: 'HR Attendance', path: '/hr/attendance', icon: '▦', roles: ['HR', 'ADMIN'] },
  { label: 'HR Employees', path: '/hr/employees', icon: '◎', roles: ['HR', 'ADMIN'] },
  { label: 'Reports', path: '/hr/reports', icon: '▤', roles: ['HR', 'ADMIN'] },
  // Admin
  { label: 'Admin Dashboard', path: '/admin/dashboard', icon: '⬛', roles: ['ADMIN'] },
  { label: 'Employees', path: '/admin/employees', icon: '◐', roles: ['ADMIN'] },
  { label: 'Departments', path: '/admin/departments', icon: '▣', roles: ['ADMIN'] },
  { label: 'Audit Logs', path: '/admin/audit', icon: '▧', roles: ['ADMIN'] },
];

interface Props { onClose: () => void; }

export default function Sidebar({ onClose }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Group items by section
  const sections: { label: string; roles: Role[] }[] = [
    { label: 'MY WORKSPACE', roles: ['EMPLOYEE'] },
    { label: 'TEAM MANAGEMENT', roles: ['DEPARTMENT_HEAD'] },
    { label: 'HR MANAGEMENT', roles: ['HR'] },
    { label: 'ADMIN', roles: ['ADMIN'] },
  ];

  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-gray-200">
        <div>
          <img src="/alpas-logo.png" alt="ALPAS" className="w-40" />
          <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">Time & Attendance</div>
        </div>
        <button onClick={onClose} className="lg:hidden p-1 hover:bg-gray-100 rounded">✕</button>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {user?.employee?.profilePicture ? (
            <img src={user.employee.profilePicture} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-sm font-bold">
              {user?.employee?.firstName?.[0]}{user?.employee?.lastName?.[0]}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.email}
            </div>
            <div className="text-[11px] text-gray-500">{user?.role?.replace('_', ' ')}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? 'sidebar-item-active block' : 'sidebar-item-inactive block'
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-3 border-t border-gray-200 space-y-0.5">
        <NavLink
          to="/profile"
          onClick={onClose}
          className={({ isActive }) => isActive ? 'sidebar-item-active block' : 'sidebar-item-inactive block'}
        >
          <span>◯</span>
          <span>My Profile</span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="sidebar-item-inactive w-full text-left text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <span>⎋</span>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
