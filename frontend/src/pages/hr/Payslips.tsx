import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface Workbook {
  id: string;
  year: number;
  spreadsheetId: string;
  title?: string | null;
  isActive: boolean;
}

interface SheetInfo {
  name: string;
  isPeriodSheet: boolean;
}

interface PreviewMatched {
  employeeId: string;
  employeeNumber: string;
  name: string;
  sheetName: string;
  netPay: number | null;
  matchMethod: string;
}

interface PreviewUnmatched {
  fullName: string;
  employeeNumber?: string;
  tin?: string;
  netPay?: number;
  reason: string;
}

interface PayrollRun {
  id: string;
  year: number;
  sheetName: string;
  periodLabel: string;
  status: string;
  matchedCount: number;
  unmatchedCount: number;
  generatedCount: number;
  failedCount: number;
  createdAt: string;
}

interface ManagedPayslip {
  id: string;
  periodLabel: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  netPay: number | string | null;
  filename: string;
  size: number;
  createdAt: string;
  year: number;
  sheetName: string;
  employeeId: string;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
  };
}

const currentYear = new Date().getFullYear();

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HRPayslipsPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [payPeriodStart, setPayPeriodStart] = useState('');
  const [payPeriodEnd, setPayPeriodEnd] = useState('');
  const [preview, setPreview] = useState<{
    periodLabel: string;
    matchedCount: number;
    unmatchedCount: number;
    matched: PreviewMatched[];
    unmatched: PreviewUnmatched[];
    payPeriodStart: string;
    payPeriodEnd: string;
  } | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  // All-employee payslip management
  const [listSearch, setListSearch] = useState('');
  const [listSearchDebounced, setListSearchDebounced] = useState('');
  const [listYear, setListYear] = useState<string>('all');
  const [listPage, setListPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setListSearchDebounced(listSearch.trim());
      setListPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [listSearch]);

  const { data: wbData, isLoading: wbLoading } = useQuery({
    queryKey: ['payroll-workbooks'],
    queryFn: () => api.get('/payroll/workbooks').then((r) => r.data.data),
  });

  const workbooks: Workbook[] = wbData?.workbooks || [];
  const google = wbData?.google as { configured?: boolean; serviceAccountEmail?: string | null } | undefined;
  const activeWorkbook = workbooks.find((w) => w.year === year);

  useEffect(() => {
    if (activeWorkbook) setSpreadsheetInput(activeWorkbook.spreadsheetId);
    else setSpreadsheetInput('');
    setSheetName('');
    setPreview(null);
    setLastResult(null);
  }, [year, activeWorkbook?.id, activeWorkbook?.spreadsheetId]);

  const { data: sheetsData, isFetching: sheetsLoading, refetch: refetchSheets, error: sheetsError } = useQuery({
    queryKey: ['payroll-sheets', year],
    queryFn: () => api.get(`/payroll/workbooks/${year}/sheets`).then((r) => r.data.data),
    enabled: !!activeWorkbook,
    retry: false,
  });

  const sheets: SheetInfo[] = sheetsData?.sheets || [];
  // Prefer period tabs; if filter removes everything, fall back to all tab names so UI is usable
  const periodSheets: string[] = useMemo(() => {
    const fromApi = (sheetsData?.periodSheets as string[] | undefined) || [];
    if (fromApi.length) return fromApi;
    const flagged = sheets.filter((s) => s.isPeriodSheet).map((s) => s.name);
    if (flagged.length) return flagged;
    return sheets.map((s) => s.name);
  }, [sheetsData?.periodSheets, sheets]);

  useEffect(() => {
    if (!sheetsData) return;
    const def = (sheetsData.defaultSheet as string | null) || periodSheets[periodSheets.length - 1] || '';
    if (def) setSheetName(def);
  }, [sheetsData, periodSheets]);

  useEffect(() => {
    if (!sheetsError) return;
    const err: any = sheetsError;
    toast.error(err?.response?.data?.message || err?.message || 'Failed to load sheet tabs.');
  }, [sheetsError]);

  async function handleRefreshTabs() {
    if (!activeWorkbook) {
      toast.error('Save the spreadsheet for this year first.');
      return;
    }
    try {
      const result = await refetchSheets();
      if (result.error) throw result.error;
      const data: any = result.data;
      const n = data?.sheets?.length ?? 0;
      if (n === 0) {
        toast.error('Spreadsheet opened but no tabs were found.');
      } else {
        const periods = (data?.periodSheets as string[] | undefined)?.length ?? n;
        toast.success(`Loaded ${n} tab(s)${periods !== n ? ` (${periods} look like cut-offs)` : ''}.`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to refresh tabs.');
    }
  }

  const { data: runs } = useQuery<PayrollRun[]>({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/payroll/runs?limit=15').then((r) => r.data.data),
  });

  const listQueryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(listPage));
    p.set('limit', '25');
    if (listSearchDebounced) p.set('search', listSearchDebounced);
    if (listYear !== 'all') p.set('year', listYear);
    return p.toString();
  }, [listPage, listSearchDebounced, listYear]);

  const { data: allPayslipsData, isLoading: allPayslipsLoading, isFetching: allPayslipsFetching } = useQuery({
    queryKey: ['payroll-all-payslips', listQueryParams],
    queryFn: () => api.get(`/payroll/payslips?${listQueryParams}`).then((r) => r.data.data),
  });

  const managedPayslips: ManagedPayslip[] = allPayslipsData?.payslips || [];
  const listPagination = allPayslipsData?.pagination as
    | { page: number; limit: number; total: number; totalPages: number }
    | undefined;

  const saveWorkbook = useMutation({
    mutationFn: () =>
      api.put(`/payroll/workbooks/${year}`, {
        spreadsheetId: spreadsheetInput.trim(),
        title: `Payroll ${year}`,
      }),
    onSuccess: () => {
      toast.success(`Payroll spreadsheet saved for ${year}.`);
      qc.invalidateQueries({ queryKey: ['payroll-workbooks'] });
      qc.invalidateQueries({ queryKey: ['payroll-sheets', year] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to save spreadsheet.'),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post('/payroll/preview', {
        year,
        sheetName,
        payPeriodStart: payPeriodStart || undefined,
        payPeriodEnd: payPeriodEnd || undefined,
      }).then((r) => r.data.data),
    onSuccess: (data) => {
      setPreview(data);
      setLastResult(null);
      if (data.payPeriodStart) setPayPeriodStart(data.payPeriodStart);
      if (data.payPeriodEnd) setPayPeriodEnd(data.payPeriodEnd);
      toast.success(`Preview: ${data.matchedCount} matched, ${data.unmatchedCount} unmatched`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Preview failed.'),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post('/payroll/generate', {
        year,
        sheetName,
        payPeriodStart: payPeriodStart || undefined,
        payPeriodEnd: payPeriodEnd || undefined,
      }).then((r) => r.data.data),
    onSuccess: (data) => {
      setLastResult(data);
      qc.invalidateQueries({ queryKey: ['payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-all-payslips'] });
      toast.success(`Generated ${data.generatedCount} payslip(s).`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Generate failed.'),
  });

  const deletePayslipMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payroll/${id}`),
    onSuccess: () => {
      toast.success('Payslip deleted.');
      qc.invalidateQueries({ queryKey: ['payroll-all-payslips'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete payslip.'),
  });

  async function downloadPayslip(p: ManagedPayslip) {
    setDownloadingId(p.id);
    try {
      const res = await api.get(`/payroll/${p.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = p.filename || `payslip-${p.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Download failed.');
    } finally {
      setDownloadingId(null);
    }
  }

  const yearOptions = useMemo(() => {
    const years = new Set<number>([currentYear, currentYear - 1, currentYear + 1]);
    workbooks.forEach((w) => years.add(w.year));
    return [...years].sort((a, b) => b - a);
  }, [workbooks]);

  const listYearOptions = useMemo(() => {
    const years = new Set<number>(yearOptions);
    managedPayslips.forEach((p) => years.add(p.year));
    return [...years].sort((a, b) => b - a);
  }, [yearOptions, managedPayslips]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black">Payslip Generator</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Read the yearly Google Sheets payroll register (15th / 30th tabs) and publish payslip PDFs to employee profiles.
          No email is sent. Each employee keeps the latest 4 payslips only.
        </p>
      </div>

      {/* Google status */}
      <div className={`card p-4 text-sm ${google?.configured ? 'bg-green-50 border border-green-100' : 'bg-amber-50 border border-amber-100'}`}>
        {google?.configured ? (
          <p>
            <span className="font-semibold text-green-800">Google Sheets connected.</span>{' '}
            Share each yearly payroll spreadsheet with{' '}
            <code className="text-xs bg-white/80 px-1.5 py-0.5 rounded border">{google.serviceAccountEmail || 'service account'}</code>{' '}
            as <strong>Viewer</strong>.
          </p>
        ) : (
          <p className="text-amber-900">
            <span className="font-semibold">Google credentials not configured on the server.</span>{' '}
            Set <code className="text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code> or email + private key env vars, then restart.
          </p>
        )}
      </div>

      {/* Workbook config */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm">1. Yearly spreadsheet</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Year</label>
            <select className="input w-32" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-64">
            <label className="label">Google Spreadsheet ID or URL</label>
            <input
              className="input text-sm font-mono"
              value={spreadsheetInput}
              onChange={(e) => setSpreadsheetInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..../edit"
            />
          </div>
          <button
            className="btn-primary text-sm"
            disabled={!spreadsheetInput.trim() || saveWorkbook.isPending}
            onClick={() => saveWorkbook.mutate()}
          >
            {saveWorkbook.isPending ? 'Saving…' : 'Save'}
          </button>
          {activeWorkbook && (
            <button className="btn-secondary text-sm" disabled={sheetsLoading} onClick={() => void handleRefreshTabs()}>
              {sheetsLoading ? 'Refreshing…' : 'Refresh tabs'}
            </button>
          )}
        </div>
        {wbLoading ? <p className="text-xs text-gray-400">Loading…</p> : null}
        {activeWorkbook ? (
          <p className="text-xs text-gray-500">
            Linked: <span className="font-mono">{activeWorkbook.spreadsheetId}</span>
            {google?.serviceAccountEmail ? (
              <>
                {' '}· Share sheet with{' '}
                <code className="text-[10px] bg-gray-50 px-1 rounded border">{google.serviceAccountEmail}</code> as Viewer
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-amber-700">No spreadsheet saved for {year} yet. Paste the URL and click Save first.</p>
        )}
        {sheetsError ? (
          <p className="text-xs text-red-600">
            {(sheetsError as any)?.response?.data?.message || (sheetsError as any)?.message || 'Could not load tabs.'}
          </p>
        ) : null}
      </div>

      {/* Cut-off */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm">2. Cut-off tab (15th / 30th)</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Sheet tab</label>
            <select
              className="input"
              value={sheetName}
              onChange={(e) => { setSheetName(e.target.value); setPreview(null); }}
              disabled={!periodSheets.length}
            >
              {!periodSheets.length && <option value="">No tabs loaded — Save + Refresh tabs</option>}
              {periodSheets.map((n) => (
                <option key={n} value={n}>{n}{sheetsData?.defaultSheet === n ? ' (latest)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Period start (optional)</label>
            <input type="date" className="input" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Period end (optional)</label>
            <input type="date" className="input" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Default tab is the last period sheet in the workbook. Dates auto-parse from names like <code>Apr15</code> / <code>May31</code>; override if needed.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary text-sm"
            disabled={!sheetName || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? 'Previewing…' : 'Preview matches'}
          </button>
          <button
            className="btn-primary text-sm"
            disabled={!sheetName || generateMutation.isPending || (preview != null && preview.matchedCount === 0)}
            onClick={() => {
              if (!confirm(`Generate payslip PDFs for "${sheetName}"? Employees will see them on My Profile (max 4 kept).`)) return;
              generateMutation.mutate();
            }}
          >
            {generateMutation.isPending ? 'Generating…' : 'Generate payslips'}
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 justify-between items-center">
            <div>
              <h2 className="font-semibold text-sm">Preview — {preview.periodLabel}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {preview.matchedCount} matched · {preview.unmatchedCount} unmatched
              </p>
            </div>
          </div>
          <div className="max-h-72 overflow-auto divide-y divide-gray-50">
            {preview.matched.slice(0, 40).map((m) => (
              <div key={m.employeeId} className="px-5 py-2.5 flex gap-3 text-sm items-center">
                <span className="font-mono text-xs text-gray-500 w-24">{m.employeeNumber}</span>
                <span className="flex-1 font-medium">{m.name}</span>
                <span className="text-xs text-gray-400 truncate max-w-40" title={m.sheetName}>{m.sheetName}</span>
                <span className="text-xs text-gray-500 w-16">{m.matchMethod}</span>
                <span className="font-mono text-xs w-24 text-right">{money(m.netPay)}</span>
              </div>
            ))}
            {preview.matched.length > 40 && (
              <div className="px-5 py-2 text-xs text-gray-400">…and {preview.matched.length - 40} more matched</div>
            )}
          </div>
          {preview.unmatched.length > 0 && (
            <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-3">
              <div className="text-xs font-bold text-amber-800 mb-2">Unmatched ({preview.unmatched.length})</div>
              <div className="space-y-1 max-h-40 overflow-auto">
                {preview.unmatched.slice(0, 30).map((u, i) => (
                  <div key={i} className="text-xs text-amber-900 flex gap-2">
                    <span className="font-medium">{u.fullName}</span>
                    <span className="text-amber-700">— {u.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last generate result */}
      {lastResult && (
        <div className="card p-5 bg-green-50 border border-green-100 text-sm space-y-1">
          <div className="font-semibold text-green-900">Generation complete — {lastResult.periodLabel}</div>
          <div>Created/updated: <strong>{lastResult.generatedCount}</strong></div>
          <div>Failed: <strong>{lastResult.failedCount}</strong></div>
          <div>Unmatched skipped: <strong>{lastResult.unmatchedCount}</strong></div>
          {lastResult.failures?.length > 0 && (
            <ul className="text-xs text-red-700 mt-2 list-disc pl-4">
              {lastResult.failures.map((f: any, i: number) => (
                <li key={i}>{f.name}: {f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* All employee payslips — view / download / delete */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-wrap gap-2 items-start justify-between">
            <div>
              <h2 className="font-semibold text-sm">All employee payslips</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Download or delete any payslip (e.g. typos). Deletion removes the PDF from storage and the employee profile.
              </p>
            </div>
            {listPagination && (
              <span className="text-xs text-gray-400">
                {listPagination.total} total{allPayslipsFetching ? ' · refreshing…' : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-48">
              <label className="label">Search</label>
              <input
                className="input text-sm"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Name, employee no., period…"
              />
            </div>
            <div>
              <label className="label">Year</label>
              <select
                className="input w-28"
                value={listYear}
                onChange={(e) => {
                  setListYear(e.target.value);
                  setListPage(1);
                }}
              >
                <option value="all">All</option>
                {listYearOptions.map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {allPayslipsLoading ? (
          <div className="text-center text-sm text-gray-400 py-10">Loading payslips…</div>
        ) : !managedPayslips.length ? (
          <div className="text-center text-sm text-gray-400 py-10">No payslips found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Period</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Net pay</th>
                  <th className="px-3 py-2.5 font-semibold">Published</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {managedPayslips.map((p) => {
                  const name = `${p.employee.firstName} ${p.employee.lastName}`;
                  const deleting = deletePayslipMutation.isPending && deletePayslipMutation.variables === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80">
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-gray-400 font-mono">
                          {p.employee.employeeNumber}
                          {p.employee.department?.name ? ` · ${p.employee.department.name}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{p.periodLabel}</div>
                        <div className="text-xs text-gray-400 font-mono">{p.year} · {p.sheetName}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {money(p.netPay != null ? Number(p.netPay) : null)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(p.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1 px-2"
                            disabled={downloadingId === p.id}
                            onClick={() => downloadPayslip(p)}
                          >
                            {downloadingId === p.id ? '…' : 'Download'}
                          </button>
                          <button
                            type="button"
                            className="text-xs py-1 px-2 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            disabled={deleting || deletePayslipMutation.isPending}
                            onClick={() => {
                              if (
                                !confirm(
                                  `Delete payslip for ${name} (${p.periodLabel})?\n\nThis cannot be undone. Re-generate from the cut-off tab if needed.`,
                                )
                              ) {
                                return;
                              }
                              deletePayslipMutation.mutate(p.id);
                            }}
                          >
                            {deleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {listPagination && listPagination.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>
              Page {listPagination.page} of {listPagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2"
                disabled={listPage <= 1}
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2"
                disabled={listPage >= listPagination.totalPages}
                onClick={() => setListPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">Recent runs</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {!runs?.length ? (
            <div className="text-center text-sm text-gray-400 py-8">No payroll runs yet</div>
          ) : (
            runs.map((r) => (
              <div key={r.id} className="px-5 py-3 flex flex-wrap gap-2 items-center text-sm">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">{r.status}</span>
                <span className="font-medium">{r.periodLabel}</span>
                <span className="text-xs text-gray-400 font-mono">{r.sheetName}</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {r.generatedCount} pdf · {r.unmatchedCount} unmatched · {format(new Date(r.createdAt), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
