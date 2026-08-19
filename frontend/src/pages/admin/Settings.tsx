import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface ApproverCandidate {
  id: string;
  email: string;
  role: string;
  name: string;
}

interface AdminSettingsData {
  officeLat: number;
  officeLng: number;
  officeRadiusMeters: number;
  otThresholdHours: number;
  maxFailedLoginAttempts: number;
  lockoutDurationMinutes: number;
  deptHeadApproverUserId: string | null;
  deptHeadApprover: ApproverCandidate | null;
}

type FormState = {
  officeLat: string;
  officeLng: string;
  officeRadiusMeters: string;
  otThresholdHours: string;
  maxFailedLoginAttempts: string;
  lockoutDurationMinutes: string;
  deptHeadApproverUserId: string;
};

function toForm(data: AdminSettingsData): FormState {
  return {
    officeLat: String(data.officeLat ?? ''),
    officeLng: String(data.officeLng ?? ''),
    officeRadiusMeters: String(data.officeRadiusMeters ?? ''),
    otThresholdHours: String(data.otThresholdHours ?? ''),
    maxFailedLoginAttempts: String(data.maxFailedLoginAttempts ?? ''),
    lockoutDurationMinutes: String(data.lockoutDurationMinutes ?? ''),
    deptHeadApproverUserId: data.deptHeadApproverUserId || '',
  };
}

