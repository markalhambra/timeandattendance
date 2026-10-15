/** Column aliases mapped from ALPAS payroll register tabs (Jan15, Apr30, …). */

export interface PayrollRowAmounts {
  fullName: string;
  employeeNumber?: string;
  tin?: string;
  hireDate?: string;
  gender?: string;
  dailyRate?: number;
  monthlyRate?: number;
  semiMonthlyRate?: number;
  lessAbsent?: number;
  adjustment?: number;
  taxableGross?: number;
  withholdingTax?: number;
  sssReg?: number;
  sssMpf?: number;
  phic?: number;
  hdmf?: number;
  salaryLoan?: number;
  laptopDeduction?: number;
  totalDeductions?: number;
  netPay?: number;
  sssLoan?: number;
  hdmfLoan?: number;
  mp2Savings?: number;
  otherDeductions: { label: string; amount: number }[];
  raw: Record<string, string | number | null>;
}

const SKIP_SHEET_PATTERNS = [
  /^tax\s*rate$/i,
  /vl\s*conversion/i,
  /13th\s*month/i,
  /year-?end\s*bonus/i,
  /alpas\s*bonus/i,
  /^copy of/i,
];

const HEADER_ALIASES: Record<string, keyof PayrollRowAmounts | 'skip'> = {
  'full name': 'fullName',
  name: 'fullName',
  employee: 'fullName',
  'employee name': 'fullName',
  'emp no': 'employeeNumber',
  'emp no.': 'employeeNumber',
  'employee no': 'employeeNumber',
  'employee no.': 'employeeNumber',
  'employee number': 'employeeNumber',
  'hire date': 'hireDate',
  gender: 'gender',
  'bir tin': 'tin',
  tin: 'tin',
  'daily rate': 'dailyRate',
  'monthly rate': 'monthlyRate',
  'semi-monthly rate': 'semiMonthlyRate',
  'semi monthly rate': 'semiMonthlyRate',
  'less absent': 'lessAbsent',
  adjustment: 'adjustment',
  'taxable gross': 'taxableGross',
  'withholding tax': 'withholdingTax',
  'sss-reg': 'sssReg',
  'sss reg': 'sssReg',
  sss: 'sssReg',
  'sss-mpf': 'sssMpf',
  'sss mpf': 'sssMpf',
  phic: 'phic',
  philhealth: 'phic',
  hdmf: 'hdmf',
  'pag-ibig': 'hdmf',
  pagibig: 'hdmf',
  'salary loan': 'salaryLoan',
  'laptop deductions (every month end only)': 'laptopDeduction',
  'laptop deductions': 'laptopDeduction',
  'total deductions': 'totalDeductions',
  'net pay': 'netPay',
  'sss loan': 'sssLoan',
  'hdmf loan': 'hdmfLoan',
  'mp2 savings': 'mp2Savings',
};

function normHeader(h: string): string {
  return h
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, '').replace(/₱/g, '').trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function isPayrollPeriodSheet(sheetName: string): boolean {
  return !SKIP_SHEET_PATTERNS.some((re) => re.test(sheetName.trim()));
}

export function normalizePersonName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop single-letter tokens (middle initials) for looser matching. */
export function nameKeyWithoutInitials(name: string): string {
  return normalizePersonName(name)
    .split(' ')
    .filter((p) => p.length > 1)
    .join(' ');
}

export function buildEmployeeNameVariants(e: {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}): string[] {
  const first = e.firstName || '';
  const last = e.lastName || '';
  const middle = e.middleName || '';
  const midInit = middle ? `${middle.charAt(0)}.` : '';
  const variants = [
    `${first} ${middle} ${last}`,
    `${first} ${midInit} ${last}`,
    `${first} ${last}`,
    `${last}, ${first}`,
    `${last}, ${first} ${middle}`,
    `${last} ${first}`,
  ];
  return [...new Set(variants.map(normalizePersonName).filter(Boolean))];
}

function findHeaderRow(rows: string[][]): { index: number; headers: string[] } | null {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] || [];
    const norms = row.map((c) => normHeader(String(c ?? '')));
    const hasName = norms.some((h) => h === 'full name' || h === 'name' || h === 'employee name');
    const hasNet = norms.some((h) => h === 'net pay' || h.includes('net pay'));
    const hasGross = norms.some((h) => h.includes('taxable gross') || h.includes('semi-monthly'));
    if (hasName && (hasNet || hasGross)) {
      return { index: i, headers: row.map((c) => String(c ?? '')) };
    }
  }
  return null;
}

