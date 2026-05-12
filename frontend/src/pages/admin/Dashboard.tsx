import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { format } from 'date-fns';

interface AdminDashboardData {
  totalUsers: number;
  activeUsers: number;
  totalDepartments: number;
  todayAttendance: { total: number; present: number; absent: number };
  pendingRequests: { leaves: number; overtime: number; corrections: number; conversions: number };
  recentAuditLogs: { id: string; action: string; entity: string; entityId: string; createdAt: string; user: { firstName: string; lastName: string } }[];
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<AdminDashboardData>({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/dashboard/admin').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>;

  const pending = data?.pendingRequests;
  const pendingTotal = (pending?.leaves || 0) + (pending?.overtime || 0) + (pending?.corrections || 0) + (pending?.conversions || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">System Overview</h1>
        <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Users</div>
          <div className="text-3xl font-black">{data?.activeUsers}</div>
          <div className="text-xs text-gray-400">of {data?.totalUsers} registered</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Departments</div>
          <div className="text-3xl font-black">{data?.totalDepartments}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Today Present</div>
          <div className="text-3xl font-black">{data?.todayAttendance.present}</div>
          <div className="text-xs text-red-500">{data?.todayAttendance.absent} absent</div>
        </div>
        <div className={`stat-card ${pendingTotal > 0 ? 'border-black' : ''}`}>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pending Total</div>
          <div className="text-3xl font-black">{pendingTotal}</div>
          <div className="text-xs text-gray-400">{pending?.leaves} L · {pending?.overtime} OT · {pending?.corrections} C · {pending?.conversions} CV</div>
        </div>
      </div>

      {/* Recent audit logs */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Recent Audit Logs</h2>
          <a href="/admin/audit-logs" className="text-xs text-gray-500 hover:text-black underline">View all</a>
        </div>
        <div className="divide-y divide-gray-50">
          {data?.recentAuditLogs.map((log) => (
            <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {log.user?.firstName?.[0]}{log.user?.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{log.user?.firstName} {log.user?.lastName} <span className="text-gray-500 font-normal">·</span> <span className="text-gray-600">{log.action}</span> on <span className="font-mono text-xs">{log.entity}</span></div>
                <div className="text-xs text-gray-400">{format(new Date(log.createdAt), 'MMM d, yyyy hh:mm a')}</div>
              </div>
            </div>
          ))}
          {!data?.recentAuditLogs?.length && <div className="text-center text-sm text-gray-400 py-8">No audit logs yet</div>}
        </div>
      </div>
    </div>
  );
}
