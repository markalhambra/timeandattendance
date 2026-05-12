import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { AttendanceRecord } from '../../types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import toast from 'react-hot-toast';

export default function AttendancePage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ requestedClockIn: '', requestedClockOut: '', reason: '' });

  const [year, m] = month.split('-').map(Number);
  const startDate = format(startOfMonth(new Date(year, m - 1)), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(new Date(year, m - 1)), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['my-attendance', startDate, endDate],
    queryFn: () => api.get(`/attendance/my?startDate=${startDate}&endDate=${endDate}&limit=31`).then((r) => r.data.data as AttendanceRecord[]),
  });

  const correctionMutation = useMutation({
    mutationFn: (body: any) => api.post('/attendance/corrections', body),
    onSuccess: () => { toast.success('Correction submitted.'); setShowCorrectionModal(false); qc.invalidateQueries({ queryKey: ['my-attendance'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to submit.'),
  });

  const statusBadge = (s?: string) => {
    const map: Record<string, string> = { ON_SITE: 'badge-onsite', WFH: 'badge-wfh', OB: 'badge-ob', ABSENT: 'badge-absent' };
    return <span className={`badge ${map[s || ''] || 'bg-gray-100 text-gray-500'}`}>{s || 'N/A'}</span>;
  };

  const openCorrection = (r: AttendanceRecord) => {
    setSelectedRecord(r);
    setCorrectionForm({
      requestedClockIn: r.clockIn ? format(parseISO(r.clockIn), "yyyy-MM-dd'T'HH:mm") : '',
      requestedClockOut: r.clockOut ? format(parseISO(r.clockOut), "yyyy-MM-dd'T'HH:mm") : '',
      reason: '',
    });
    setShowCorrectionModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">My Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage your attendance records</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="input w-auto text-sm"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">Attendance Records — {format(new Date(year, m - 1), 'MMMM yyyy')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Clock In', 'Clock Out', 'Status', 'Hours', 'Overtime', ''].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="table-cell"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : !data?.length ? (
                <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-10">No records found</td></tr>
              ) : (
                data.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium">{format(parseISO(r.date), 'EEE, MMM d')}</td>
                    <td className="table-cell">
                      {r.clockIn ? format(parseISO(r.clockIn), 'hh:mm a') : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-cell">
                      {r.clockOut ? format(parseISO(r.clockOut), 'hh:mm a') : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-cell">{statusBadge(r.status)}</td>
                    <td className="table-cell">{r.workingMinutes ? `${(r.workingMinutes / 60).toFixed(1)}h` : '—'}</td>
                    <td className="table-cell">
                      {r.overtimeMinutes > 0 ? <span className="font-semibold">{(r.overtimeMinutes / 60).toFixed(1)}h</span> : '—'}
                    </td>
                    <td className="table-cell">
                      {r.clockIn && (
                        <button onClick={() => openCorrection(r)} className="text-xs text-gray-500 hover:text-black underline">
                          Correct
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Correction Modal */}
      {showCorrectionModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">Request Attendance Correction</h3>
            <p className="text-xs text-gray-500 mb-4">
              {format(parseISO(selectedRecord.date), 'EEEE, MMMM d, yyyy')}
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Corrected Clock In</label>
                <input
                  type="datetime-local"
                  value={correctionForm.requestedClockIn}
                  onChange={(e) => setCorrectionForm((f) => ({ ...f, requestedClockIn: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Corrected Clock Out</label>
                <input
                  type="datetime-local"
                  value={correctionForm.requestedClockOut}
                  onChange={(e) => setCorrectionForm((f) => ({ ...f, requestedClockOut: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Reason *</label>
                <textarea
                  value={correctionForm.reason}
                  onChange={(e) => setCorrectionForm((f) => ({ ...f, reason: e.target.value }))}
                  className="input resize-none"
                  rows={3}
                  placeholder="Explain why the correction is needed..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowCorrectionModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => correctionMutation.mutate({
                  attendanceId: selectedRecord.id,
                  requestedClockIn: correctionForm.requestedClockIn || undefined,
                  requestedClockOut: correctionForm.requestedClockOut || undefined,
                  reason: correctionForm.reason,
                })}
                disabled={!correctionForm.reason || correctionMutation.isPending}
                className="btn-primary flex-1"
              >
                {correctionMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
