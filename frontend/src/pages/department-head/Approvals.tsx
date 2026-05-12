import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { LeaveRequest, OvertimeRecord, AttendanceCorrection, OvertimeConversion } from '../../types';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

type Tab = 'leaves' | 'overtime' | 'corrections' | 'conversions';

interface ReviewModalState { type: Tab; id: string; action: 'APPROVED' | 'REJECTED'; name: string; }

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('leaves');
  const [modal, setModal] = useState<ReviewModalState | null>(null);
  const [notes, setNotes] = useState('');

  const invalidateAll = () => {
    ['dept-leaves', 'dept-overtime', 'dept-corrections', 'dept-conversions'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries({ queryKey: ['depthead-dashboard'] });
  };

  const { data: leaves } = useQuery<LeaveRequest[]>({ queryKey: ['dept-leaves'], queryFn: () => api.get('/leave?status=PENDING').then((r) => r.data.data) });
  const { data: overtime } = useQuery<OvertimeRecord[]>({ queryKey: ['dept-overtime'], queryFn: () => api.get('/overtime?status=PENDING').then((r) => r.data.data) });
  const { data: corrections } = useQuery<AttendanceCorrection[]>({ queryKey: ['dept-corrections'], queryFn: () => api.get('/attendance/corrections?status=PENDING').then((r) => r.data.data) });
  const { data: conversions } = useQuery<OvertimeConversion[]>({ queryKey: ['dept-conversions'], queryFn: () => api.get('/overtime/conversions?status=PENDING').then((r) => r.data.data) });

  const reviewMutation = useMutation({
    mutationFn: ({ type, id, action, notes }: { type: Tab; id: string; action: string; notes: string }) => {
      const endpoints: Record<Tab, string> = {
        leaves: `/leave/${id}/review`,
        overtime: `/overtime/${id}/review`,
        corrections: `/attendance/corrections/${id}/review`,
        conversions: `/overtime/conversions/${id}/review`,
      };
      return api.patch(endpoints[type], { status: action, notes });
    },
    onSuccess: () => { toast.success('Decision recorded.'); setModal(null); setNotes(''); invalidateAll(); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to process.'),
  });

  const openModal = (type: Tab, id: string, name: string, action: 'APPROVED' | 'REJECTED') => {
    setModal({ type, id, action, name });
    setNotes('');
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'leaves', label: 'Leaves', count: leaves?.length },
    { key: 'overtime', label: 'Overtime', count: overtime?.length },
    { key: 'corrections', label: 'Corrections', count: corrections?.length },
    { key: 'conversions', label: 'OT Conversions', count: conversions?.length },
  ];

  const leaveTypeLabel: Record<string, string> = { SICK: 'Sick', VACATION: 'Vacation', PML: 'Pamilya Muna', SML: 'Sarili Muna' };

  const ActionButtons = ({ type, id, name }: { type: Tab; id: string; name: string }) => (
    <div className="flex gap-1.5">
      <button onClick={() => openModal(type, id, name, 'APPROVED')} className="btn bg-black text-white text-xs px-3 py-1.5">Approve</button>
      <button onClick={() => openModal(type, id, name, 'REJECTED')} className="btn bg-red-50 text-red-600 text-xs px-3 py-1.5">Reject</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Approvals</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and act on pending requests from your team</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}>
            {t.label}
            {!!t.count && <span className="bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'leaves' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Employee', 'Type', 'Start', 'End', 'Days', 'Reason', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {!leaves?.length ? <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-10">No pending leaves</td></tr> : leaves.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{l.employee?.user?.firstName} {l.employee?.user?.lastName}</td>
                  <td className="table-cell">{leaveTypeLabel[l.leaveType] || l.leaveType}</td>
                  <td className="table-cell">{format(parseISO(l.startDate), 'MMM d')}</td>
                  <td className="table-cell">{format(parseISO(l.endDate), 'MMM d, yyyy')}</td>
                  <td className="table-cell">{l.totalDays}</td>
                  <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{l.reason}</td>
                  <td className="table-cell"><ActionButtons type="leaves" id={l.id} name={`${l.employee?.user?.firstName} ${l.employee?.user?.lastName}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'overtime' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Employee', 'Date', 'Hours', 'Expires', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {!overtime?.length ? <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-10">No pending overtime</td></tr> : overtime.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{(o as any).employee?.user?.firstName} {(o as any).employee?.user?.lastName}</td>
                  <td className="table-cell">{format(parseISO(o.date), 'MMM d, yyyy')}</td>
                  <td className="table-cell font-semibold">{(o.minutes / 60).toFixed(1)}h</td>
                  <td className="table-cell text-gray-500 text-xs">{o.pendingExpiry ? format(parseISO(o.pendingExpiry), 'MMM d, yyyy') : '—'}</td>
                  <td className="table-cell"><ActionButtons type="overtime" id={o.id} name={`${(o as any).employee?.user?.firstName} ${(o as any).employee?.user?.lastName}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'corrections' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Employee', 'Date', 'Req. In', 'Req. Out', 'Reason', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {!corrections?.length ? <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No pending corrections</td></tr> : corrections.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{(c as any).employee?.user?.firstName} {(c as any).employee?.user?.lastName}</td>
                  <td className="table-cell">{c.attendance?.date ? format(parseISO(c.attendance.date), 'MMM d, yyyy') : '—'}</td>
                  <td className="table-cell">{c.requestedClockIn ? format(parseISO(c.requestedClockIn), 'hh:mm a') : '—'}</td>
                  <td className="table-cell">{c.requestedClockOut ? format(parseISO(c.requestedClockOut), 'hh:mm a') : '—'}</td>
                  <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{(c as any).reason}</td>
                  <td className="table-cell"><ActionButtons type="corrections" id={c.id} name={`${(c as any).employee?.user?.firstName} ${(c as any).employee?.user?.lastName}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'conversions' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Employee', 'Type', 'Scheduled Date', 'Hours', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-50">
              {!conversions?.length ? <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-10">No pending conversions</td></tr> : conversions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{(c as any).employee?.user?.firstName} {(c as any).employee?.user?.lastName}</td>
                  <td className="table-cell font-semibold">{c.type}</td>
                  <td className="table-cell">{format(parseISO(c.scheduledDate), 'MMM d, yyyy')}</td>
                  <td className="table-cell">{(c.totalMinutes / 60).toFixed(1)}h</td>
                  <td className="table-cell"><ActionButtons type="conversions" id={c.id} name={`${(c as any).employee?.user?.firstName} ${(c as any).employee?.user?.lastName}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">
              {modal.action === 'APPROVED' ? 'Approve' : 'Reject'} Request
            </h3>
            <p className="text-sm text-gray-500 mb-4">{modal.name}</p>
            <div>
              <label className="label">Notes {modal.action === 'REJECTED' && <span className="text-red-500">*</span>}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input resize-none" rows={3} placeholder={modal.action === 'REJECTED' ? 'Reason for rejection...' : 'Optional notes...'} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => reviewMutation.mutate({ type: modal.type, id: modal.id, action: modal.action, notes })}
                disabled={(modal.action === 'REJECTED' && !notes) || reviewMutation.isPending}
                className={`flex-1 btn font-semibold ${modal.action === 'APPROVED' ? 'bg-black text-white' : 'bg-red-600 text-white'}`}
              >
                {reviewMutation.isPending ? 'Processing...' : modal.action === 'APPROVED' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
