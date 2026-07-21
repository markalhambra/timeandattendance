import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Employee, Department } from '../../types';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const DOC_TYPES = ['201', 'Contract', 'ID', 'OTHER'];

interface DocRow {
  id: string;
  type: string;
  originalName: string;
  size: number;
  uploadedAt: string;
  path: string;
}

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Editing state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Employee>>({});

  // Profile picture
  const picInputRef = useRef<HTMLInputElement>(null);
  const [picUploading, setPicUploading] = useState(false);

  // Document upload
  const docInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('201');
  const [docUploading, setDocUploading] = useState(false);

  const { data: depts } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.data),
  });

  const { data: employee, isLoading } = useQuery<Employee>({
    queryKey: ['employee-profile', id],
    queryFn: () => api.get(`/employees/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: docs, refetch: refetchDocs } = useQuery<DocRow[]>({
    queryKey: ['employee-docs', id],
    queryFn: () => api.get(`/employees/${id}/documents`).then((r) => r.data.data),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Employee>) => api.put(`/employees/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-profile', id] });
      toast.success('Employee updated.');
      setEditing(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/employees/${id}/documents/${docId}`),
    onSuccess: () => { refetchDocs(); toast.success('Document deleted.'); },
    onError: () => toast.error('Failed to delete document.'),
  });

  const unlockMutation = useMutation({
    mutationFn: () => api.patch(`/employees/${id}/unlock`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-profile', id] });
      toast.success('Account unlocked.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to unlock.'),
  });

  const startEdit = () => {
    if (!employee) return;
    setForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      middleName: employee.middleName ?? '',
      nickname: employee.nickname ?? '',
      mobile: employee.mobile ?? '',
      address: employee.address ?? '',
      designation: employee.designation ?? '',
      departmentId: employee.departmentId ?? '',
      dateHired: employee.dateHired ? employee.dateHired.slice(0, 10) : '',
      gender: employee.gender ?? '',
      birthday: employee.birthday ? employee.birthday.slice(0, 10) : '',
      emergencyContact: employee.emergencyContact ?? '',
      emergencyContactNumber: employee.emergencyContactNumber ?? '',
      sssNumber: employee.sssNumber ?? '',
      pagibigNumber: employee.pagibigNumber ?? '',
      philhealthNumber: employee.philhealthNumber ?? '',
      tinNumber: employee.tinNumber ?? '',
    });
    setEditing(true);
  };

  const handlePicChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicUploading(true);
    try {
      const fd = new FormData();
      fd.append('picture', file);
      await api.post(`/employees/${id}/profile-picture`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['employee-profile', id] });
      toast.success('Profile picture updated.');
    } catch {
      toast.error('Failed to upload picture.');
    } finally {
      setPicUploading(false);
      e.target.value = '';
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', docType);
      await api.post(`/employees/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      refetchDocs();
      toast.success('Document uploaded.');
    } catch {
      toast.error('Failed to upload document.');
    } finally {
      setDocUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (doc: DocRow) => {
    try {
      const resp = await api.get(`/uploads/documents/${doc.path.split('/').pop()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(doc.path, '_blank');
    }
  };

  const Field = ({ label, value }: { label: string; value?: string }) => (
    <div>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value || '—'}</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!employee) {
    return <div className="text-center py-20 text-gray-400">Employee not found.</div>;
  }

  const initials = `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase();

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/hr/employees')} className="text-gray-400 hover:text-black text-sm flex items-center gap-1">
          ← Back
        </button>
        <div className="flex-1" />
        {!editing && (
          <button onClick={startEdit} className="btn-primary text-sm">Edit Profile</button>
        )}
      </div>

      {/* Profile header card */}
      <div className="card p-6 flex items-center gap-6">
        <div className="relative">
          {employee.profilePicture ? (
            <img src={employee.profilePicture} alt="Profile" className="w-24 h-24 rounded-2xl object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-gray-900 flex items-center justify-center text-white text-2xl font-bold">
              {initials}
            </div>
          )}
          <button
            onClick={() => picInputRef.current?.click()}
            disabled={picUploading}
            className="absolute -bottom-2 -right-2 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow hover:bg-gray-50 text-xs"
            title="Change photo"
          >
            {picUploading ? '…' : '✎'}
          </button>
          <input ref={picInputRef} type="file" accept="image/*" className="hidden" onChange={handlePicChange} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black">{employee.firstName} {employee.middleName ? employee.middleName + ' ' : ''}{employee.lastName}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{employee.designation || '—'} · {employee.department?.name || 'No department'}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-lg">{employee.employeeNumber}</span>
            <span className={`badge ${employee.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {employee.isActive ? 'Active' : 'Inactive'}
            </span>
            {employee.user?.lockedAt && (
              <>
                <span className="badge bg-orange-50 text-orange-700">🔒 Locked</span>
                <button
                  onClick={() => { if (confirm('Unlock this account?')) unlockMutation.mutate(); }}
                  disabled={unlockMutation.isPending}
                  className="text-xs px-3 py-1 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 transition-colors font-medium disabled:opacity-50"
                >
                  {unlockMutation.isPending ? 'Unlocking…' : 'Unlock Account'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-sm">Edit Employee Information</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input className="input" value={form.firstName ?? ''} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input className="input" value={form.lastName ?? ''} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label className="label">Middle Name</label>
              <input className="input" value={form.middleName ?? ''} onChange={(e) => setForm({ ...form, middleName: e.target.value })} />
            </div>
            <div>
              <label className="label">Nickname</label>
              <input className="input" value={form.nickname ?? ''} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
            </div>
            <div>
              <label className="label">Gender</label>
              <select className="input" value={form.gender ?? ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="label">Birthday</label>
              <input type="date" className="input" value={form.birthday as string ?? ''} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
            </div>
            <div>
              <label className="label">Designation</label>
              <input className="input" value={form.designation ?? ''} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input className="input" value={form.mobile ?? ''} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="09xxxxxxxxx" />
            </div>
            <div>
              <label className="label">Department</label>
              <select className="input" value={form.departmentId ?? ''} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select department</option>
                {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date Hired</label>
              <input type="date" className="input" value={form.dateHired as string ?? ''} onChange={(e) => setForm({ ...form, dateHired: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label">Present Address</label>
              <input className="input" value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
            </div>
            <div>
              <label className="label">Emergency Contact Person</label>
              <input className="input" value={form.emergencyContact ?? ''} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Name" />
            </div>
            <div>
              <label className="label">Emergency Contact Number</label>
              <input className="input" value={form.emergencyContactNumber ?? ''} onChange={(e) => setForm({ ...form, emergencyContactNumber: e.target.value })} placeholder="09xxxxxxxxx" />
            </div>
          </div>

          <hr className="border-gray-100" />
          <h3 className="font-semibold text-sm text-gray-700">Government ID Numbers</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">SSS Number</label>
              <input className="input" value={form.sssNumber ?? ''} onChange={(e) => setForm({ ...form, sssNumber: e.target.value })} placeholder="XX-XXXXXXX-X" />
            </div>
            <div>
              <label className="label">Pag-IBIG Number</label>
              <input className="input" value={form.pagibigNumber ?? ''} onChange={(e) => setForm({ ...form, pagibigNumber: e.target.value })} placeholder="XXXX-XXXX-XXXX" />
            </div>
            <div>
              <label className="label">PhilHealth Number</label>
              <input className="input" value={form.philhealthNumber ?? ''} onChange={(e) => setForm({ ...form, philhealthNumber: e.target.value })} placeholder="XX-XXXXXXXXX-X" />
            </div>
            <div>
              <label className="label">TIN Number</label>
              <input className="input" value={form.tinNumber ?? ''} onChange={(e) => setForm({ ...form, tinNumber: e.target.value })} placeholder="XXX-XXX-XXX" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => updateMutation.mutate(form)}
              disabled={!form.firstName || !form.lastName || updateMutation.isPending}
              className="btn-primary flex-1"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Info panels */}
      {!editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Information */}
          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-sm">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employee No." value={employee.employeeNumber} />
              <Field label="Email" value={employee.email} />
              <Field label="Mobile" value={employee.mobile} />
              <Field label="Nickname" value={employee.nickname} />
              <Field label="Gender" value={employee.gender} />
              <Field label="Birthday" value={employee.birthday ? format(parseISO(employee.birthday), 'MMMM d, yyyy') : undefined} />
              <Field label="Date Hired" value={employee.dateHired ? format(parseISO(employee.dateHired), 'MMMM d, yyyy') : undefined} />
              <Field label="Designation" value={employee.designation} />
              <Field label="Department" value={employee.department?.name} />
              <Field label="Emergency Contact" value={employee.emergencyContact} />
              <Field label="Emergency No." value={employee.emergencyContactNumber} />
              <div className="col-span-2">
                <Field label="Present Address" value={employee.address} />
              </div>
              <Field label="Last Login" value={employee.user?.lastLogin ? format(parseISO(employee.user.lastLogin), 'MMM d, yyyy h:mm a') : undefined} />
              <Field label="Role" value={employee.user?.role} />
            </div>
          </div>

          {/* Government IDs */}
          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-sm">Government ID Numbers</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="SSS Number" value={employee.sssNumber} />
              <Field label="Pag-IBIG Number" value={employee.pagibigNumber} />
              <Field label="PhilHealth Number" value={employee.philhealthNumber} />
              <Field label="TIN Number" value={employee.tinNumber} />
            </div>
          </div>
        </div>
      )}

      {/* Documents */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">201 File & Supporting Documents</h2>
          <div className="flex items-center gap-2">
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input w-auto text-xs py-1.5">
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={() => docInputRef.current?.click()}
              disabled={docUploading}
              className="btn-primary text-xs py-1.5 px-3"
            >
              {docUploading ? 'Uploading…' : '+ Upload File'}
            </button>
            <input ref={docInputRef} type="file" className="hidden" onChange={handleDocUpload}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
          </div>
        </div>

        {!docs?.length ? (
          <p className="text-sm text-gray-400 py-6 text-center">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                  {doc.originalName.split('.').pop()?.toUpperCase().slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <a
                    href={`/api${doc.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-700 hover:underline truncate block"
                  >
                    {doc.originalName}
                  </a>
                  <p className="text-xs text-gray-400">{doc.type} · {(doc.size / 1024).toFixed(0)} KB · {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleDownload(doc)} className="text-xs text-gray-500 hover:text-black underline">Download</button>
                  <button onClick={() => { if (confirm('Delete this document?')) deleteMutation.mutate(doc.id); }} className="text-xs text-red-500 hover:text-red-700 underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
