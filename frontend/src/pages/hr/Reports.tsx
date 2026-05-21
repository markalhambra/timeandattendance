import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Department, Employee } from '../../types';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';

type ReportType = 'attendance' | 'leave' | 'overtime' | 'absence';

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('attendance');
  const today = format(new Date(), 'yyyy-MM-dd');
  const firstOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [deptFilter, setDeptFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: depts } = useQuery<Department[]>({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.data) });
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['report-employees', deptFilter],
    queryFn: () => api.get(`/employees?departmentId=${deptFilter}&limit=500`).then((r) => r.data.data),
  });

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report', reportType, startDate, endDate, deptFilter, employeeFilter],
    queryFn: () => api.get(`/reports/${reportType}?startDate=${startDate}&endDate=${endDate}${employeeFilter ? `&employeeId=${employeeFilter}` : deptFilter ? `&departmentId=${deptFilter}` : ''}`).then((r) => r.data.data),
  });

  const reportTypes: { key: ReportType; label: string }[] = [
    { key: 'attendance', label: 'Attendance' },
    { key: 'leave', label: 'Leave' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'absence', label: 'Absences' },
  ];

  const handleExport = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      if (reportType === 'attendance') {
        // Use dedicated XLSX endpoint (sends auth header via api instance)
        const resp = await api.get(
          `/reports/attendance/export?startDate=${startDate}&endDate=${endDate}${employeeFilter ? `&employeeId=${employeeFilter}` : deptFilter ? `&departmentId=${deptFilter}` : ''}`,
          { responseType: 'blob' },
        );
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${startDate}_to_${endDate}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Export summary of current report as XLSX client-side
        if (!reportData?.summary?.length) return;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(reportData.summary);
        XLSX.utils.book_append_sheet(wb, ws, reportType.charAt(0).toUpperCase() + reportType.slice(1));
        XLSX.writeFile(wb, `${reportType}_${startDate}_to_${endDate}.xlsx`);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Analytics and downloadable reports</p>
        </div>
        <button onClick={handleExport} disabled={exporting || !reportData?.summary?.length} className="btn-primary disabled:opacity-50">
          {exporting ? 'Exporting…' : `Export ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} XLSX`}
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {reportTypes.map((t) => (
            <button key={t.key} onClick={() => setReportType(t.key)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${reportType === t.key ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="input w-auto text-sm" />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="input w-auto text-sm" />
        </div>
        <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setEmployeeFilter(''); }} className="input w-auto text-sm">
          <option value="">All Departments</option>
          {depts?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input w-auto text-sm">
          <option value="">All Employees</option>
          {employees?.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}
        </select>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      ) : reportData && Array.isArray(reportData.chartData) ? (
        <div className="card p-6">
          <h2 className="font-semibold text-sm mb-4">
            {reportType.charAt(0).toUpperCase() + reportType.slice(1)} Summary — {startDate} to {endDate}
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            {reportType === 'attendance' ? (
              <BarChart data={reportData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="onsite" name="On-Site" fill="#000" />
                <Bar dataKey="wfh" name="WFH" fill="#6b7280" />
                <Bar dataKey="ob" name="OB" fill="#9ca3af" />
              </BarChart>
            ) : (
              <LineChart data={reportData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#000" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Summary table */}
      {reportData?.summary && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-sm">Summary by Department</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {Object.keys(reportData.summary[0] || {}).map((k) => (
                    <th key={k} className="table-header">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reportData.summary.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {Object.values(row).map((v: any, j: number) => (
                      <td key={j} className="table-cell text-sm">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
