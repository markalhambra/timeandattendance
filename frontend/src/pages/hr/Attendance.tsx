import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { AttendanceRecord, Department } from '../../types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';

export default function HRAttendance() {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');

  const [year, m] = month.split('-').map(Number);
  const startDate = format(startOfMonth(new Date(year, m - 1)), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(new Date(year, m - 1)), 'yyyy-MM-dd');

  const { data: depts } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.data) });

  const { data, isLoading } = useQuery({
    queryKey: ['hr-attendance', startDate, endDate, deptFilter, search],
    queryFn: () => api.get(`/attendance?startDate=${startDate}&endDate=${endDate}${deptFilter ? `&departmentId=${deptFilter}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}&limit=200`).then((r) => r.data.data as AttendanceRecord[]),
  });

  const statusBadge = (s?: string) => {
    const map: Record<string, string> = { ON_SITE: 'badge-onsite', WFH: 'badge-wfh', OB: 'badge-ob', ABSENT: 'badge-absent' };
    return <span className={`badge ${map[s || ''] || 'bg-gray-100 text-gray-500'}`}>{s || 'N/A'}</span>;
  };

  const handleExport = () => {
    const url = `/api/reports/attendance/export?startDate=${startDate}&endDate=${endDate}${deptFilter ? `&departmentId=${deptFilter}` : ''}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Attendance Records</h1>
          <p className="text-sm text-gray-500 mt-0.5">View all employee attendance</p>
        </div>
        <button onClick={handleExport} className="btn-primary">Export XLSX</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input w-auto text-sm" />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">All Departments</option>
          {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee..." className="input flex-1 min-w-40 text-sm" />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">{data?.length ?? 0} records</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Employee', 'Date', 'Dept', 'Clock In', 'Clock Out', 'Status', 'Hours', 'OT'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>) :
                !data?.length ? <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-10">No records found</td></tr> :
                data.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{(r as any).employee?.user?.firstName} {(r as any).employee?.user?.lastName}</td>
                    <td className="table-cell">{format(parseISO(r.date), 'MMM d, EEE')}</td>
                    <td className="table-cell text-gray-500 text-xs">{(r as any).employee?.department?.name}</td>
                    <td className="table-cell">{r.clockIn ? format(parseISO(r.clockIn), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{r.clockOut ? format(parseISO(r.clockOut), 'hh:mm a') : '—'}</td>
                    <td className="table-cell">{statusBadge(r.status)}</td>
                    <td className="table-cell">{r.workingMinutes ? `${(r.workingMinutes / 60).toFixed(1)}h` : '—'}</td>
                    <td className="table-cell">{r.overtimeMinutes > 0 ? `${(r.overtimeMinutes / 60).toFixed(1)}h` : '—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
