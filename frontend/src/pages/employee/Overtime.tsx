import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { OvertimeRecord, OvertimeConversion, OvertimeConversionType } from '../../types';
import { format, parseISO, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

export default function OvertimePage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [convType, setConvType] = useState<OvertimeConversionType>('CTO');
  const [scheduledDate, setScheduledDate] = useState('');

  const { data: credits } = useQuery<{ records: OvertimeRecord[]; totalMinutes: number }>({
    queryKey: ['overtime-credits'],
    queryFn: () => api.get('/overtime/credits').then((r) => r.data.data),
  });

  const { data: all, isLoading } = useQuery<OvertimeRecord[]>({
    queryKey: ['my-overtime'],
    queryFn: () => api.get('/overtime/my').then((r) => r.data.data),
  });

  const { data: conversions } = useQuery<OvertimeConversion[]>({
    queryKey: ['my-conversions'],
    queryFn: () => api.get('/overtime/conversions/my').then((r) => r.data.data),
  });

  const convertMutation = useMutation({
    mutationFn: (body: any) => api.post('/overtime/convert', body),
    onSuccess: () => {
      toast.success('Conversion request submitted.');
      setShowModal(false);
      setSelectedRecords([]);
      qc.invalidateQueries({ queryKey: ['overtime-credits'] });
      qc.invalidateQueries({ queryKey: ['my-conversions'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to convert.'),
  });

  const toggleRecord = (id: string) => setSelectedRecords((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const selectedTotal = selectedRecords.reduce((sum, id) => {
    const r = credits?.records.find((r) => r.id === id);
    return sum + (r?.minutes || 0);
  }, 0);

  const canConvert = convType === 'CTO' ? selectedTotal >= 240 : selectedTotal >= 480;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { PENDING: 'badge-pending', APPROVED: 'badge-approved', REJECTED: 'badge-rejected', EXPIRED: 'bg-gray-100 text-gray-500' };
    return <span className={`badge ${map[s] || ''}`}>{s}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Overtime</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and convert overtime to leave credits</p>
        </div>
        {credits?.totalMinutes ? (
          <button onClick={() => setShowModal(true)} className="btn-primary">Convert OT</button>
        ) : null}
      </div>

      {/* Credits summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 col-span-1 sm:col-span-1">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Available Credits</div>
          <div className="text-4xl font-black mt-1">{credits ? (credits.totalMinutes / 60).toFixed(1) : 0}h</div>
          <div className="text-xs text-gray-400 mt-1">{credits?.records.length ?? 0} records</div>
        </div>
        <div className={`card p-5 ${credits && credits.totalMinutes >= 240 ? 'border-black' : ''}`}>
          <div className="text-xs text-gray-500 font-semibold">CTO Eligible</div>
          <div className="text-2xl font-black mt-1">{credits && credits.totalMinutes >= 240 ? 'Yes' : 'No'}</div>
          <div className="text-xs text-gray-400 mt-1">Requires 4h minimum</div>
        </div>
        <div className={`card p-5 ${credits && credits.totalMinutes >= 480 ? 'border-black' : ''}`}>
          <div className="text-xs text-gray-500 font-semibold">CDO Eligible</div>
          <div className="text-2xl font-black mt-1">{credits && credits.totalMinutes >= 480 ? 'Yes' : 'No'}</div>
          <div className="text-xs text-gray-400 mt-1">Requires 8h minimum</div>
        </div>
      </div>

      {/* All overtime records */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-sm">Overtime Records</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date', 'Hours', 'Status', 'Expires', ''].map((h) => <th key={h} className="table-header">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={5}><div className="h-10 bg-gray-100 m-2 rounded animate-pulse" /></td></tr>)
              ) : !all?.length ? (
                <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-10">No overtime records</td></tr>
              ) : (
                all.map((r) => {
                  const expiry = r.approvedExpiry || r.pendingExpiry;
                  const daysLeft = expiry ? differenceInDays(parseISO(expiry), new Date()) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{format(parseISO(r.date), 'MMM d, yyyy')}</td>
                      <td className="table-cell font-semibold">{(r.minutes / 60).toFixed(1)}h</td>
                      <td className="table-cell">{statusBadge(r.status)}</td>
                      <td className="table-cell">
                        {expiry ? (
                          <span className={daysLeft !== null && daysLeft <= 7 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                            {format(parseISO(expiry), 'MMM d, yyyy')}
                            {daysLeft !== null && daysLeft <= 7 && ` (${daysLeft}d!)`}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="table-cell text-xs text-gray-400">{r.isConverted ? 'Converted' : ''}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion history */}
      {conversions?.length ? (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-sm">Conversion History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Type', 'Scheduled Date', 'Hours', 'Status'].map((h) => <th key={h} className="table-header">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {conversions.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{c.type}</td>
                    <td className="table-cell">{format(parseISO(c.scheduledDate), 'MMM d, yyyy')}</td>
                    <td className="table-cell">{(c.totalMinutes / 60).toFixed(1)}h</td>
                    <td className="table-cell">{statusBadge(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Convert Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-4">Convert Overtime</h3>

            <div className="mb-4">
              <label className="label">Conversion Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['CTO', 'CDO'] as OvertimeConversionType[]).map((t) => (
                  <button key={t} onClick={() => setConvType(t)} className={`p-3 rounded-xl border-2 text-left transition-all ${convType === t ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'}`}>
                    <div className="font-bold text-sm">{t}</div>
                    <div className={`text-xs ${convType === t ? 'text-gray-300' : 'text-gray-500'}`}>{t === 'CTO' ? 'Min 4 hours' : 'Min 8 hours'}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="label">Scheduled Date</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="input" min={format(new Date(), 'yyyy-MM-dd')} />
            </div>

            <div className="mb-4">
              <label className="label">Select Records to Convert</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {credits?.records.map((r) => (
                  <label key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedRecords.includes(r.id) ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={selectedRecords.includes(r.id)} onChange={() => toggleRecord(r.id)} className="rounded" />
                    <div>
                      <div className="text-sm font-medium">{format(parseISO(r.date), 'MMM d, yyyy')}</div>
                      <div className="text-xs text-gray-500">{(r.minutes / 60).toFixed(1)}h</div>
                    </div>
                    <div className="ml-auto text-xs text-gray-400">
                      Exp {r.approvedExpiry ? format(parseISO(r.approvedExpiry), 'MM/yy') : '--'}
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-sm font-semibold">
                Selected: {(selectedTotal / 60).toFixed(1)}h — {canConvert ? <span className="text-green-600">Eligible</span> : <span className="text-red-500">Insufficient for {convType}</span>}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => convertMutation.mutate({ type: convType, scheduledDate, overtimeIds: selectedRecords })}
                disabled={!canConvert || !scheduledDate || !selectedRecords.length || convertMutation.isPending}
                className="btn-primary flex-1"
              >
                {convertMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
