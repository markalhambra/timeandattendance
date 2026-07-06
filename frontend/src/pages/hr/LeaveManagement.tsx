import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import type { Employee, LeaveBalance, LeaveAdjustment, LeaveType } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADJUSTABLE_LEAVE_TYPES: LeaveType[] = [
  'SICK', 'VACATION', 'PML', 'SML', 'EMERGENCY',
  'SOLO_PARENT', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'MAGNA_CARTA_WOMEN',
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: 'Sick Leave',
  VACATION: 'Vacation Leave',
  PML: 'Parental / Maternity Leave (PML)',
  SML: 'Special Maternity Leave',
  EMERGENCY: 'Emergency Leave',
  SOLO_PARENT: 'Solo Parent Leave',
  MATERNITY: 'Maternity Leave',
  PATERNITY: 'Paternity Leave',
  BEREAVEMENT: 'Bereavement Leave',
  MAGNA_CARTA_WOMEN: 'Magna Carta for Women',
  LWOP: 'Leave Without Pay',
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function searchEmployees(q: string): Promise<Employee[]> {
  const { data } = await api.get('/employees', { params: { search: q, limit: 20 } });
  return data.data ?? [];
}

async function fetchBalances(employeeId: string, year: number): Promise<{ balances: LeaveBalance[]; employee: Employee }> {
  const { data } = await api.get(`/leave/employee/${employeeId}/balances`, { params: { year } });
  return { balances: data.data, employee: data.employee };
}

async function fetchAdjustments(employeeId: string): Promise<LeaveAdjustment[]> {
  const { data } = await api.get('/leave/adjustments', { params: { employeeId, limit: 100 } });
  return data.data ?? [];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvailableDays({ balance }: { balance: LeaveBalance }) {
  const available = balance.totalDays - balance.usedDays - balance.pendingDays;
  const pct = balance.totalDays > 0 ? Math.min(100, (available / balance.totalDays) * 100) : 0;
  const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{available.toFixed(2)} / {balance.totalDays.toFixed(2)} days</span>
        <span className="text-gray-400">Used: {balance.usedDays.toFixed(2)} | Pending: {balance.pendingDays.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface AdjustForm {
  leaveType: LeaveType;
  action: 'ADD' | 'DEDUCT';
  amount: string;
  reason: string;
}

const EMPTY_FORM: AdjustForm = { leaveType: 'VACATION', action: 'ADD', amount: '', reason: '' };

export default function HrLeaveManagement() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  // Employee search
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Adjust modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(EMPTY_FORM);
  const [adjustError, setAdjustError] = useState('');

  // Search handler with debounce
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => setDebouncedSearch(val), 350);
    setDebounceTimer(t);
  }, [debounceTimer]);

  // Queries
  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['emp-search', debouncedSearch],
    queryFn: () => searchEmployees(debouncedSearch),
    enabled: debouncedSearch.length >= 1,
  });

  const { data: balanceData, isLoading: balancesLoading } = useQuery({
    queryKey: ['hr-emp-balances', selectedEmployee?.id, selectedYear],
    queryFn: () => fetchBalances(selectedEmployee!.id, selectedYear),
    enabled: !!selectedEmployee,
  });

  const { data: adjustments = [], isLoading: adjLoading } = useQuery({
    queryKey: ['hr-adjustments', selectedEmployee?.id],
    queryFn: () => fetchAdjustments(selectedEmployee!.id),
    enabled: !!selectedEmployee,
  });

  // Adjust mutation
  const adjustMutation = useMutation({
    mutationFn: async (form: AdjustForm) => {
      const amount = parseFloat(form.amount);
      const finalAmount = form.action === 'DEDUCT' ? -Math.abs(amount) : Math.abs(amount);
      await api.post(`/leave/employee/${selectedEmployee!.id}/adjust`, {
        leaveType: form.leaveType,
        adjustmentAmount: finalAmount,
        reason: form.reason.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-emp-balances', selectedEmployee?.id] });
      queryClient.invalidateQueries({ queryKey: ['hr-adjustments', selectedEmployee?.id] });
      setShowAdjustModal(false);
      setAdjustForm(EMPTY_FORM);
      setAdjustError('');
    },
    onError: (err: any) => {
      setAdjustError(err?.response?.data?.message ?? 'Adjustment failed.');
    },
  });

  const openAdjustModal = (leaveType: LeaveType) => {
    setAdjustForm({ ...EMPTY_FORM, leaveType });
    setAdjustError('');
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = () => {
    const amount = parseFloat(adjustForm.amount);
    if (!adjustForm.amount || isNaN(amount) || amount <= 0) {
      setAdjustError('Enter a valid positive amount.');
      return;
    }
    if (!adjustForm.reason.trim()) {
      setAdjustError('Reason is required.');
      return;
    }
    adjustMutation.mutate(adjustForm);
  };

  const balances = balanceData?.balances ?? [];
  const displayedEmployee = balanceData?.employee ?? selectedEmployee;
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Leave Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Employee Search ── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-700 text-sm">Select Employee</h2>
            </div>
            <div className="p-3">
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by name or ID..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="divide-y divide-gray-100 max-h-[calc(100vh-300px)] overflow-y-auto">
              {searching && (
                <div className="p-4 text-center text-sm text-gray-400">Searching...</div>
              )}
              {!searching && debouncedSearch && searchResults.length === 0 && (
                <div className="p-4 text-center text-sm text-gray-400">No employees found.</div>
              )}
              {!debouncedSearch && (
                <div className="p-4 text-center text-sm text-gray-400">Type to search employees.</div>
              )}
              {searchResults.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => { setSelectedEmployee(emp); setSearch(''); setDebouncedSearch(''); }}
                  className={`w-full text-left p-3 hover:bg-indigo-50 transition-colors ${
                    selectedEmployee?.id === emp.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''
                  }`}
                >
                  <div className="font-medium text-sm text-gray-800">
                    {emp.lastName}, {emp.firstName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {emp.employeeNumber} · {emp.department?.name ?? '—'}
                  </div>
                </button>
              ))}
              {selectedEmployee && !debouncedSearch && (
                <div className={`w-full text-left p-3 bg-indigo-50 border-l-2 border-indigo-500`}>
                  <div className="font-medium text-sm text-gray-800">
                    {selectedEmployee.lastName}, {selectedEmployee.firstName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {selectedEmployee.employeeNumber} · {selectedEmployee.department?.name ?? '—'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Balances + History ── */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedEmployee ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
              Select an employee to view and manage their leave balances.
            </div>
          ) : (
            <>
              {/* Balance table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-700 text-sm">
                      Leave Balances — {displayedEmployee?.firstName} {displayedEmployee?.lastName}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">{displayedEmployee?.employeeNumber}</p>
                  </div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {balancesLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Loading balances...</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {ADJUSTABLE_LEAVE_TYPES.map((lt) => {
                      const bal = balances.find((b) => b.leaveType === lt);
                      const available = bal ? bal.totalDays - bal.usedDays - bal.pendingDays : 0;
                      return (
                        <div key={lt} className="px-4 py-3 flex items-center gap-4">
                          <div className="w-48 flex-shrink-0">
                            <div className="text-sm font-medium text-gray-700">{LEAVE_TYPE_LABELS[lt]}</div>
                            {bal && <AvailableDays balance={bal} />}
                            {!bal && <div className="text-xs text-gray-400">No balance record</div>}
                          </div>
                          <div className="flex-1 text-right">
                            <span className={`text-lg font-bold ${available < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                              {available.toFixed(2)}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">days avail.</span>
                          </div>
                          <button
                            onClick={() => openAdjustModal(lt)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg font-medium transition-colors flex-shrink-0"
                          >
                            Adjust
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Adjustment history */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="font-semibold text-gray-700 text-sm">Adjustment History</h2>
                </div>
                {adjLoading ? (
                  <div className="p-6 text-center text-sm text-gray-400">Loading...</div>
                ) : adjustments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">No adjustment records yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Leave Type</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 text-left">Reason</th>
                          <th className="px-4 py-2 text-left">Adjusted By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {adjustments.map((adj) => (
                          <tr key={adj.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                              {new Date(adj.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-2 font-medium text-gray-700">
                              {LEAVE_TYPE_LABELS[adj.leaveType] ?? adj.leaveType}
                            </td>
                            <td className={`px-4 py-2 text-right font-semibold ${adj.adjustmentAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {adj.adjustmentAmount >= 0 ? '+' : ''}{adj.adjustmentAmount.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={adj.reason}>
                              {adj.reason}
                            </td>
                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                              {adj.isSystemGenerated ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                  System
                                </span>
                              ) : adj.adjustedByUser?.employee ? (
                                `${adj.adjustedByUser.employee.firstName} ${adj.adjustedByUser.employee.lastName}`
                              ) : (
                                adj.adjustedByUser?.email ?? '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Adjust Modal ── */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Adjust Leave Balance</h3>
              <p className="text-sm text-gray-500 mt-1">
                {displayedEmployee?.firstName} {displayedEmployee?.lastName} — {LEAVE_TYPE_LABELS[adjustForm.leaveType]}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Leave Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                <select
                  value={adjustForm.leaveType}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, leaveType: e.target.value as LeaveType }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ADJUSTABLE_LEAVE_TYPES.map((lt) => (
                    <option key={lt} value={lt}>{LEAVE_TYPE_LABELS[lt]}</option>
                  ))}
                </select>
              </div>

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <div className="flex gap-3">
                  {(['ADD', 'DEDUCT'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAdjustForm((f) => ({ ...f, action: a }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        adjustForm.action === a
                          ? a === 'ADD'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {a === 'ADD' ? '+ Add Days' : '− Deduct Days'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (days)</label>
                <input
                  type="number"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                  min="0.5"
                  step="0.5"
                  placeholder="e.g. 1.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  placeholder="Explain the reason for this adjustment..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {adjustError && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{adjustError}</div>
              )}
            </div>
            <div className="p-6 pt-0 flex gap-3 justify-end">
              <button
                onClick={() => { setShowAdjustModal(false); setAdjustForm(EMPTY_FORM); setAdjustError(''); }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustSubmit}
                disabled={adjustMutation.isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  adjustForm.action === 'ADD'
                    ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                }`}
              >
                {adjustMutation.isPending ? 'Saving...' : `Confirm ${adjustForm.action === 'ADD' ? 'Addition' : 'Deduction'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
