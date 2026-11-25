import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { DailySummaryRow, NumeralStyle } from '../types/ledger';
import {
  SHEETS,
  formatFullDateLabel,
  formatNum,
  formatQtyWithUnit,
  roundQty,
} from '../utils/ledgerLogic';

interface DailyDisbursementChartProps {
  rows: DailySummaryRow[];
  period: string;
  unit: string;
  numeralStyle: NumeralStyle;
}

export function DailyDisbursementChart({
  rows,
  period,
  unit,
  numeralStyle,
}: DailyDisbursementChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const chartData = useMemo(() => {
    const ordered = [...rows].sort((a, b) => a.key.localeCompare(b.key));
    const maxQty = ordered.reduce((m, r) => Math.max(m, r.totalQty), 0);
    let orderSum = 0;
    let dispatchSum = 0;
    let singleSum = 0;
    for (const r of ordered) {
      orderSum = roundQty(orderSum + r.bySheet.order);
      dispatchSum = roundQty(dispatchSum + r.bySheet.dispatch);
      singleSum = roundQty(singleSum + r.bySheet.single);
    }
    const grand = roundQty(orderSum + dispatchSum + singleSum);
    return { ordered, maxQty, orderSum, dispatchSum, singleSum, grand };
  }, [rows]);

  if (chartData.ordered.length === 0 || chartData.maxQty === 0) return null;

  const activeRow =
    chartData.ordered.find((r) => r.key === hoveredKey) ||
    chartData.ordered.reduce((best, r) => (r.totalQty > best.totalQty ? r : best), chartData.ordered[0]);

  const activeDateInfo = formatFullDateLabel(activeRow, period, numeralStyle);

  const orderPct = chartData.grand > 0 ? Math.round((chartData.orderSum / chartData.grand) * 100) : 0;
  const dispatchPct =
    chartData.grand > 0 ? Math.round((chartData.dispatchSum / chartData.grand) * 100) : 0;
  const singlePct = Math.max(0, 100 - orderPct - dispatchPct);

  return (
    <div className="bg-white border border-[#d9dfdb] rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_rgba(24,44,34,0.04)] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg bg-[#e8f0eb] text-[#173f2e] grid place-items-center"
            aria-hidden="true"
          >
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-black text-[#17211d]">التحليل البصري للمنصرف اليومي</h4>
            <p className="text-[11px] text-[#647069]">
              مرّر المؤشر أو انقر على أي عمود لعرض تفاصيل اليوم.
            </p>
          </div>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5] text-xs font-bold text-[#17211d] tabular-nums">
          <span className="text-[#647069]">التاريخ: </span>
          <span className="text-[#173f2e] font-black">{activeDateInfo.primary}</span>
          <span className="mx-1.5 text-[#cbd4cd]">|</span>
          <span>{formatQtyWithUnit(activeRow.totalQty, numeralStyle, unit)}</span>
          <span className="mx-1.5 text-[#cbd4cd]">|</span>
          <span className="text-[#647069]">
            {formatNum(activeRow.entryCount, numeralStyle)} قيد
          </span>
        </div>
      </div>

      {/* Responsive Bar Chart */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[420px] h-44 flex items-end gap-1.5 px-2 pt-4 pb-1 border-b border-[#e5e9e5]">
          {chartData.ordered.map((r) => {
            const pct = chartData.maxQty > 0 ? Math.max(4, Math.round((r.totalQty / chartData.maxQty) * 100)) : 4;
            const isActive = activeRow.key === r.key;
            const label = formatFullDateLabel(r, period, numeralStyle).primary;
            return (
              <button
                key={r.key}
                type="button"
                onMouseEnter={() => setHoveredKey(r.key)}
                onFocus={() => setHoveredKey(r.key)}
                onClick={() => setHoveredKey(r.key)}
                title={`${label}: ${formatQtyWithUnit(r.totalQty, numeralStyle, unit)} (${formatNum(
                  r.entryCount,
                  numeralStyle
                )} قيد)`}
                className="flex-1 min-w-[20px] max-w-[46px] h-full flex flex-col items-center justify-end gap-1 group cursor-pointer focus:outline-none"
              >
                <div className="w-full flex-1 flex items-end justify-center">
                  <div
                    className={`w-full max-w-[26px] rounded-t-lg transition-all duration-150 ${
                      r.totalQty === 0
                        ? 'bg-[#e8ece9]'
                        : isActive
                        ? 'bg-[#173f2e] shadow-[0_4px_10px_rgba(23,63,46,0.28)]'
                        : 'bg-[#7aa38e] group-hover:bg-[#215a41]'
                    }`}
                    style={{ height: `${r.totalQty === 0 ? 4 : pct}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] tabular-nums truncate max-w-full ${
                    isActive ? 'font-black text-[#173f2e]' : 'font-semibold text-[#647069]'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Distribution Bar */}
      {chartData.grand > 0 && (
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-[#edf1ee]">
            {orderPct > 0 && (
              <div
                className="h-full bg-[#173f2e]"
                style={{ width: `${orderPct}%` }}
                title={`${SHEETS.order}: ${orderPct}%`}
              />
            )}
            {dispatchPct > 0 && (
              <div
                className="h-full bg-[#174c9c]"
                style={{ width: `${dispatchPct}%` }}
                title={`${SHEETS.dispatch}: ${dispatchPct}%`}
              />
            )}
            {singlePct > 0 && (
              <div
                className="h-full bg-[#b97723]"
                style={{ width: `${singlePct}%` }}
                title={`${SHEETS.single}: ${singlePct}%`}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-[#46534b] tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#173f2e]" />
              {SHEETS.order}: {formatQtyWithUnit(chartData.orderSum, numeralStyle, unit)} (
              {formatNum(orderPct, numeralStyle)}٪)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#174c9c]" />
              {SHEETS.dispatch}: {formatQtyWithUnit(chartData.dispatchSum, numeralStyle, unit)} (
              {formatNum(dispatchPct, numeralStyle)}٪)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#b97723]" />
              {SHEETS.single}: {formatQtyWithUnit(chartData.singleSum, numeralStyle, unit)} (
              {formatNum(singlePct, numeralStyle)}٪)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
