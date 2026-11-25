import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  Contrast,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileUp,
  Laptop,
  LayoutGrid,
  Lock,
  PenTool,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Undo2,
  Upload,
  UserCheck,
} from 'lucide-react';

interface HeaderToolsMenuProps {
  activeDailyReport: boolean;
  canUndo: boolean;
  readOnly: boolean;
  highContrast: boolean;
  isDefaultPassword: boolean;
  activeDbLabel?: string;
  onToggleReadOnly: () => void;
  onToggleHighContrast: () => void;
  onOpenQuickAdd: () => void;
  onOpenImport: () => void;
  onLoadSampleData: () => void;
  onDownloadTemplate: () => void;
  onOpenBeneficiaryReport: () => void;
  onToggleDailyReport: () => void;
  onOpenExport: () => void;
  onExportCurrentExcel: () => void;
  onExportAllExcel: () => void;
  onExportCurrentCsv: () => void;
  onOpenSignature: () => void;
  onUndo: () => void;
  onOpenDatabase: () => void;
  onOpenSecurity: () => void;
  onOpenWindowsGuide: () => void;
  onLockApp: () => void;
}

export function HeaderToolsMenu({
  activeDailyReport,
  canUndo,
  readOnly,
  highContrast,
  isDefaultPassword,
  activeDbLabel,
  onToggleReadOnly,
  onToggleHighContrast,
  onOpenQuickAdd,
  onOpenImport,
  onLoadSampleData,
  onDownloadTemplate,
  onOpenBeneficiaryReport,
  onToggleDailyReport,
  onOpenExport,
  onExportCurrentExcel,
  onExportAllExcel,
  onExportCurrentCsv,
  onOpenSignature,
  onUndo,
  onOpenDatabase,
  onOpenSecurity,
  onOpenWindowsGuide,
  onLockApp,
}: HeaderToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const runAction = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="فتح قائمة أدوات التطبيق"
        className={`inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-extrabold border transition-colors whitespace-nowrap cursor-pointer ${
          open
            ? 'bg-white text-[#173f2e] border-white shadow-md'
            : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
        }`}
      >
        <LayoutGrid className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>الأدوات</span>
        {isDefaultPassword && (
          <span
            className="w-2 h-2 rounded-full bg-[#f5c451] shrink-0"
            title="تنبيه أمان متاح"
            aria-hidden="true"
          />
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="قائمة أدوات كشوفات المنصرف"
          className="absolute left-0 mt-2 w-72 sm:w-80 max-h-[78vh] overflow-y-auto rounded-2xl bg-white text-[#17211d] border border-[#d9dfdb] shadow-2xl z-50 p-2 flex flex-col gap-1"
        >
          {/* Section 1: Data Entry & Import */}
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-black text-[#647069] tracking-wide">
            الإدخال والاستيراد
          </div>

          <button
            type="button"
            role="menuitem"
            disabled={readOnly}
            onClick={() => runAction(onOpenQuickAdd)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-right text-xs font-extrabold text-white bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none transition-colors"
          >
            <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">إضافة قيد منصرف مباشر</span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={readOnly}
            onClick={() => runAction(onOpenImport)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] disabled:opacity-45 disabled:pointer-events-none transition-colors"
          >
            <FileUp className="w-4 h-4 shrink-0 text-[#174c9c]" aria-hidden="true" />
            <span className="flex-1">استيراد CSV أو لصق القيود</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onDownloadTemplate)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 text-[#46534b]" aria-hidden="true" />
            <span className="flex-1">تنزيل نموذج CSV</span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={readOnly}
            onClick={() => runAction(onLoadSampleData)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#845315] hover:bg-[#fbf1df]/70 disabled:opacity-45 disabled:pointer-events-none transition-colors"
          >
            <Sparkles className="w-4 h-4 shrink-0 text-[#845315]" aria-hidden="true" />
            <span className="flex-1">إدراج بيانات تجريبية</span>
          </button>

          <div className="my-1 border-t border-[#edf0ed]" />

          {/* Section 2: Reports & Exports */}
          <div className="px-2.5 pt-1 pb-1 text-[10px] font-black text-[#647069] tracking-wide">
            التقارير والتصدير
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenBeneficiaryReport)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <UserCheck className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">تقرير مستفيد (جميع الفئات)</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onToggleDailyReport)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold transition-colors ${
              activeDailyReport
                ? 'bg-[#ede6d6] text-[#173f2e]'
                : 'text-[#17211d] hover:bg-[#f2f6f3]'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">التقرير الإجمالي بالتاريخ</span>
            {activeDailyReport && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white text-[#173f2e]">
                مفتوح
              </span>
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenExport)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">تصدير PDF / PNG / Excel</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onExportCurrentExcel)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-extrabold text-[#173f2e] bg-[#f2f7f4] hover:bg-[#e5efe9] transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">تصدير الكشف الحالي Excel</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#cfe0d5] text-[#173f2e]">
              .xlsx
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onExportAllExcel)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#173f2e] hover:bg-[#f2f6f3] transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 text-[#215a41]" aria-hidden="true" />
            <span className="flex-1">تصدير جميع الكشوفات Excel</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f7f8f6] border border-[#d9dfdb] text-[#46534b]">
              .xlsx
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onExportCurrentCsv)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <Download className="w-4 h-4 shrink-0 text-[#46534b]" aria-hidden="true" />
            <span className="flex-1">تصدير الكشف الحالي CSV</span>
          </button>

          <div className="my-1 border-t border-[#edf0ed]" />

          {/* Section 3: Tools, Signature & Security */}
          <div className="px-2.5 pt-1 pb-1 text-[10px] font-black text-[#647069] tracking-wide">
            التحرير والأمان
          </div>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={readOnly}
            onClick={() => runAction(onToggleReadOnly)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-extrabold transition-colors ${
              readOnly
                ? 'bg-[#fbf1df] text-[#845315] border border-[#ebd4aa]'
                : 'text-[#17211d] hover:bg-[#f2f6f3]'
            }`}
          >
            <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">وضع القراءة فقط</span>
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                readOnly ? 'bg-white text-[#845315]' : 'bg-[#edf0ed] text-[#647069]'
              }`}
            >
              {readOnly ? 'مفعّل' : 'معطّل'}
            </span>
          </button>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={highContrast}
            onClick={() => runAction(onToggleHighContrast)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-extrabold transition-colors ${
              highContrast
                ? 'bg-[#e8f0eb] text-[#173f2e] border border-[#b7cbbe]'
                : 'text-[#17211d] hover:bg-[#f2f6f3]'
            }`}
          >
            <Contrast className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">وضع التباين العالي</span>
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                highContrast ? 'bg-[#173f2e] text-white' : 'bg-[#edf0ed] text-[#647069]'
              }`}
            >
              {highContrast ? 'مفعّل' : 'معطّل'}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={readOnly || !canUndo}
            onClick={() => runAction(onUndo)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] disabled:opacity-45 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-4 h-4 shrink-0 text-[#46534b]" aria-hidden="true" />
            <span className="flex-1">تراجع عن آخر تعديل</span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f7f8f6] border border-[#d9dfdb] text-[#647069]">
              Ctrl+Z
            </kbd>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenSignature)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <PenTool className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">التوقيع والمخوّل</span>
            {readOnly && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#fbf1df] text-[#845315]">
                قراءة
              </span>
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenDatabase)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-extrabold text-[#173f2e] bg-[#f2f7f4] hover:bg-[#e5efe9] transition-colors"
          >
            <Database className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">قاعدة البيانات المحلية (.db)</span>
            {activeDbLabel && (
              <span
                dir="ltr"
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#cfe0d5] text-[#173f2e] max-w-[96px] truncate"
                title={activeDbLabel}
              >
                {activeDbLabel}
              </span>
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenWindowsGuide)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <Laptop className="w-4 h-4 shrink-0 text-[#174c9c]" aria-hidden="true" />
            <span className="flex-1">التشغيل والتثبيت على ويندوز ١٠</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onOpenSecurity)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-bold text-[#17211d] hover:bg-[#f2f6f3] transition-colors"
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#173f2e]" aria-hidden="true" />
            <span className="flex-1">إعدادات التطبيق والأمان</span>
            {isDefaultPassword && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#fbf1df] text-[#845315]">
                تنبيه
              </span>
            )}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onLockApp)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-right text-xs font-extrabold text-[#9e3029] bg-[#fff5f4] hover:bg-[#fde2e0] border border-[#f5d5d2] mt-0.5 transition-colors"
          >
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">قفل التطبيق</span>
          </button>
        </div>
      )}
    </div>
  );
}
