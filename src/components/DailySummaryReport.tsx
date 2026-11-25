import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  FileImage,
  FileSpreadsheet,
  Pencil,
  Printer,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  DailySummaryRow,
  Entry,
  NumeralStyle,
  ReportScope,
  ReportSort,
} from '../types/ledger';
import {
  SHEETS,
  buildDailySummaryRows,
  csvEscape,
  downloadBlob,
  formatFullDateLabel,
  formatNum,
  formatPeriodLabel,
  formatQtyWithUnit,
  roundQty,
} from '../utils/ledgerLogic';
import { DailyDisbursementChart } from './DailyDisbursementChart';

interface DailySummaryReportProps {
  entries: Entry[];
  period: string;
  unit: string;
  numeralStyle: NumeralStyle;
  readOnly: boolean;
  onUnitChange: (unit: string) => void;
  onNumeralStyleChange: (style: NumeralStyle) => void;
  onPrintReport: (opts: {
    rows: DailySummaryRow[];
    scope: ReportScope;
    showSheetBreakdown: boolean;
  }) => void;
  onExportPngReport: (opts: {
    rows: DailySummaryRow[];
    scope: ReportScope;
    showSheetBreakdown: boolean;
  }) => void;
  onExportExcelReport: (opts: {
    rows: DailySummaryRow[];
    scope: ReportScope;
    showSheetBreakdown: boolean;
  }) => void;
  onNotify: (msg: string) => void;
  onOpenQuickAdd: () => void;
  onEditEntry: (entry: Entry) => void;
  onDeleteEntry: (entryId: string) => void;
  onDeleteDayEntries: (entryIds: string[], dayLabel: string) => void;
}

