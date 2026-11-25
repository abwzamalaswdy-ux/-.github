import {
  AppState,
  BackupFrequency,
  BeneficiaryRow,
  DailySummaryRow,
  Entry,
  NumeralStyle,
  ReportScope,
  ReportSort,
  SheetKey,
  SignPosition,
} from '../types/ledger';

export const SHEETS: Record<SheetKey, string> = {
  order: 'المنصرف بأمر',
  dispatch: 'منصرف التفويج',
  single: 'كشف منصرف التفريدة',
};

export const ORDER_KW = ['امر', 'بلاغ', 'طلوع', 'سياج'];
export const DISPATCH_KW = ['دخول', 'دخلة', 'نجران', 'سقم'];
export const STORE_KEY = 'mansarf_app_v2';
export const HIGH_CONTRAST_KEY = 'mansarf_high_contrast_v1';
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const DEFAULT_STATE: AppState = {
  entries: [],
  signer: { name: '', job: '', position: 'right', image: '' },
  period: 'all',
  unit: 'لتر',
  numeralStyle: 'ar',
  autoLockMinutes: 15,
  readOnly: false,
  highContrast: false,
  backupFrequency: 'weekly',
  lastBackupAt: '',
  dailyReminderTime: '',
};

export function loadHighContrastPref(): boolean {
  try {
    if (localStorage.getItem(HIGH_CONTRAST_KEY) === '1') return true;
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') as {
      highContrast?: unknown;
    } | null;
    return Boolean(raw?.highContrast);
  } catch {
    return false;
  }
}

export function applyHighContrastMode(enabled: boolean): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('high-contrast', enabled);
    if (enabled) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
  }
  try {
    localStorage.setItem(HIGH_CONTRAST_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage write errors
  }
}

/** Eliminates IEEE-754 floating-point drift across decimal quantity summations. */
export function roundQty(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function isValidSheetKey(value: unknown): value is SheetKey {
  return value === 'order' || value === 'dispatch' || value === 'single';
}

export function isValidSignPosition(value: unknown): value is SignPosition {
  return value === 'right' || value === 'center' || value === 'left';
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2150 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day <= maxDay;
}

export function clampDateToPeriod(period: string, preferredIsoDate: string): string {
  const safeFallback = /^\d{4}-\d{2}-\d{2}$/.test(preferredIsoDate)
    ? preferredIsoDate
    : new Date().toISOString().slice(0, 10);
  if (period === 'all' || !/^\d{4}-\d{2}$/.test(period)) {
    return safeFallback;
  }
  const [yStr, mStr] = period.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const maxDay = new Date(year, month, 0).getDate() || 28;
  const preferredDay = Number(safeFallback.slice(8, 10)) || 1;
  const clampedDay = Math.min(Math.max(1, preferredDay), maxDay);
  return `${yStr}-${mStr}-${String(clampedDay).padStart(2, '0')}`;
}

export function sanitizeImageDataUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2 * 1024 * 1024) return '';
  // Allow only raster PNG/JPEG/WEBP data URLs (blocks SVG/XSS and external tracking/javascript URLs)
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function sanitizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 160) : '';
  const day = Math.trunc(Number(r.day));
  if (!name || !Number.isInteger(day) || day < 1 || day > 31) return null;

  const desc = typeof r.desc === 'string' ? r.desc.trim().slice(0, 400) : '';
  const rawQty = Number(r.qty);
  const qty = Number.isFinite(rawQty) && rawQty >= 0 ? roundQty(rawQty) : 0;

  let date = '';
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date.trim())) {
    const [y, m, d] = r.date.trim().split('-').map(Number);
    if (isValidCalendarDate(y, m, d)) {
      date = r.date.trim();
    }
  }

  const sheet: SheetKey = isValidSheetKey(r.sheet) ? r.sheet : classify(desc);
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 80) : uid();

  return {
    id,
    name,
    day: date ? Number(date.slice(8, 10)) : day,
    desc,
    qty,
    date,
    sheet,
  };
}

