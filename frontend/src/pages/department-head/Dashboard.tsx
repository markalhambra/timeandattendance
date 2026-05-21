import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { AttendanceRecord } from '../../types';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface DeptDashboardData {
  department: { id: string; name: string };
  todayStats: { total: number; present: number; absent: number; onsite: number; wfh: number; ob: number };
  todayRecords: (AttendanceRecord & { employee: { firstName: string; lastName: string; employeeNumber: string } })[];
  pendingLeaves: number;
  pendingOvertimes: number;
  pendingCorrections: number;
  totalEmployees: number;
}

export default function DeptHeadDashboard() {
  const { data, isLoading, isError } = useQuery<DeptDashboardData>({
    queryKey: ['depthead-dashboard'],
    queryFn: () => api.get('/dashboard/department-head').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const statusBadge = (s?: string) => {
    const map: Record<string, string> = { ON_SITE: 'badge-onsite', WFH: 'badge-wfh', OB: 'badge-ob', ABSENT: 'badge-absent' };
    return <span className={`badge ${map[s || ''] || 'bg-gray-100 text-gray-500'}`}>{s || 'N/A'}</span>;
  };

  if (isLoading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (isError) return <div className="text-sm text-red-500 p-4">Failed to load dashboard. Please refresh.</div>;

  const s = data?.todayStats;
  const pendingTotal = (data?.pendingLeaves || 0) + (data?.pendingOvertimes || 0) + (data?.pendingCorrections || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">{data?.department?.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{today}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Staff</div>
          <div className="text-3xl font-black">{data?.totalEmployees ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Present</div>
          <div className="text-3xl font-black">{s?.present ?? 0}</div>
          <div className="text-xs text-gray-400">{s?.onsite ?? 0} onsite · {s?.wfh ?? 0} WFH · {s?.ob ?? 0} OB</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Absent</div>
          <div className="text-3xl font-black text-red-600">{s?.absent ?? 0}</div>
        </div>
        <div className={`stat-card ${pendingTotal > 0 ? 'border-black' : ''}`}>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pending Approvals</div>
          <div className="text-3xl font-black">{pendingTotal}</div>
          {pendingTotal > 0 && <Link to="/department-head/approvals" className="text-xs underline text-black">Review now →</Link>}
        </div>
      </div>

      {/* Pending breakdown */}
      {pendingTotal > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-sm mb-3">Pending Approvals Breakdown</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-yellow-50 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-yellow-700">{data?.pendingLeaves}</div>
              <div className="text-xs text-yellow-600">Leaves</div>
            </div>
            <div className="bg-yellow-50 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-yellow-700">{data?.pendingOvertimes}</div>
              <div className="text-xs text-yellow-600">Overtime</div>
            </div>
            <div className="bg-yellow-50 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-yellow-700">{data?.pendingCorrections}</div>
              <div className="text-xs text-yellow-600">Corrections</div>
            </div>
          </div>
        </div>
      )}

      {/* Today's attendance */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">Today's Team Attendance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Employee', 'Clock In', 'Clock Out', 'Status', 'Hours'].map((h) => <th key={h} className="table-header">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!data?.todayRecords?.length ? (
                <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-10">No records yet today</td></tr>
              ) : (
                data.todayRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{r.employee?.firstName} {r.employee?.lastName}</td>
                    <td className="table-cell">{r.clockIn ? format(new Date(r.clockIn), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{r.clockOut ? format(new Date(r.clockOut), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{statusBadge(r.status)}</td>
                    <td className="table-cell">{r.workingMinutes ? `${(r.workingMinutes / 60).toFixed(1)}h` : '—'}</td>
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
