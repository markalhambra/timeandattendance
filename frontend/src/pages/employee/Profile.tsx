import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Employee } from '../../types';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface MyPayslip {
  id: string;
  periodLabel: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  netPay: string | number | null;
  filename: string;
  size: number;
  createdAt: string;
  year: number;
  sheetName: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'info' | 'payslips' | 'password'>('info');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: profile } = useQuery<Employee>({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/employees/me').then((r) => r.data.data),
  });

  const { data: payslips, isLoading: payslipsLoading } = useQuery<MyPayslip[]>({
    queryKey: ['my-payslips'],
    queryFn: () => api.get('/payroll/me').then((r) => r.data.data),
    enabled: activeTab === 'payslips' || true,
  });

  const changePasswordMutation = useMutation({
    mutationFn: (body: any) => api.put('/auth/change-password', body),
    onSuccess: () => { toast.success('Password changed successfully.'); setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to change password.'),
  });

  const handleChangePassword = () => {
    if (passwords.newPassword !== passwords.confirmPassword) { toast.error('Passwords do not match.'); return; }
    if (passwords.newPassword.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    changePasswordMutation.mutate({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
  };

  const downloadPayslip = async (id: string, filename: string) => {
    setDownloadingId(id);
    try {
      const res = await api.get(`/payroll/me/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'payslip.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download payslip.');
    } finally {
      setDownloadingId(null);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="flex py-3 border-b border-gray-50">
      <div className="w-40 text-sm text-gray-500 font-medium">{label}</div>
      <div className="flex-1 text-sm font-semibold">{value || '—'}</div>
    </div>
  );

  const formatNet = (n: string | number | null | undefined) => {
    if (n == null || n === '') return '—';
    const num = typeof n === 'number' ? n : parseFloat(String(n));
    if (!Number.isFinite(num)) return '—';
    return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">View your profile, payslips, and account settings</p>
      </div>

      {/* Avatar + name */}
      <div className="card p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center text-2xl font-black flex-shrink-0">
          {profile?.firstName?.[0]}{profile?.lastName?.[0]}
        </div>
        <div>
          <div className="font-bold text-lg">{profile?.firstName} {profile?.lastName}</div>
          <div className="text-sm text-gray-500">{profile?.user?.email || user?.email}</div>
          <div className="text-xs text-gray-400 mt-0.5">{(profile?.user?.roles?.length ? profile.user.roles : profile?.user?.role ? [profile.user.role] : user?.roles?.length ? user.roles : user?.role ? [user.role] : []).map((r) => r.replace(/_/g, ' ')).join(', ') || '—'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {([
          { id: 'info' as const, label: 'Personal Info' },
          { id: 'payslips' as const, label: 'Payslips' },
          { id: 'password' as const, label: 'Change Password' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t.id ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' ? (
        <div className="card p-6">
          <InfoRow label="Employee No." value={profile?.employeeNumber} />
          <InfoRow label="First Name" value={profile?.firstName} />
          <InfoRow label="Last Name" value={profile?.lastName} />
          <InfoRow label="Nickname" value={profile?.nickname} />
          <InfoRow label="Gender" value={profile?.gender} />
          <InfoRow label="Birthday" value={profile?.birthday ? new Date(profile.birthday).toLocaleDateString('en-PH') : undefined} />
          <InfoRow label="Email" value={profile?.user?.email} />
          <InfoRow label="Department" value={profile?.department?.name} />
          <InfoRow label="Designation" value={profile?.designation} />
          <InfoRow label="Date Hired" value={profile?.dateHired ? new Date(profile.dateHired).toLocaleDateString('en-PH') : undefined} />
          <InfoRow label="Contact No." value={profile?.mobile} />
          <InfoRow label="Address" value={profile?.address} />
          <InfoRow label="Emergency Contact" value={profile?.emergencyContact} />
          <InfoRow label="Emergency Contact No." value={profile?.emergencyContactNumber} />
          <InfoRow label="SSS" value={profile?.sssNumber} />
          <InfoRow label="PhilHealth" value={profile?.philhealthNumber} />
          <InfoRow label="Pag-IBIG (HDMF)" value={profile?.pagibigNumber} />
          <InfoRow label="TIN" value={profile?.tinNumber} />
        </div>
      ) : activeTab === 'payslips' ? (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-sm">My Payslips</h2>
            <p className="text-xs text-gray-400 mt-0.5">Only the latest 4 payslips are kept. Older files are removed automatically.</p>
          </div>
          {payslipsLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />)}
            </div>
          ) : !payslips?.length ? (
            <div className="text-center text-sm text-gray-400 py-10">No payslips available yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {payslips.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{p.periodLabel}</div>
                    <div className="text-xs text-gray-400">
                      Net {formatNet(p.netPay)}
                      {p.createdAt ? ` · ${format(new Date(p.createdAt), 'MMM d, yyyy')}` : ''}
                    </div>
                  </div>
                  <button
                    className="btn-secondary text-xs"
                    disabled={downloadingId === p.id}
                    onClick={() => downloadPayslip(p.id, p.filename)}
                  >
                    {downloadingId === p.id ? '…' : 'Download PDF'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input
              type="password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              className="input"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              className="input"
              placeholder="Minimum 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              type="password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
              className="input"
              placeholder="Repeat new password"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={!passwords.currentPassword || !passwords.newPassword || changePasswordMutation.isPending}
            className="btn-primary w-full"
          >
            {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      )}
    </div>
  );
}