export function parsePayrollSheetRows(rows: string[][]): PayrollRowAmounts[] {
  const headerInfo = findHeaderRow(rows);
  if (!headerInfo) {
    throw new Error(
      'Could not find payroll header row (expected columns like "Full Name" and "Net Pay").',
    );
  }

  const colMap: { idx: number; field: keyof PayrollRowAmounts | 'other'; label: string }[] = [];
  headerInfo.headers.forEach((h, idx) => {
    const n = normHeader(h);
    if (!n) return;
    const known = HEADER_ALIASES[n];
    if (known && known !== 'skip') {
      colMap.push({ idx, field: known, label: h });
    } else if (n && !['regularization date/end date', 'hire date'].includes(n)) {
      // Keep unknown numeric columns as other deductions/earnings if they have values
      colMap.push({ idx, field: 'other', label: h.replace(/\r?\n/g, ' ').trim() });
    }
  });

  const results: PayrollRowAmounts[] = [];
  for (let r = headerInfo.index + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const nameIdx = colMap.find((c) => c.field === 'fullName')?.idx ?? 0;
    const fullName = String(row[nameIdx] ?? '').trim();
    if (!fullName) continue;
    // Skip section banners / totals
    if (/^(full time|part time|contractual|intern|total|grand total|subtotal)/i.test(fullName)) continue;
    if (!/[a-zA-Z]/.test(fullName)) continue;

    const item: PayrollRowAmounts = {
      fullName,
      otherDeductions: [],
      raw: {},
    };

    for (const col of colMap) {
      const rawVal = row[col.idx];
      const display = rawVal == null || rawVal === '' ? null : rawVal;
      item.raw[col.label] = display as any;

      if (col.field === 'other') {
        const num = toNum(rawVal);
        if (num != null && num !== 0 && !/rate|date|gender|tin|name/i.test(col.label)) {
          // Only treat extra columns that look like money as other lines
          if (/loan|deduct|bonus|adj|outing|mp2|savings|14th|13th|tax/i.test(col.label) || Math.abs(num) >= 1) {
            // Avoid double-counting known mapped fields already handled
            if (!HEADER_ALIASES[normHeader(col.label)]) {
              item.otherDeductions.push({ label: col.label, amount: num });
            }
          }
        }
        continue;
      }

      if (col.field === 'fullName' || col.field === 'employeeNumber' || col.field === 'tin' || col.field === 'hireDate' || col.field === 'gender') {
        (item as any)[col.field] = rawVal == null || rawVal === '' ? undefined : String(rawVal).trim();
      } else {
        (item as any)[col.field] = toNum(rawVal);
      }
    }

    // Must have some pay signal
    if (item.netPay == null && item.taxableGross == null && item.semiMonthlyRate == null) continue;
    results.push(item);
  }

  return results;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Parse tab names like Jan15, Jan30, Feb28, Mar31, Apr 15, July 31, 2026-04-15 */
export function parsePeriodFromSheetName(
  sheetName: string,
  year: number,
): { start: Date; end: Date; label: string } | null {
  const raw = sheetName.trim();

  // ISO-ish: 2026-04-15 or 2026/04/15
  const iso = raw.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    const end = new Date(Date.UTC(y, m - 1, d));
    const start = d <= 15
      ? new Date(Date.UTC(y, m - 1, 1))
      : new Date(Date.UTC(y, m - 1, 16));
    return { start, end, label: formatPeriodLabel(start, end) };
  }

  // MonDD or Month DD / MonthDD
  const m1 = raw.match(/^([A-Za-z]+)\s*[-.]?\s*(\d{1,2})$/);
  if (m1) {
    const mon = MONTHS[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    if (mon && day >= 1 && day <= 31) {
      const end = new Date(Date.UTC(year, mon - 1, day));
      const start = day <= 15
        ? new Date(Date.UTC(year, mon - 1, 1))
        : new Date(Date.UTC(year, mon - 1, 16));
      return { start, end, label: formatPeriodLabel(start, end) };
    }
  }

  return null;
}

function formatPeriodLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  const a = start.toLocaleDateString('en-US', opts);
  const b = end.toLocaleDateString('en-US', opts);
  return `${a} – ${b}`;
}

export function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}
