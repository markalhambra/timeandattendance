import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { format } from 'date-fns';

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
  const { data, isLoading } = useQuery<HRDashboardData>({
    queryKey: ['hr-dashboard'],
    queryFn: () => api.get('/dashboard/hr').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (isLoading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>;

  const t = data?.todayStats;
  const pendingTotal = (data?.pendingLeaves || 0) + (data?.pendingOvertimes || 0) + (data?.pendingConversions || 0);

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
