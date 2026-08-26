import type { LeaveType } from '../types';

/** Module 06 leave filing notice periods (shown on employee leave filing form). */
export const LEAVE_TYPE_META: Record<
  LeaveType,
  { label: string; notice: string }
> = {
  MATERNITY: { label: 'Maternity Leave', notice: '30 days advance notice' },
  VACATION: { label: 'Vacation Leave', notice: '14 days advance notice' },
  PATERNITY: { label: 'Paternity Leave', notice: '7 days advance notice' },
  SML: { label: 'Sarili Muna Leave', notice: '7 days advance notice' },
  SOLO_PARENT: { label: 'Solo Parent Leave', notice: '5 days advance notice' },
  MAGNA_CARTA_WOMEN: {
    label: 'Special Leave for Women (RA 9170)',
    notice: '5 days advance notice',
  },
  PML: { label: 'Pamilya Muna Leave', notice: '3 days advance notice' },
  SICK: { label: 'Sick Leave', notice: 'Notify (no advance notice required)' },
  EMERGENCY: {
    label: 'Emergency Leave',
    notice: 'Notify (no advance notice required)',
  },
  BEREAVEMENT: {
    label: 'Bereavement Leave',
    notice: 'Notify (no advance notice required)',
  },
  CALAMITY: {
    label: 'Calamity Leave (CL)',
    notice: 'Notify (no advance notice required)',
  },
  VAWC: { label: 'VAWC Leave', notice: 'Notify (no advance notice required)' },
  LWOP: {
    label: 'Leave Without Pay',
    notice: 'Notify (no advance notice required)',
  },
};

export function leaveTypeLabel(type: string): string {
  return LEAVE_TYPE_META[type as LeaveType]?.label ?? type;
}

export function leaveTypeNotice(type: string): string {
  return LEAVE_TYPE_META[type as LeaveType]?.notice ?? '';
}

/** CDO/CTO share the 7-day advance notice row with Paternity / Sarili Muna. */
export const CONVERSION_NOTICE = '7 days advance notice';
