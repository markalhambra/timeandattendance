import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { format } from 'date-fns';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValues: any;
  newValues: any;
  ipAddress?: string;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', page, search, actionFilter],
    queryFn: () => api.get(`/audit-logs?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}${actionFilter ? `&action=${actionFilter}` : ''}`).then((r) => r.data.data),
  });

  const actions = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'CLOCK_IN', 'CLOCK_OUT'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-0.5">System-wide activity trail</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search user or entity..." className="input flex-1 min-w-48 text-sm" />
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="input w-auto text-sm">
          <option value="">All Actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-sm">{data?.total ?? 0} total entries</h2>
          <span className="text-xs text-gray-400">Page {data?.page} of {data?.totalPages}</span>
        </div>
        <div className="divide-y divide-gray-50">
          {isLoading ? [...Array(8)].map((_, i) => <div key={i} className="h-14 bg-gray-50 m-2 rounded animate-pulse" />) :
            !data?.logs?.length ? <div className="text-center text-sm text-gray-400 py-10">No audit logs</div> :
            data.logs.map((log) => (
              <div key={log.id}>
                <button onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 text-left transition-colors">
                  <div className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide ${
                    log.action.includes('CREATE') ? 'bg-green-50 text-green-700' :
                    log.action.includes('DELETE') || log.action.includes('REJECT') ? 'bg-red-50 text-red-600' :
                    log.action.includes('APPROVE') ? 'bg-blue-50 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{log.action}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {log.user?.firstName} {log.user?.lastName}
                      <span className="text-gray-400 font-normal"> · </span>
                      <span className="font-mono text-xs text-gray-600">{log.entity}</span>
                    </div>
                    <div className="text-xs text-gray-400">{format(new Date(log.createdAt), 'MMM d, yyyy hh:mm:ss a')} {log.ipAddress && `· ${log.ipAddress}`}</div>
                  </div>
                  <span className="text-gray-400 text-xs">{expanded === log.id ? '▲' : '▼'}</span>
                </button>
                {expanded === log.id && (log.oldValues || log.newValues) && (
                  <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                    {log.oldValues && (
                      <div className="bg-red-50 rounded-xl p-3">
                        <div className="text-xs font-bold text-red-700 mb-2">Before</div>
                        <pre className="text-[11px] text-red-600 overflow-auto max-h-32">{JSON.stringify(log.oldValues, null, 2)}</pre>
                      </div>
                    )}
                    {log.newValues && (
                      <div className="bg-green-50 rounded-xl p-3">
                        <div className="text-xs font-bold text-green-700 mb-2">After</div>
                        <pre className="text-[11px] text-green-600 overflow-auto max-h-32">{JSON.stringify(log.newValues, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm disabled:opacity-50">← Prev</button>
          <span className="text-sm text-gray-500">{page} / {data.totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="btn-secondary text-sm disabled:opacity-50">Next →</button>
        </div>
      )}
    </div>
  );
}
