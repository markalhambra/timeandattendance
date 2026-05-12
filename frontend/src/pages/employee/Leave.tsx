import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { LeaveBalance, LeaveRequest, LeaveType } from '../../types';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const LEAVE_TYPES: { value: LeaveType; label: string; desc: string }[] = [
  { value: 'SICK', label: 'Sick Leave', desc: 'For illness or medical appointments' },
  { value: 'VACATION', label: 'Vacation Leave', desc: 'For personal time off' },
  { value: 'PML', label: 'Pamilya Muna Leave', desc: 'For family-related matters' },
  { value: 'SML', label: 'Sarili Muna Leave', desc: 'For personal wellness' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'badge-pending',
  APPROVED: 'badge-approved',
  REJECTED: 'badge-rejected',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function LeavePage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ leaveType: 'SICK' as LeaveType, startDate: '', endDate: '', reason: '' });

  const { data: balances } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances'],
    queryFn: () => api.get('/leave/balances').then((r) => r.data.data),
  });

  const { data: leaves, isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ['my-leaves'],
    queryFn: () => api.get('/leave/my').then((r) => r.data.data),
  });

  const fileMutation = useMutation({
    mutationFn: (body: any) => api.post('/leave', body),
    onSuccess: () => {
      toast.success('Leave filed successfully.');
      setShowModal(false);
      setForm({ leaveType: 'SICK', startDate: '', endDate: '', reason: '' });
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to file leave.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leave/${id}`),
    onSuccess: () => { toast.success('Leave cancelled.'); qc.invalidateQueries({ queryKey: ['my-leaves'] }); qc.invalidateQueries({ queryKey: ['leave-balances'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to cancel.'),
  });

  const leaveTypeLabel = (t: string) => LEAVE_TYPES.find((l) => l.value === t)?.label || t;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">File and track your leave requests</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ File Leave</button>
      </div>

      {/* Leave balances */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {LEAVE_TYPES.map((lt) => {
          const bal = balances?.find((b) => b.leaveType === lt.value);
          const avail = bal ? bal.totalDays - bal.usedDays - bal.pendingDays : 0;
          return (
            <div key={lt.value} className="card p-4">
              <div className="text-xs text-gray-500 mb-1">{lt.label}</div>
              <div className="text-2xl font-black">{avail.toFixed(1)}</div>
              <div className="text-xs text-gray-400">of {bal?.totalDays ?? 0} days</div>
              {bal?.pendingDays ? <div className="text-[10px] text-yellow-600 mt-1">{bal.pendingDays} pending</div> : null}
            </div>
          );
        })}
      </div>

      {/* Leave history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">Leave History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Type', 'Start', 'End', 'Days', 'Status', 'Filed', ''].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(3)].map((_, i) => <tr key={i}><td colSpan={7}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>)
              ) : !leaves?.length ? (
                <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-10">No leave requests yet</td></tr>
              ) : (
                leaves.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium">{leaveTypeLabel(l.leaveType)}</td>
                    <td className="table-cell">{format(parseISO(l.startDate), 'MMM d, yyyy')}</td>
                    <td className="table-cell">{format(parseISO(l.endDate), 'MMM d, yyyy')}</td>
                    <td className="table-cell">{l.totalDays}</td>
                    <td className="table-cell"><span className={`badge ${STATUS_COLORS[l.status] || ''}`}>{l.status}</span></td>
                    <td className="table-cell text-gray-400">{format(parseISO(l.createdAt), 'MMM d')}</td>
                    <td className="table-cell">
                      {l.status === 'PENDING' && (
                        <button onClick={() => { if (confirm('Cancel this leave?')) cancelMutation.mutate(l.id); }} className="text-xs text-red-500 hover:text-red-700">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* File Leave Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-4">File Leave Request</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Leave Type</label>
                <select value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value as LeaveType }))} className="input">
                  {LEAVE_TYPES.map((lt) => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="input" min={format(new Date(), 'yyyy-MM-dd')} required />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="input" min={form.startDate} required />
                </div>
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="input resize-none" rows={3} placeholder="Provide details about your leave..." required />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => fileMutation.mutate(form)}
                disabled={!form.startDate || !form.endDate || !form.reason || fileMutation.isPending}
                className="btn-primary flex-1"
              >
                {fileMutation.isPending ? 'Filing...' : 'File Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
