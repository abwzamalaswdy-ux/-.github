export type SheetKey = 'order' | 'dispatch' | 'single';

export type SignPosition = 'right' | 'center' | 'left';

export type NumeralStyle = 'ar' | 'en';

export type ReportScope = 'all' | SheetKey;

export type ReportSort = 'date_asc' | 'date_desc' | 'qty_desc' | 'count_desc';

export type BackupFrequency = 'off' | 'daily' | 'weekly' | 'monthly';

export interface Entry {
  id: string;
  name: string;
  day: number;
  desc: string;
  qty: number;
  date: string;
  sheet: SheetKey;
}

export interface SignerInfo {
  name: string;
  job: string;
  position: SignPosition;
  image: string;
}

export interface AppState {
  entries: Entry[];
  signer: SignerInfo;
  period: string;
  unit?: string;
  numeralStyle?: NumeralStyle;
  autoLockMinutes?: number;
  readOnly?: boolean;
  highContrast?: boolean;
  backupFrequency?: BackupFrequency;
  lastBackupAt?: string;
}

export interface BeneficiaryRow {
  name: string;
  days: number[];
}

export interface LedgerPrintPage {
  sheet: SheetKey;
  rows: BeneficiaryRow[];
  pageNo: number;
  totalPages: number;
}

export interface DailySummaryRow {
  key: string;
  day: number;
  fullDate: string;
  totalQty: number;
  entryCount: number;
  beneficiaryCount: number;
  bySheet: Record<SheetKey, number>;
  entries: Entry[];
}
