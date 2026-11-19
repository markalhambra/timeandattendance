import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface Holiday {
  id: string;
  name: string;
  date: string;
  endDate: string;
  type: string;
  isRecurring: boolean;
}

interface HolidayEffects {
  attendanceUpdated: number;
  overtimeCreated: number;
  overtimeUpdated: number;
  overtimeRemoved: number;
  overtimeSkipped: number;
  leaveAdjusted: number;
  warnings: string[];
}

const TYPE_LABEL: Record<string, string> = {
  REGULAR: 'Regular',
  SPECIAL_NON_WORKING: 'Non-working',
  SPECIAL_WORKING: 'Working',
};

function manilaYear(): number {
  return Number(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric' }));
}

function formatDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRange(start: string, end?: string): string {
  if (!end || end === start) return formatDateLabel(start);
  return `${formatDateLabel(start)} – ${formatDateLabel(end)}`;
}

function toastEffects(effects?: HolidayEffects) {
  if (!effects) return;
  const parts = [
    effects.attendanceUpdated ? `${effects.attendanceUpdated} attendance updated` : '',
    effects.overtimeCreated ? `${effects.overtimeCreated} overtime draft created` : '',
    effects.overtimeUpdated ? `${effects.overtimeUpdated} overtime draft updated` : '',
    effects.leaveAdjusted ? `${effects.leaveAdjusted} leave charge adjusted` : '',
  ].filter(Boolean);
  if (parts.length) toast.success(parts.join(' · '));
  effects.warnings.slice(0, 3).forEach((warning) => toast(warning, { icon: '⚠' }));
  if (effects.warnings.length > 3) toast(`${effects.warnings.length - 3} more warnings were not shown.`);
}

export default function HrHolidays() {
  const qc = useQueryClient();
  const [year, setYear] = useState(manilaYear);
  const [form, setForm] = useState({ name: '', date: '', endDate: '' });
  const [editing, setEditing] = useState<Holiday | null>(null);

  const { data: holidays, isLoading, isError } = useQuery<Holiday[]>({
    queryKey: ['holidays', year],
    queryFn: () => api.get('/holidays', { params: { year } }).then((r) => r.data.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['holidays'] });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; date: string; endDate: string }) => api.post('/holidays', body),
    onSuccess: (res) => {
      toast.success('Holiday added.');
      toastEffects(res.data.effects);
      setForm({ name: '', date: '', endDate: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to add holiday.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name: string; date: string; endDate: string } }) => api.put(`/holidays/${id}`, body),
    onSuccess: (res) => {
      toast.success('Holiday updated.');
      toastEffects(res.data.effects);
      setEditing(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to update holiday.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/holidays/${id}`),
    onSuccess: (res) => {
      toast.success('Holiday removed.');
      toastEffects(res.data.effects);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to remove holiday.'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Holidays</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Set one day or a date range, such as a Christmas break from December 20 to January 3. Every day in the range is a non-working holiday.
          </p>
        </div>
        <label className="text-sm text-gray-600">
          Year
          <select
            className="input ml-2"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      <form
        className="card p-5 grid grid-cols-1 sm:grid-cols-[1fr_160px_160px_auto] gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate(form);
        }}
      >
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Holiday name</span>
          <input
            className="input w-full"
            value={form.name}
            maxLength={120}
            placeholder="e.g. Christmas Day"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Start date</span>
          <input
            type="date"
            className="input w-full"
            value={form.date}
            onChange={(e) => setForm((f) => ({
              ...f,
              date: e.target.value,
              endDate: !f.endDate || f.endDate < e.target.value ? e.target.value : f.endDate,
            }))}
            required
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">End date</span>
          <input
            type="date"
            className="input w-full"
            value={form.endDate}
            min={form.date || undefined}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={createMutation.isPending || !form.name.trim() || !form.date || !form.endDate}>
          Add holiday
        </button>
      </form>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-400">Loading holidays…</div>
        ) : isError ? (
          <div className="p-6 text-sm text-red-500">Failed to load holidays.</div>
        ) : !holidays?.length ? (
          <div className="p-6 text-sm text-gray-400">No holidays for {year}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((holiday) => (
                <tr key={holiday.id} className="border-b border-gray-50">
                  <td className="px-5 py-3 whitespace-nowrap">{formatRange(holiday.date, holiday.endDate || holiday.date)}</td>
                  <td className="px-5 py-3 font-medium">{holiday.name}</td>
                  <td className="px-5 py-3 text-gray-500">{TYPE_LABEL[holiday.type] || holiday.type}</td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <button type="button" className="btn-secondary text-xs" onClick={() => setEditing(holiday)}>Edit</button>
                    <button
                      type="button"
                      className="text-xs text-red-600 px-2"
                      onClick={() => {
                        if (confirm(`Remove ${holiday.name} (${formatRange(holiday.date, holiday.endDate || holiday.date)})?`)) {
                          deleteMutation.mutate(holiday.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            className="card p-6 w-full max-w-md space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({ id: editing.id, body: { name: editing.name, date: editing.date, endDate: editing.endDate || editing.date } });
            }}
          >
            <h2 className="font-bold text-lg">Edit holiday</h2>
            <label className="block text-sm">
              <span className="block text-gray-500 mb-1">Name</span>
              <input
                className="input w-full"
                value={editing.name}
                maxLength={120}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="block text-gray-500 mb-1">Start date</span>
              <input
                type="date"
                className="input w-full"
                value={editing.date}
                onChange={(e) => setEditing({
                  ...editing,
                  date: e.target.value,
                  endDate: !editing.endDate || editing.endDate < e.target.value ? e.target.value : editing.endDate,
                })}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="block text-gray-500 mb-1">End date</span>
              <input
                type="date"
                className="input w-full"
                value={editing.endDate || editing.date}
                min={editing.date}
                onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                required
              />
            </label>
            <p className="text-xs text-gray-500">
              Use the same start and end date for a one-day holiday. Changing the range recalculates attendance and leave for the old and new dates. Filed or approved overtime credits are not rewritten.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={updateMutation.isPending || !editing.name.trim()}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
