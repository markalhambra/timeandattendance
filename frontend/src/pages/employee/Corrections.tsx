import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { AttendanceCorrection } from '../../types';
import { format, parseISO } from 'date-fns';

export default function CorrectionsPage() {
  const { data: corrections, isLoading } = useQuery<AttendanceCorrection[]>({
    queryKey: ['my-corrections'],
    queryFn: () => api.get('/attendance/corrections/my').then((r) => r.data.data),
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { PENDING: 'badge-pending', APPROVED: 'badge-approved', REJECTED: 'badge-rejected' };
    return <span className={`badge ${map[s] || ''}`}>{s}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Attendance Corrections</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track your correction requests — submit from the Attendance page</p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">Correction Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Requested In', 'Requested Out', 'Status', 'Reviewer Notes', 'Submitted'].map((h) => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(3)].map((_, i) => <tr key={i}><td colSpan={6}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>)
              ) : !corrections?.length ? (
                <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No correction requests</td></tr>
              ) : (
                corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{c.attendance?.date ? format(parseISO(c.attendance.date), 'MMM d, yyyy') : '—'}</td>
                    <td className="table-cell">{c.requestedClockIn ? format(parseISO(c.requestedClockIn), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{c.requestedClockOut ? format(parseISO(c.requestedClockOut), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{statusBadge(c.status)}</td>
                    <td className="table-cell max-w-xs truncate text-gray-500 text-xs">{c.reviewerNotes || '—'}</td>
                    <td className="table-cell text-gray-400 text-xs">{format(parseISO(c.createdAt), 'MMM d, yyyy')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
