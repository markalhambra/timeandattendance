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
  const [showHistory, setShowHistory] = useState(false);

  const invalidateForTab = (type: Tab) => {
    // Invalidate only the queries relevant to the tab that was just reviewed
    const pendingKey = ({ leaves: 'dept-leaves', overtime: 'dept-overtime', corrections: 'dept-corrections', conversions: 'dept-conversions' } as Record<Tab, string>)[type];
    const historyKey = ({ leaves: 'dept-leaves-history', overtime: 'dept-overtime-all', corrections: 'dept-corrections-all', conversions: 'dept-conversions' } as Record<Tab, string>)[type];
    qc.invalidateQueries({ queryKey: [pendingKey] });
    qc.invalidateQueries({ queryKey: [historyKey] });
    qc.invalidateQueries({ queryKey: ['depthead-dashboard'] });
  };

  const { data: leaves } = useQuery<LeaveRequest[]>({ queryKey: ['dept-leaves'], queryFn: () => api.get('/leave?status=PENDING').then((r) => r.data.data) });
  const { data: overtime } = useQuery<OvertimeRecord[]>({ queryKey: ['dept-overtime'], queryFn: () => api.get('/overtime?status=PENDING').then((r) => r.data.data) });
  const { data: corrections } = useQuery<AttendanceCorrection[]>({ queryKey: ['dept-corrections'], queryFn: () => api.get('/attendance/corrections?status=PENDING').then((r) => r.data.data) });
  const { data: conversionsAll } = useQuery<OvertimeConversion[]>({ queryKey: ['dept-conversions'], queryFn: () => api.get('/overtime/conversions').then((r) => r.data.data) });
  const conversions = (conversionsAll ?? []).filter((c) => c.status === 'PENDING');
  const conversionsHistory = (conversionsAll ?? []).filter((c) => c.status !== 'PENDING');

  // History queries
  const { data: leavesHistory } = useQuery<LeaveRequest[]>({
    queryKey: ['dept-leaves-history'],
    queryFn: () => api.get('/leave?reviewed=true').then((r) => r.data.data),
  });
  const { data: overtimeAllData } = useQuery<OvertimeRecord[]>({
    queryKey: ['dept-overtime-all'],
    queryFn: () => api.get('/overtime').then((r) => r.data.data),
  });
  const overtimeHistory = (overtimeAllData ?? []).filter((o) => o.status !== 'PENDING');
  const { data: correctionsAllData } = useQuery<AttendanceCorrection[]>({
    queryKey: ['dept-corrections-all'],
    queryFn: () => api.get('/attendance/corrections').then((r) => r.data.data),
  });
  const correctionsHistory = (correctionsAllData ?? []).filter((c) => c.status !== 'PENDING');

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
    onSuccess: (_, variables) => { toast.success('Decision recorded.'); setModal(null); setNotes(''); invalidateForTab(variables.type); },
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

  const leaveTypeLabel: Record<string, string> = {
    SICK: 'Sick',
    VACATION: 'Vacation',
    PML: 'Pamilya Muna',
    SML: 'Sarili Muna',
    EMERGENCY: 'Emergency Leave',
    SOLO_PARENT: 'Solo Parent Leave',
    MATERNITY: 'Maternity Leave',
    PATERNITY: 'Paternity Leave',
    BEREAVEMENT: 'Bereavement Leave',
    MAGNA_CARTA_WOMEN: 'Magna Carta for Women Leave',
  };

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
      {tab === 'leaves' && (() => {
        const allLeaves = [
          ...(leaves ?? []),
          ...(leavesHistory ?? []),
        ];
        return (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Employee', 'Type', 'Start', 'End', 'Days', 'Reason', 'Status', 'Remarks', 'Reviewed On', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!allLeaves.length ? (
                  <tr><td colSpan={10} className="text-center text-sm text-gray-400 py-10">No leave records</td></tr>
                ) : allLeaves.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{l.employee?.firstName} {l.employee?.lastName}</td>
                    <td className="table-cell">{leaveTypeLabel[l.leaveType] || l.leaveType}</td>
                    <td className="table-cell">{format(parseISO(l.startDate), 'MMM d')}</td>
                    <td className="table-cell">{format(parseISO(l.endDate), 'MMM d, yyyy')}</td>
                    <td className="table-cell">{l.totalDays}</td>
                    <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{l.reason}</td>
                    <td className="table-cell">
                      {l.status === 'PENDING'
                        ? <span className="badge bg-yellow-50 text-yellow-700">PENDING</span>
                        : <span className={`badge ${l.status === 'APPROVED' ? 'badge-approved' : 'badge-rejected'}`}>{l.status}</span>}
                    </td>
                    <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{l.deptHeadNotes || '—'}</td>
                    <td className="table-cell text-gray-400 text-xs">{l.deptHeadAt ? format(parseISO(l.deptHeadAt), 'MMM d, yyyy') : '—'}</td>
                    <td className="table-cell">
                      {l.status === 'PENDING' && <ActionButtons type="leaves" id={l.id} name={`${l.employee?.firstName} ${l.employee?.lastName}`} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>            </div>          </div>
        );
      })()}

      {tab === 'overtime' && (() => {
        const allOvertime = [
          ...(overtime ?? []),
          ...overtimeHistory,
        ];
        return (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Employee', 'Date', 'Hours', 'Reason', 'Status', 'Remarks', 'Reviewed On', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!allOvertime.length ? (
                  <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-10">No overtime records</td></tr>
                ) : allOvertime.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{(o as any).employee?.firstName} {(o as any).employee?.lastName}</td>
                    <td className="table-cell">{format(parseISO(o.date), 'MMM d, yyyy')}</td>
                    <td className="table-cell font-semibold">{(o.minutes / 60).toFixed(1)}h</td>
                    <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{o.reason || '—'}</td>
                    <td className="table-cell">
                      {o.status === 'PENDING'
                        ? <span className="badge bg-yellow-50 text-yellow-700">PENDING</span>
                        : <span className={`badge ${o.status === 'APPROVED' ? 'badge-approved' : 'badge-rejected'}`}>{o.status}</span>}
                    </td>
                    <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{o.reviewerNotes || '—'}</td>
                    <td className="table-cell text-gray-400 text-xs">{o.reviewedAt ? format(parseISO(o.reviewedAt), 'MMM d, yyyy') : '—'}</td>
                    <td className="table-cell">
                      {o.status === 'PENDING' && <ActionButtons type="overtime" id={o.id} name={`${(o as any).employee?.firstName} ${(o as any).employee?.lastName}`} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>            </div>          </div>
        );
      })()}

      {tab === 'corrections' && (
        <div className="space-y-3">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Employee', 'Date', 'Req. In', 'Req. Out', 'Reason', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {!corrections?.length ? <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No pending corrections</td></tr> : corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{(c as any).employee?.firstName} {(c as any).employee?.lastName}</td>
                    <td className="table-cell">{c.attendance?.date ? format(parseISO(c.attendance.date), 'MMM d, yyyy') : '—'}</td>
                    <td className="table-cell">{c.requestedClockIn ? format(parseISO(c.requestedClockIn), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{c.requestedClockOut ? format(parseISO(c.requestedClockOut), 'hh:mm a') : '—'}</td>
                    <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{(c as any).reason}</td>
                    <td className="table-cell"><ActionButtons type="corrections" id={c.id} name={`${(c as any).employee?.firstName} ${(c as any).employee?.lastName}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>            </div>          </div>
          <div>
            <button onClick={() => setShowHistory((h) => !h)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium py-1">
              <span>{showHistory ? '▲' : '▼'}</span>
              {showHistory ? 'Hide' : 'Show'} Review History ({correctionsHistory.length})
            </button>
            {showHistory && (
              <div className="card overflow-hidden mt-2">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[650px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{['Employee', 'Date', 'Req. In', 'Req. Out', 'Decision', 'Remarks', 'Reviewed On'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!correctionsHistory.length ? (
                      <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No reviewed corrections</td></tr>
                    ) : correctionsHistory.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="table-cell font-medium">{(c as any).employee?.firstName} {(c as any).employee?.lastName}</td>
                        <td className="table-cell">{c.attendance?.date ? format(parseISO(c.attendance.date), 'MMM d, yyyy') : '—'}</td>
                        <td className="table-cell">{c.requestedClockIn ? format(parseISO(c.requestedClockIn), 'hh:mm a') : '—'}</td>
                        <td className="table-cell">{c.requestedClockOut ? format(parseISO(c.requestedClockOut), 'hh:mm a') : '—'}</td>
                        <td className="table-cell">
                          <span className={`badge ${c.status === 'APPROVED' ? 'badge-approved' : 'badge-rejected'}`}>{c.status}</span>
                        </td>
                        <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{c.reviewerNotes || '—'}</td>
                        <td className="table-cell text-gray-400 text-xs">{c.reviewedAt ? format(parseISO(c.reviewedAt), 'MMM d, yyyy') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>                </div>              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'conversions' && (
        <div className="space-y-3">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>{['Employee', 'Dept', 'Type', 'Scheduled Date', 'Hours', ''].map((h) => <th key={h} className="table-header">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {!conversions.length ? <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No pending conversions</td></tr> : conversions.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{(c as any).employee?.firstName} {(c as any).employee?.lastName}</td>
                    <td className="table-cell text-xs text-gray-500">{(c as any).employee?.department?.name || '—'}</td>
                    <td className="table-cell font-semibold">{c.conversionType}</td>
                    <td className="table-cell">{c.scheduledDate ? format(parseISO(c.scheduledDate), 'MMM d, yyyy') : '—'}</td>
                    <td className="table-cell">{(c.minutesToConvert / 60).toFixed(1)}h</td>
                    <td className="table-cell"><ActionButtons type="conversions" id={c.id} name={`${(c as any).employee?.firstName} ${(c as any).employee?.lastName}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>            </div>          </div>
          <div>
            <button onClick={() => setShowHistory((h) => !h)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium py-1">
              <span>{showHistory ? '▲' : '▼'}</span>
              {showHistory ? 'Hide' : 'Show'} Review History ({conversionsHistory.length})
            </button>
            {showHistory && (
              <div className="card overflow-hidden mt-2">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[750px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{['Employee', 'Dept', 'Type', 'Hours', 'Decision', 'Reviewed By', 'Notes', 'Reviewed On'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {!conversionsHistory.length ? (
                      <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-8">No reviewed conversions</td></tr>
                    ) : conversionsHistory.map((c) => {
                      const reviewedBy = c.deptHeadStatus && c.deptHeadStatus !== 'PENDING' ? 'Dept Head'
                        : c.hrStatus && c.hrStatus !== 'PENDING' ? 'HR'
                        : c.adminStatus && (c.adminStatus as string) !== 'PENDING' ? 'Admin' : '—';
                      const reviewedAt = c.deptHeadStatus && c.deptHeadStatus !== 'PENDING' ? c.deptHeadAt
                        : c.hrStatus && c.hrStatus !== 'PENDING' ? c.hrAt
                        : c.adminStatus && (c.adminStatus as string) !== 'PENDING' ? c.adminAt : null;
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="table-cell font-medium">{(c as any).employee?.firstName} {(c as any).employee?.lastName}</td>
                          <td className="table-cell text-xs text-gray-500">{(c as any).employee?.department?.name || '—'}</td>
                          <td className="table-cell">{c.conversionType}</td>
                          <td className="table-cell">{(c.minutesToConvert / 60).toFixed(1)}h</td>
                          <td className="table-cell"><span className={`badge ${c.status === 'APPROVED' ? 'badge-approved' : 'badge-rejected'}`}>{c.status}</span></td>
                          <td className="table-cell text-xs text-gray-600">{reviewedBy}</td>
                          <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{c.reviewerNotes || '—'}</td>
                          <td className="table-cell text-gray-400 text-xs">{reviewedAt ? format(parseISO(reviewedAt as string), 'MMM d, yyyy') : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
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
