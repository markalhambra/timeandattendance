import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Department, Employee } from '../../types';
import toast from 'react-hot-toast';

interface DepartmentWithDetails extends Omit<Department, 'head'> {
  _count?: { employees: number };
  head?: { id?: string; user?: { firstName: string; lastName: string } };
}

export default function AdminDepartments() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editDept, setEditDept] = useState<DepartmentWithDetails | null>(null);
  const [showAssignHead, setShowAssignHead] = useState<DepartmentWithDetails | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [selectedHead, setSelectedHead] = useState('');

  const { data: depts, isLoading } = useQuery<DepartmentWithDetails[]>({
    queryKey: ['departments-admin'],
    queryFn: () => api.get('/departments').then((r) => r.data.data),
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['employees-all'],
    queryFn: () => api.get('/employees?limit=500').then((r) => r.data.data),
    enabled: !!showAssignHead,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/departments', body),
    onSuccess: () => { toast.success('Department created.'); setShowCreate(false); setForm({ name: '', description: '' }); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put(`/departments/${id}`, body),
    onSuccess: () => { toast.success('Department updated.'); setEditDept(null); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => { toast.success('Department removed.'); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed — department may have active employees.'),
  });

  const assignHeadMutation = useMutation({
    mutationFn: ({ deptId, employeeId }: { deptId: string; employeeId: string }) => api.patch(`/departments/${deptId}/assign-head`, { employeeId }),
    onSuccess: () => { toast.success('Head assigned.'); setShowAssignHead(null); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Departments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage organizational structure</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ New Department</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? [...Array(6)].map((_, i) => <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />) :
          depts?.map((d) => (
            <div key={d.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold">{d.name}</div>
                  {d.description && <div className="text-xs text-gray-500 mt-0.5">{d.description}</div>}
                </div>
                <span className="badge bg-gray-100 text-gray-600">{d._count?.employees ?? 0} staff</span>
              </div>
              <div className="text-xs text-gray-500">
                <span className="font-medium">Head: </span>
                {d.head?.user ? `${d.head.user.firstName} ${d.head.user.lastName}` : <span className="text-red-400">Unassigned</span>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditDept(d); setForm({ name: d.name, description: d.description || '' }); }} className="btn-secondary text-xs flex-1">Edit</button>
                <button onClick={() => { setShowAssignHead(d); setSelectedHead(d.headId || ''); }} className="btn-secondary text-xs flex-1">Assign Head</button>
                <button onClick={() => { if (confirm(`Delete "${d.name}"?`)) deleteMutation.mutate(d.id); }} className="btn text-xs text-red-500 px-3">Delete</button>
              </div>
            </div>
          ))
        }
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-4">New Department</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="Engineering" />
              </div>
              <div>
                <label className="label">Description</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input" placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending} className="btn-primary flex-1">
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-4">Edit Department</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Description</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditDept(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => updateMutation.mutate({ id: editDept.id, body: form })} disabled={!form.name || updateMutation.isPending} className="btn-primary flex-1">
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Head Modal */}
      {showAssignHead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">Assign Department Head</h3>
            <p className="text-sm text-gray-500 mb-4">{showAssignHead.name}</p>
            <div>
              <label className="label">Select Employee</label>
              <select value={selectedHead} onChange={(e) => setSelectedHead(e.target.value)} className="input">
                <option value="">-- Select --</option>
                {employees?.map((e) => (
                  <option key={e.id} value={e.id}>{e.user?.firstName} {e.user?.lastName} · {e.department?.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAssignHead(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => assignHeadMutation.mutate({ deptId: showAssignHead.id, employeeId: selectedHead })} disabled={!selectedHead || assignHeadMutation.isPending} className="btn-primary flex-1">
                {assignHeadMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
