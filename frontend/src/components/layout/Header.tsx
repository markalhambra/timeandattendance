import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Notification } from '../../types';
import { formatDistanceToNow } from 'date-fns';

interface Props { onMenuClick: () => void; }

export default function Header({ onMenuClick }: Props) {
  const { user } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: countData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.data.count as number),
    refetchInterval: 30_000,
  });

  const { data: notifsData, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=10').then((r) => r.data.data as Notification[]),
    enabled: showNotifs,
  });

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    refetch();
  };

  const now = new Date();
  const phTime = now.toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true });
  const phDate = now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-10">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <div className="w-5 h-0.5 bg-black mb-1" />
          <div className="w-5 h-0.5 bg-black mb-1" />
          <div className="w-5 h-0.5 bg-black" />
        </button>
        <div className="hidden sm:block">
          <div className="text-xs text-gray-500">{phDate}</div>
          <div className="text-sm font-semibold">{phTime} <span className="text-gray-400 text-xs">PHT</span></div>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {!!countData && countData > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-black text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {countData > 99 ? '99+' : countData}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-modal z-50 animate-slide-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-sm">Notifications</span>
                <button onClick={markAllRead} className="text-xs text-gray-500 hover:text-black">Mark all read</button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {!notifsData?.length ? (
                  <div className="text-center text-sm text-gray-400 py-8">No notifications</div>
                ) : (
                  notifsData.map((n) => (
                    <div key={n.id} className={`px-4 py-3 text-sm ${!n.isRead ? 'bg-gray-50' : ''}`}>
                      <div className="font-medium">{n.title}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{n.message}</div>
                      <div className="text-gray-400 text-[11px] mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
          <div className="hidden md:block text-right">
            <div className="text-xs font-semibold leading-tight">
              {user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.email}
            </div>
            <div className="text-[10px] text-gray-400">{user?.role?.replace('_', ' ')}</div>
          </div>
          {user?.employee?.profilePicture ? (
            <img src={user.employee.profilePicture} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">
              {user?.employee?.firstName?.[0]}{user?.employee?.lastName?.[0]}
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      {showNotifs && <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)} />}
    </header>
  );
}
