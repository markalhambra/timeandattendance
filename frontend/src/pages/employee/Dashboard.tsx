import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import ClockWidget from '../../components/attendance/ClockWidget';
import { LeaveBalance, OvertimeRecord, AttendanceRecord } from '../../types';
import { format, parseISO } from 'date-fns';

interface DashboardData {
  todayRecord: AttendanceRecord | null;
  monthlySummary: {
    totalDays: number;
    onsite: number;
    wfh: number;
    ob: number;
    totalWorkingMinutes: number;
    totalOvertimeMinutes: number;
  };
  leaveBalances: LeaveBalance[];
  pendingLeaves: number;
  overtimeCredit: { totalMinutes: number; count: number; records: OvertimeRecord[] };
  pendingCorrections: number;
}

function StatCard({ label, value, sub, color = '' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export default function EmployeeDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['employee-dashboard'],
    queryFn: () => api.get('/dashboard/employee').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const leaveTypeLabels: Record<string, string> = {
    SICK: 'Sick Leave',
    VACATION: 'Vacation',
    PML: 'Pamilya Muna',
    SML: 'Sarili Muna',
  };

  const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  const m = data?.monthlySummary;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black">My Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{today}</p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Clock widget */}
        <div className="lg:col-span-1">
          <ClockWidget />
        </div>

        {/* Monthly summary */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-bold text-base mb-4">This Month</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-black text-white rounded-xl p-4">
              <div className="text-3xl font-black">{m?.totalDays ?? 0}</div>
              <div className="text-xs text-gray-300 mt-1">Days Present</div>
            </div>
            <div className="bg-gray-100 rounded-xl p-4">
              <div className="text-3xl font-black">{m?.onsite ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">On-Site</div>
            </div>
            <div className="bg-gray-100 rounded-xl p-4">
              <div className="text-3xl font-black">{m?.wfh ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">WFH</div>
            </div>
            <div className="bg-gray-100 rounded-xl p-4">
              <div className="text-3xl font-black">{m?.ob ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">OB</div>
            </div>
            <div className="bg-gray-100 rounded-xl p-4">
              <div className="text-2xl font-black">{m ? (m.totalWorkingMinutes / 60).toFixed(1) : 0}h</div>
              <div className="text-xs text-gray-500 mt-1">Total Hours</div>
            </div>
            <div className="bg-gray-100 rounded-xl p-4">
              <div className="text-2xl font-black">{m ? (m.totalOvertimeMinutes / 60).toFixed(1) : 0}h</div>
              <div className="text-xs text-gray-500 mt-1">Overtime</div>
            </div>
          </div>
        </div>
      </div>

      {/* Leave balances + Overtime credits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Leave balances */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base">Leave Balances</h2>
            {data?.pendingLeaves ? <span className="badge badge-pending">{data.pendingLeaves} pending</span> : null}
          </div>
          <div className="space-y-3">
            {data?.leaveBalances?.length ? data.leaveBalances.map((b) => {
              const available = b.totalDays - b.usedDays - b.pendingDays;
              const pct = (available / b.totalDays) * 100;
              return (
                <div key={b.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{leaveTypeLabels[b.leaveType] || b.leaveType}</span>
                    <span className="font-bold">{available.toFixed(1)} / {b.totalDays} days</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-black rounded-full transition-all" style={{ width: `${Math.max(0, pct)}%` }} />
                  </div>
                </div>
              );
            }) : (
              <div className="text-sm text-gray-400 text-center py-4">No leave balances</div>
            )}
          </div>
        </div>

        {/* Overtime credits */}
        <div className="card p-6">
          <h2 className="font-bold text-base mb-4">Overtime Credits</h2>
          {data?.overtimeCredit.totalMinutes ? (
            <div>
              <div className="text-center py-3">
                <div className="text-4xl font-black">{(data.overtimeCredit.totalMinutes / 60).toFixed(1)}h</div>
                <div className="text-sm text-gray-500 mt-1">Available credits</div>
              </div>
              <div className="flex gap-2 mt-4">
                <div className={`flex-1 p-3 rounded-xl border ${data.overtimeCredit.totalMinutes >= 4 * 60 ? 'border-black bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                  <div className="text-xs font-bold">CTO</div>
                  <div className="text-[11px] text-gray-500">Min 4h</div>
                </div>
                <div className={`flex-1 p-3 rounded-xl border ${data.overtimeCredit.totalMinutes >= 8 * 60 ? 'border-black bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}>
                  <div className="text-xs font-bold">CDO</div>
                  <div className="text-[11px] text-gray-500">Min 8h</div>
                </div>
              </div>
              {data.overtimeCredit.records.slice(0, 3).map((r) => (
                <div key={r.id} className="flex justify-between items-center py-2 border-t border-gray-100 mt-3 text-sm">
                  <span className="text-gray-600">{format(parseISO(r.date), 'MMM d, yyyy')}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{(r.minutes / 60).toFixed(1)}h</span>
                    <span className="text-[10px] text-gray-400">
                      Exp {r.approvedExpiry ? format(parseISO(r.approvedExpiry), 'MM/yy') : '--'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-gray-400">
              <div className="text-3xl mb-2">⊕</div>
              No overtime credits available
            </div>
          )}
        </div>
      </div>

      {/* Pending actions */}
      {(data?.pendingLeaves || data?.pendingCorrections) ? (
        <div className="card p-5 flex items-center gap-4 border-l-4 border-l-black">
          <div className="text-2xl">◈</div>
          <div>
            <div className="font-semibold text-sm">Pending Requests</div>
            <div className="text-xs text-gray-500">
              {[
                data.pendingLeaves && `${data.pendingLeaves} leave request(s)`,
                data.pendingCorrections && `${data.pendingCorrections} correction(s)`,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