export function DailySummaryReport({
  entries,
  period,
  unit,
  numeralStyle,
  readOnly,
  onUnitChange,
  onNumeralStyleChange,
  onPrintReport,
  onExportPngReport,
  onExportExcelReport,
  onNotify,
  onOpenQuickAdd,
  onEditEntry,
  onDeleteEntry,
  onDeleteDayEntries,
}: DailySummaryReportProps) {
  const [scope, setScope] = useState<ReportScope>('all');
  const [sort, setSort] = useState<ReportSort>('date_asc');
  const [showSheetBreakdown, setShowSheetBreakdown] = useState(false);
  const [includeEmptyDays, setIncludeEmptyDays] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [confirmEntryId, setConfirmEntryId] = useState<string | null>(null);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<{
    entryIds: string[];
    dayLabel: string;
    count: number;
    totalQty: number;
  } | null>(null);

  useEffect(() => {
    if (!readOnly) return;
    setConfirmEntryId(null);
    setConfirmDeleteDay(null);
  }, [readOnly]);

  const rows = useMemo(
    () => buildDailySummaryRows(entries, period, scope, sort, includeEmptyDays),
    [entries, period, scope, sort, includeEmptyDays]
  );

  const totals = useMemo(() => {
    let qty = 0;
    let count = 0;
    let order = 0;
    let dispatch = 0;
    let single = 0;
    let maxQty = 0;
    let peakDayLabel = '—';

    for (const r of rows) {
      qty = roundQty(qty + r.totalQty);
      count += r.entryCount;
      order = roundQty(order + r.bySheet.order);
      dispatch = roundQty(dispatch + r.bySheet.dispatch);
      single = roundQty(single + r.bySheet.single);
      if (r.totalQty > maxQty) {
        maxQty = r.totalQty;
        peakDayLabel = formatFullDateLabel(r, period, numeralStyle).primary;
      }
    }

    const activeDays = rows.filter((r) => r.entryCount > 0).length;
    const avgDaily = activeDays > 0 ? roundQty(qty / activeDays) : 0;

    return { qty, count, order, dispatch, single, maxQty, peakDayLabel, activeDays, avgDaily };
  }, [rows, period, numeralStyle]);

  const handleExportCsv = () => {
    if (!rows.length) {
      onNotify('لا توجد بيانات للتصدير في هذا النطاق.');
      return;
    }

    const headers = showSheetBreakdown
      ? ['التاريخ', 'الكمية', 'الوحدة', 'عدد القيود', 'عدد المستفيدين', SHEETS.order, SHEETS.dispatch, SHEETS.single]
      : ['التاريخ', 'الكمية', 'الوحدة', 'عدد القيود', 'عدد المستفيدين'];

    const lines = [headers.map(csvEscape).join(',')];

    for (const r of rows) {
      const dateStr = formatFullDateLabel(r, period, numeralStyle).primary;
      const base = [dateStr, r.totalQty, unit, r.entryCount, r.beneficiaryCount];
      if (showSheetBreakdown) {
        base.push(r.bySheet.order, r.bySheet.dispatch, r.bySheet.single);
      }
      lines.push(base.map(csvEscape).join(','));
    }

    const totalRow = showSheetBreakdown
      ? ['الإجمالي', totals.qty, unit, totals.count, '', totals.order, totals.dispatch, totals.single]
      : ['الإجمالي', totals.qty, unit, totals.count, ''];
    lines.push(totalRow.map(csvEscape).join(','));

    const filename = `تقرير_المنصرف_حسب_التاريخ_${formatPeriodLabel(period).replace('/', '-')}.csv`;
    downloadBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
    onNotify(`تم تصدير تقرير ${formatNum(rows.length, numeralStyle)} يومًا بصيغة CSV.`);
  };

  const handleCopyText = async () => {
    if (!rows.length) {
      onNotify('لا توجد بيانات لنسخها.');
      return;
    }

    const scopeTitle = scope === 'all' ? 'جميع الكشوفات' : SHEETS[scope];
    const headerLines = [
      `تقرير المنصرف الإجمالي بحسب التاريخ`,
      `الفترة: ${formatPeriodLabel(period)} | النطاق: ${scopeTitle}`,
      `─────────────────────────`,
      `التاريخ  |  الكمية  |  عدد القيود`,
    ];

    const bodyLines = rows.map((r) => {
      const dateTxt = formatFullDateLabel(r, period, numeralStyle).primary;
      const qtyTxt = formatQtyWithUnit(r.totalQty, numeralStyle, unit);
      const countTxt = formatNum(r.entryCount, numeralStyle);
      return `${dateTxt}  |  ${qtyTxt}  |  ${countTxt}`;
    });

    const footerLines = [
      `─────────────────────────`,
      `الإجمالي: ${formatQtyWithUnit(totals.qty, numeralStyle, unit)} | ${formatNum(
        totals.count,
        numeralStyle
      )} قيد`,
    ];

    try {
      await navigator.clipboard.writeText([...headerLines, ...bodyLines, ...footerLines].join('\n'));
      setCopiedText(true);
      onNotify('تم نسخ ملخص التقرير النصي إلى الحافظة.');
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      onNotify('تعذر النسخ التلقائي؛ يمكنك التصدير بصيغة CSV أو PDF.');
    }
  };

  return (
    <section className="space-y-4">
      {/* Report Summary & Controls Header */}
      <div className="bg-white border border-[#d9dfdb] rounded-2xl shadow-[0_8px_28px_rgba(24,44,34,0.06)] overflow-hidden">
        <div className="p-5 border-b border-[#edf0ed] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs font-extrabold text-[#215a41] mb-1">
              التقرير التجميعي اليومي · {formatPeriodLabel(period)}
            </div>
            <h3 className="text-lg font-black text-[#17211d]">
              تقرير المنصرف الإجمالي بحسب التاريخ
            </h3>
            <p className="text-xs text-[#647069] mt-0.5">
              يجمع كافة قيود المنصرف المسجلة في نفس التاريخ ويعرض إجمالي الكمية وعدد القيود لكل يوم.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onPrintReport({ rows, scope, showSheetBreakdown })}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 text-white transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>طباعة / PDF</span>
            </button>

            <button
              type="button"
              onClick={() => onExportPngReport({ rows, scope, showSheetBreakdown })}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#eaf1fd] hover:bg-[#dce8fb] disabled:opacity-45 text-[#174c9c] border border-[#d7e4f8] transition-colors whitespace-nowrap"
            >
              <FileImage className="w-4 h-4" aria-hidden="true" />
              <span>تصدير PNG</span>
            </button>

            <button
              type="button"
              onClick={() => onExportExcelReport({ rows, scope, showSheetBreakdown })}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#e8f0eb] hover:bg-[#dce8e1] disabled:opacity-45 text-[#173f2e] border border-[#b7cbbe] transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-45 text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#fbf1df] hover:bg-[#f6e6c8] disabled:opacity-45 text-[#845315] border border-[#f2e0bd] transition-colors whitespace-nowrap"
            >
              {copiedText ? (
                <Check className="w-4 h-4 text-[#173f2e]" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{copiedText ? 'تم النسخ' : 'نسخ كنص'}</span>
            </button>
          </div>
        </div>

        {/* Filter & Format Controls Bar */}
        <div className="px-5 py-3.5 bg-[#f7f8f6] border-b border-[#edf0ed] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#46534b]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#173f2e]" aria-hidden="true" />
              <span>النطاق:</span>
            </div>

            <div
              role="group"
              aria-label="نطاق الكشوفات في التقرير"
              className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-[#d9dfdb]"
            >
              {(
                [
                  ['all', 'جميع الكشوفات'],
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
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

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#46534b]">
              <span>الترتيب:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ReportSort)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#d8dfda] bg-white text-xs font-bold text-[#17211d]"
              >
                <option value="date_asc">التاريخ (تصاعدي)</option>
                <option value="date_desc">التاريخ (تنازلي)</option>
                <option value="qty_desc">الأعلى كمية</option>
                <option value="count_desc">الأكثر قيودًا</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#46534b]">
              <span>الوحدة:</span>
              <input
                type="text"
                value={unit}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={(e) => !readOnly && onUnitChange(e.target.value)}
                placeholder="لتر"
                aria-label="وحدة القياس"
                className="w-16 min-h-[34px] px-2 py-1 text-center rounded-lg border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] disabled:text-[#647069] disabled:cursor-not-allowed text-xs font-bold text-[#17211d]"
              />
            </label>

            <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-white border border-[#d9dfdb]">
              <button
                type="button"
                onClick={() => onNumeralStyleChange('ar')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                  numeralStyle === 'ar'
                    ? 'bg-[#ede6d6] text-[#173f2e]'
                    : 'text-[#647069] hover:text-[#17211d]'
                }`}
              >
                ٢٩
              </button>
              <button
                type="button"
                onClick={() => onNumeralStyleChange('en')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                  numeralStyle === 'en'
                    ? 'bg-[#ede6d6] text-[#173f2e]'
                    : 'text-[#647069] hover:text-[#17211d]'
                }`}
              >
                29
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#46534b] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSheetBreakdown}
                onChange={(e) => setShowSheetBreakdown(e.target.checked)}
                className="w-4 h-4 accent-[#173f2e]"
              />
              <span>تفصيل الكشوفات</span>
            </label>

            {period !== 'all' && (
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#46534b] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeEmptyDays}
                  onChange={(e) => setIncludeEmptyDays(e.target.checked)}
                  className="w-4 h-4 accent-[#173f2e]"
                />
                <span>كل أيام الشهر</span>
              </label>
            )}
          </div>
        </div>

        {/* Report Quick Insights Strip */}
        {rows.length > 0 && (
          <div className="px-5 py-3.5 border-b border-[#edf0ed] grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#fcfdfc]">
            <div className="px-3.5 py-2.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
              <div className="text-[11px] font-bold text-[#647069]">الأيام التي تم فيها الصرف</div>
              <div className="text-lg font-black text-[#173f2e] tabular-nums mt-0.5">
                {formatNum(totals.activeDays, numeralStyle)} يوم
              </div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
              <div className="text-[11px] font-bold text-[#647069]">إجمالي الكمية المنصرفة</div>
              <div className="text-lg font-black text-[#173f2e] tabular-nums mt-0.5">
                {formatQtyWithUnit(totals.qty, numeralStyle, unit)}
              </div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
              <div className="text-[11px] font-bold text-[#647069]">إجمالي عدد القيود</div>
              <div className="text-lg font-black text-[#173f2e] tabular-nums mt-0.5">
                {formatNum(totals.count, numeralStyle)} قيد
              </div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-[#ede6d6]/55 border border-[#e2d8c0]">
              <div className="text-[11px] font-bold text-[#645942]">أعلى يوم صرفًا</div>
              <div className="text-lg font-black text-[#173f2e] tabular-nums mt-0.5">
                تاريخ {totals.peakDayLabel} · {formatQtyWithUnit(totals.maxQty, numeralStyle, unit)}
              </div>
            </div>
          </div>
        )}

        {/* Daily Summary Table */}
        {rows.length === 0 ? (
          <div className="py-12 px-5 text-center text-[#647069]">
            <div className="w-12 h-12 rounded-2xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center mx-auto mb-3 text-xl font-bold">
              ≣
            </div>
            <strong className="block text-base text-[#17211d] mb-1">
              لا توجد قيود منصرف في الفترة والنطاق المحددين
            </strong>
            <p className="text-sm mb-4">
              أضف قيودًا عبر الاستيراد أو القيد المباشر لتظهر التجميعات اليومية هنا فورًا.
            </p>
            <button
              type="button"
              disabled={readOnly}
              onClick={onOpenQuickAdd}
              className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none text-white transition-colors"
            >
              إضافة قيد جديد
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse tabular-nums" dir="rtl">
              <thead>
                <tr className="bg-[#173f2e] text-white text-sm font-extrabold">
                  <th className="py-3 px-4 border-l border-[#275943] w-36">التاريخ</th>
                  <th className="py-3 px-4 border-l border-[#275943]">الكمية</th>
                  <th className="py-3 px-4 border-l border-[#275943] w-36">عدد القيود</th>
                  {showSheetBreakdown && (
                    <>
                      <th className="py-3 px-3 border-l border-[#275943] text-xs">
                        {SHEETS.order}
                      </th>
                      <th className="py-3 px-3 border-l border-[#275943] text-xs">
                        {SHEETS.dispatch}
                      </th>
                      <th className="py-3 px-3 border-l border-[#275943] text-xs">
                        {SHEETS.single}
                      </th>
                    </>
                  )}
                  <th className="py-3 px-4 border-l border-[#275943] hidden md:table-cell w-52">
                    النسبة من أعلى يوم
                  </th>
                  <th className="py-3 px-4 w-44">التفاصيل / إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d9dfdb] text-sm">
                {rows.map((r) => {
                  const dateInfo = formatFullDateLabel(r, period, numeralStyle);
                  const isExpanded = expandedKey === r.key;
                  const pct = totals.maxQty > 0 ? Math.round((r.totalQty / totals.maxQty) * 100) : 0;

                  return (
                    <React.Fragment key={r.key}>
                      <tr className="hover:bg-[#f7faf8] transition-colors">
                        <td className="py-3 px-4 bg-[#ede6d6]/70 border-l border-[#d9dfdb] font-extrabold text-[#17211d]">
                          <div className="text-base leading-tight">{dateInfo.primary}</div>
                          {dateInfo.secondary && (
                            <div className="text-[11px] font-semibold text-[#647069] mt-0.5">
                              {dateInfo.secondary}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 border-l border-[#d9dfdb] font-black text-base text-[#173f2e]">
                          {formatQtyWithUnit(r.totalQty, numeralStyle, unit)}
                        </td>

                        <td className="py-3 px-4 border-l border-[#d9dfdb] font-extrabold text-[#17211d]">
                          {formatNum(r.entryCount, numeralStyle)}
                        </td>

                        {showSheetBreakdown && (
                          <>
                            <td className="py-3 px-3 border-l border-[#d9dfdb] text-xs font-bold text-[#46534b]">
                              {r.bySheet.order ? formatNum(r.bySheet.order, numeralStyle) : '—'}
                            </td>
                            <td className="py-3 px-3 border-l border-[#d9dfdb] text-xs font-bold text-[#46534b]">
                              {r.bySheet.dispatch
                                ? formatNum(r.bySheet.dispatch, numeralStyle)
                                : '—'}
                            </td>
                            <td className="py-3 px-3 border-l border-[#d9dfdb] text-xs font-bold text-[#46534b]">
                              {r.bySheet.single ? formatNum(r.bySheet.single, numeralStyle) : '—'}
                            </td>
                          </>
                        )}

                        <td className="py-3 px-4 border-l border-[#d9dfdb] hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2.5 rounded-full bg-[#e8f0eb] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#173f2e] transition-all duration-200"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-[#647069] w-10 text-left">
                              {formatNum(pct, numeralStyle)}%
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {r.entryCount > 0 ? (
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setExpandedKey(isExpanded ? null : r.key)}
                                aria-expanded={isExpanded}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#f7f8f6] hover:bg-[#e8f0eb] text-[#173f2e] border border-[#d9dfdb] transition-colors whitespace-nowrap"
                              >
                                <span>{isExpanded ? 'إخفاء' : 'عرض القيود'}</span>
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>

                              <button
                                type="button"
                                disabled={readOnly}
                                onClick={() =>
                                  !readOnly &&
                                  setConfirmDeleteDay({
                                    entryIds: r.entries.map((item) => item.id),
                                    dayLabel: dateInfo.primary,
                                    count: r.entryCount,
                                    totalQty: r.totalQty,
                                  })
                                }
                                title={`حذف جميع قيود تاريخ ${dateInfo.primary}`}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-40 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca] transition-colors whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>حذف اليوم</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-[#9aa79f]">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Day Drill-down */}
                      {isExpanded && r.entries.length > 0 && (
                        <tr>
                          <td
                            colSpan={showSheetBreakdown ? 8 : 5}
                            className="p-4 bg-[#f7f8f6] text-right border-b border-[#cbd4cd]"
                          >
                            <div className="text-xs font-extrabold text-[#173f2e] mb-2.5">
                              تفاصيل قيود تاريخ {dateInfo.primary} ({formatNum(r.entryCount, numeralStyle)}{' '}
                              قيد · {formatNum(r.beneficiaryCount, numeralStyle)} مستفيد):
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-[#d9dfdb] bg-white">
                              <table className="w-full text-right border-collapse text-xs">
                                <thead>
                                  <tr className="bg-[#edf1ee] text-[#365244] font-extrabold">
                                    <th className="py-2 px-3 border-l border-[#d9dfdb] w-12 text-center">
                                      م.
                                    </th>
                                    <th className="py-2 px-3 border-l border-[#d9dfdb]">المستفيد</th>
                                    <th className="py-2 px-3 border-l border-[#d9dfdb]">الكشف</th>
                                    <th className="py-2 px-3 border-l border-[#d9dfdb]">الوصف</th>
                                    <th className="py-2 px-3 border-l border-[#d9dfdb] text-center">
                                      الكمية
                                    </th>
                                    <th className="py-2 px-3 text-center w-36">إجراء</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#edf0ed]">
                                  {r.entries.map((item, idx) => {
                                    const isConfirming = confirmEntryId === item.id;
                                    return (
                                      <tr key={item.id} className="hover:bg-[#fafbf9]">
                                        <td className="py-2 px-3 border-l border-[#edf0ed] text-center text-[#647069]">
                                          {formatNum(idx + 1, numeralStyle)}
                                        </td>
                                        <td className="py-2 px-3 border-l border-[#edf0ed] font-bold text-[#17211d]">
                                          {item.name}
                                        </td>
                                        <td className="py-2 px-3 border-l border-[#edf0ed] text-[#46534b]">
                                          {SHEETS[item.sheet]}
                                        </td>
                                        <td className="py-2 px-3 border-l border-[#edf0ed] text-[#647069]">
                                          {item.desc || '—'}
                                        </td>
                                        <td className="py-2 px-3 border-l border-[#edf0ed] text-center font-extrabold text-[#173f2e]">
                                          {formatQtyWithUnit(item.qty, numeralStyle, unit)}
                                        </td>
                                        <td className="py-2 px-2 text-center">
                                          {isConfirming && !readOnly ? (
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  onDeleteEntry(item.id);
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
                                                onClick={() => onEditEntry(item)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-40 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb]"
                                              >
                                                <Pencil className="w-3 h-3" aria-hidden="true" />
                                                <span>تعديل</span>
                                              </button>
                                              <button
                                                type="button"
                                                disabled={readOnly}
                                                onClick={() => setConfirmEntryId(item.id)}
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
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Grand Total Row */}
                <tr className="bg-[#e6ece7] text-[#173f2e] font-black text-base border-t-2 border-[#173f2e]">
                  <td className="py-3.5 px-4 border-l border-[#c4d0c7]">الإجمالي الكلي</td>
                  <td className="py-3.5 px-4 border-l border-[#c4d0c7]">
                    {formatQtyWithUnit(totals.qty, numeralStyle, unit)}
                  </td>
                  <td className="py-3.5 px-4 border-l border-[#c4d0c7]">
                    {formatNum(totals.count, numeralStyle)}
                  </td>
                  {showSheetBreakdown && (
                    <>
                      <td className="py-3.5 px-3 border-l border-[#c4d0c7] text-xs">
                        {formatNum(totals.order, numeralStyle)}
                      </td>
                      <td className="py-3.5 px-3 border-l border-[#c4d0c7] text-xs">
                        {formatNum(totals.dispatch, numeralStyle)}
                      </td>
                      <td className="py-3.5 px-3 border-l border-[#c4d0c7] text-xs">
                        {formatNum(totals.single, numeralStyle)}
                      </td>
                    </>
                  )}
                  <td className="py-3.5 px-4 border-l border-[#c4d0c7] hidden md:table-cell text-xs font-bold">
                    المعدل اليومي: {formatQtyWithUnit(Math.round(totals.avgDaily * 10) / 10, numeralStyle, unit)}
                  </td>
                  <td className="py-3.5 px-4" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DailyDisbursementChart
        rows={rows}
        period={period}
        unit={unit}
        numeralStyle={numeralStyle}
      />

      {confirmDeleteDay && !readOnly && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-del-title"
          onClick={() => setConfirmDeleteDay(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
              <h3 id="daily-del-title" className="text-base font-extrabold text-[#9e3029]">
                تأكيد حذف قيود يوم {confirmDeleteDay.dayLabel}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteDay(null)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-[#17211d] leading-relaxed">
                هل تريد حذف جميع قيود تاريخ <strong>{confirmDeleteDay.dayLabel}</strong> في النطاق
                الحالي ({formatNum(confirmDeleteDay.count, numeralStyle)} قيد بإجمالي{' '}
                {formatQtyWithUnit(confirmDeleteDay.totalQty, numeralStyle, unit)})؟
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteDayEntries(confirmDeleteDay.entryIds, confirmDeleteDay.dayLabel);
                    setConfirmDeleteDay(null);
                  }}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#b93f37] hover:bg-[#9e3029] text-white"
                >
                  تأكيد الحذف
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDay(null)}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
