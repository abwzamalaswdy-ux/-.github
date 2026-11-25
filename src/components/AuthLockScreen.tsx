import React, { useEffect, useState } from 'react';
import { AlertCircle, Contrast, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { applyHighContrastMode, loadHighContrastPref } from '../utils/ledgerLogic';

export interface AuthSession {
  token: string;
  expiresAt: number;
  isDefaultPassword: boolean;
  envOverride: boolean;
}

interface AuthLockScreenProps {
  onUnlocked: (session: AuthSession) => void;
  lockReason?: string | null;
}

export function AuthLockScreen({ onUnlocked, lockReason }: AuthLockScreenProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isDefaultPassword, setIsDefaultPassword] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [highContrast, setHighContrast] = useState(() => loadHighContrastPref());

  const handleToggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    applyHighContrastMode(next);
  };

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setIsDefaultPassword(Boolean(data.isDefaultPassword));
        if (typeof data.lockedOutSeconds === 'number' && data.lockedOutSeconds > 0) {
          setCooldownSeconds(data.lockedOutSeconds);
        }
      })
      .catch(() => {
        // Status fetch failure handled gracefully on submit
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    if (!password) {
      setError('يرجى إدخال كلمة المرور للمتابعة.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        expiresAt?: number;
        isDefaultPassword?: boolean;
        envOverride?: boolean;
        error?: string;
        retryAfterSeconds?: number;
      };

      if (!res.ok || !data.token) {
        if (typeof data.retryAfterSeconds === 'number' && data.retryAfterSeconds > 0) {
          setCooldownSeconds(data.retryAfterSeconds);
        }
        setError(data.error || 'تعذر التحقق من كلمة المرور.');
        setPassword('');
        return;
      }

      setPassword('');
      onUnlocked({
        token: data.token,
        expiresAt: Number(data.expiresAt) || Date.now() + 8 * 60 * 60 * 1000,
        isDefaultPassword: Boolean(data.isDefaultPassword),
        envOverride: Boolean(data.envOverride),
      });
    } catch {
      setError('تعذر الاتصال بخادم التحقق المحلي. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#f3f1ec] flex flex-col items-center justify-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md bg-white border border-[#d9dfdb] rounded-3xl shadow-[0_18px_50px_rgba(23,63,46,0.12)] overflow-hidden">
        {/* Emerald Top Identity Banner */}
        <div className="bg-[#173f2e] text-white px-6 py-7 text-center relative">
          <button
            type="button"
            role="switch"
            aria-checked={highContrast}
            onClick={handleToggleContrast}
            title="تفعيل أو تعطيل وضع التباين العالي لتحسين وضوح القراءة"
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors cursor-pointer"
          >
            <Contrast className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{highContrast ? 'تباين عالٍ: مفعّل' : 'تباين عالٍ'}</span>
          </button>
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/12 border border-white/25 grid place-items-center"
            aria-hidden="true"
          >
            <Lock className="w-7 h-7 text-[#ede6d6]" />
          </div>
          <h1 className="text-xl font-black tracking-tight">كشوفات المنصرف</h1>
          <p className="text-xs text-[#d6e2da] mt-1">
            جلسة محمية بكلمة مرور · التحقق يتم عبر الخادم الآمن
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {lockReason && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[#fbf6ea] border border-[#e3d4b4] text-xs font-bold text-[#725020]">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{lockReason}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-[#fff0ef] border border-[#f0ceca] text-xs font-bold text-[#9e3029]"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {cooldownSeconds > 0 && (
            <div className="p-3 rounded-xl bg-[#fff8e8] border border-[#f0dfaf] text-xs font-extrabold text-[#725020] text-center tabular-nums">
              محاولات متعددة خاطئة — إعادة المحاولة متاحة بعد {cooldownSeconds} ثانية
            </div>
          )}

          <div>
            <label
              htmlFor="unlock-password"
              className="block text-xs font-extrabold text-[#365244] mb-1.5"
            >
              كلمة المرور
            </label>
            <div className="relative flex items-center">
              <KeyRound
                className="w-4 h-4 text-[#647069] absolute right-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="unlock-password"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                autoComplete="current-password"
                value={password}
                disabled={submitting || cooldownSeconds > 0}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور لفتح الكشوفات"
                className="w-full min-h-[46px] pr-10 pl-11 py-2.5 text-sm font-bold rounded-xl border border-[#cfd8d2] bg-[#fcfdfc] text-[#17211d] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30 focus:border-[#173f2e] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="absolute left-2.5 w-8 h-8 rounded-lg grid place-items-center text-[#647069] hover:text-[#173f2e] hover:bg-[#edf1ee] transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {isDefaultPassword && (
            <div className="p-3 rounded-xl bg-[#f4f8f5] border border-[#c4d6ca] text-[11px] text-[#365244] leading-relaxed">
              كلمة المرور الافتراضية للتشغيل الأول هي{' '}
              <code
                dir="ltr"
                className="inline-block px-1.5 py-0.5 rounded bg-white border border-[#b7cbbe] font-mono font-bold text-[#173f2e]"
              >
                admin
              </code>{' '}
              — يُنصح بتغييرها فور الدخول من قائمة الأمان.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || cooldownSeconds > 0}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl text-sm font-black bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-55 text-white shadow-[0_6px_18px_rgba(23,63,46,0.22)] transition-colors cursor-pointer"
          >
            {submitting ? 'جارٍ التحقق…' : 'فتح التطبيق'}
          </button>
        </form>
      </div>
    </div>
  );
}