export function sanitizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_STATE)) as AppState;
  }
  const obj = raw as Record<string, unknown>;
  const entries = Array.isArray(obj.entries)
    ? obj.entries.map(sanitizeEntry).filter((e): e is Entry => Boolean(e))
    : [];

  const rawSigner =
    obj.signer && typeof obj.signer === 'object'
      ? (obj.signer as Record<string, unknown>)
      : {};

  const period =
    typeof obj.period === 'string' && (obj.period === 'all' || /^\d{4}-\d{2}$/.test(obj.period))
      ? obj.period
      : 'all';

  const unit =
    typeof obj.unit === 'string' && obj.unit.trim().length <= 24
      ? obj.unit.trim()
      : DEFAULT_STATE.unit;

  const numeralStyle: NumeralStyle = obj.numeralStyle === 'en' ? 'en' : 'ar';

  const autoLockMinutes =
    typeof obj.autoLockMinutes === 'number' &&
    [0, 5, 15, 30].includes(obj.autoLockMinutes)
      ? obj.autoLockMinutes
      : DEFAULT_STATE.autoLockMinutes;

  const backupFrequency: BackupFrequency =
    obj.backupFrequency === 'off' ||
    obj.backupFrequency === 'daily' ||
    obj.backupFrequency === 'weekly' ||
    obj.backupFrequency === 'monthly'
      ? obj.backupFrequency
      : 'weekly';

  let lastBackupAt = '';
  if (typeof obj.lastBackupAt === 'string' && obj.lastBackupAt.trim()) {
    const parsedTime = Date.parse(obj.lastBackupAt.trim());
    if (Number.isFinite(parsedTime) && parsedTime > 0) {
      lastBackupAt = new Date(parsedTime).toISOString();
    }
  }

  const dailyReminderTime =
    typeof obj.dailyReminderTime === 'string' && /^\d{2}:\d{2}$/.test(obj.dailyReminderTime.trim())
      ? obj.dailyReminderTime.trim()
      : '';

  return {
    entries,
    signer: {
      name: typeof rawSigner.name === 'string' ? rawSigner.name.slice(0, 120) : '',
      job: typeof rawSigner.job === 'string' ? rawSigner.job.slice(0, 120) : '',
      position: isValidSignPosition(rawSigner.position) ? rawSigner.position : 'right',
      image: sanitizeImageDataUrl(rawSigner.image),
    },
    period,
    unit,
    numeralStyle,
    autoLockMinutes,
    readOnly: Boolean(obj.readOnly),
    highContrast: Boolean(obj.highContrast),
    backupFrequency,
    lastBackupAt,
    dailyReminderTime,
  };
}

export function loadStoredState(): AppState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const sanitized = sanitizeState(raw);
      if ((raw as Record<string, unknown>).highContrast === undefined) {
        sanitized.highContrast = loadHighContrastPref();
      }
      return sanitized;
    }
  } catch {
    // Ignore storage read errors
  }
  const fallback = JSON.parse(JSON.stringify(DEFAULT_STATE)) as AppState;
  fallback.highContrast = loadHighContrastPref();
  return fallback;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

export function digits(s: unknown): string {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function toArabicDigits(value: string | number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(value).replace(/\d/g, (d) => map[Number(d)]);
}

export function formatNum(value: number, style: NumeralStyle = 'ar'): string {
  const n = roundQty(Number(value) || 0);
  const formatted = n.toLocaleString('en-US', {
    maximumFractionDigits: 4,
  });
  return style === 'ar' ? toArabicDigits(formatted) : formatted;
}

export function formatQtyWithUnit(
  qty: number,
  style: NumeralStyle = 'ar',
  unit = 'لتر'
): string {
  const numText = formatNum(qty, style);
  const cleanUnit = unit.trim();
  return cleanUnit ? `${numText} ${cleanUnit}` : numText;
}

export function formatDayNumber(day: number, style: NumeralStyle = 'ar'): string {
  return style === 'ar' ? toArabicDigits(day) : String(day);
}

export function formatFullDateLabel(
  row: DailySummaryRow,
  period: string,
  style: NumeralStyle = 'ar'
): { primary: string; secondary: string } {
  if (period !== 'all') {
    const primary = formatDayNumber(row.day, style);
    const secondary = row.fullDate
      ? style === 'ar'
        ? toArabicDigits(row.fullDate.split('-').reverse().join('/'))
        : row.fullDate.split('-').reverse().join('/')
      : '';
    return { primary, secondary };
  }

  if (row.fullDate) {
    const parts = row.fullDate.split('-');
    const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    return {
      primary: style === 'ar' ? toArabicDigits(formatted) : formatted,
      secondary: `اليوم ${formatDayNumber(row.day, style)}`,
    };
  }

  return {
    primary: `يوم ${formatDayNumber(row.day, style)}`,
    secondary: 'بدون شهر محدد',
  };
}

export function num(v: unknown): number {
  const cleaned = digits(String(v ?? '').replace(/[,،\s]/g, '').replace(/[٫]/g, '.'));
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) && n >= 0 ? roundQty(n) : 0;
}

