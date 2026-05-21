import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { GeoLocation, AttendanceRecord, AttendanceStatus } from '../../types';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

const OFFICE_LAT = parseFloat(import.meta.env.VITE_OFFICE_LAT || '14.5995');
const OFFICE_LNG = parseFloat(import.meta.env.VITE_OFFICE_LNG || '120.9842');
const OFFICE_RADIUS = parseFloat(import.meta.env.VITE_OFFICE_RADIUS || '200');

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ClockWidget() {
  const qc = useQueryClient();
  const [geo, setGeo] = useState<GeoLocation | null>(null);
  const [geoError, setGeoError] = useState<string>('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('WFH');
  const [distance, setDistance] = useState<number | null>(null);

  const { data: todayData, isLoading } = useQuery<{ data: AttendanceRecord | null; missedClockOut: AttendanceRecord | null }>({ 
    queryKey: ['today-attendance'],
    queryFn: () => api.get('/attendance/today').then((r) => ({ data: r.data.data, missedClockOut: r.data.missedClockOut ?? null })),
    refetchInterval: 60_000,
  });

  const today = todayData?.data ?? null;
  const missedClockOut = todayData?.missedClockOut ?? null;
  const navigate = useNavigate();

  // Live working timer
  useEffect(() => {
    if (!today?.clockIn || today?.clockOut) return;
    const interval = setInterval(() => {
      setElapsed(formatDuration(Date.now() - new Date(today.clockIn!).getTime()));
    }, 1000);
    return () => clearInterval(interval);
  }, [today]);

  const getLocation = useCallback((): Promise<GeoLocation> => {
    setGeoLoading(true);
    setGeoError('');
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setGeo(loc);
          const dist = haversine(loc.latitude, loc.longitude, OFFICE_LAT, OFFICE_LNG);
          setDistance(Math.round(dist));
          setGeoLoading(false);
          resolve(loc);
        },
        (err) => {
          setGeoError(err.message);
          setGeoLoading(false);
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }, []);

  const clockInMutation = useMutation({
    mutationFn: async (status?: AttendanceStatus) => {
      const loc = geo || await getLocation();
      return api.post('/attendance/clock-in', { ...loc, status });
    },
    onSuccess: () => { toast.success('Clock-in recorded!'); qc.invalidateQueries({ queryKey: ['today-attendance'] }); qc.invalidateQueries({ queryKey: ['employee-dashboard'] }); setShowStatusModal(false); },
    onError: async (err: any) => {
      if (err?.response?.status === 400 && err?.response?.data?.message?.includes('outside office radius')) {
        setShowStatusModal(true);
      } else {
        toast.error(err?.response?.data?.message || 'Clock-in failed.');
      }
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      const loc = geo || await getLocation();
      return api.post('/attendance/clock-out', loc);
    },
    onSuccess: () => { toast.success('Clock-out recorded!'); qc.invalidateQueries({ queryKey: ['today-attendance'] }); qc.invalidateQueries({ queryKey: ['employee-dashboard'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Clock-out failed.'),
  });

  const handleClock = async () => {
    try {
      const loc = await getLocation();
      const dist = haversine(loc.latitude, loc.longitude, OFFICE_LAT, OFFICE_LNG);
      const isOnsite = dist <= OFFICE_RADIUS;

      if (today?.clockIn) {
        clockOutMutation.mutate();
      } else if (isOnsite) {
        clockInMutation.mutate('ON_SITE');
      } else {
        setShowStatusModal(true);
      }
    } catch {
      toast.error('Unable to get location. Please enable GPS.');
    }
  };

  const isBusy = clockInMutation.isPending || clockOutMutation.isPending || geoLoading || isLoading;
  const hasClockedIn = !!today?.clockIn;
  const hasClockedOut = !!today?.clockOut;

  const statusColors: Record<string, string> = {
    ON_SITE: 'bg-black text-white',
    WFH: 'bg-gray-700 text-white',
    OB: 'bg-gray-400 text-white',
  };

  return (
    <>
      {missedClockOut && (
        <div className="card px-4 py-3 bg-amber-50 border border-amber-200 flex items-start gap-3">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Missed clock-out on {format(parseISO(missedClockOut.date), 'MMMM d, yyyy')}</p>
            <p className="text-xs text-amber-700 mt-0.5">You forgot to clock out. Please file a time correction so your hours are recorded correctly.</p>
          </div>
          <button
            onClick={() => navigate('/attendance')}
            className="text-xs font-semibold text-amber-800 underline whitespace-nowrap hover:text-amber-900 shrink-0"
          >
            File Correction
          </button>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-base">Time Clock</h2>
          {today?.status && (
            <span className={`badge ${statusColors[today.status] || 'bg-gray-100 text-gray-700'}`}>
              {today.status}
            </span>
          )}
        </div>

        {/* Live clock */}
        <div className="text-center py-4">
          <div className="text-5xl font-mono font-black tracking-tight">
            {hasClockedIn && !hasClockedOut ? elapsed : new Date().toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {hasClockedIn && !hasClockedOut ? 'Working time' : hasClockedOut ? 'Shift completed' : 'Not clocked in'}
          </div>
        </div>

        {/* Clock info */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Clock In</div>
            <div className="text-sm font-semibold">
              {today?.clockIn ? new Date(today.clockIn).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Clock Out</div>
            <div className="text-sm font-semibold">
              {today?.clockOut ? new Date(today.clockOut).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--'}
            </div>
          </div>
        </div>

        {/* GPS info */}
        {distance !== null && (
          <div className={`flex items-center gap-2 mb-4 text-xs px-3 py-2 rounded-lg ${distance <= OFFICE_RADIUS ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
            <span>📍</span>
            <span>
              {distance <= OFFICE_RADIUS ? `${distance}m from office — ON-SITE` : `${distance}m from office — Outside radius`}
            </span>
          </div>
        )}

        {geoError && (
          <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">
            GPS Error: {geoError}
          </div>
        )}

        {/* Action button */}
        {!hasClockedOut && (
          <button
            onClick={handleClock}
            disabled={isBusy}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
              hasClockedIn
                ? 'bg-white border-2 border-black text-black hover:bg-gray-50'
                : 'bg-black text-white hover:bg-gray-800'
            } disabled:opacity-50`}
          >
            {isBusy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {geoLoading ? 'Getting location...' : 'Processing...'}
              </span>
            ) : hasClockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        )}

        {hasClockedOut && (
          <div className="text-center text-sm text-gray-500 py-2">
            Shift completed · {today?.workingMinutes ? `${(today.workingMinutes / 60).toFixed(1)}h worked` : ''}
            {today?.overtimeMinutes ? ` · ${(today.overtimeMinutes / 60).toFixed(1)}h OT` : ''}
          </div>
        )}
      </div>

      {/* Status selection modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-slide-in">
            <h3 className="font-bold text-base mb-1">Select Attendance Type</h3>
            <p className="text-sm text-gray-500 mb-4">You are outside the office radius ({distance}m). How are you working today?</p>
            <div className="space-y-2 mb-5">
              {(['WFH', 'OB', 'ON_SITE'] as AttendanceStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${selectedStatus === s ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'}`}
                >
                  <div className="font-semibold text-sm">{s === 'ON_SITE' ? 'On-Site' : s === 'WFH' ? 'Work From Home' : 'Official Business'}</div>
                  <div className={`text-xs mt-0.5 ${selectedStatus === s ? 'text-gray-300' : 'text-gray-500'}`}>
                    {s === 'ON_SITE' ? 'Working from the office' : s === 'WFH' ? 'Working remotely from home' : 'Working on external duty'}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowStatusModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => clockInMutation.mutate(selectedStatus)}
                disabled={clockInMutation.isPending}
                className="btn-primary flex-1"
              >
                {clockInMutation.isPending ? 'Clocking in...' : 'Confirm & Clock In'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
