import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Employee, Department } from '../../types';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

type Tab = 'list' | 'create';

export default function HREmployees() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', departmentId: '', position: '', dateHired: '', contactNumber: '' });

  const { data: depts } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.data) });
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', search, deptFilter],
    queryFn: () => api.get(`/employees?search=${encodeURIComponent(search)}&departmentId=${deptFilter}&limit=100`).then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/employees', body),
    onSuccess: () => { toast.success('Employee created. Credentials sent via email.'); setTab('list'); qc.invalidateQueries({ queryKey: ['employees'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/employees/${id}/toggle-active`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Status updated.'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const handleCreate = () => {
    if (!form.firstName || !form.lastName || !form.email || !form.departmentId) {
      toast.error('Please fill in all required fields.'); return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all employee records</p>
        </div>
        <button onClick={() => setTab(tab === 'list' ? 'create' : 'list')} className="btn-primary">
          {tab === 'create' ? '← Back to List' : '+ Add Employee'}
        </button>
      </div>

      {tab === 'list' ? (
        <>
          {/* Filters */}
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
                  <tr>{['Name', 'Employee No.', 'Department', 'Position', 'Date Hired', 'Status', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
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
                        <td className="table-cell text-gray-500 text-sm">{e.department?.name}</td>
                        <td className="table-cell text-sm">{e.position}</td>
                        <td className="table-cell text-sm">{e.dateHired ? format(parseISO(e.dateHired), 'MMM d, yyyy') : '—'}</td>
                        <td className="table-cell">
                          <span className={`badge ${e.user?.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {e.user?.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="table-cell">
                          <button onClick={() => { if (confirm(`${e.user?.isActive ? 'Deactivate' : 'Activate'} ${e.user?.firstName}?`)) toggleMutation.mutate(e.id); }} className="text-xs text-gray-500 hover:text-black underline">
                            {e.user?.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card p-6 max-w-xl space-y-4">
          <h2 className="font-bold text-base">Create New Employee</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name *</label>
              <input type="text" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="input" placeholder="Juan" />
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input type="text" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="input" placeholder="Dela Cruz" />
            </div>
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input" placeholder="juan@company.com" />
          </div>
          <div>
            <label className="label">Department *</label>
            <select value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))} className="input">
              <option value="">Select department</option>
              {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Position</label>
            <input type="text" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} className="input" placeholder="Software Engineer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date Hired</label>
              <input type="date" value={form.dateHired} onChange={(e) => setForm((f) => ({ ...f, dateHired: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Contact No.</label>
              <input type="tel" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} className="input" placeholder="09XX XXX XXXX" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setTab('list')} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleCreate} disabled={createMutation.isPending} className="btn-primary flex-1">
              {createMutation.isPending ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
