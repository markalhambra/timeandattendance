import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { LeaveBalance, LeaveRequest, LeaveType, Employee } from '../../types';
import { format, parseISO, addMonths } from 'date-fns';
import toast from 'react-hot-toast';

const LEAVE_TYPES: { value: LeaveType; label: string; desc: string }[] = [
  { value: 'SICK', label: 'Sick Leave', desc: 'For illness or medical appointments' },
  { value: 'VACATION', label: 'Vacation Leave', desc: 'For personal time off' },
  { value: 'PML', label: 'Pamilya Muna Leave', desc: 'For family-related matters' },
  { value: 'SML', label: 'Sarili Muna Leave', desc: 'For personal wellness' },
  { value: 'EMERGENCY', label: 'Emergency Leave', desc: 'For urgent and unexpected situations' },
  { value: 'SOLO_PARENT', label: 'Solo Parent Leave', desc: 'For qualified solo parents' },
  { value: 'MATERNITY', label: 'Maternity Leave', desc: 'For childbirth and recovery' },
  { value: 'PATERNITY', label: 'Paternity Leave', desc: 'For fathers after childbirth' },
  { value: 'BEREAVEMENT', label: 'Bereavement Leave', desc: 'For the loss of a family member' },
  { value: 'MAGNA_CARTA_WOMEN', label: 'Magna Carta for Women Leave', desc: 'For qualified benefits under the Magna Carta of Women' },
  { value: 'LWOP', label: 'Leave Without Pay', desc: 'Unpaid leave — no balance required' },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'badge-pending',
  APPROVED: 'badge-approved',
  REJECTED: 'badge-rejected',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function LeavePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [lwopOnly, setLwopOnly] = useState(false);
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);
  type LeaveDuration = 'FULL_DAY' | 'HALF_DAY_MORNING' | 'HALF_DAY_AFTERNOON';
  const HALF_DAY_TYPES: LeaveType[] = ['SICK', 'VACATION', 'EMERGENCY'];
  const [form, setForm] = useState({ leaveType: 'SICK' as LeaveType, leaveDuration: 'FULL_DAY' as LeaveDuration, startDate: '', endDate: '', reason: '' });
  const isHalfDay = form.leaveDuration !== 'FULL_DAY';
  const supportsHalfDay = HALF_DAY_TYPES.includes(form.leaveType);

  const { data: myProfile } = useQuery<Employee>({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/employees/me').then((r) => r.data.data),
  });

  const sixMonthDate = myProfile?.dateHired ? addMonths(parseISO(myProfile.dateHired), 6) : null;
  const isBelowSixMonths = sixMonthDate ? new Date() < sixMonthDate : false;
  const eligibleOn = sixMonthDate ? format(sixMonthDate, 'MMMM d, yyyy') : null;

  const { data: balances } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances'],
    queryFn: () => api.get('/leave/balances').then((r) => r.data.data),
  });

  const { data: leaves, isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ['my-leaves'],
    queryFn: () => api.get('/leave/my').then((r) => r.data.data),
  });

  const balanceMap = useMemo(
    () => new Map(balances?.map((b) => [b.leaveType, b]) ?? []),
    [balances],
  );

  const fileMutation = useMutation({
    mutationFn: (body: any) => api.post('/leave', body),
    onSuccess: () => {
      toast.success('Leave filed successfully.');
      closeModal();
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

  const openLwopModal = () => {
    setForm((f) => ({ ...f, leaveType: 'LWOP', leaveDuration: 'FULL_DAY' }));
    setLwopOnly(true);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setLwopOnly(false);
    setForm({ leaveType: 'SICK', leaveDuration: 'FULL_DAY', startDate: '', endDate: '', reason: '' });
  };

  const getLeaveStage = (l: LeaveRequest): { label: string; color: string } => {
    if (l.status === 'CANCELLED') return { label: 'Cancelled', color: 'bg-gray-100 text-gray-500' };
    if (l.status === 'APPROVED') return { label: 'Approved', color: 'badge-approved' };
    if (l.status === 'REJECTED') {
      return { label: l.deptHeadStatus === 'REJECTED' ? 'Rejected by Dept Head' : 'Rejected by HR', color: 'badge-rejected' };
    }
    return { label: 'Pending', color: 'badge-pending' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">File and track your leave requests</p>
        </div>
        <div className="flex items-center gap-2">
          {isBelowSixMonths && (
            <button onClick={openLwopModal} className="btn-primary">
              + File LWOP
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            disabled={isBelowSixMonths}
            title={isBelowSixMonths && eligibleOn ? `Leave filing is available after 6 months of service. Eligible on ${eligibleOn}.` : undefined}
            className={`btn-primary ${isBelowSixMonths ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            + File Leave
          </button>
        </div>
      </div>

      {isBelowSixMonths && (
        <div className="card p-4 bg-amber-50 border border-amber-200 flex items-start gap-3">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Leave filing not yet available</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Employees must complete 6 months of service before filing leaves.
              {eligibleOn ? ` You will be eligible on ${eligibleOn}.` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Leave balances — LWOP has no balance to track */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {LEAVE_TYPES.filter((lt) => lt.value !== 'LWOP').map((lt) => {
          const bal = balanceMap.get(lt.value);
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
                    <td className="table-cell">
                      <span className={`badge ${getLeaveStage(l).color}`}>{getLeaveStage(l).label}</span>
                    </td>
                    <td className="table-cell text-gray-400">{format(parseISO(l.createdAt), 'MMM d')}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setViewLeave(l)} className="text-xs text-blue-600 hover:text-blue-800">View</button>
                        {l.status === 'PENDING' && (
                          <button onClick={() => { if (confirm('Cancel this leave?')) cancelMutation.mutate(l.id); }} className="text-xs text-red-500 hover:text-red-700">Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Leave Details Modal */}
      {viewLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-slide-in">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">{leaveTypeLabel(viewLeave.leaveType)}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {format(parseISO(viewLeave.startDate), 'MMM d')} – {format(parseISO(viewLeave.endDate), 'MMM d, yyyy')} · {viewLeave.totalDays} day{viewLeave.totalDays !== 1 ? 's' : ''}
                </p>
              </div>
              <span className={`badge ${getLeaveStage(viewLeave).color}`}>{getLeaveStage(viewLeave).label}</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-400 font-medium mb-1">Your Reason</div>
                <div className="text-gray-700">{viewLeave.reason}</div>
              </div>
              {viewLeave.deptHeadStatus ? (
                <div className={`rounded-xl p-3 ${viewLeave.deptHeadStatus === 'APPROVED' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${viewLeave.deptHeadStatus === 'APPROVED' ? 'text-green-700' : 'text-red-700'}`}>
                      Dept Head — {viewLeave.deptHeadStatus}
                    </span>
                    {viewLeave.deptHeadAt && <span className="text-xs text-gray-400">{format(parseISO(viewLeave.deptHeadAt), 'MMM d, yyyy')}</span>}
                  </div>
                  <div className="text-xs text-gray-600">{viewLeave.deptHeadNotes || 'No remarks.'}</div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400 font-medium">Dept Head — Pending review</div>
                </div>
              )}
              {viewLeave.hrStatus ? (
                <div className={`rounded-xl p-3 ${viewLeave.hrStatus === 'APPROVED' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${viewLeave.hrStatus === 'APPROVED' ? 'text-green-700' : 'text-red-700'}`}>
                      HR — {viewLeave.hrStatus}
                    </span>
                    {viewLeave.hrAt && <span className="text-xs text-gray-400">{format(parseISO(viewLeave.hrAt), 'MMM d, yyyy')}</span>}
                  </div>
                  <div className="text-xs text-gray-600">{viewLeave.hrNotes || 'No remarks.'}</div>
                </div>
              ) : viewLeave.deptHeadStatus === 'APPROVED' ? (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400 font-medium">HR — Pending review</div>
                </div>
              ) : null}
            </div>
            <button onClick={() => setViewLeave(null)} className="btn-secondary w-full mt-5">Close</button>
          </div>
        </div>
      )}

      {/* File Leave Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-4">{lwopOnly ? 'File Leave Without Pay (LWOP)' : 'File Leave Request'}</h3>
            {lwopOnly && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                LWOP is unpaid leave. No leave balance will be deducted. Subject to approval.
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="label">Leave Type</label>
                {lwopOnly ? (
                  <div className="input bg-gray-50 text-gray-700">Leave Without Pay (LWOP)</div>
                ) : (
                  <select
                    value={form.leaveType}
                    onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value as LeaveType, leaveDuration: 'FULL_DAY' }))}
                    className="input"
                  >
                    {LEAVE_TYPES.map((lt) => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                  </select>
                )}
              </div>
              {supportsHalfDay && (
                <div>
                  <label className="label">Leave Duration</label>
                  <select
                    value={form.leaveDuration}
                    onChange={(e) => setForm((f) => ({ ...f, leaveDuration: e.target.value as LeaveDuration, endDate: e.target.value !== 'FULL_DAY' ? f.startDate : f.endDate }))}
                    className="input"
                  >
                    <option value="FULL_DAY">Full Day</option>
                    <option value="HALF_DAY_MORNING">Half Day - Morning</option>
                    <option value="HALF_DAY_AFTERNOON">Half Day - Afternoon</option>
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: isHalfDay ? e.target.value : f.endDate }))}
                    className="input"
                    min={format(new Date(), 'yyyy-MM-dd')}
                    required
                  />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input
                    type="date"
                    value={isHalfDay ? form.startDate : form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="input"
                    min={form.startDate}
                    disabled={isHalfDay}
                    required
                  />
                  {isHalfDay && <p className="text-xs text-gray-400 mt-1">Half-day is a single day (0.5 credit)</p>}
                </div>
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="input resize-none" rows={3} placeholder="Provide details about your leave..." required />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => fileMutation.mutate(form)}
                disabled={isBelowSixMonths && !lwopOnly || !form.startDate || !form.endDate || !form.reason || fileMutation.isPending}
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
