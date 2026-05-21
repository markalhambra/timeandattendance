import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Department, Employee } from '../../types';
import toast from 'react-hot-toast';

interface DepartmentWithDetails extends Omit<Department, 'head'> {
  _count?: { employees: number };
  head?: { id?: string; employee?: { firstName: string; lastName: string } };
}

export default function AdminDepartments() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editDept, setEditDept] = useState<DepartmentWithDetails | null>(null);
  const [showAssignHead, setShowAssignHead] = useState<DepartmentWithDetails | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [selectedHead, setSelectedHead] = useState('');
  const [headOutsideSearch, setHeadOutsideSearch] = useState('');
  const [showHeadDropdown, setShowHeadDropdown] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');

  const { data: depts, isLoading } = useQuery<DepartmentWithDetails[]>({
    queryKey: ['departments-admin'],
    queryFn: () => api.get('/departments').then((r) => r.data.data),
  });

  const { data: members, isLoading: membersLoading } = useQuery<Employee[]>({
    queryKey: ['dept-members', editDept?.id],
    queryFn: () => api.get(`/departments/${editDept!.id}/members`).then((r) => r.data.data),
    enabled: !!editDept,
  });

  const { data: allEmployees } = useQuery<Employee[]>({
    queryKey: ['employees-all-dept'],
    queryFn: () => api.get('/employees?limit=500&isActive=true').then((r) => r.data.data),
    enabled: !!editDept || !!showAssignHead,
  });

  const { data: headCandidates } = useQuery<Employee[]>({
    queryKey: ['dept-members', showAssignHead?.id],
    queryFn: () => api.get(`/departments/${showAssignHead!.id}/members`).then((r) => r.data.data),
    enabled: !!showAssignHead,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/departments', body),
    onSuccess: () => { toast.success('Department created.'); setShowCreate(false); setForm({ name: '', description: '' }); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put(`/departments/${id}`, body),
    onSuccess: () => { toast.success('Department updated.'); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => { toast.success('Department removed.'); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed — department may have active employees.'),
  });

  const assignHeadMutation = useMutation({
    mutationFn: ({ deptId, userId }: { deptId: string; userId: string }) => api.patch(`/departments/${deptId}/head`, { userId }),
    onSuccess: () => { toast.success('Head assigned.'); setShowAssignHead(null); qc.invalidateQueries({ queryKey: ['departments-admin'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ deptId, employeeId }: { deptId: string; employeeId: string }) =>
      api.post(`/departments/${deptId}/members`, { employeeId }),
    onSuccess: () => {
      toast.success('Employee added.');
      setAddSearch('');
      qc.invalidateQueries({ queryKey: ['dept-members', editDept?.id] });
      qc.invalidateQueries({ queryKey: ['departments-admin'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ deptId, employeeId }: { deptId: string; employeeId: string }) =>
      api.delete(`/departments/${deptId}/members/${employeeId}`),
    onSuccess: () => {
      toast.success('Employee removed.');
      qc.invalidateQueries({ queryKey: ['dept-members', editDept?.id] });
      qc.invalidateQueries({ queryKey: ['departments-admin'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const memberIds = new Set(members?.map((m) => m.id) ?? []);
  const filteredMembers = members?.filter((m) =>
    `${m.firstName} ${m.lastName} ${m.designation ?? ''}`.toLowerCase().includes(memberSearch.toLowerCase())
  ) ?? [];
  const availableToAdd = allEmployees?.filter((e) =>
    !memberIds.has(e.id) &&
    `${e.firstName} ${e.lastName} ${e.designation ?? ''}`.toLowerCase().includes(addSearch.toLowerCase())
  ) ?? [];

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
                {d.head?.employee
                  ? `${d.head.employee.firstName} ${d.head.employee.lastName}`
                  : <span className="text-red-400">Unassigned</span>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditDept(d); setForm({ name: d.name, description: d.description || '' }); setMemberSearch(''); setAddSearch(''); }} className="btn-secondary text-xs flex-1">Edit</button>
                <button onClick={() => { setShowAssignHead(d); setSelectedHead(''); }} className="btn-secondary text-xs flex-1">Assign Head</button>
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

      {/* Edit Modal — with Members panel */}
      {editDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl animate-slide-in flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h3 className="font-bold text-base">Edit Department — {editDept.name}</h3>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Left: details form */}
              <div className="md:w-56 shrink-0 p-6 border-b md:border-b-0 md:border-r border-gray-100 space-y-3">
                <div>
                  <label className="label">Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Description</label>
                  <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input" placeholder="Optional" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditDept(null)} className="btn-secondary flex-1 text-sm">Close</button>
                  <button
                    onClick={() => updateMutation.mutate({ id: editDept.id, body: form })}
                    disabled={!form.name || updateMutation.isPending}
                    className="btn-primary flex-1 text-sm"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Right: members panel */}
              <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
                {/* Add member row */}
                <div>
                  <p className="label mb-1">Add Employee</p>
                  <div className="relative">
                    <input
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      className="input pr-4"
                      placeholder="Search by name or designation…"
                    />
                    {addSearch && availableToAdd.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                        {availableToAdd.slice(0, 20).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => addMemberMutation.mutate({ deptId: editDept.id, employeeId: e.id })}
                            disabled={addMemberMutation.isPending}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                          >
                            <span className="font-medium">{e.firstName} {e.lastName}</span>
                            {e.designation && <span className="text-gray-400 ml-2 text-xs">{e.designation}</span>}
                            {e.department?.name && <span className="text-xs text-blue-400 ml-2">({e.department.name})</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {addSearch && !availableToAdd.length && (
                      <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                        No matching employees available
                      </div>
                    )}
                  </div>
                </div>

                {/* Current members list */}
                <div className="flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="label">Current Members ({members?.length ?? 0})</p>
                    {(members?.length ?? 0) > 4 && (
                      <input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="input text-xs w-40 py-1"
                        placeholder="Filter…"
                      />
                    )}
                  </div>

                  {membersLoading ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No members in this department</p>
                  ) : (
                    <div className="space-y-1">
                      {filteredMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 group">
                          <div>
                            <span className="text-sm font-medium">{m.firstName} {m.lastName}</span>
                            {m.designation && <span className="text-xs text-gray-400 ml-2">{m.designation}</span>}
                            <span className="text-xs text-gray-300 ml-2">{m.user?.role?.replace(/_/g, ' ')}</span>
                          </div>
                          <button
                            onClick={() => { if (confirm(`Remove ${m.firstName} ${m.lastName} from ${editDept.name}?`)) removeMemberMutation.mutate({ deptId: editDept.id, employeeId: m.id }); }}
                            disabled={removeMemberMutation.isPending}
                            className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Head Modal */}
      {showAssignHead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">Assign Department Head</h3>
            <p className="text-sm text-gray-500 mb-3">{showAssignHead.name}</p>

            {/* Department members list */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Department Members</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-4 max-h-44 overflow-y-auto">
              {!headCandidates || headCandidates.length === 0 ? (
                <p className="text-sm text-gray-400 p-3 text-center">No members in this department</p>
              ) : headCandidates.map((e) => {
                const uid = e.user?.id ?? e.id;
                const isSelected = selectedHead === uid;
                return (
                  <button
                    key={uid}
                    onClick={() => { setSelectedHead(uid); setHeadOutsideSearch(''); setShowHeadDropdown(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors border-b border-gray-100 last:border-0 ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    <span className="flex-1">{e.firstName} {e.lastName}</span>
                    {isSelected && (
                      <svg className="w-4 h-4 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Outside-department autocomplete */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Or assign from outside department</p>
            <div className="relative">
              <input
                type="text"
                value={headOutsideSearch}
                onChange={(e) => { setHeadOutsideSearch(e.target.value); setShowHeadDropdown(e.target.value.length >= 1); }}
                onFocus={() => { if (headOutsideSearch.length >= 1) setShowHeadDropdown(true); }}
                onBlur={() => setTimeout(() => setShowHeadDropdown(false), 150)}
                className="input"
                placeholder="Type a name to search..."
              />
              {showHeadDropdown && (() => {
                const q = headOutsideSearch.toLowerCase();
                const outside = (allEmployees ?? []).filter(
                  (e) => e.departmentId !== showAssignHead.id &&
                    `${e.firstName} ${e.lastName}`.toLowerCase().includes(q)
                );
                return outside.length > 0 ? (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl mt-1 shadow-lg max-h-44 overflow-y-auto">
                    {outside.map((e) => {
                      const uid = e.user?.id ?? e.id;
                      return (
                        <button
                          key={uid}
                          onClick={() => { setSelectedHead(uid); setHeadOutsideSearch(`${e.firstName} ${e.lastName}`); setShowHeadDropdown(false); }}
                          className="w-full flex flex-col px-4 py-2.5 text-sm text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                        >
                          <span className="font-medium text-gray-800">{e.firstName} {e.lastName}</span>
                          <span className="text-xs text-gray-400">{e.department?.name ?? 'No department'}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null;
              })()}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowAssignHead(null); setSelectedHead(''); setHeadOutsideSearch(''); setShowHeadDropdown(false); }}
                className="btn-secondary flex-1"
              >Cancel</button>
              <button
                onClick={() => assignHeadMutation.mutate({ deptId: showAssignHead.id, userId: selectedHead })}
                disabled={!selectedHead || assignHeadMutation.isPending}
                className="btn-primary flex-1"
              >
                {assignHeadMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
