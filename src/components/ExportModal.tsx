import React, { useState } from 'react';
import { CalendarDays, FileImage, FileSpreadsheet, Printer, UserCheck, X } from 'lucide-react';
import { SheetKey } from '../types/ledger';
import { SHEETS } from '../utils/ledgerLogic';

interface ExportModalProps {
  open: boolean;
  defaultSheet: SheetKey;
  periodLabel: string;
  onClose: () => void;
  onPrintLedger: (sheets: SheetKey[]) => void;
  onExportLedgerPng: (sheets: SheetKey[]) => void;
  onExportLedgerExcel: (sheets: SheetKey[]) => void;
  onOpenDailyReport: () => void;
  onOpenBeneficiaryReport: () => void;
}

export function ExportModal({
  open,
  defaultSheet,
  periodLabel,
  onClose,
  onPrintLedger,
  onExportLedgerPng,
  onExportLedgerExcel,
  onOpenDailyReport,
  onOpenBeneficiaryReport,
}: ExportModalProps) {
  const [selectedSheets, setSelectedSheets] = useState<Set<SheetKey>>(new Set([defaultSheet]));

  React.useEffect(() => {
    if (open) {
      setSelectedSheets(new Set([defaultSheet]));
    }
  }, [open, defaultSheet]);

  if (!open) return null;

  const toggleSheet = (key: SheetKey) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chosen = [...selectedSheets];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-xl bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
          <h3 id="export-dialog-title" className="text-base font-extrabold text-[#17211d]">
            تصدير الكشوفات والتقارير
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069] hover:text-[#17211d]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-[#647069] leading-relaxed">
            اختر الكشوفات التفصيلية للتصدير. يمكنك التصدير إلى ملف Excel (.xlsx) متعدد الأوراق مع
            معادلات الجمع التلقائية، أو طباعة A4 أفقي (25 مستفيدًا/صفحة)، أو PNG بدقة 8K.
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            {(Object.entries(SHEETS) as Array<[SheetKey, string]>).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[#d9dfdb] bg-[#fbfcfb] font-extrabold text-sm text-[#17211d] cursor-pointer hover:bg-[#f3f6f4]"
              >
                <input
                  type="checkbox"
                  checked={selectedSheets.has(key)}
                  onChange={() => toggleSheet(key)}
                  className="w-4 h-4 accent-[#173f2e]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#647069]">
            <span>الفترة الحالية:</span>
            <strong className="text-[#173f2e]">{periodLabel}</strong>
            <span>·</span>
            <span>عدد الأيام في الكشف: 1–31</span>
          </div>

          <div className="pt-2 border-t border-[#edf0ed] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-[#17211d]">
                  التقرير الإجمالي بحسب التاريخ
                </div>
                <div className="text-[11px] text-[#647069]">
                  تجميع الكمية وعدد القيود لكل يوم (مثال: ٢٩ — ٤٥٠ لتر — ١٥).
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDailyReport();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#ede6d6] hover:bg-[#e5dbc4] text-[#173f2e] transition-colors whitespace-nowrap"
              >
                <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                <span>فتح التقرير اليومي</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#f3f5f3]">
              <div>
                <div className="text-xs font-extrabold text-[#17211d]">
                  تقرير المنصرف بحسب اسم المستفيد
                </div>
                <div className="text-[11px] text-[#647069]">
                  كشف تفصيلي للمستفيد من جميع الفئات مع تمييز كل فئة وإظهار التواريخ.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBeneficiaryReport();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#e8f0eb] hover:bg-[#dce8e1] text-[#173f2e] transition-colors whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تقرير مستفيد</span>
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-[#e8ece9] bg-[#fafbf9] flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => onExportLedgerExcel(chosen)}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#e8f0eb] hover:bg-[#dce8e1] disabled:opacity-45 text-[#173f2e] border border-[#b7cbbe] transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
            <span>تصدير Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => onPrintLedger(chosen)}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 text-white transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>طباعة / حفظ PDF</span>
          </button>

          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => onExportLedgerPng(chosen)}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#eaf1fd] hover:bg-[#dce8fb] disabled:opacity-45 text-[#174c9c] border border-[#d7e4f8] transition-colors"
          >
            <FileImage className="w-4 h-4" aria-hidden="true" />
            <span>تصدير PNG 8K</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
