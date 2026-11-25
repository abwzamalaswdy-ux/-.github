import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Database,
  DatabaseBackup,
  Download,
  FolderCog,
  FolderOpen,
  HardDrive,
  History,
  Link2,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { AppState, BackupFrequency, NumeralStyle } from '../types/ledger';
import { MAX_IMPORT_FILE_BYTES, formatNum, sanitizeState } from '../utils/ledgerLogic';
import {
  BACKUP_FREQUENCY_LABELS,
  DbStatusInfo,
  LocalDeviceFileHandle,
  formatBackupDateArabic,
  formatFileSizeArabic,
  getNextBackupDueArabic,
  pickDeviceSaveSqliteFile,
  supportsDeviceFilePicker,
} from '../utils/localDbClient';

interface DatabaseSettingsModalProps {
  open: boolean;
  readOnly: boolean;
  numeralStyle: NumeralStyle;
  dbInfo: DbStatusInfo | null;
  savingDb: boolean;
  linkedDeviceFile: LocalDeviceFileHandle | null;
  backupFrequency: BackupFrequency;
  lastBackupAt?: string;
  onClose: () => void;
  onRefreshInfo: () => void;
  onChangeLocation: (
    relativePath: string,
    mode: 'move_or_copy' | 'open_or_create'
  ) => Promise<void>;
  onDownloadSqlite: () => Promise<void>;
  onImportSqliteFile: (file: File, targetPath?: string) => Promise<void>;
  onImportJsonState: (state: AppState) => Promise<void>;
  onLinkDeviceFile: (handle: LocalDeviceFileHandle | null) => Promise<void>;
  onChangeBackupFrequency: (freq: BackupFrequency) => void;
  onTriggerBackupPrompt: () => void;
  onCreateBackupNow: () => Promise<void>;
  onDownloadBackupFile: (relativePath: string) => Promise<void>;
  onRestoreSavedBackup: (relativePath: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

export function DatabaseSettingsModal({
  open,
  readOnly,
  numeralStyle,
  dbInfo,
  savingDb,
  linkedDeviceFile,
  backupFrequency,
  lastBackupAt,
  onClose,
  onRefreshInfo,
  onChangeLocation,
  onDownloadSqlite,
  onImportSqliteFile,
  onImportJsonState,
  onLinkDeviceFile,
  onChangeBackupFrequency,
  onTriggerBackupPrompt,
  onCreateBackupNow,
  onDownloadBackupFile,
  onRestoreSavedBackup,
  onNotify,
}: DatabaseSettingsModalProps) {
  const [customPath, setCustomPath] = useState(dbInfo?.relativePath || 'mansarf-ledger.db');
  const [locationMode, setLocationMode] = useState<'move_or_copy' | 'open_or_create'>(
    'move_or_copy'
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    if (dbInfo?.relativePath) {
      setCustomPath(dbInfo.relativePath);
    }
  }, [open, dbInfo?.relativePath]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canUseDevicePicker = supportsDeviceFilePicker();

  const handleApplyLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = customPath.trim();
    if (!trimmed) {
      setErrorMsg('يرجى إدخال اسم ومكان ملف قاعدة البيانات.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      await onChangeLocation(trimmed, locationMode);
    } catch (err) {
      setErrorMsg((err as Error).message || 'تعذر تحديث مسار قاعدة البيانات.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('حجم ملف قاعدة البيانات يتجاوز الحد المسموح (25 ميجابايت).');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    try {
      if (/\.json$/i.test(file.name)) {
        if (file.size > MAX_IMPORT_FILE_BYTES) {
          throw new Error('حجم ملف JSON يتجاوز الحد المسموح (5 ميجابايت).');
        }
        const text = await file.text();
        const parsed = JSON.parse(text) as { state?: unknown; entries?: unknown };
        const candidate =
          parsed && typeof parsed === 'object' && parsed.state ? parsed.state : parsed;
        if (
          !candidate ||
          typeof candidate !== 'object' ||
          !Array.isArray((candidate as AppState).entries)
        ) {
          throw new Error('ملف JSON غير صالح ولا يحتوي على قيود قاعدة بيانات.');
        }
        await onImportJsonState(sanitizeState(candidate));
      } else {
        await onImportSqliteFile(file);
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'تعذر استيراد ملف قاعدة البيانات.');
    } finally {
      setBusy(false);
    }
  };

  const handlePickDeviceSyncFile = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const baseName =
        dbInfo?.relativePath.split('/').pop() || 'mansarf-ledger.db';
      const handle = await pickDeviceSaveSqliteFile(baseName);
      if (handle) {
        await onLinkDeviceFile(handle);
      }
    } catch (err) {
      const msg = (err as Error)?.message || '';
      if ((err as { name?: string })?.name !== 'AbortError') {
        setErrorMsg(msg || 'تعذر ربط الملف المحلي على جهازك.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-settings-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#101a14]/65 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e8ece9] bg-[#fafbf9]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="db-settings-title" className="text-base font-black text-[#17211d] truncate">
                إدارة قاعدة البيانات المحلية (مستقلة عن المتصفح)
              </h3>
              <p className="text-xs text-[#647069]">
                تُحفظ جميع القيود والإعدادات في ملف SQLite محلي على القرص، مع إمكانية تحديد مسار
                الحفظ واستيراد أي قاعدة بيانات في أي وقت.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg grid place-items-center bg-white border border-[#d9dfdb] text-[#647069] hover:text-[#17211d] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#fff0ef] border border-[#f0ceca] text-xs font-bold text-[#9e3029]"
            >
              {errorMsg}
            </div>
          )}

          {/* Active Database Status Card */}
          <section className="p-4 rounded-2xl border border-[#b7cbbe] bg-[#f4f8f5] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#173f2e]" aria-hidden="true" />
                <h4 className="text-sm font-black text-[#173f2e]">
                  قاعدة البيانات النشطة حاليًا (SQLite محلي)
                </h4>
              </div>
              <button
                type="button"
                onClick={onRefreshInfo}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-[#e8f0eb] text-[#173f2e] border border-[#c4d6ca]"
              >
                <RefreshCw className={`w-3 h-3 ${savingDb ? 'animate-spin' : ''}`} />
                <span>تحديث الحالة</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-[#d9dfdb]">
                <div className="text-[11px] font-bold text-[#647069]">مسار الملف النشط</div>
                <div dir="ltr" className="font-mono font-extrabold text-[#17211d] mt-0.5 truncate" title={dbInfo?.fullPath || ''}>
                  {dbInfo?.relativePath || 'mansarf-ledger.db'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-[#d9dfdb]">
                <div className="text-[11px] font-bold text-[#647069]">عدد القيود المخزنة</div>
                <div className="font-black text-sm text-[#173f2e] mt-0.5 tabular-nums">
                  {formatNum(dbInfo?.entryCount ?? 0, numeralStyle)} قيد
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-[#d9dfdb]">
                <div className="text-[11px] font-bold text-[#647069]">حجم ملف القاعدة</div>
                <div className="font-extrabold text-[#17211d] mt-0.5 tabular-nums">
                  {formatFileSizeArabic(dbInfo?.sizeBytes ?? 0)}
                </div>
              </div>
            </div>

            {dbInfo?.storageRoot && (
              <div className="text-[11px] text-[#46534b] bg-white/80 px-3 py-2 rounded-xl border border-[#d9dfdb]">
                <span className="font-bold">المجلد الرئيسي لقواعد البيانات على القرص: </span>
                <code dir="ltr" className="font-mono text-[#173f2e] break-all">
                  {dbInfo.storageRoot}
                </code>
              </div>
            )}
          </section>

          {/* Configure Storage Location Inside App */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-white space-y-3.5">
            <div className="flex items-start gap-2.5">
              <FolderCog className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-black text-[#17211d]">
                  تحديد مكان تخزين قاعدة البيانات أو التبديل بين القواعد
                </h4>
                <p className="text-xs text-[#647069] mt-0.5">
                  اكتب مسار المجلد الفرعي واسم الملف (مثل{' '}
                  <code dir="ltr" className="font-mono font-bold text-[#173f2e]">
                    2026/main.db
                  </code>{' '}
                  أو{' '}
                  <code dir="ltr" className="font-mono font-bold text-[#173f2e]">
                    branch-1/ledger.db
                  </code>
                  ) أو اختر ملفًا موجودًا بالأسفل.
                </p>
              </div>
            </div>

            <form onSubmit={handleApplyLocation} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                    مسار التخزين واسم الملف (.db)
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={customPath}
                      disabled={busy}
                      onChange={(e) => setCustomPath(e.target.value)}
                      placeholder="e.g. 2026/mansarf-ledger.db"
                      className="w-full min-h-[40px] px-3 py-2 text-sm font-mono rounded-xl border border-[#d8dfda] bg-[#fafbf9] text-[#17211d] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                    />
                    {canUseDevicePicker && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            const handle = await pickDeviceSaveSqliteFile(
                              customPath.split('/').pop() || 'mansarf-ledger.db'
                            );
                            if (handle && handle.name) {
                              setCustomPath(handle.name);
                              setLocationMode('open_or_create');
                              onNotify(`تم اختيار الملف: ${handle.name}`);
                            }
                          } catch {
                            // ignore user cancel
                          }
                        }}
                        title="اختر ملف من جهازك عبر متصفح الملفات"
                        className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-[#e8f0eb] hover:bg-[#dce8e1] text-[#173f2e] border border-[#b7cbbe] whitespace-nowrap shrink-0"
                      >
                        <FolderOpen className="w-4 h-4 shrink-0" />
                        <span>استعراض</span>
                      </button>
                    )}
                  </div>
                </label>

                <label className="block">
                  <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                    إجراء عند تغيير المسار
                  </span>
                  <select
                    value={locationMode}
                    disabled={busy}
                    onChange={(e) =>
                      setLocationMode(e.target.value as 'move_or_copy' | 'open_or_create')
                    }
                    className="w-full min-h-[40px] px-3 py-2 text-xs font-extrabold rounded-xl border border-[#d8dfda] bg-[#fafbf9] text-[#17211d]"
                  >
                    <option value="move_or_copy">
                      نسخ البيانات الحالية إلى المسار الجديد واعتماده
                    </option>
                    <option value="open_or_create">
                      الربط بملف موجود في هذا المسار (أو إنشاء قاعدة جديدة فارغة)
                    </option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={busy || (readOnly && locationMode === 'move_or_copy')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 text-white transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{busy ? 'جارٍ التطبيق…' : 'اعتماد مكان التخزين'}</span>
                </button>
              </div>
            </form>

            {dbInfo && dbInfo.availableFiles.length > 0 && (
              <div className="pt-2 border-t border-[#edf0ed]">
                <div className="text-[11px] font-extrabold text-[#46534b] mb-2">
                  ملفات قواعد البيانات المتوفرة في التخزين المحلي ({formatNum(dbInfo.availableFiles.length, numeralStyle)}):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {dbInfo.availableFiles.map((f) => {
                    const isActive = f.relativePath === dbInfo.relativePath;
                    return (
                      <button
                        key={f.relativePath}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setCustomPath(f.relativePath);
                          setLocationMode('open_or_create');
                          if (!isActive) {
                            setBusy(true);
                            setErrorMsg('');
                            try {
                              await onChangeLocation(f.relativePath, 'open_or_create');
                            } catch (err) {
                              setErrorMsg((err as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }
                        }}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-right transition-colors ${
                          isActive
                            ? 'bg-[#e8f0eb] border-[#173f2e] text-[#173f2e]'
                            : 'bg-[#fafbf9] hover:bg-[#edf1ee] border-[#d9dfdb] text-[#17211d]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div dir="ltr" className="font-mono text-xs font-extrabold truncate">
                            {f.relativePath}
                          </div>
                          <div className="text-[10px] text-[#647069] mt-0.5">
                            {formatFileSizeArabic(f.sizeBytes)}
                          </div>
                        </div>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-[#173f2e] text-white shrink-0">
                            نشط
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Local Device Export & Any-Time Import */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-[#fafbf9] space-y-3.5">
            <div>
              <h4 className="text-sm font-black text-[#17211d]">
                التصدير والاستيراد من التخزين المحلي على جهازك في أي وقت
              </h4>
              <p className="text-xs text-[#647069] mt-0.5">
                صدّر ملف قاعدة البيانات الكامل (<code dir="ltr">.db</code>) إلى أي مجلد على جهازك
                أو ذاكرة خارجية، واستعده في أي وقت بضغطة زر.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={onDownloadSqlite}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>حفظ / تصدير قاعدة البيانات (.db)</span>
              </button>

              <button
                type="button"
                disabled={busy || readOnly}
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-white hover:bg-[#e8f0eb] disabled:opacity-45 disabled:pointer-events-none text-[#173f2e] border border-[#b7cbbe] transition-colors"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {readOnly
                    ? 'الاستيراد معطّل (وضع القراءة فقط)'
                    : 'استيراد قاعدة بيانات (.db / .sqlite / .json)'}
                </span>
              </button>

              <input
                ref={importInputRef}
                type="file"
                disabled={readOnly}
                accept=".db,.sqlite,.sqlite3,.json,application/octet-stream,application/json"
                onChange={handleFileImportChange}
                className="hidden"
              />
            </div>

            {/* Optional Direct Desktop File Sync (File System Access API) */}
            {canUseDevicePicker && (
              <div className="p-3 rounded-xl bg-white border border-[#d9dfdb] flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-[#17211d] flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-[#173f2e]" aria-hidden="true" />
                    <span>مزامنة تلقائية مباشرة مع ملف على قرص جهازك</span>
                  </div>
                  <p className="text-[11px] text-[#647069] mt-0.5">
                    {linkedDeviceFile ? (
                      <span className="inline-flex items-center gap-1 text-[#173f2e] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>مرتبط حاليًا بالملف: {linkedDeviceFile.name}</span>
                      </span>
                    ) : (
                      'اختر مكانًا على جهازك (سطح المكتب، القرص D، إلخ) لحفظ نسخة محدثة تلقائيًا مع كل تعديل.'
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handlePickDeviceSyncFile}
                    className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#e8f0eb] hover:bg-[#dce8e1] text-[#173f2e] border border-[#b7cbbe]"
                  >
                    {linkedDeviceFile ? 'تغيير الملف المرتبط' : 'تحديد ملف على جهازك'}
                  </button>
                  {linkedDeviceFile && (
                    <button
                      type="button"
                      onClick={() => {
                        onLinkDeviceFile(null);
                        onNotify('تم فك ربط المزامنة التلقائية مع ملف الجهاز.');
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#f7f8f6] text-[#647069] border border-[#d9dfdb]"
                    >
                      فصل
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Periodic Automatic Backup Section */}
          <section className="p-4 rounded-2xl border border-[#b7cbbe] bg-[#f4f8f5] space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
                <CalendarClock className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-black text-[#173f2e]">
                    النسخ الاحتياطي الدوري التلقائي عند فتح التطبيق
                  </h4>
                  <p className="text-xs text-[#46534b] mt-0.5 leading-relaxed">
                    عند حلول الموعد المحدد، يطلب التطبيق تأكيدك تلقائيًا عند الفتح لحفظ نسخة احتياطية
                    جديدة من قاعدة البيانات.
                  </p>
                </div>
              </div>

              <select
                value={backupFrequency}
                disabled={busy}
                aria-label="دورية النسخ الاحتياطي التلقائي"
                onChange={(e) => {
                  const nextFreq = e.target.value as BackupFrequency;
                  onChangeBackupFrequency(nextFreq);
                  onNotify(
                    nextFreq === 'off'
                      ? 'تم إيقاف طلب النسخ الاحتياطي الدوري التلقائي.'
                      : `تم ضبط طلب النسخ الاحتياطي الدوري: ${BACKUP_FREQUENCY_LABELS[nextFreq]}.`
                  );
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#b7cbbe] bg-white text-xs font-extrabold text-[#173f2e] shrink-0"
              >
                <option value="weekly">أسبوعيًا (كل ٧ أيام) — افتراضي</option>
                <option value="daily">يوميًا (كل ٢٤ ساعة)</option>
                <option value="monthly">شهريًا (كل ٣٠ يومًا)</option>
                <option value="off">معطّل</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-[#d9dfdb]">
                <div className="text-[11px] font-bold text-[#647069]">آخر نسخة احتياطية</div>
                <div className="font-extrabold text-[#17211d] mt-0.5">
                  {formatBackupDateArabic(lastBackupAt)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-[#d9dfdb]">
                <div className="text-[11px] font-bold text-[#647069]">النسخة القادمة المستحقة</div>
                <div className="font-extrabold text-[#173f2e] mt-0.5">
                  {getNextBackupDueArabic(backupFrequency, lastBackupAt)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErrorMsg('');
                  try {
                    await onCreateBackupNow();
                  } catch (err) {
                    setErrorMsg((err as Error).message || 'تعذر إنشاء النسخة الاحتياطية.');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors"
              >
                <DatabaseBackup className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إنشاء نسخة احتياطية الآن</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onClose();
                  onTriggerBackupPrompt();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-white hover:bg-[#e8f0eb] text-[#173f2e] border border-[#b7cbbe] transition-colors"
              >
                <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إظهار نافذة التأكيد الآن</span>
              </button>
            </div>

            {dbInfo?.backups && dbInfo.backups.length > 0 && (
              <div className="pt-2.5 border-t border-[#d8e5dc] space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#173f2e]">
                  <History className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    النسخ الاحتياطية الدورية المحفوظة محليًا ({formatNum(dbInfo.backups.length, numeralStyle)}):
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {dbInfo.backups.map((bk) => (
                    <div
                      key={bk.relativePath}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-[#d9dfdb] text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div dir="ltr" className="font-mono font-extrabold text-[#17211d] truncate">
                          {bk.name}
                        </div>
                        <div className="text-[10px] text-[#647069] mt-0.5">
                          {formatBackupDateArabic(bk.updatedAt)} · {formatFileSizeArabic(bk.sizeBytes)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onDownloadBackupFile(bk.relativePath)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#f7f8f6] hover:bg-[#edf1ee] text-[#17211d] border border-[#d9dfdb]"
                        >
                          <Download className="w-3 h-3" aria-hidden="true" />
                          <span>تنزيل</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy || readOnly}
                          onClick={async () => {
                            setBusy(true);
                            setErrorMsg('');
                            try {
                              await onRestoreSavedBackup(bk.relativePath);
                            } catch (err) {
                              setErrorMsg((err as Error).message || 'تعذر استعادة النسخة الاحتياطية.');
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-[#e8f0eb] hover:bg-[#dce8e1] disabled:opacity-45 disabled:pointer-events-none text-[#173f2e] border border-[#b7cbbe]"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" />
                          <span>استعادة</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e8ece9] bg-[#fafbf9] flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#647069]">
            جميع التعديلات تُحفظ فوريًا في قاعدة البيانات المحلية ولا تعتمد على ذاكرة المتصفح.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-white text-[#17211d] border border-[#d9dfdb]"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
