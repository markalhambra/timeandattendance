import { useState, useMemo } from 'react';
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, parseISO, addMonths, subMonths, format, isWithinInterval } from 'date-fns';

export interface LeaveEvent {
  id: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  employee?: { firstName: string; lastName: string };
}

export interface ConversionEvent {
  id: string;
  scheduledDate?: string | null;
  conversionType: string;
  employee?: { firstName: string; lastName: string };
}

interface Props {
  leaves?: LeaveEvent[];
  conversions?: ConversionEvent[];
  showEmployee?: boolean;
  title?: string;
}

const LEAVE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SICK:     { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Sick' },
  VACATION: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Vacation' },
  PML:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Pamilya Muna' },
  SML:      { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Sarili Muna' },
  EMERGENCY: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Emergency Leave' },
  SOLO_PARENT: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Solo Parent Leave' },
  MATERNITY: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Maternity Leave' },
  PATERNITY: { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Paternity Leave' },
  BEREAVEMENT: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Bereavement Leave' },
  MAGNA_CARTA_WOMEN: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Magna Carta for Women Leave' },
};
const CONV_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  CTO: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'CTO' },
  CDO: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'CDO' },
};

export default function MiniCalendar({ leaves = [], conversions = [], showEmployee = false, title = 'Schedule' }: Props) {
  const [current, setCurrent] = useState(() => new Date());

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun

  const dayEvents = useMemo(() => {
    const map = new Map<string, { bg: string; text: string; title: string }[]>();
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      const evts: { bg: string; text: string; title: string }[] = [];

      for (const l of leaves) {
        try {
          const s = parseISO(l.startDate);
          const e = parseISO(l.endDate);
          if (isWithinInterval(day, { start: s, end: e })) {
            const c = LEAVE_COLORS[l.leaveType] || { bg: 'bg-gray-100', text: 'text-gray-600', label: l.leaveType };
            const who = showEmployee && l.employee ? ` — ${l.employee.firstName} ${l.employee.lastName}` : '';
            evts.push({ bg: c.bg, text: c.text, title: `${c.label}${who}` });
          }
        } catch { /* skip bad dates */ }
      }

      for (const conv of conversions) {
        if (!conv.scheduledDate) continue;
        try {
          if (isSameDay(parseISO(conv.scheduledDate), day)) {
            const c = CONV_COLORS[conv.conversionType] || { bg: 'bg-amber-100', text: 'text-amber-700', label: conv.conversionType };
            const who = showEmployee && conv.employee ? ` — ${conv.employee.firstName} ${conv.employee.lastName}` : '';
            evts.push({ bg: c.bg, text: c.text, title: `${c.label}${who}` });
          }
        } catch { /* skip */ }
      }

      if (evts.length) map.set(key, evts);
    }
    return map;
  }, [days, leaves, conversions, showEmployee]);

  const today = new Date();
  const usedTypes = new Set([
    ...leaves.map((l) => l.leaveType),
    ...conversions.filter((c) => c.scheduledDate).map((c) => c.conversionType),
  ]);

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm">{title}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrent(subMonths(current, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-xs font-bold">‹</button>
          <span className="text-sm font-semibold w-28 text-center">{format(current, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrent(addMonths(current, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-xs font-bold">›</button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const evts = dayEvents.get(key) || [];
          const isToday = isSameDay(day, today);
          const first = evts[0];
          const extra = evts.length - 1;

          return (
            <div
              key={key}
              className={`relative flex flex-col items-center justify-start rounded-lg py-1 min-h-[36px] ${first ? first.bg : ''} ${isToday && !first ? 'ring-1 ring-black ring-inset' : ''}`}
              title={evts.map((e) => e.title).join('\n') || undefined}
            >
              <span className={`text-[11px] font-semibold ${first ? first.text : isToday ? 'font-black' : 'text-gray-700'}`}>
                {format(day, 'd')}
              </span>
              {extra > 0 && (
                <span className={`text-[9px] font-bold ${first.text}`}>+{extra}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {usedTypes.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {[...usedTypes].map((t) => {
            const c = { ...LEAVE_COLORS, ...CONV_COLORS }[t];
            if (!c) return null;
            return (
              <span key={t} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                {c.label}
              </span>
            );
          })}
        </div>
      )}

      {usedTypes.size === 0 && (
        <div className="text-center text-xs text-gray-400 pt-3 border-t border-gray-100">No scheduled events this month</div>
      )}
    </div>
  );
}