export function norm(s: string): string {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

export function classify(desc: string): SheetKey {
  const x = norm(desc);
  if (ORDER_KW.some((w) => x.includes(norm(w)))) return 'order';
  if (DISPATCH_KW.some((w) => x.includes(norm(w)))) return 'dispatch';
  return 'single';
}

export function parseDate(value: string): { day: number | null; date: string } {
  const x = digits(value);
  const isoMatch = x.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const year = +isoMatch[1];
    const month = +isoMatch[2];
    const day = +isoMatch[3];
    if (isValidCalendarDate(year, month, day)) {
      return {
        day,
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
    return { day: null, date: '' };
  }

  const m = x.match(/(?:^|\D)(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?/);
  if (!m) return { day: null, date: '' };

  const day = +m[1];
  const month = +m[2];
  let year = m[3] ? +m[3] : null;
  if (year !== null && year < 100) year += 2000;
  if (day < 1 || day > 31) return { day: null, date: '' };

  let iso = '';
  if (year !== null) {
    if (!isValidCalendarDate(year, month, day)) {
      return { day: null, date: '' };
    }
    iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (month < 1 || month > 12) {
    return { day: null, date: '' };
  }

  return { day, date: iso };
}

export function makeEntry(
  name: string,
  day: number,
  desc: string,
  qty: number,
  date = '',
  sheet?: SheetKey
): Entry | null {
  const clean = String(name || '').trim().slice(0, 160);
  const d = Math.trunc(Number(day));
  if (!clean || !Number.isInteger(d) || d < 1 || d > 31) return null;

  let validDate = '';
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    const [y, m, dd] = date.trim().split('-').map(Number);
    if (isValidCalendarDate(y, m, dd)) {
      validDate = date.trim();
    }
  }

  const numericQty = Number(qty);
  const safeQty = Number.isFinite(numericQty) && numericQty >= 0 ? roundQty(numericQty) : 0;

  return {
    id: uid(),
    name: clean,
    day: validDate ? Number(validDate.slice(8, 10)) : d,
    desc: String(desc || '').trim().slice(0, 400),
    qty: safeQty,
    date: validDate,
    sheet: sheet && isValidSheetKey(sheet) ? sheet : classify(desc),
  };
}

export function getAvailablePeriods(entries: Entry[]): string[] {
  return [...new Set(entries.map((e) => e.date?.slice(0, 7)).filter(Boolean))].sort().reverse();
}

export function formatPeriodLabel(period: string): string {
  if (period === 'all') return 'كل الفترات';
  const [y, m] = period.split('-');
  return `${m}/${y}`;
}

export function filterByPeriod(entries: Entry[], period: string): Entry[] {
  if (period === 'all') return entries;
  return entries.filter((e) => e.date && e.date.slice(0, 7) === period);
}

export function buildBeneficiaryRows(entries: Entry[], search = ''): BeneficiaryRow[] {
  const map = new Map<string, number[]>();
  const trimmed = search.trim();
  const q = norm(trimmed);
  const qDigits = digits(trimmed).trim();
  const matchedByEntry = new Set<string>();

  for (const e of entries) {
    if (!map.has(e.name)) {
      map.set(e.name, Array(32).fill(0));
    }
    const rowDays = map.get(e.name)!;
    rowDays[e.day] = roundQty(rowDays[e.day] + (Number(e.qty) || 0));

    if (q) {
      const isPlaceholder = Number(e.qty) === 0 && !e.desc.trim();
      if (!isPlaceholder) {
        const descHit = norm(e.desc).includes(q);
        const dateAr = formatEntryDateDisplay(e, 'ar');
        const dateEn = formatEntryDateDisplay(e, 'en');
        const dateHit =
          Boolean(
            e.date &&
              (e.date.includes(qDigits) || dateEn.includes(qDigits) || dateAr.includes(trimmed))
          ) ||
          (qDigits.length > 0 && /^\d+$/.test(qDigits) && e.day === Number(qDigits));
        if (descHit || dateHit) {
          matchedByEntry.add(e.name);
        }
      }
    }
  }
  let arr: BeneficiaryRow[] = [...map.entries()].map(([name, days]) => ({ name, days }));
  if (q) {
    arr = arr.filter((r) => norm(r.name).includes(q) || matchedByEntry.has(r.name));
  }
  return arr;
}

export function buildDailySummaryRows(
  entries: Entry[],
  period: string,
  scope: ReportScope = 'all',
  sort: ReportSort = 'date_asc',
  includeEmptyDays = false
): DailySummaryRow[] {
  const periodFiltered = filterByPeriod(entries, period).filter(
    (e) => scope === 'all' || e.sheet === scope
  );

  // Exclude 0-qty placeholder rows created solely to list an empty beneficiary
  const realEntries = periodFiltered.filter((e) => Number(e.qty) > 0 || e.desc.trim().length > 0);

  const grouped = new Map<
    string,
    {
      day: number;
      fullDate: string;
      totalQty: number;
      entryCount: number;
      beneficiaries: Set<string>;
      bySheet: Record<SheetKey, number>;
      entries: Entry[];
    }
  >();

  for (const e of realEntries) {
    const qty = roundQty(Number(e.qty) || 0);
    const key =
      period !== 'all'
        ? `${period}-${String(e.day).padStart(2, '0')}`
        : e.date
        ? e.date
        : `day-${String(e.day).padStart(2, '0')}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        day: e.day,
        fullDate: e.date || (period !== 'all' ? `${period}-${String(e.day).padStart(2, '0')}` : ''),
        totalQty: 0,
        entryCount: 0,
        beneficiaries: new Set<string>(),
        bySheet: { order: 0, dispatch: 0, single: 0 },
        entries: [],
      });
    }

    const bucket = grouped.get(key)!;
    bucket.totalQty = roundQty(bucket.totalQty + qty);
    bucket.entryCount += 1;
    bucket.beneficiaries.add(e.name);
    bucket.bySheet[e.sheet] = roundQty(bucket.bySheet[e.sheet] + qty);
    bucket.entries.push(e);
  }

  if (includeEmptyDays && period !== 'all') {
    const [yearStr, monthStr] = period.split('-');
    const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate() || 31;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${period}-${String(d).padStart(2, '0')}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          day: d,
          fullDate: key,
          totalQty: 0,
          entryCount: 0,
          beneficiaries: new Set<string>(),
          bySheet: { order: 0, dispatch: 0, single: 0 },
          entries: [],
        });
      }
    }
  }

  const rows: DailySummaryRow[] = [...grouped.entries()].map(([key, bucket]) => ({
    key,
    day: bucket.day,
    fullDate: bucket.fullDate,
    totalQty: bucket.totalQty,
    entryCount: bucket.entryCount,
    beneficiaryCount: bucket.beneficiaries.size,
    bySheet: bucket.bySheet,
    entries: bucket.entries,
  }));

  rows.sort((a, b) => {
    if (sort === 'qty_desc') {
      return b.totalQty - a.totalQty || a.day - b.day;
    }
    if (sort === 'count_desc') {
      return b.entryCount - a.entryCount || b.totalQty - a.totalQty;
    }
    if (sort === 'date_desc') {
      return b.key.localeCompare(a.key);
    }
    return a.key.localeCompare(b.key);
  });

  return rows;
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function importCSVText(text: string): { added: Entry[]; skipped: number } {
  const rows = parseCSV(text).filter((r) => r.some((x) => String(x).trim()));
  if (!rows.length) return { added: [], skipped: 0 };

  let start = 0;
  const header = rows[0].map((x) => norm(x));
  if (header.some((h) => h.includes('مستفيد') || h.includes('كميه') || h === 'اليوم')) {
    start = 1;
  }

  const ix = (terms: string[], def: number) => {
    const n = header.findIndex((h) => terms.some((t) => h.includes(norm(t))));
    return n >= 0 ? n : def;
  };

  const nameIx = ix(['مستفيد', 'اسم'], 0);
  const dateIx = ix(['تاريخ'], 1);
  const dayIx = ix(['اليوم', 'يوم'], 2);
  const descIx = ix(['وصف', 'بيان', 'قيد'], 3);
  const qtyIx = ix(['كميه', 'كمية', 'منصرف'], 4);
  const sheetIx = ix(['كشف', 'تصنيف'], 5);

  const added: Entry[] = [];
  let skipped = 0;

  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[nameIx] || '').trim();
    const dateValue = (r[dateIx] || '').trim();
    let { day, date } = parseDate(dateValue);
    if (!day) {
      day = Math.trunc(Number(digits(r[dayIx] || '')));
      date = '';
    }
    const desc = (r[descIx] || '').trim();
    const qty = num(r[qtyIx] || '');

    let sheet: SheetKey | '' = '';
    const sn = norm(r[sheetIx] || '');
    if (sn.includes(norm(SHEETS.order)) || sn === 'order') sheet = 'order';
    else if (sn.includes(norm(SHEETS.dispatch)) || sn === 'dispatch') sheet = 'dispatch';
    else if (sn.includes(norm(SHEETS.single)) || sn === 'single') sheet = 'single';

    const e = makeEntry(name, day || 0, desc, qty, date, sheet || classify(desc));
    if (e) added.push(e);
    else skipped++;
  }

  return { added, skipped };
}

export function parseRawText(text: string): { added: Entry[]; skipped: number } {
  const normText = String(text || '').replace(/\r/g, '').trim();
  if (!normText) return { added: [], skipped: 0 };
  if (/(^|\n)\s*المستفيد\s*,/i.test(normText)) {
    return importCSVText(normText);
  }

  const added: Entry[] = [];
  const lines = normText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const used = new Set<number>();

  // Single-line format: Name -- Description .كمية. 40 with date on same line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qmatch = line.match(/\.\s*كمية\s*\.\s*([\d٠-٩۰-۹,.٫]+)/i);
    if (!qmatch) continue;
    const split = line.indexOf('--');
    if (split < 0) continue;

    const name = line.slice(0, split).trim();
    const desc = line
      .slice(split + 2, qmatch.index)
      .replace(/(?:تاريخ\s*الصرف\s*[:：]?)/gi, '')
      .trim();
    const { day, date } = parseDate(line);
    const q = num(qmatch[1]);
    const e = makeEntry(name, day || 0, desc, q, date);
    if (e) {
      added.push(e);
      used.add(i);
    }
  }

  // Multi-line format: Name -- desc, then تاريخ الصرف, then .كمية.
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i) || !norm(lines[i]).includes(norm('تاريخ الصرف'))) continue;

    let name = '';
    let priorDesc = '';
    let nameLineIdx = -1;
    for (let p = i - 1; p >= 0; p--) {
      if (lines[p] && !used.has(p)) {
        const sep = lines[p].indexOf('--');
        name = (sep >= 0 ? lines[p].slice(0, sep) : lines[p]).trim();
        if (sep >= 0) priorDesc = lines[p].slice(sep + 2).trim();
        nameLineIdx = p;
        break;
      }
    }

    const { day, date } = parseDate(lines[i]);
    let desc = priorDesc;
    let qty: number | null = null;
    let qline = -1;

    const dateMatch = digits(lines[i]).match(/\d{1,4}\s*[\/\-.]\s*\d{1,2}(?:\s*[\/\-.]\s*\d{1,4})?/);
    if (dateMatch && dateMatch.index !== undefined) {
      const tail = lines[i]
        .slice(dateMatch.index + dateMatch[0].length)
        .replace(/^\s*[-–—:：]?\s*/, '')
        .trim();
      if (tail) desc = tail;
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
      const q = lines[j].match(/\.\s*كمية\s*\.\s*([\d٠-٩۰-۹,.٫]+)/i);
      if (q) {
        qty = num(q[1]);
        qline = j;
        const before = lines[j].slice(0, q.index).trim();
        if (before) desc = before;
        break;
      }
      if (!desc) {
        const dash = lines[j].indexOf('--');
        desc = (dash >= 0 ? lines[j].slice(dash + 2) : lines[j])
          .replace(/(?:تاريخ\s*الصرف\s*[:：]?)/gi, '')
          .trim();
      }
    }

    if (qty === null && i + 1 < lines.length) {
      const q = lines[i + 1].match(/(?:كمية\s*[:：]?\s*)?([\d٠-٩۰-۹,.٫]+)\s*$/);
      if (q) {
        qty = num(q[1]);
        qline = i + 1;
      }
    }

    if (name && day && qty !== null) {
      const e = makeEntry(name, day, desc, qty, date);
      if (e) {
        added.push(e);
        used.add(i);
        if (nameLineIdx >= 0) used.add(nameLineIdx);
        if (qline >= 0) used.add(qline);
      }
    }
  }

  const skipped = Math.max(0, lines.length - used.size);
  return { added, skipped };
}

/** Escapes CSV values and prevents spreadsheet formula injection (=, +, -, @, tab, CR). */
export function csvEscape(v: unknown): string {
  let str = String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function sanitizeFilename(filename: string): string {
  return (
    String(filename || 'report')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim() || 'report'
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = sanitizeFilename(filename);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function createSampleEntries(): Entry[] {
  const sampleSpecs: Array<[string, string, number, string, SheetKey]> = [
    ['أنس محمد علي', '2026-11-29', 40, 'أمر من قائد اللواء', 'order'],
    ['سالم عبد الله الحربي', '2026-11-29', 30, 'بلاغ عملياتي', 'order'],
    ['خالد ناصر القحطاني', '2026-11-29', 25, 'دخول تفويج صباحي', 'dispatch'],
    ['فهد سعيد الدوسري', '2026-11-29', 35, 'طلوع سياج', 'order'],
    ['ماجد عايض الشهري', '2026-11-29', 20, 'تفريدة ميدانية', 'single'],
    ['عمر حسين العمري', '2026-11-29', 45, 'دخلة نجران', 'dispatch'],
    ['طارق يحيى الزهراني', '2026-11-29', 30, 'أمر صرف عاجل', 'order'],
    ['بدر صالح الغامدي', '2026-11-29', 25, 'تفريدة مسائية', 'single'],
    ['نايف إبراهيم السبيعي', '2026-11-29', 40, 'بلاغ دورية', 'order'],
    ['وليد راشد العتيبي', '2026-11-29', 20, 'تفريدة محطة', 'single'],
    ['أنس محمد علي', '2026-11-29', 35, 'طلوع إضافي', 'order'],
    ['سلطان حمد المالكي', '2026-11-29', 30, 'سقم تفويج', 'dispatch'],
    ['عبدالرحمن فيصل الشمري', '2026-11-29', 25, 'أمر مناوب', 'order'],
    ['راكان علي المطيري', '2026-11-29', 30, 'دخول قافلة', 'dispatch'],
    ['ياسر سعد العنزي', '2026-11-29', 20, 'تفريدة صيانة', 'single'],
    ['أنس محمد علي', '2026-11-28', 60, 'أمر من قائد اللواء', 'order'],
    ['سالم عبد الله الحربي', '2026-11-28', 45, 'دخول تفويج', 'dispatch'],
    ['خالد ناصر القحطاني', '2026-11-28', 35, 'تفريدة ميدانية', 'single'],
    ['فهد سعيد الدوسري', '2026-11-27', 50, 'طلوع سياج', 'order'],
    ['ماجد عايض الشهري', '2026-11-27', 40, 'دخلة نجران', 'dispatch'],
    ['عمر حسين العمري', '2026-11-25', 80, 'أمر تموين', 'order'],
    ['طارق يحيى الزهراني', '2026-11-25', 30, 'تفريدة', 'single'],
  ];

  return sampleSpecs
    .map(([name, date, qty, desc, sheet]) => {
      const day = Number(date.slice(8, 10));
      return makeEntry(name, day, desc, qty, date, sheet);
    })
    .filter((e): e is Entry => Boolean(e));
}

export const SHEET_STYLES: Record<
  SheetKey,
  {
    label: string;
    badgeClass: string;
    cardClass: string;
    hexBg: string;
    hexText: string;
    hexBorder: string;
  }
> = {
  order: {
    label: SHEETS.order,
    badgeClass: 'bg-[#e8f0eb] text-[#173f2e] border border-[#b7cbbe]',
    cardClass: 'bg-[#f4f8f5] border-[#c4d6ca] text-[#173f2e]',
    hexBg: '#e8f0eb',
    hexText: '#173f2e',
    hexBorder: '#b7cbbe',
  },
  dispatch: {
    label: SHEETS.dispatch,
    badgeClass: 'bg-[#eaf1fd] text-[#174c9c] border border-[#c4d8f8]',
    cardClass: 'bg-[#f3f7fe] border-[#c9dcf9] text-[#174c9c]',
    hexBg: '#eaf1fd',
    hexText: '#174c9c',
    hexBorder: '#c4d8f8',
  },
  single: {
    label: SHEETS.single,
    badgeClass: 'bg-[#fbf1df] text-[#845315] border border-[#ebd4aa]',
    cardClass: 'bg-[#fdf8ee] border-[#eedcb9] text-[#845315]',
    hexBg: '#fbf1df',
    hexText: '#845315',
    hexBorder: '#ebd4aa',
  },
};

export function formatEntryDateDisplay(
  entry: Pick<Entry, 'date' | 'day'>,
  style: NumeralStyle = 'ar'
): string {
  if (entry.date) {
    const parts = entry.date.split('-');
    if (parts.length === 3) {
      const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      return style === 'ar' ? toArabicDigits(formatted) : formatted;
    }
  }
  const dayStr = style === 'ar' ? toArabicDigits(entry.day) : String(entry.day);
  return `يوم ${dayStr}`;
}

export function getAllBeneficiaryNames(entries: Entry[], period: string): string[] {
  const scoped = filterByPeriod(entries, period);
  const set = new Set<string>();
  for (const e of scoped) {
    if (e.name.trim()) set.add(e.name.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
}

export interface BeneficiaryStatement {
  beneficiaryName: string;
  entries: Entry[];
  totalQty: number;
  totalCount: number;
  bySheet: Record<SheetKey, { qty: number; count: number }>;
}

export function buildBeneficiaryStatement(
  entries: Entry[],
  beneficiaryName: string,
  period: string,
  scope: ReportScope = 'all'
): BeneficiaryStatement {
  const target = norm(beneficiaryName.trim());
  const periodScoped = filterByPeriod(entries, period);

  const allForBeneficiary = periodScoped.filter(
    (e) =>
      norm(e.name.trim()) === target &&
      (Number(e.qty) > 0 || e.desc.trim().length > 0)
  );

  const bySheet: Record<SheetKey, { qty: number; count: number }> = {
    order: { qty: 0, count: 0 },
    dispatch: { qty: 0, count: 0 },
    single: { qty: 0, count: 0 },
  };

  for (const e of allForBeneficiary) {
    const qty = roundQty(Number(e.qty) || 0);
    bySheet[e.sheet].qty = roundQty(bySheet[e.sheet].qty + qty);
    bySheet[e.sheet].count += 1;
  }

  const filtered = allForBeneficiary
    .filter((e) => scope === 'all' || e.sheet === scope)
    .sort((a, b) => {
      const keyA = a.date || `9999-99-${String(a.day).padStart(2, '0')}`;
      const keyB = b.date || `9999-99-${String(b.day).padStart(2, '0')}`;
      return keyA.localeCompare(keyB) || a.day - b.day;
    });

  const totalQty = roundQty(filtered.reduce((s, e) => s + (Number(e.qty) || 0), 0));

  return {
    beneficiaryName: beneficiaryName.trim(),
    entries: filtered,
    totalQty,
    totalCount: filtered.length,
    bySheet,
  };
}
