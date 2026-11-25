import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileImage,
  FileSpreadsheet,
  Pencil,
  Printer,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { Entry, NumeralStyle, ReportScope, SheetKey } from '../types/ledger';
import {
  BeneficiaryStatement,
  SHEETS,
  SHEET_STYLES,
  buildBeneficiaryStatement,
  csvEscape,
  downloadBlob,
  formatEntryDateDisplay,
  formatNum,
  formatPeriodLabel,
  formatQtyWithUnit,
  getAllBeneficiaryNames,
} from '../utils/ledgerLogic';

interface BeneficiaryReportModalProps {
  open: boolean;
  initialBeneficiary: string;
  entries: Entry[];
  period: string;
  unit: string;
  numeralStyle: NumeralStyle;
  readOnly: boolean;
  onClose: () => void;
  onEditEntry: (entry: Entry) => void;
  onDeleteEntry: (entryId: string) => void;
  onPrintReport: (opts: { statement: BeneficiaryStatement; scope: ReportScope }) => void;
  onExportPngReport: (opts: { statement: BeneficiaryStatement; scope: ReportScope }) => void;
  onExportExcelReport: (opts: { statement: BeneficiaryStatement; scope: ReportScope }) => void;
  onNotify: (msg: string) => void;
}

export function BeneficiaryReportModal({
  open,
  initialBeneficiary,
  entries,
  period,
  unit,
  numeralStyle,
  readOnly,
  onClose,
  onEditEntry,
  onDeleteEntry,
  onPrintReport,
  onExportPngReport,
  onExportExcelReport,
  onNotify,
}: BeneficiaryReportModalProps) {
  const allNames = useMemo(() => getAllBeneficiaryNames(entries, period), [entries, period]);
  const [selectedName, setSelectedName] = useState(initialBeneficiary);
  const [scope, setScope] = useState<ReportScope>('all');
  const [copiedText, setCopiedText] = useState(false);
  const [confirmEntryId, setConfirmEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (readOnly) setConfirmEntryId(null);
  }, [readOnly]);

  useEffect(() => {
    if (!open) return;
    if (initialBeneficiary && allNames.includes(initialBeneficiary)) {
      setSelectedName(initialBeneficiary);
    } else if (initialBeneficiary) {
      setSelectedName(initialBeneficiary);
    } else if (allNames.length > 0) {
      setSelectedName(allNames[0]);
    } else {
      setSelectedName('');
    }
    setScope('all');
    setCopiedText(false);
    setConfirmEntryId(null);
  }, [open, initialBeneficiary, allNames]);

  const statement = useMemo(
    () => buildBeneficiaryStatement(entries, selectedName, period, scope),
    [entries, selectedName, period, scope]
  );

  if (!open) return null;

  const handleExportCsv = () => {
    if (!statement.beneficiaryName || statement.entries.length === 0) {
      onNotify('لا توجد قيود لهذا المستفيد للتصدير.');
      return;
    }

    const lines = [
      ['المستفيد', 'التاريخ', 'فئة المنصرف', 'الوصف / الملاحظات', 'الكمية', 'الوحدة']
        .map(csvEscape)
        .join(','),
    ];

    for (const entry of statement.entries) {
      lines.push(
        [
          statement.beneficiaryName,
          formatEntryDateDisplay(entry, numeralStyle),
          SHEETS[entry.sheet],
          entry.desc || '',
          entry.qty,
          unit,
        ]
          .map(csvEscape)
          .join(',')
      );
    }

    lines.push('');
    lines.push(['ملخص حسب الفئة', 'الكمية', 'عدد القيود'].map(csvEscape).join(','));
    (['order', 'dispatch', 'single'] as SheetKey[]).forEach((sk) => {
      lines.push(
        [SHEETS[sk], statement.bySheet[sk].qty, statement.bySheet[sk].count]
          .map(csvEscape)
          .join(',')
      );
    });
    lines.push(
      ['الإجمالي الكلي', statement.totalQty, statement.totalCount].map(csvEscape).join(',')
    );

    const filename = `تقرير_المستفيد_${statement.beneficiaryName}_${formatPeriodLabel(period).replace(
      '/',
      '-'
    )}.csv`;
    downloadBlob(
      new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      filename
    );
    onNotify(`تم تصدير تقرير المستفيد «${statement.beneficiaryName}» بصيغة CSV.`);
  };

  const handleCopyText = async () => {
    if (!statement.beneficiaryName || statement.entries.length === 0) {
      onNotify('لا توجد قيود لنسخها.');
      return;
    }

    const header = [
      `تقرير منصرف المستفيد: ${statement.beneficiaryName}`,
      `الفترة: ${formatPeriodLabel(period)} | النطاق: ${
        scope === 'all' ? 'جميع الفئات' : SHEETS[scope]
      }`,
      `─────────────────────────`,
      `• ${SHEETS.order}: ${formatQtyWithUnit(
        statement.bySheet.order.qty,
        numeralStyle,
        unit
      )} (${formatNum(statement.bySheet.order.count, numeralStyle)} قيد)`,
      `• ${SHEETS.dispatch}: ${formatQtyWithUnit(
        statement.bySheet.dispatch.qty,
        numeralStyle,
        unit
      )} (${formatNum(statement.bySheet.dispatch.count, numeralStyle)} قيد)`,
      `• ${SHEETS.single}: ${formatQtyWithUnit(
        statement.bySheet.single.qty,
        numeralStyle,
        unit
      )} (${formatNum(statement.bySheet.single.count, numeralStyle)} قيد)`,
      `─────────────────────────`,
      `التاريخ  |  الفئة  |  الكمية  |  الوصف`,
    ];

    const rowsText = statement.entries.map((e) => {
      const d = formatEntryDateDisplay(e, numeralStyle);
      const c = SHEETS[e.sheet];
      const q = formatQtyWithUnit(e.qty, numeralStyle, unit);
      return `${d}  |  ${c}  |  ${q}${e.desc ? `  |  ${e.desc}` : ''}`;
    });

    const footer = [
      `─────────────────────────`,
      `الإجمالي الكلي: ${formatQtyWithUnit(statement.totalQty, numeralStyle, unit)} (${formatNum(
        statement.totalCount,
        numeralStyle
      )} قيد)`,
    ];

    try {
      await navigator.clipboard.writeText([...header, ...rowsText, ...footer].join('\n'));
      setCopiedText(true);
      onNotify('تم نسخ تقرير المستفيد إلى الحافظة.');
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      onNotify('تعذر النسخ التلقائي؛ استخدم التصدير بصيغة CSV أو PDF.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ben-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#101a14]/65 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e8ece9] bg-[#fafbf9]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="ben-report-title" className="text-base font-black text-[#17211d] truncate">
                تقرير المنصرف بحسب اسم المستفيد
              </h3>
              <p className="text-xs text-[#647069]">
                تجميع الكميات من جميع الفئات مع تمييز فئة المنصرف وإظهار التاريخ لكل عملية
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

        {/* Selector & Category Filter Bar */}
        <div className="px-5 py-3.5 border-b border-[#edf0ed] bg-[#f7f8f6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-[240px] flex-1 max-w-sm">
            <label
              htmlFor="beneficiarySelect"
              className="text-xs font-extrabold text-[#46534b] whitespace-nowrap"
            >
              المستفيد:
            </label>
            <select
              id="beneficiarySelect"
              value={selectedName}
              onChange={(e) => setSelectedName(e.target.value)}
              className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-[#d8dfda] bg-white text-sm font-extrabold text-[#17211d] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
            >
              {allNames.length === 0 ? (
                <option value="">لا يوجد مستفيدون</option>
              ) : (
                allNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))
              )}
            </select>
          </div>

          <div
            role="group"
            aria-label="تصفية حسب فئة المنصرف"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[#d9dfdb]"
          >
            {(
              [
                ['all', 'جميع الفئات'],
                ['order', SHEETS.order],
                ['dispatch', SHEETS.dispatch],
                ['single', SHEETS.single],
              ] as Array<[ReportScope, string]>
            ).map(([key, label]) => {
              const active = scope === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(key)}
                  aria-pressed={active}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#173f2e] text-white'
                      : 'text-[#46534b] hover:bg-[#f3f5f3]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Category Breakdown Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(['order', 'dispatch', 'single'] as SheetKey[]).map((sk) => {
              const st = SHEET_STYLES[sk];
              const bucket = statement.bySheet[sk];
              return (
                <div
                  key={sk}
                  className={`p-3.5 rounded-xl border ${st.cardClass}`}
                >
                  <div className="text-[11px] font-extrabold">{st.label}</div>
                  <div className="text-lg font-black mt-1 tabular-nums">
                    {formatQtyWithUnit(bucket.qty, numeralStyle, unit)}
                  </div>
                  <div className="text-[11px] font-semibold opacity-85 tabular-nums">
                    {formatNum(bucket.count, numeralStyle)} قيد
                  </div>
                </div>
              );
            })}

            <div className="p-3.5 rounded-xl bg-[#173f2e] border border-[#173f2e] text-white">
              <div className="text-[11px] font-extrabold text-[#d8e7dd]">
                الإجمالي ({scope === 'all' ? 'جميع الفئات' : SHEETS[scope]})
              </div>
              <div className="text-lg font-black mt-1 tabular-nums">
                {formatQtyWithUnit(statement.totalQty, numeralStyle, unit)}
              </div>
              <div className="text-[11px] font-semibold text-[#d8e7dd] tabular-nums">
                {formatNum(statement.totalCount, numeralStyle)} قيد · {formatPeriodLabel(period)}
              </div>
            </div>
          </div>

          {/* Dated Entries Table */}
          {statement.entries.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl border border-dashed border-[#d9dfdb] text-[#647069] text-sm">
              لا توجد قيود منصرفة مسجلة لهذا المستفيد في الفترة والفئة المحددة.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#d9dfdb]">
              <table className="w-full text-center border-collapse text-sm tabular-nums" dir="rtl">
                <thead>
                  <tr className="bg-[#173f2e] text-white text-xs font-extrabold">
                    <th className="py-2.5 px-3 border-l border-[#275943] w-12">م.</th>
                    <th className="py-2.5 px-3 border-l border-[#275943] w-36">التاريخ</th>
                    <th className="py-2.5 px-3 border-l border-[#275943] w-44">فئة المنصرف</th>
                    <th className="py-2.5 px-3 border-l border-[#275943] text-right">
                      الوصف / الملاحظات
                    </th>
                    <th className="py-2.5 px-3 border-l border-[#275943] w-32">الكمية</th>
                    <th className="py-2.5 px-3 w-36">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ed]">
                  {statement.entries.map((entry, idx) => {
                    const st = SHEET_STYLES[entry.sheet];
                    const isConfirming = confirmEntryId === entry.id;
                    return (
                      <tr key={entry.id} className="hover:bg-[#f7faf8] transition-colors">
                        <td className="py-2.5 px-3 border-l border-[#edf0ed] text-xs text-[#647069]">
                          {formatNum(idx + 1, numeralStyle)}
                        </td>
                        <td className="py-2.5 px-3 border-l border-[#edf0ed] bg-[#ede6d6]/55 font-extrabold text-[#17211d] whitespace-nowrap">
                          {formatEntryDateDisplay(entry, numeralStyle)}
                        </td>
                        <td className="py-2.5 px-3 border-l border-[#edf0ed] whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold ${st.badgeClass}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 border-l border-[#edf0ed] text-right text-xs text-[#46534b]">
                          {entry.desc || '—'}
                        </td>
                        <td className="py-2.5 px-3 border-l border-[#edf0ed] font-black text-[#173f2e] whitespace-nowrap">
                          {formatQtyWithUnit(entry.qty, numeralStyle, unit)}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          {isConfirming && !readOnly ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteEntry(entry.id);
                                  setConfirmEntryId(null);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-extrabold bg-[#b93f37] text-white"
                              >
                                تأكيد
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmEntryId(null)}
                                className="px-2 py-1 rounded text-[11px] font-bold bg-[#f7f8f6] text-[#647069] border border-[#d9dfdb]"
                              >
                                لا
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={readOnly}
                                onClick={() => onEditEntry(entry)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-40 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb]"
                              >
                                <Pencil className="w-3 h-3" aria-hidden="true" />
                                <span>تعديل</span>
                              </button>
                              <button
                                type="button"
                                disabled={readOnly}
                                onClick={() => setConfirmEntryId(entry.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-40 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca]"
                              >
                                <Trash2 className="w-3 h-3" aria-hidden="true" />
                                <span>حذف</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[#e6ece7] text-[#173f2e] font-black border-t-2 border-[#173f2e]">
                    <td className="py-3 px-3 border-l border-[#c4d0c7]" />
                    <td className="py-3 px-3 border-l border-[#c4d0c7]">الإجمالي الكلي</td>
                    <td className="py-3 px-3 border-l border-[#c4d0c7] text-xs">
                      {formatNum(statement.totalCount, numeralStyle)} قيد
                    </td>
                    <td className="py-3 px-3 border-l border-[#c4d0c7]" />
                    <td className="py-3 px-3 border-l border-[#c4d0c7]">
                      {formatQtyWithUnit(statement.totalQty, numeralStyle, unit)}
                    </td>
                    <td className="py-3 px-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Export Actions */}
        <div className="px-5 py-3.5 border-t border-[#e8ece9] bg-[#fafbf9] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!statement.entries.length}
              onClick={() => onPrintReport({ statement, scope })}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 text-white transition-colors"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>طباعة / حفظ PDF</span>
            </button>

            <button
              type="button"
              disabled={!statement.entries.length}
              onClick={() => onExportPngReport({ statement, scope })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#eaf1fd] hover:bg-[#dce8fb] disabled:opacity-45 text-[#174c9c] border border-[#d7e4f8] transition-colors"
            >
              <FileImage className="w-4 h-4" aria-hidden="true" />
              <span>تصدير PNG</span>
            </button>

            <button
              type="button"
              disabled={!statement.entries.length}
              onClick={() => onExportExcelReport({ statement, scope })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#e8f0eb] hover:bg-[#dce8e1] disabled:opacity-45 text-[#173f2e] border border-[#b7cbbe] transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              disabled={!statement.entries.length}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-white hover:bg-[#edf0ed] disabled:opacity-45 text-[#17211d] border border-[#d9dfdb] transition-colors"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              disabled={!statement.entries.length}
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#fbf1df] hover:bg-[#f6e6c8] disabled:opacity-45 text-[#845315] border border-[#f2e0bd] transition-colors"
            >
              {copiedText ? (
                <Check className="w-4 h-4 text-[#173f2e]" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{copiedText ? 'تم النسخ' : 'نسخ كنص'}</span>
            </button>
          </div>

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