export default function AdminSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  const { data, isLoading, isError } = useQuery<AdminSettingsData>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/settings').then((r) => r.data.data),
  });

  const { data: candidates } = useQuery<ApproverCandidate[]>({
    queryKey: ['admin-settings-approver-candidates'],
    queryFn: () => api.get('/settings/approver-candidates').then((r) => r.data.data),
  });

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put('/settings', body),
    onSuccess: (res) => {
      toast.success('Settings saved.');
      qc.setQueryData(['admin-settings'], res.data.data);
      qc.invalidateQueries({ queryKey: ['office-settings'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save settings.');
    },
  });

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const [previewData, setPreviewData] = useState<{ count: number; cutoffDate: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const handlePreview = async () => {
    try {
      setPreviewing(true);
      const r = await api.get('/settings/archive-attendance/preview');
      setPreviewData(r.data.data);
    } catch {
      toast.error('Failed to get archive preview.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleArchive = async () => {
    if (!previewData?.count) return;
    try {
      setArchiving(true);
      const resp = await api.post('/settings/archive-attendance', {}, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_archive_before_${previewData.cutoffDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setPreviewData(null);
      toast.success('Archive downloaded and old records deleted.');
    } catch (err: any) {
      const text = await err?.response?.data?.text?.();
      let msg = 'Archive failed.';
      try { msg = JSON.parse(text)?.message || msg; } catch { /* use default */ }
      toast.error(msg);
    } finally {
      setArchiving(false);
    }
  };

  const handleBackup = async () => {
    try {
      setBackingUp(true);
      const resp = await api.get('/settings/backup', { responseType: 'blob' });
      const today = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tams_backup_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Backup failed.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    const file = restoreFileRef.current?.files?.[0];
    if (!file) { toast.error('Please select an XLSX file.'); return; }
    try {
      setRestoring(true);
      setRestoreResult(null);
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/settings/restore-attendance', fd);
      setRestoreResult(r.data.data.message);
      toast.success('Restore complete.');
      if (restoreFileRef.current) restoreFileRef.current.value = '';
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  const handleSave = () => {
    if (!form) return;
    saveMutation.mutate({
      officeLat: parseFloat(form.officeLat),
      officeLng: parseFloat(form.officeLng),
      officeRadiusMeters: parseFloat(form.officeRadiusMeters),
      otThresholdHours: parseFloat(form.otThresholdHours),
      maxFailedLoginAttempts: parseInt(form.maxFailedLoginAttempts, 10),
      lockoutDurationMinutes: parseInt(form.lockoutDurationMinutes, 10),
      deptHeadApproverUserId: form.deptHeadApproverUserId || null,
    });
  };

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <div className="text-sm text-red-500 p-4">Failed to load settings. Please refresh.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <span aria-hidden>⚙</span>
            Admin Settings
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            System configuration. Only administrators can access this page.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-primary"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Attendance */}
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-sm">Attendance</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Office geofence used for on-site clock-in and overtime threshold after a full workday.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Office latitude</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.officeLat}
              onChange={(e) => setField('officeLat', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Office longitude</label>
            <input
              type="number"
              step="any"
              className="input"
              value={form.officeLng}
              onChange={(e) => setField('officeLng', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Radius (meters)</label>
            <input
              type="number"
              min={10}
              className="input"
              value={form.officeRadiusMeters}
              onChange={(e) => setField('officeRadiusMeters', e.target.value)}
            />
          </div>
          <div>
            <label className="label">OT threshold (hours)</label>
            <input
              type="number"
              min={1}
              max={24}
              step="0.25"
              className="input"
              value={form.otThresholdHours}
              onChange={(e) => setField('otThresholdHours', e.target.value)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Working time above this counts as overtime (default 9h).
            </p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-sm">Security</h2>
          <p className="text-xs text-gray-500 mt-0.5">Login lockout after repeated failed attempts.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Max failed login attempts</label>
            <input
              type="number"
              min={1}
              max={50}
              className="input"
              value={form.maxFailedLoginAttempts}
              onChange={(e) => setField('maxFailedLoginAttempts', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Lockout duration (minutes)</label>
            <input
              type="number"
              min={0}
              max={10080}
              className="input"
              value={form.lockoutDurationMinutes}
              onChange={(e) => setField('lockoutDurationMinutes', e.target.value)}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              0 = locked until HR/Admin unlocks the account. Greater than 0 auto-unlocks after that many minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Approvals */}
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-sm">Approvals</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            When a department head files leave, OT, conversion, or correction, notify this user instead of all HR.
          </p>
        </div>
        <div>
          <label className="label">Default department head approver</label>
          <select
            className="input"
            value={form.deptHeadApproverUserId}
            onChange={(e) => setField('deptHeadApproverUserId', e.target.value)}
          >
            <option value="">All active HR (default)</option>
            {(candidates || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.email} ({c.role})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            Must be an active HR or ADMIN user. Leave empty to keep notifying every active HR user.
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-primary"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Database Management */}
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-bold text-sm">Database Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">Archive old records to free up Supabase storage. Only administrators can perform these actions.</p>
        </div>

        {/* Archive & Purge */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Archive & Purge Attendance</h3>
            <p className="text-xs text-gray-400 mt-0.5">Download all attendance records older than 6 months as XLSX, then permanently delete them from the database.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handlePreview} disabled={previewing} className="btn-secondary text-sm">
              {previewing ? 'Checking…' : 'Preview'}
            </button>
            {previewData && (
              <span className="text-sm text-gray-600">
                {previewData.count > 0
                  ? `${previewData.count} record${previewData.count !== 1 ? 's' : ''} before ${previewData.cutoffDate}`
                  : 'No records older than 6 months.'}
              </span>
            )}
            {previewData && previewData.count > 0 && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {archiving ? 'Archiving…' : `Archive & Delete ${previewData.count} records`}
              </button>
            )}
          </div>
          {previewData && previewData.count > 0 && (
            <p className="text-[11px] text-red-500">⚠ This permanently deletes the records shown above. The XLSX will download automatically.</p>
          )}
        </div>

        {/* Full Backup */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Full Data Backup</h3>
            <p className="text-xs text-gray-400 mt-0.5">Export all employees, attendance, leave, and overtime records as a multi-sheet XLSX.</p>
          </div>
          <button onClick={handleBackup} disabled={backingUp} className="btn-secondary text-sm disabled:opacity-50">
            {backingUp ? 'Preparing…' : 'Download Backup XLSX'}
          </button>
        </div>

        {/* Restore */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Restore Attendance from Archive</h3>
            <p className="text-xs text-gray-400 mt-0.5">Upload a previously downloaded archive XLSX to re-import attendance records. Safe to run multiple times — upserts by employee + date.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={restoreFileRef}
              type="file"
              accept=".xlsx"
              className="text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
            <button onClick={handleRestore} disabled={restoring} className="btn-secondary text-sm disabled:opacity-50">
              {restoring ? 'Restoring…' : 'Restore'}
            </button>
          </div>
          {restoreResult && <p className="text-xs text-green-600">{restoreResult}</p>}
        </div>
      </section>
    </div>
  );
}
