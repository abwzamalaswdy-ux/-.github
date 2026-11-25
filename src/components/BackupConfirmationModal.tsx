import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, DatabaseBackup, Download, Settings2, X } from 'lucide-react';
import { BackupFrequency, NumeralStyle } from '../types/ledger';
import { formatNum } from '../utils/ledgerLogic';
import { BACKUP_FREQUENCY_LABELS, formatBackupDateArabic } from '../utils/localDbClient';

interface BackupConfirmationModalProps {
  open: boolean;
  dbRelativePath: string;
  entryCount: number;
  numeralStyle: NumeralStyle;
  frequency: BackupFrequency;
  lastBackupAt?: string;
  onConfirmBackup: (alsoDownloadCopy: boolean) => Promise<void>;
  onPostpone: () => void;
  onOpenSettings: () => void;
}

export function BackupConfirmationModal({
  open,
  dbRelativePath,
  entryCount,
  numeralStyle,
  frequency,
  lastBackupAt,
  onConfirmBackup,
  onPostpone,
  onOpenSettings,
}: BackupConfirmationModalProps) {
  const [alsoDownloadCopy, setAlsoDownloadCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onPostpone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onPostpone]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await onConfirmBackup(alsoDownloadCopy);
    } catch (err) {
      setErrorMsg((err as Error).message || 'تعذر حفظ النسخة الاحتياطية الآن.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/65 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#d9dfdb] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e8ece9] bg-[#f4f8f5]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl bg-[#173f2e] text-white grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <DatabaseBackup className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="backup-confirm-title" className="text-base font-black text-[#17211d]">
                تأكيد حفظ نسخة احتياطية دورية
              </h3>
              <p className="text-xs text-[#46534b]">
                تذكير تلقائي عند فتح التطبيق لحماية سجلات قاعدة البيانات.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onPostpone}
            aria-label="تأجيل وإغلاق"
            className="w-8 h-8 rounded-lg grid place-items-center bg-white border border-[#d9dfdb] text-[#647069] hover:text-[#17211d] disabled:opacity-45 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#fff0ef] border border-[#f0ceca] text-xs font-bold text-[#9e3029]"
            >
              {errorMsg}
            </div>
          )}

          <p className="text-sm font-bold text-[#17211d] leading-relaxed">
            حان موعد حفظ نسخة احتياطية دورية من قاعدة بيانات «كشوفات المنصرف». هل تريد تأكيد حفظ
            النسخة الاحتياطية الآن؟
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[#fafbf9] border border-[#d9dfdb]">
              <div className="text-[11px] font-bold text-[#647069]">قاعدة البيانات النشطة</div>
              <div dir="ltr" className="font-mono font-extrabold text-[#173f2e] mt-0.5 truncate">
                {dbRelativePath}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#fafbf9] border border-[#d9dfdb]">
              <div className="text-[11px] font-bold text-[#647069]">عدد القيود الحالية</div>
              <div className="font-black text-[#173f2e] mt-0.5 tabular-nums">
                {formatNum(entryCount, numeralStyle)} قيد
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#fafbf9] border border-[#d9dfdb]">
              <div className="text-[11px] font-bold text-[#647069] flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5 text-[#173f2e]" aria-hidden="true" />
                <span>الجدولة المضبوطة</span>
              </div>
              <div className="font-extrabold text-[#17211d] mt-0.5">
                {BACKUP_FREQUENCY_LABELS[frequency]}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#fafbf9] border border-[#d9dfdb]">
              <div className="text-[11px] font-bold text-[#647069]">آخر نسخة احتياطية</div>
              <div className="font-extrabold text-[#17211d] mt-0.5">
                {formatBackupDateArabic(lastBackupAt)}
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#f4f8f5] border border-[#cfe0d5] cursor-pointer">
            <input
              type="checkbox"
              checked={alsoDownloadCopy}
              disabled={busy}
              onChange={(e) => setAlsoDownloadCopy(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#173f2e] shrink-0"
            />
            <span className="text-xs font-bold text-[#173f2e] leading-relaxed">
              تنزيل نسخة ملف قاعدة البيانات (<code dir="ltr">.db</code>) على جهازي أيضًا إلى جانب
              حفظها في مجلد النسخ الاحتياطية المحلي.
            </span>
          </label>
        </div>

        <div className="px-5 py-3.5 border-t border-[#e8ece9] bg-[#fafbf9] flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold text-[#46534b] hover:text-[#173f2e] hover:bg-[#edf1ee] transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>تعديل الجدولة</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onPostpone}
              className="px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-white hover:bg-[#f2f4f2] text-[#46534b] border border-[#d9dfdb]"
            >
              تأجيل لمرة لاحقة
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-50 text-white transition-colors shadow-sm"
            >
              {alsoDownloadCopy ? (
                <Download className="w-4 h-4" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{busy ? 'جارٍ الحفظ…' : 'تأكيد وحفظ النسخة الآن'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
