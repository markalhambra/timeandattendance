import { useEffect, useState } from 'react';
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
    </div>
  );
}
