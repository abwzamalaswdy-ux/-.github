import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Contrast,
  Database,
  DatabaseBackup,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { AppState } from '../types/ledger';
import {
  MAX_IMPORT_FILE_BYTES,
  downloadBlob,
  sanitizeState,
} from '../utils/ledgerLogic';
import { AuthSession } from './AuthLockScreen';

interface SecuritySettingsModalProps {
  open: boolean;
  readOnly?: boolean;
  highContrast: boolean;
  activeDbLabel?: string;
  session: AuthSession;
  state: AppState;
  onClose: () => void;
  onSessionUpdated: (next: AuthSession) => void;
  onAutoLockChange: (minutes: number) => void;
  onDailyReminderChange: (time: string) => void;
  onHighContrastChange: (enabled: boolean) => void;
  onOpenDatabase?: () => void;
  onRestoreBackup: (restoredState: AppState) => void;
  onNotify: (msg: string) => void;
}

export function SecuritySettingsModal({
  open,
  readOnly = false,
  highContrast,
  activeDbLabel,
  session,
  state,
  onClose,
  onSessionUpdated,
  onAutoLockChange,
  onDailyReminderChange,
  onHighContrastChange,
  onOpenDatabase,
  onRestoreBackup,
  onNotify,
}: SecuritySettingsModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const backupInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const strengthScore = (() => {
    if (!newPassword) return 0;
    let score = 0;
    if (newPassword.length >= 6) score++;
    if (newPassword.length >= 10) score++;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
    if (/\d/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword)) score++;
    return score;
  })();

  const strengthLabel =
    strengthScore <= 1
      ? { text: 'ضعيفة', color: 'bg-[#d96b63]', textColor: 'text-[#9e3029]' }
      : strengthScore === 2
      ? { text: 'متوسطة', color: 'bg-[#d69e2e]', textColor: 'text-[#845315]' }
      : { text: 'قوية', color: 'bg-[#173f2e]', textColor: 'text-[#173f2e]' };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError('يرجى تعبئة جميع حقول كلمة المرور.');
      return;
    }
    if (newPassword.length < 4 || newPassword.length > 128) {
      setPwdError('يجب أن تكون كلمة المرور الجديدة بين 4 و 128 حرفًا.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('كلمتا المرور الجديدتان غير متطابقتين.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        expiresAt?: number;
        error?: string;
      };

      if (!res.ok || !data.token) {
        setPwdError(data.error || 'تعذر تحديث كلمة المرور.');
        return;
      }

      onSessionUpdated({
        token: data.token,
        expiresAt: Number(data.expiresAt) || session.expiresAt,
        isDefaultPassword: false,
        envOverride: false,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdSuccess('تم تحديث كلمة المرور بنجاح وتجديد الجلسة.');
      onNotify('تم تحديث كلمة المرور بنجاح.');
    } catch {
      setPwdError('تعذر الاتصال بالخادم لتحديث كلمة المرور.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDownloadJsonBackup = () => {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      app: 'كشوفات المنصرف',
      state,
    };
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      `نسخة_احتياطية_كشوفات_المنصرف_${dateStamp}.json`
    );
    onNotify('تم تنزيل النسخة الاحتياطية الكاملة (JSON).');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      onNotify('حجم ملف النسخة الاحتياطية يتجاوز الحد المسموح (5 ميجابايت).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}')) as {
          state?: unknown;
          entries?: unknown;
        };
        const candidate = parsed && typeof parsed === 'object' && parsed.state ? parsed.state : parsed;
        if (!candidate || typeof candidate !== 'object' || !Array.isArray((candidate as AppState).entries)) {
          onNotify('ملف النسخة الاحتياطية غير صالح أو لا يحتوي على قيود.');
          return;
        }
        const safeState = sanitizeState(candidate);
        onRestoreBackup(safeState);
        onNotify(`تمت استعادة ${safeState.entries.length} قيدًا وإعدادات الكشف بنجاح.`);
        onClose();
      } catch {
        onNotify('تعذر قراءة ملف JSON؛ تأكد من سلامة الملف.');
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const autoLockValue = state.autoLockMinutes ?? 15;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#101a14]/60 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9] bg-[#fafbf9]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center"
              aria-hidden="true"
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 id="security-settings-title" className="text-base font-black text-[#17211d]">
                إعدادات التطبيق والأمان والنسخ الاحتياطي
              </h3>
              <p className="text-xs text-[#647069]">
                تخصيص العرض وإمكانية الوصول، إدارة كلمة المرور، القفل التلقائي، والنسخ الاحتياطي.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg grid place-items-center bg-white border border-[#d9dfdb] text-[#647069] hover:text-[#17211d]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Accessibility & Display Section */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
              <Contrast className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-black text-[#17211d]">
                  وضع التباين العالي (High Contrast Mode)
                </h4>
                <p className="text-xs text-[#647069] mt-0.5 leading-relaxed">
                  يزيد وضوح النصوص والحدود والأزرار ومؤشرات التركيز لتحسين القراءة لضعاف البصر أو
                  عند العمل تحت الإضاءة القوية.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={highContrast}
              onClick={() => {
                const next = !highContrast;
                onHighContrastChange(next);
                onNotify(
                  next
                    ? 'تم تفعيل وضع التباين العالي لتحسين وضوح العرض.'
                    : 'تم إيقاف وضع التباين العالي والعودة للعرض القياسي.'
                );
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-extrabold border transition-colors shrink-0 cursor-pointer ${
                highContrast
                  ? 'bg-[#173f2e] text-white border-[#173f2e]'
                  : 'bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border-[#d9dfdb]'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  highContrast ? 'bg-[#ffeb3b]' : 'bg-[#9aa79f]'
                }`}
                aria-hidden="true"
              />
              <span>{highContrast ? 'مفعّل' : 'معطّل'}</span>
            </button>
          </section>

          {/* Password Change Section */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-[#fcfdfc] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-[#17211d]">تغيير كلمة مرور التطبيق</h4>
              {session.isDefaultPassword && (
                <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-[#fbf1df] text-[#845315] border border-[#ebd4aa]">
                  كلمة افتراضية (يُنصح بالتغيير)
                </span>
              )}
            </div>

            {session.envOverride ? (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[#eaf1fd] border border-[#c4d8f8] text-xs font-bold text-[#174c9c]">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  كلمة المرور مُدارة حاليًا عبر متغير البيئة <code className="font-mono">ADMIN_PASSCODE</code>{' '}
                  في إعدادات الخادم. لتعديلها، حدّث المتغير من لوحة الأسرار.
                </span>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                {pwdError && (
                  <div className="p-2.5 rounded-xl bg-[#fff0ef] border border-[#f0ceca] text-xs font-bold text-[#9e3029]">
                    {pwdError}
                  </div>
                )}
                {pwdSuccess && (
                  <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-[#e8f0eb] border border-[#b7cbbe] text-xs font-bold text-[#173f2e]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{pwdSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                      كلمة المرور الحالية
                    </span>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                      كلمة المرور الجديدة
                    </span>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="4 أحرف على الأقل"
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                      تأكيد الجديدة
                    </span>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="أعد الإدخال"
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                    />
                  </label>
                </div>

                {newPassword && (
                  <div className="flex items-center gap-2.5 text-[11px] font-bold">
                    <span className="text-[#647069]">قوة كلمة المرور:</span>
                    <div className="flex-1 max-w-[140px] h-1.5 rounded-full bg-[#e5e9e5] overflow-hidden">
                      <div
                        className={`h-full transition-all ${strengthLabel.color}`}
                        style={{ width: `${Math.max(25, strengthScore * 25)}%` }}
                      />
                    </div>
                    <span className={strengthLabel.textColor}>{strengthLabel.text}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPasswords((s) => !s)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#46534b] hover:text-[#173f2e]"
                  >
                    {showPasswords ? (
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{showPasswords ? 'إخفاء الأحرف' : 'إظهار الأحرف'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-50 text-white transition-colors"
                  >
                    {savingPassword ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور الجديدة'}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Auto-Lock Idle Timeout */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-black text-[#17211d]">القفل التلقائي عند الخمول</h4>
                <p className="text-xs text-[#647069] mt-0.5">
                  يُقفل التطبيق تلقائيًا ويطلب كلمة المرور عند عدم التفاعل لفترة محددة.
                </p>
              </div>
            </div>

            <select
              value={autoLockValue}
              onChange={(e) => {
                const mins = Number(e.target.value);
                onAutoLockChange(mins);
                onNotify(
                  mins === 0
                    ? 'تم تعطيل القفل التلقائي عند الخمول.'
                    : `تم ضبط القفل التلقائي بعد ${mins} دقيقة من الخمول.`
                );
              }}
              aria-label="مدة القفل التلقائي عند الخمول"
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#d8dfda] bg-[#f7f8f6] text-xs font-extrabold text-[#173f2e]"
            >
              <option value={5}>بعد 5 دقائق</option>
              <option value={15}>بعد 15 دقيقة</option>
              <option value={30}>بعد 30 دقيقة</option>
              <option value={0}>معطّل</option>
            </select>
          </section>

          {/* Daily Reminder Time Setting */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-black text-[#17211d]">وقت التذكير اليومي للقيود</h4>
                <p className="text-xs text-[#647069] mt-0.5">
                  حدد وقتًا ليظهر لك تنبيه (تذكير) في التطبيق إذا لم تقم بتسجيل أي قيود لليوم الحالي.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="time"
                value={state.dailyReminderTime || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onDailyReminderChange(val);
                  onNotify(
                    val
                      ? `تم ضبط وقت التذكير اليومي على الساعة ${val}.`
                      : 'تم إيقاف تذكير القيود اليومي.'
                  );
                }}
                aria-label="وقت التذكير اليومي"
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#d8dfda] bg-[#f7f8f6] text-xs font-extrabold text-[#173f2e]"
              />
              {state.dailyReminderTime && (
                <button
                  type="button"
                  onClick={() => {
                    onDailyReminderChange('');
                    onNotify('تم إيقاف تذكير القيود اليومي.');
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#f7f8f6] text-[#647069] border border-[#d9dfdb]"
                >
                  إيقاف
                </button>
              )}
            </div>
          </section>

          {/* Local SQLite Database Manager Shortcut */}
          {onOpenDatabase && (
            <section className="p-4 rounded-2xl border border-[#b7cbbe] bg-[#f4f8f5] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
                <Database className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-black text-[#173f2e]">
                    قاعدة البيانات المحلية (مستقلة عن المتصفح)
                  </h4>
                  <p className="text-xs text-[#46534b] mt-0.5">
                    تُحفظ البيانات في ملف SQLite محلي على القرص
                    {activeDbLabel ? (
                      <>
                        {' '}
                        (<code dir="ltr" className="font-mono font-bold text-[#173f2e]">{activeDbLabel}</code>)
                      </>
                    ) : null}
                    . يمكنك تغيير مسار التخزين أو استيراد قاعدة بيانات في أي وقت.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDatabase();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors shrink-0"
              >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تحديد المسار أو الاستيراد</span>
              </button>
            </section>
          )}

          {/* Full JSON Backup & Restore */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-[#fafbf9] space-y-3">
            <div className="flex items-start gap-2.5">
              <DatabaseBackup className="w-4 h-4 text-[#173f2e] mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-black text-[#17211d]">
                  النسخ الاحتياطي الكامل والاستعادة (JSON)
                </h4>
                <p className="text-xs text-[#647069] mt-0.5">
                  احفظ نسخة كاملة شاملة للقيود والتوقيع والإعدادات لنقلها بين الأجهزة أو استعادتها
                  بأمان مع التحقق من صحة البيانات.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadJsonBackup}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تنزيل نسخة احتياطية JSON</span>
              </button>

              <button
                type="button"
                disabled={readOnly}
                onClick={() => backupInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-white hover:bg-[#edf0ed] disabled:opacity-45 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb] transition-colors"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{readOnly ? 'الاستعادة معطلة (قراءة فقط)' : 'استعادة من ملف JSON'}</span>
              </button>
              <input
                ref={backupInputRef}
                type="file"
                disabled={readOnly}
                accept=".json,application/json"
                onChange={handleRestoreFile}
                className="hidden"
              />
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-[#e8ece9] bg-[#fafbf9] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
