import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Department } from '../../types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';

interface HRDashboardData {
  totalEmployees: number;
  activeEmployees: number;
  totalDepartments: number;
  todayStats: { present: number; absent: number; onsite: number; wfh: number; ob: number; notYetIn: number };
  pendingLeaves: number;
  pendingOvertimes: number;
  pendingConversions: number;
  departments: { id: string; name: string; count: number; presentToday: number }[];
}

export default function HRDashboard() {
  const [schedMonth, setSchedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [schedDept, setSchedDept] = useState('');
  const [schedType, setSchedType] = useState('');

  const { data, isLoading, isError } = useQuery<HRDashboardData>({
    queryKey: ['hr-dashboard'],
    queryFn: () => api.get('/dashboard/hr').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const [yr, mo] = schedMonth.split('-').map(Number);
  const start = format(startOfMonth(new Date(yr, mo - 1)), 'yyyy-MM-dd');
  const end = format(endOfMonth(new Date(yr, mo - 1)), 'yyyy-MM-dd');

  const { data: depts } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.data) });

  const isConvFilter = schedType === 'CTO' || schedType === 'CDO';

  const { data: schedLeaves } = useQuery<any[]>({
    queryKey: ['hr-sched-leaves', start, end, schedDept, schedType],
    queryFn: () => {
      if (isConvFilter) return Promise.resolve([]);
      const params = new URLSearchParams({ status: 'APPROVED', startDate: start, endDate: end, limit: '200' });
      if (schedDept) params.set('departmentId', schedDept);
      if (schedType) params.set('leaveType', schedType);
      return api.get(`/leave?${params}`).then((r) => r.data.data);
    },
  });

  const { data: schedConversions } = useQuery<any[]>({
    queryKey: ['hr-sched-conversions', start, end, schedDept, schedType],
    queryFn: () => {
      if (schedType && !isConvFilter) return Promise.resolve([]);
      const params = new URLSearchParams({ status: 'APPROVED', limit: '200' });
      if (schedDept) params.set('departmentId', schedDept);
      if (schedType) params.set('conversionType', schedType);
      return api.get(`/overtime/conversions?${params}`).then((r) => r.data.data);
    },
  });

  const leaveTypeLabel: Record<string, string> = {
    SICK: 'Sick Leave',
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

  const allItems: any[] = [
    ...(schedLeaves ?? []).map((l: any) => ({
      key: `l-${l.id}`, kind: 'leave',
      employee: `${l.employee?.firstName ?? ''} ${l.employee?.lastName ?? ''}`.trim(),
      dept: l.employee?.department?.name ?? '—',
      type: leaveTypeLabel[l.leaveType] || l.leaveType,
      dateLabel: `${format(parseISO(l.startDate), 'MMM d')} – ${format(parseISO(l.endDate), 'MMM d, yyyy')} (${l.totalDays}d)`,
      sortDate: l.startDate,
      badge: 'bg-blue-50 text-blue-700',
    })),
    ...(schedConversions ?? []).filter((c: any) => c.scheduledDate).map((c: any) => ({
      key: `c-${c.id}`, kind: 'conversion',
      employee: `${c.employee?.firstName ?? ''} ${c.employee?.lastName ?? ''}`.trim(),
      dept: c.employee?.department?.name ?? '—',
      type: c.conversionType,
      dateLabel: format(parseISO(c.scheduledDate), 'MMM d, yyyy'),
      sortDate: c.scheduledDate,
      badge: c.conversionType === 'CTO' ? 'bg-amber-50 text-amber-700' : 'bg-orange-50 text-orange-700',
    })),
  ].sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  const t = data?.todayStats;
  const pendingTotal = (data?.pendingLeaves || 0) + (data?.pendingOvertimes || 0) + (data?.pendingConversions || 0);

  if (isLoading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  if (isError) return <div className="text-sm text-red-500 p-4">Failed to load dashboard. Please refresh.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">HR Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{today}</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Employees</div>
          <div className="text-3xl font-black">{data?.activeEmployees}</div>
          <div className="text-xs text-gray-400">of {data?.totalEmployees} total</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Present Today</div>
          <div className="text-3xl font-black">{t?.present ?? 0}</div>
          <div className="text-xs text-gray-400">{t?.onsite ?? 0} onsite · {t?.wfh ?? 0} WFH · {t?.ob ?? 0} OB</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Absent Today</div>
          <div className="text-3xl font-black text-red-600">{t?.absent ?? 0}</div>
        </div>
        <div className={`stat-card ${pendingTotal > 0 ? 'border-black' : ''}`}>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pending Approvals</div>
          <div className="text-3xl font-black">{pendingTotal}</div>
          <div className="text-xs text-gray-400">{data?.pendingLeaves ?? 0} leaves · {data?.pendingOvertimes ?? 0} OT · {data?.pendingConversions ?? 0} conversions</div>
        </div>
      </div>

      {/* Attendance breakdown visual */}
      <div className="card p-6">
        <h2 className="font-bold text-sm mb-4">Today Attendance Breakdown</h2>
        <div className="flex h-8 rounded-xl overflow-hidden gap-0.5">
          {[
            { label: 'On-Site', value: t?.onsite || 0, color: 'bg-black' },
            { label: 'WFH', value: t?.wfh || 0, color: 'bg-gray-500' },
            { label: 'OB', value: t?.ob || 0, color: 'bg-gray-400' },
            { label: 'Absent', value: t?.absent || 0, color: 'bg-red-500' },
            { label: 'Not In', value: t?.notYetIn || 0, color: 'bg-gray-100' },
          ].map((seg) => {
            const total = (data?.activeEmployees || 1);
            const pct = (seg.value / total) * 100;
            return pct > 0 ? <div key={seg.label} className={`${seg.color} transition-all`} style={{ width: `${pct}%` }} title={`${seg.label}: ${seg.value}`} /> : null;
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          {[
            { label: 'On-Site', value: t?.onsite || 0, color: 'bg-black' },
            { label: 'WFH', value: t?.wfh || 0, color: 'bg-gray-500' },
            { label: 'OB', value: t?.ob || 0, color: 'bg-gray-400' },
            { label: 'Absent', value: t?.absent || 0, color: 'bg-red-500' },
            { label: 'Not clocked in', value: t?.notYetIn || 0, color: 'bg-gray-200' },
          ].map((seg) => (
            <div key={seg.label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${seg.color}`} />
              <span className="text-xs text-gray-600">{seg.label} <span className="font-bold">{seg.value}</span></span>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Summary */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm mb-3">Employee Schedule Summary</h2>
          <div className="flex flex-wrap gap-2">
            <input type="month" value={schedMonth} onChange={(e) => setSchedMonth(e.target.value)} className="input w-auto text-sm" />
            <select value={schedDept} onChange={(e) => setSchedDept(e.target.value)} className="input w-auto text-sm">
              <option value="">All Departments</option>
              {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={schedType} onChange={(e) => setSchedType(e.target.value)} className="input w-auto text-sm">
              <option value="">All Types</option>
              <option value="SICK">Sick Leave</option>
              <option value="VACATION">Vacation</option>
              <option value="PML">Pamilya Muna</option>
              <option value="SML">Sarili Muna</option>
              <option value="EMERGENCY">Emergency Leave</option>
              <option value="SOLO_PARENT">Solo Parent Leave</option>
              <option value="MATERNITY">Maternity Leave</option>
              <option value="PATERNITY">Paternity Leave</option>
              <option value="BEREAVEMENT">Bereavement Leave</option>
              <option value="MAGNA_CARTA_WOMEN">Magna Carta for Women Leave</option>
              <option value="CTO">CTO</option>
              <option value="CDO">CDO</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Employee', 'Department', 'Type', 'Date / Schedule'].map((h) => <th key={h} className="table-header">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!allItems.length
                ? <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-10">No approved schedules for this period</td></tr>
                : allItems.map((item) => (
                  <tr key={item.key} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{item.employee || '—'}</td>
                    <td className="table-cell text-xs text-gray-500">{item.dept}</td>
                    <td className="table-cell"><span className={`badge ${item.badge}`}>{item.type}</span></td>
                    <td className="table-cell text-sm">{item.dateLabel}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Department breakdown */}
      <div className="card p-6">
        <h2 className="font-bold text-sm mb-4">Department Attendance</h2>
        <div className="space-y-3">
          {data?.departments.map((d) => {
            const pct = d.count > 0 ? (d.presentToday / d.count) * 100 : 0;
            return (
              <div key={d.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-gray-500">{d.presentToday} / {d.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-black rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
