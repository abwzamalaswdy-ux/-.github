import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FileSpreadsheet, FileUp, PlusCircle, Sparkles, X } from 'lucide-react';

interface ImportPanelProps {
  readOnly?: boolean;
  onParsePaste: (text: string) => boolean;
  onImportCsvFile: (file: File) => void;
  onDownloadTemplate: () => void;
  onLoadSampleData: () => void;
  onOpenQuickAdd: () => void;
  onClose?: () => void;
}

export function ImportPanel({
  readOnly = false,
  onParsePaste,
  onImportCsvFile,
  onDownloadTemplate,
  onLoadSampleData,
  onOpenQuickAdd,
  onClose,
}: ImportPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    const ok = onParsePaste(pasteValue);
    if (ok) {
      setPasteValue('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportCsvFile(file);
    }
    e.target.value = '';
  };

  return (
    <section className="bg-white border border-[#d9dfdb] rounded-2xl shadow-[0_8px_28px_rgba(24,44,34,0.06)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#edf0ed]">
        <div>
          <h3 className="text-base font-extrabold text-[#17211d]">إضافة واستيراد القيود</h3>
          <p className="text-xs text-[#647069] mt-0.5">
            أضف قيدًا مباشرًا أو استورد CSV أو الصق نص القيود؛ تتم المعالجة محليًا داخل جهازك فقط.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={readOnly}
            onClick={onOpenQuickAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none text-white transition-colors whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>قيد مباشر</span>
          </button>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069] hover:text-[#17211d]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
            >
              <span>{collapsed ? 'إظهار' : 'إخفاء'}</span>
              {collapsed ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {(onClose || !collapsed) && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)] gap-5">
          <div>
            <label
              htmlFor="pasteInput"
              className="block text-xs font-extrabold text-[#46534b] mb-2"
            >
              الصق القيود هنا
            </label>
            <textarea
              id="pasteInput"
              value={pasteValue}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={(e) => setPasteValue(e.target.value)}
              placeholder="الصق نص القيود… يقبل الاسم قبل -- والكمية بعد .كمية.، أو صيغة متعددة الأسطر."
              className="w-full min-h-[110px] resize-y border border-[#d8dfda] rounded-xl px-3.5 py-2.5 bg-[#fcfdfc] disabled:bg-[#f2f4f2] disabled:text-[#647069] text-sm text-[#17211d] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30 focus:border-[#173f2e]"
            />

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                disabled={readOnly}
                onClick={handleParse}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none text-white transition-colors whitespace-nowrap"
              >
                <span>تحليل وإضافة القيود</span>
              </button>

              <button
                type="button"
                disabled={readOnly}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#eaf1fd] hover:bg-[#dce8fb] disabled:opacity-45 disabled:pointer-events-none text-[#174c9c] border border-[#d7e4f8] transition-colors whitespace-nowrap"
              >
                <FileUp className="w-4 h-4" aria-hidden="true" />
                <span>استيراد CSV</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                disabled={readOnly}
                accept=".csv,.txt,text/csv,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={onDownloadTemplate}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                <span>نموذج CSV</span>
              </button>

              <button
                type="button"
                disabled={readOnly}
                onClick={onLoadSampleData}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#fbf1df] hover:bg-[#f6e6c8] disabled:opacity-45 disabled:pointer-events-none text-[#845315] border border-[#f2e0bd] transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>إدراج بيانات تجريبية</span>
              </button>

              {pasteValue && !readOnly && (
                <button
                  type="button"
                  onClick={() => setPasteValue('')}
                  className="inline-flex items-center justify-center px-3 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#647069] border border-[#d9dfdb] transition-colors whitespace-nowrap"
                >
                  مسح النص
                </button>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
            <h4 className="text-xs font-extrabold text-[#17211d] mb-2">صيغة نصية مقترحة</h4>
            <pre
              dir="rtl"
              className="m-0 p-3 rounded-lg bg-white border border-[#e1e5e2] text-[#415047] font-mono text-xs leading-loose whitespace-pre-wrap"
            >
              {`اسم المستفيد -- الوصف\nتاريخ الصرف: 29/11/2026\n.كمية. 40`}
            </pre>
            <p className="text-[11px] text-[#647069] mt-2 leading-relaxed">
              اسم المستفيد يؤخذ من النص السابق لـ <code className="font-mono">--</code>، والكمية من
              الرقم بعد <code className="font-mono">.كمية.</code>؛ ويُستخدم رقم اليوم من التاريخ. يمكن
              أيضًا استيراد CSV بأعمدة: المستفيد، التاريخ/اليوم، الوصف، الكمية.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
