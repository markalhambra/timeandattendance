import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Employee, Department, Role } from '../../types';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  firstName: '', lastName: '', middleName: '', nickname: '', email: '',
  mobile: '', address: '', designation: '', departmentId: '',
  dateHired: '', role: 'EMPLOYEE' as Role,
  gender: '', birthday: '', emergencyContact: '', emergencyContactNumber: '',
  sssNumber: '', pagibigNumber: '', philhealthNumber: '', tinNumber: '',
};

type Modal = 'none' | 'add' | 'edit' | 'resetPw' | 'importResult';

type ImportResult = { created: number; failed: number; errors: { row: number; error: string }[] };

export default function AdminEmployees() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [modal, setModal] = useState<Modal>('none');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newPassword, setNewPassword] = useState('');
  const [tempPwResult, setTempPwResult] = useState<{ name: string; password: string } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { data: depts } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.data) });
  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ['admin-employees', search, deptFilter],
    queryFn: () => api.get(`/employees?search=${encodeURIComponent(search)}&departmentId=${deptFilter}&limit=200`).then((r) => r.data.data),
    enabled: !showArchived,
  });
  const { data: archivedEmployees, isLoading: archivedLoading } = useQuery<Employee[]>({
    queryKey: ['admin-employees-archived', search, deptFilter],
    queryFn: () => api.get(`/employees?isArchived=true&search=${encodeURIComponent(search)}&departmentId=${deptFilter}&limit=200`).then((r) => r.data.data),
    enabled: showArchived,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => api.post('/employees', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
      const emp = res.data.data.employee;
      const pw = res.data.data.tempPassword;
      closeModal();
      setTempPwResult({ name: `${emp.firstName} ${emp.lastName}`, password: pw });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create employee.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY_FORM> }) => api.put(`/employees/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); toast.success('Employee updated.'); closeModal(); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); toast.success('Employee deleted.'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/employees/${id}/toggle-active`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); toast.success('Status updated.'); },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/employees/${id}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
      qc.invalidateQueries({ queryKey: ['admin-employees-archived'] });
      toast.success('Employee archived.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to archive.'),
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.patch(`/employees/${id}/reset-password`, { newPassword: password }),
    onSuccess: (res) => {
      const pw = res.data.data?.tempPassword;
      closeModal();
      if (pw) setTempPwResult({ name: `${selected?.firstName} ${selected?.lastName}`, password: pw });
      else toast.success('Password reset.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed.'),
  });

  const openAdd = () => { setForm(EMPTY_FORM); setModal('add'); };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await api.get('/employees/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export employees.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleTemplateDownload = async () => {
    try {
      const res = await api.get('/employees/template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/employees/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const result: ImportResult = res.data.data;
      setImportResult(result);
      setModal('importResult');
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  const openEdit = (e: Employee) => {
    setSelected(e);
    setForm({
      firstName: e.firstName, lastName: e.lastName, middleName: e.middleName ?? '',
      nickname: e.nickname ?? '', email: e.email, mobile: e.mobile ?? '', address: e.address ?? '',
      designation: e.designation ?? '', departmentId: e.departmentId ?? '',
      dateHired: e.dateHired ? e.dateHired.slice(0, 10) : '',
      role: (e.user?.role ?? 'EMPLOYEE') as Role,
      gender: e.gender ?? '', birthday: e.birthday ? e.birthday.slice(0, 10) : '',
      emergencyContact: e.emergencyContact ?? '', emergencyContactNumber: e.emergencyContactNumber ?? '',
      sssNumber: e.sssNumber ?? '', pagibigNumber: e.pagibigNumber ?? '',
      philhealthNumber: e.philhealthNumber ?? '', tinNumber: e.tinNumber ?? '',
    });
    setModal('edit');
  };
  const openResetPw = (e: Employee) => { setSelected(e); setNewPassword(''); setModal('resetPw'); };
  const closeModal = () => { setModal('none'); setSelected(null); };
  const confirmDelete = (e: Employee) => {
    if (confirm(`Delete ${e.firstName} ${e.lastName}? This will permanently deactivate their account.`)) deleteMutation.mutate(e.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Employee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">System-wide employee management</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleTemplateDownload} className="btn-secondary text-sm">Template</button>
          <button onClick={() => importInputRef.current?.click()} disabled={isImporting} className="btn-secondary text-sm">
            {isImporting ? 'Importing...' : 'Import'}
          </button>
          <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
          <button onClick={handleExport} disabled={isExporting} className="btn-secondary text-sm">
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
          <button onClick={openAdd} className="btn-primary">+ Add Employee</button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button onClick={() => setShowArchived(false)} className={`px-4 py-2 text-sm font-medium transition-colors ${!showArchived ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Active</button>
          <button onClick={() => setShowArchived(true)} className={`px-4 py-2 text-sm font-medium transition-colors ${showArchived ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Archived</button>
        </div>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, number or email..." className="input flex-1 min-w-48 text-sm" />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">All Departments</option>
          {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">{(showArchived ? archivedEmployees : employees)?.length ?? 0} {showArchived ? 'archived' : 'active'} employees</h2>
        </div>
        <div className="overflow-x-auto">
          {showArchived ? (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Name', 'Emp. No.', 'Dept', 'Designation', 'Resigned On', 'Actions'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {archivedLoading
                  ? [...Array(3)].map((_, i) => <tr key={i}><td colSpan={6}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>)
                  : !archivedEmployees?.length
                    ? <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No archived employees</td></tr>
                    : archivedEmployees.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 opacity-70">
                        <td className="table-cell">
                          <div className="font-semibold">{e.firstName} {e.lastName}</div>
                          <div className="text-xs text-gray-400">{e.email}</div>
                        </td>
                        <td className="table-cell font-mono text-xs">{e.employeeNumber}</td>
                        <td className="table-cell text-sm text-gray-500">{e.department?.name ?? '—'}</td>
                        <td className="table-cell text-sm text-gray-500">{e.designation ?? '—'}</td>
                        <td className="table-cell text-sm text-gray-500">{(e as any).resignedAt ? format(parseISO((e as any).resignedAt), 'MMM d, yyyy') : '—'}</td>
                        <td className="table-cell">
                          <button onClick={() => confirmDelete(e)} className="text-xs text-red-500 hover:text-red-700 underline">Delete</button>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Name', 'Emp. No.', 'Dept', 'Designation', 'Role', 'Date Hired', 'Status', 'Actions'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>)
                : !employees?.length
                  ? <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-10">No employees found</td></tr>
                  : employees.map((e) => (
                    <tr key={e.id} className={`hover:bg-gray-50 ${!e.isActive ? 'opacity-50' : ''}`}>
                      <td className="table-cell">
                        <div className="font-semibold">{e.firstName} {e.lastName}</div>
                        <div className="text-xs text-gray-400">{e.email}</div>
                      </td>
                      <td className="table-cell font-mono text-xs">{e.employeeNumber}</td>
                      <td className="table-cell text-sm text-gray-500">{e.department?.name ?? '—'}</td>
                      <td className="table-cell text-sm text-gray-500">{e.designation ?? '—'}</td>
                      <td className="table-cell text-xs">{e.user?.role?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="table-cell text-sm">{e.dateHired ? format(parseISO(e.dateHired), 'MMM d, yyyy') : '—'}</td>
                      <td className="table-cell">
                        <span className={`badge ${e.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {e.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => openEdit(e)} className="text-xs text-blue-600 hover:text-blue-800 underline">Edit</button>
                          <button onClick={() => { if (confirm(`${e.isActive ? 'Deactivate' : 'Activate'} ${e.firstName}?`)) toggleMutation.mutate(e.id); }} className="text-xs text-gray-500 hover:text-black underline">{e.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button onClick={() => openResetPw(e)} className="text-xs text-gray-500 hover:text-black underline">Reset PW</button>
                          <button onClick={() => { if (confirm(`Archive ${e.firstName} ${e.lastName} as resigned? They will no longer appear in reports or dashboards.`)) archiveMutation.mutate(e.id); }} className="text-xs text-orange-500 hover:text-orange-700 underline">Archive</button>
                          <button onClick={() => confirmDelete(e)} className="text-xs text-red-500 hover:text-red-700 underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-4">{modal === 'add' ? 'Add New Employee' : `Edit — ${selected?.firstName} ${selected?.lastName}`}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name *</label>
                <input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Juan" />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Dela Cruz" />
              </div>
              <div>
                <label className="label">Middle Name</label>
                <input className="input" value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} placeholder="Santos" />
              </div>
              <div>
                <label className="label">Nickname</label>
                <input className="input" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="JD" />
              </div>
              <div>
                <label className="label">Email {modal === 'add' ? '*' : ''}</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="juan@company.com" disabled={modal === 'edit'} />
              </div>
              <div>
                <label className="label">Mobile</label>
                <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="09xxxxxxxxx" />
              </div>
              <div>
                <label className="label">Gender</label>
                <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="label">Birthday</label>
                <input type="date" className="input" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
              </div>
              <div>
                <label className="label">Designation *</label>
                <input className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Software Engineer" />
              </div>
              <div>
                <label className="label">Department *</label>
                <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                  <option value="">Select department</option>
                  {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="DEPARTMENT_HEAD">Department Head</option>
                  <option value="HR">HR</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Date Hired *</label>
                <input type="date" className="input" value={form.dateHired} onChange={(e) => setForm({ ...form, dateHired: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="label">Present Address</label>
                <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City" />
              </div>
              <div>
                <label className="label">Emergency Contact Person</label>
                <input className="input" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Maria Dela Cruz" />
              </div>
              <div>
                <label className="label">Emergency Contact Number</label>
                <input className="input" value={form.emergencyContactNumber} onChange={(e) => setForm({ ...form, emergencyContactNumber: e.target.value })} placeholder="09xxxxxxxxx" />
              </div>
            </div>
            <p className="text-xs font-semibold text-gray-500 mt-4 mb-2">Government ID Numbers</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">SSS</label>
                <input className="input" value={form.sssNumber} onChange={(e) => setForm({ ...form, sssNumber: e.target.value })} placeholder="XX-XXXXXXX-X" />
              </div>
              <div>
                <label className="label">PhilHealth</label>
                <input className="input" value={form.philhealthNumber} onChange={(e) => setForm({ ...form, philhealthNumber: e.target.value })} placeholder="XX-XXXXXXXXX-X" />
              </div>
              <div>
                <label className="label">Pag-IBIG (HDMF)</label>
                <input className="input" value={form.pagibigNumber} onChange={(e) => setForm({ ...form, pagibigNumber: e.target.value })} placeholder="XXXX-XXXX-XXXX" />
              </div>
              <div>
                <label className="label">TIN</label>
                <input className="input" value={form.tinNumber} onChange={(e) => setForm({ ...form, tinNumber: e.target.value })} placeholder="XXX-XXX-XXX" />
              </div>
            </div>
            {modal === 'add' && <p className="text-xs text-gray-400 mt-3">A temporary password will be generated. Share it securely.</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => modal === 'add' ? createMutation.mutate(form) : selected && updateMutation.mutate({ id: selected.id, data: form })}
                disabled={!form.firstName || !form.lastName || !form.designation || !form.departmentId || !form.dateHired || (modal === 'add' && !form.email) || createMutation.isPending || updateMutation.isPending}
                className="btn-primary flex-1"
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : modal === 'add' ? 'Create Employee' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {modal === 'resetPw' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-4">{selected.firstName} {selected.lastName}</p>
            <div>
              <label className="label">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Minimum 8 characters" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => resetMutation.mutate({ id: selected.id, password: newPassword })} disabled={newPassword.length < 8 || resetMutation.isPending} className="btn-primary flex-1">
                {resetMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Temp Password Result */}
      {tempPwResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="font-bold text-base">{tempPwResult.name}</h3>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-xs text-amber-700 font-semibold mb-1">Temporary Password — share securely</p>
              <p className="font-mono text-sm font-bold text-amber-900 break-all">{tempPwResult.password}</p>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(tempPwResult!.password); toast.success('Copied!'); }} className="btn-secondary w-full mb-2 text-sm">Copy Password</button>
            <button onClick={() => setTempPwResult(null)} className="btn-primary w-full text-sm">Done</button>
          </div>
        </div>
      )}

      {/* Import Result Modal */}
      {modal === 'importResult' && importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-slide-in max-h-[80vh] flex flex-col">
            <h3 className="font-bold text-base mb-1">Import Results</h3>
            <div className="flex gap-4 my-3">
              <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-green-600">{importResult.created}</p>
                <p className="text-xs text-green-700">Created</p>
              </div>
              <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-red-500">{importResult.failed}</p>
                <p className="text-xs text-red-600">Failed</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="flex-1 overflow-y-auto border border-red-100 rounded-xl p-3 mb-4 space-y-1">
                <p className="text-xs font-semibold text-red-600 mb-2">Errors</p>
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-xs text-gray-600"><span className="font-semibold text-gray-800">Row {e.row}:</span> {e.error}</div>
                ))}
              </div>
            )}
            <button onClick={() => { setModal('none'); setImportResult(null); }} className="btn-primary w-full text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
