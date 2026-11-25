import { AppState, BackupFrequency } from '../types/ledger';
import { sanitizeState } from './ledgerLogic';

export interface DbFileInfo {
  name: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface DbStatusInfo {
  engine: 'sqlite';
  relativePath: string;
  fullPath: string;
  storageRoot: string;
  sizeBytes: number;
  updatedAt: string;
  entryCount: number;
  availableFiles: DbFileInfo[];
  availableDirs: string[];
  backups: DbFileInfo[];
}

export interface LocalDeviceFileHandle {
  name: string;
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

export class UnauthorizedError extends Error {
  constructor(message = 'انتهت الجلسة، يرجى تسجيل الدخول مجددًا.') {
    super(message);
  }
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  if (res.status === 401) {
    return new UnauthorizedError();
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(data.error || fallback);
}

export async function fetchLocalDbInfo(token: string): Promise<DbStatusInfo> {
  const res = await fetch('/api/db/info', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await parseError(res, 'تعذر تحديث معلومات قاعدة البيانات المحلية.');
  const data = (await res.json()) as { dbInfo: DbStatusInfo };
  return data.dbInfo;
}

export async function fetchLocalDbState(
  token: string
): Promise<{ state: AppState; dbInfo: DbStatusInfo }> {
  const res = await fetch('/api/db/state', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await parseError(res, 'تعذر تحميل قاعدة البيانات المحلية.');
  const data = (await res.json()) as { state: unknown; dbInfo: DbStatusInfo };
  return { state: sanitizeState(data.state), dbInfo: data.dbInfo };
}

export async function saveLocalDbState(
  token: string,
  state: AppState
): Promise<{ state: AppState; dbInfo: DbStatusInfo }> {
  const res = await fetch('/api/db/state', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw await parseError(res, 'تعذر حفظ التغييرات في قاعدة البيانات المحلية.');
  const data = (await res.json()) as { state: unknown; dbInfo: DbStatusInfo };
  return { state: sanitizeState(data.state), dbInfo: data.dbInfo };
}

export async function changeLocalDbLocation(
  token: string,
  relativePath: string,
  mode: 'move_or_copy' | 'open_or_create'
): Promise<{ state: AppState; dbInfo: DbStatusInfo }> {
  const res = await fetch('/api/db/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ relativePath, mode }),
  });
  if (!res.ok) throw await parseError(res, 'تعذر تغيير موقع تخزين قاعدة البيانات.');
  const data = (await res.json()) as { state: unknown; dbInfo: DbStatusInfo };
  return { state: sanitizeState(data.state), dbInfo: data.dbInfo };
}

export async function downloadSqliteDbBlob(
  token: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch('/api/db/export-file', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await parseError(res, 'تعذر تنزيل ملف قاعدة البيانات.');
  const disp = res.headers.get('content-disposition') || '';
  const match = disp.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || 'mansarf-ledger.db';
  const blob = await res.blob();
  return { blob, filename };
}

export async function importSqliteDbFile(
  token: string,
  file: File,
  targetRelativePath?: string
): Promise<{ state: AppState; dbInfo: DbStatusInfo }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    Authorization: `Bearer ${token}`,
  };
  if (targetRelativePath && targetRelativePath.trim()) {
    headers['X-Target-Path'] = targetRelativePath.trim();
  }

  const res = await fetch('/api/db/import-sqlite', {
    method: 'POST',
    headers,
    body: await file.arrayBuffer(),
  });
  if (!res.ok) throw await parseError(res, 'تعذر استيراد ملف قاعدة البيانات.');
  const data = (await res.json()) as { state: unknown; dbInfo: DbStatusInfo };
  return { state: sanitizeState(data.state), dbInfo: data.dbInfo };
}

export function supportsDeviceFilePicker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'
  );
}

export async function pickDeviceSaveSqliteFile(
  suggestedName = 'mansarf-ledger.db'
): Promise<LocalDeviceFileHandle | null> {
  const win = window as unknown as {
    showSaveFilePicker?: (opts?: unknown) => Promise<LocalDeviceFileHandle>;
  };
  if (typeof win.showSaveFilePicker !== 'function') return null;
  return win.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'SQLite Database File (.db)',
        accept: { 'application/vnd.sqlite3': ['.db', '.sqlite'] },
      },
    ],
  });
}

export async function syncBlobToDeviceFileHandle(
  handle: LocalDeviceFileHandle,
  blob: Blob
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function createLocalDbBackup(token: string): Promise<{
  backupFile: string;
  lastBackupAt: string;
  state: AppState;
  dbInfo: DbStatusInfo;
}> {
  const res = await fetch('/api/db/backup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'تعذر إنشاء النسخة الاحتياطية الدورية.');
  const data = (await res.json()) as {
    backupFile: string;
    lastBackupAt: string;
    state: unknown;
    dbInfo: DbStatusInfo;
  };
  return {
    backupFile: data.backupFile,
    lastBackupAt: data.lastBackupAt,
    state: sanitizeState(data.state),
    dbInfo: data.dbInfo,
  };
}

export async function downloadBackupFileBlob(
  token: string,
  relativePath: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api/db/backup-file?path=${encodeURIComponent(relativePath)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await parseError(res, 'تعذر تنزيل ملف النسخة الاحتياطية.');
  const disp = res.headers.get('content-disposition') || '';
  const match = disp.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || relativePath.split('/').pop() || 'backup.db';
  const blob = await res.blob();
  return { blob, filename };
}

export async function restoreLocalDbBackup(
  token: string,
  relativePath: string
): Promise<{ state: AppState; dbInfo: DbStatusInfo }> {
  const res = await fetch('/api/db/restore-backup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ relativePath }),
  });
  if (!res.ok) throw await parseError(res, 'تعذر استعادة النسخة الاحتياطية.');
  const data = (await res.json()) as { state: unknown; dbInfo: DbStatusInfo };
  return { state: sanitizeState(data.state), dbInfo: data.dbInfo };
}

export const BACKUP_INTERVAL_MS: Record<BackupFrequency, number> = {
  off: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export const BACKUP_FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  off: 'معطّل',
  daily: 'يوميًا (كل ٢٤ ساعة)',
  weekly: 'أسبوعيًا (كل ٧ أيام)',
  monthly: 'شهريًا (كل ٣٠ يومًا)',
};

export function isPeriodicBackupDue(
  frequency: BackupFrequency | undefined,
  lastBackupAt: string | undefined,
  entryCount: number
): boolean {
  const freq: BackupFrequency = frequency || 'weekly';
  if (freq === 'off' || entryCount <= 0) return false;
  if (!lastBackupAt) return true;
  const lastMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(lastMs) || lastMs <= 0) return true;
  return Date.now() - lastMs >= BACKUP_INTERVAL_MS[freq];
}

export function formatBackupDateArabic(iso?: string): string {
  if (!iso) return 'لم يتم الحفظ بعد';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'غير محدد';
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function getNextBackupDueArabic(
  frequency: BackupFrequency | undefined,
  lastBackupAt?: string
): string {
  const freq: BackupFrequency = frequency || 'weekly';
  if (freq === 'off') return 'النسخ التلقائي معطّل';
  if (!lastBackupAt) return 'مستحقة الآن عند الفتح';
  const lastMs = Date.parse(lastBackupAt);
  if (!Number.isFinite(lastMs)) return 'مستحقة الآن';
  const nextMs = lastMs + BACKUP_INTERVAL_MS[freq];
  if (Date.now() >= nextMs) return 'مستحقة الآن';
  return formatBackupDateArabic(new Date(nextMs).toISOString());
}

export function formatFileSizeArabic(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}
