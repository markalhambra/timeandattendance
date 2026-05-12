import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Employee, Department } from '../../types';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

export default function AdminEmployees() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const { data: depts } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.data) });
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ['admin-employees', search, deptFilter],
    queryFn: () => api.get(`/employees?search=${encodeURIComponent(search)}&departmentId=${deptFilter}&limit=200`).then((r) => r.data.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/employees/${id}/toggle-active`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); toast.success('Status updated.'); },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.post(`/employees/${id}/reset-password`, { newPassword: password }),
    onSuccess: () => { toast.success('Password reset.'); setResetTarget(null); setNewPassword(''); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Employee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">System-wide employee management</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email..." className="input flex-1 min-w-48 text-sm" />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">All Departments</option>
          {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">{employees?.length ?? 0} employees</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Name', 'Emp. No.', 'Dept', 'Role', 'Date Hired', 'Status', 'Actions'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>) :
                !employees?.length ? <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-10">No employees found</td></tr> :
                employees.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <div className="font-semibold">{e.user?.firstName} {e.user?.lastName}</div>
                      <div className="text-xs text-gray-400">{e.user?.email}</div>
                    </td>
                    <td className="table-cell font-mono text-xs">{e.employeeNumber}</td>
                    <td className="table-cell text-sm text-gray-500">{e.department?.name}</td>
                    <td className="table-cell text-xs">{e.user?.role?.replace('_', ' ')}</td>
                    <td className="table-cell text-sm">{e.dateHired ? format(parseISO(e.dateHired), 'MMM d, yyyy') : '—'}</td>
                    <td className="table-cell">
                      <span className={`badge ${e.user?.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        {e.user?.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button onClick={() => { if (confirm(`${e.user?.isActive ? 'Deactivate' : 'Activate'} ${e.user?.firstName}?`)) toggleMutation.mutate(e.id); }} className="text-xs text-gray-500 hover:text-black underline">{e.user?.isActive ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => setResetTarget(e)} className="text-xs text-gray-500 hover:text-black underline">Reset PW</button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-4">{resetTarget.user?.firstName} {resetTarget.user?.lastName}</p>
            <div>
              <label className="label">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Minimum 8 characters" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setResetTarget(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => resetMutation.mutate({ id: resetTarget.id, password: newPassword })} disabled={newPassword.length < 8 || resetMutation.isPending} className="btn-primary flex-1">
                {resetMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
