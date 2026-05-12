import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Employee } from '../../types';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const { data: profile } = useQuery<Employee>({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/employees/profile').then((r) => r.data.data),
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

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="flex py-3 border-b border-gray-50">
      <div className="w-40 text-sm text-gray-500 font-medium">{label}</div>
      <div className="flex-1 text-sm font-semibold">{value || '—'}</div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">View your profile and manage account settings</p>
      </div>

      {/* Avatar + name */}
      <div className="card p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center text-2xl font-black flex-shrink-0">
          {profile?.user?.firstName?.[0]}{profile?.user?.lastName?.[0]}
        </div>
        <div>
          <div className="font-bold text-lg">{profile?.user?.firstName} {profile?.user?.lastName}</div>
          <div className="text-sm text-gray-500">{profile?.user?.email}</div>
          <div className="text-xs text-gray-400 mt-0.5">{profile?.user?.role?.replace('_', ' ')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(['info', 'password'] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}>
            {t === 'info' ? 'Personal Info' : 'Change Password'}
          </button>
        ))}
      </div>

      {activeTab === 'info' ? (
        <div className="card p-6">
          <InfoRow label="Employee No." value={profile?.employeeNumber} />
          <InfoRow label="First Name" value={profile?.user?.firstName} />
          <InfoRow label="Last Name" value={profile?.user?.lastName} />
          <InfoRow label="Email" value={profile?.user?.email} />
          <InfoRow label="Department" value={profile?.department?.name} />
          <InfoRow label="Position" value={profile?.position} />
          <InfoRow label="Date Hired" value={profile?.dateHired ? new Date(profile.dateHired).toLocaleDateString('en-PH') : undefined} />
          <InfoRow label="Contact No." value={profile?.contactNumber} />
          <InfoRow label="Address" value={profile?.address} />
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
