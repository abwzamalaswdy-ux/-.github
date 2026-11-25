import { useEffect, useState } from 'react';
import { Download, Laptop, MonitorDown, Smartphone, WifiOff, X } from 'lucide-react';
import { downloadBlob } from '../utils/ledgerLogic';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-[#845315] px-3.5 py-2 text-xs font-extrabold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>وضع عدم الاتصال — الواجهة تعمل محليًا</span>
    </div>
  );
}

interface PWAInstallButtonProps {
  onOpenDesktopGuide?: () => void;
}

export function PWAInstallButton({ onOpenDesktopGuide }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="تثبيت التطبيق على سطح المكتب (ويندوز 10) أو الجهاز اللوحي"
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-[#ede6d6] hover:bg-[#e4dac3] text-[#173f2e] border border-[#dcd1b8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <MonitorDown className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>تثبيت على iPad</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl border border-[#d9dfdb] text-[#17211d] space-y-3"
            >
              <h3 className="text-base font-black">تثبيت التطبيق على iPad / iPhone</h3>
              <p className="text-xs text-[#46534b] leading-relaxed">
                ١. اضغط على زر <strong>مشاركة (Share)</strong> في شريط Safari.
                <br />
                ٢. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[40px] rounded-xl bg-[#173f2e] text-white text-xs font-extrabold"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (onOpenDesktopGuide) {
    return (
      <button
        type="button"
        onClick={onOpenDesktopGuide}
        title="تثبيت وتشغيل التطبيق على كمبيوتر ويندوز 10"
        className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-white/15 hover:bg-white/25 text-white border border-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Laptop className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>تطبيق ويندوز ١٠</span>
      </button>
    );
  }

  return null;
}

const WINDOWS_BAT_CONTENT = `@echo off
title Mansarf Ledger - Windows 10 Launcher
setlocal enabledelayedexpansion

echo ==================================================
echo   Mansarf Ledger (Kashofat Al-Mansarf) - Windows 10
echo ==================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed.
  echo Please install Node.js 22 LTS or newer from https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if !NODE_MAJOR! LSS 22 (
  echo [WARNING] Detected Node.js v!NODE_MAJOR!. Node.js 22+ is required for built-in SQLite.
  echo Please upgrade from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist "dist\\index.html" (
  echo Building production interface...
  call npm run build
  if %errorlevel% neq 0 (
    echo [ERROR] npm run build failed.
    pause
    exit /b 1
  )
)

set PORT=3000
set NODE_ENV=production

echo.
echo Starting local database server on http://localhost:%PORT% ...
start "" "http://localhost:%PORT%"
node server.ts

if %errorlevel% neq 0 (
  echo.
  echo Server stopped unexpectedly.
  pause
)
`;

interface WindowsDesktopModalProps {
  open: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export function WindowsDesktopModal({ open, onClose, onNotify }: WindowsDesktopModalProps) {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownloadBat = () => {
    downloadBlob(
      new Blob([WINDOWS_BAT_CONTENT.replace(/\n/g, '\r\n')], {
        type: 'application/x-bat;charset=utf-8',
      }),
      'start-windows.bat'
    );
    onNotify('تم تنزيل ملف التشغيل start-windows.bat لنظام ويندوز ١٠.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="windows-guide-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/65 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e8ece9] bg-[#fafbf9]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <Laptop className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="windows-guide-title" className="text-base font-black text-[#17211d]">
                التشغيل والتثبيت على كمبيوتر ويندوز ١٠ (Windows 10)
              </h3>
              <p className="text-xs text-[#647069]">
                ثبّت التطبيق بنافذة مستقلة على سطح المكتب أو شغّله محليًا بقاعدة بيانات SQLite كاملة.
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs leading-relaxed">
          {/* Option 1: Install as Desktop App (PWA) */}
          <section className="p-4 rounded-2xl border border-[#b7cbbe] bg-[#f4f8f5] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-[#173f2e]">
                أولًا: التثبيت كتطبيق سطح مكتب مستقل (بدون شريط متصفح)
              </h4>
              {isInstalled && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-[#173f2e] text-white">
                  مثبّت حاليًا
                </span>
              )}
            </div>
            <p className="text-[#46534b]">
              يدعم التطبيق التثبيت المباشر على <strong>Windows 10</strong> عبر متصفح{' '}
              <strong>Microsoft Edge</strong> أو <strong>Google Chrome</strong> ليظهر بأيقونة على
              سطح المكتب وقائمة ابدأ ويعمل في نافذة مستقلة:
            </p>
            {isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] text-white"
              >
                <MonitorDown className="w-4 h-4" aria-hidden="true" />
                <span>تثبيت التطبيق الآن على ويندوز ١٠</span>
              </button>
            ) : (
              <ol className="list-decimal list-inside space-y-1 text-[#17211d] font-bold">
                <li>افتح التطبيق في Microsoft Edge أو Google Chrome على ويندوز ١٠.</li>
                <li>
                  من شريط العنوان اضغط أيقونة التثبيت، أو من القائمة (<strong>⋯</strong>) اختر{' '}
                  <strong>التطبيقات (Apps) ← تثبيت هذا الموقع كتطبيق</strong>.
                </li>
                <li>فعّل خيار «تثبيت على سطح المكتب / شريط المهام» للوصول الفوري.</li>
              </ol>
            )}
          </section>

          {/* Option 2: Run locally on Windows 10 with SQLite */}
          <section className="p-4 rounded-2xl border border-[#d9dfdb] bg-[#fafbf9] space-y-3">
            <h4 className="text-sm font-black text-[#17211d]">
              ثانيًا: التشغيل المحلي الكامل على جهاز ويندوز ١٠ (بقاعدة بيانات القرص)
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-[#46534b] font-semibold">
              <li>
                ثبّت برنامج <strong className="text-[#17211d]">Node.js 22 LTS</strong> (أو أحدث) على
                ويندوز ١٠.
              </li>
              <li>
                انقل مجلد التطبيق إلى أي قرص (مثل{' '}
                <code dir="ltr" className="font-mono font-bold text-[#173f2e]">
                  D:\MansarfApp
                </code>
                ).
              </li>
              <li>
                اضغط نقرًا مزدوجًا على ملف{' '}
                <code dir="ltr" className="font-mono font-bold text-[#173f2e]">
                  start-windows.bat
                </code>{' '}
                الموجود في مجلد المشروع؛ سيقوم تلقائيًا بالبناء وتشغيل الخادم وفتح التطبيق على{' '}
                <code dir="ltr" className="font-mono font-bold text-[#173f2e]">
                  http://localhost:3000
                </code>
                .
              </li>
              <li>
                تُحفظ قواعد البيانات محليًا داخل مجلد{' '}
                <code dir="ltr" className="font-mono font-bold text-[#173f2e]">
                  local-db\
                </code>{' '}
                ويمكنك تخصيص مسار أي ملف <code dir="ltr">.db</code> أو استيراده في أي وقت.
              </li>
            </ol>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleDownloadBat}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] rounded-xl text-xs font-extrabold bg-white hover:bg-[#e8f0eb] text-[#173f2e] border border-[#b7cbbe] transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تنزيل ملف التشغيل start-windows.bat</span>
              </button>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-[#e8ece9] bg-[#fafbf9] flex justify-end">
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
