import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, PieChart } from 'lucide-react';
import { Entry, NumeralStyle, SheetKey } from '../types/ledger';
import {
  SHEETS,
  formatNum,
  formatPeriodLabel,
  formatQtyWithUnit,
  roundQty,
} from '../utils/ledgerLogic';

interface MonthlyVisualStatsProps {
  sheet: SheetKey;
  periodLabel: string;
  sheetEntries: Entry[];
  periodScopedEntries: Entry[];
  allEntries: Entry[];
  unit: string;
  numeralStyle: NumeralStyle;
  onSelectBeneficiary?: (name: string) => void;
}

type VisualScope = 'sheet' | 'month_all';

export function MonthlyVisualStats({
  sheet,
  periodLabel,
  sheetEntries,
  periodScopedEntries,
  allEntries,
  unit,
  numeralStyle,
  onSelectBeneficiary,
}: MonthlyVisualStatsProps) {
  const [expanded, setExpanded] = useState(true);
  const [visualScope, setVisualScope] = useState<VisualScope>('sheet');
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const activeEntries = visualScope === 'sheet' ? sheetEntries : periodScopedEntries;

  const dayStats = useMemo(() => {
    const totals = Array(32).fill(0);
    const counts = Array(32).fill(0);
    for (const e of activeEntries) {
      const qty = roundQty(Number(e.qty) || 0);
      if (qty <= 0 && !e.desc.trim()) continue;
      if (e.day >= 1 && e.day <= 31) {
        totals[e.day] = roundQty(totals[e.day] + qty);
        counts[e.day] += 1;
      }
    }

    let maxQty = 0;
    let peakDay = 0;
    let activeDays = 0;
    let sum = 0;

    for (let d = 1; d <= 31; d++) {
      sum = roundQty(sum + totals[d]);
      if (totals[d] > 0) {
        activeDays++;
        if (totals[d] > maxQty) {
          maxQty = totals[d];
          peakDay = d;
        }
      }
    }

    const avgQty = activeDays > 0 ? roundQty(sum / activeDays) : 0;
    return { totals, counts, maxQty, peakDay, activeDays, sum, avgQty };
  }, [activeEntries]);

  const categoryBreakdown = useMemo(() => {
    const sums: Record<SheetKey, number> = { order: 0, dispatch: 0, single: 0 };
    for (const e of periodScopedEntries) {
      sums[e.sheet] = roundQty(sums[e.sheet] + (Number(e.qty) || 0));
    }
    const total = roundQty(sums.order + sums.dispatch + sums.single);
    return { sums, total };
  }, [periodScopedEntries]);

  const topBeneficiaries = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of activeEntries) {
      const qty = roundQty(Number(e.qty) || 0);
      if (qty <= 0) continue;
      map.set(e.name, roundQty((map.get(e.name) || 0) + qty));
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'))
      .slice(0, 5);
  }, [activeEntries]);

  const monthlyComparison = useMemo(() => {
    const monthMap = new Map<string, number>();
    for (const e of allEntries) {
      if (!e.date || e.date.length < 7) continue;
      const qty = roundQty(Number(e.qty) || 0);
      if (qty <= 0) continue;
      const m = e.date.slice(0, 7);
      monthMap.set(m, roundQty((monthMap.get(m) || 0) + qty));
    }
    const items = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const maxMonth = items.reduce((m, [, val]) => Math.max(m, val), 0);
    return { items, maxMonth };
  }, [allEntries]);

  const selectedDay =
    hoveredDay !== null && hoveredDay >= 1 && hoveredDay <= 31
      ? hoveredDay
      : dayStats.peakDay || 1;

  // SVG Donut ring calculations (radius 38, circumference ~238.76)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const catTotal = categoryBreakdown.total;
  const segments: Array<{ key: SheetKey; color: string; qty: number; pct: number; dash: number; offset: number }> = [];
  let runningDash = 0;
  const catColors: Record<SheetKey, string> = {
    order: '#173f2e',
    dispatch: '#174c9c',
    single: '#b97723',
  };
  (['order', 'dispatch', 'single'] as SheetKey[]).forEach((k) => {
    const qty = categoryBreakdown.sums[k];
    const ratio = catTotal > 0 ? qty / catTotal : 0;
    const dash = ratio * circumference;
    segments.push({
      key: k,
      color: catColors[k],
      qty,
      pct: Math.round(ratio * 100),
      dash,
      offset: -runningDash,
    });
    runningDash += dash;
  });

  const avgLinePct =
    dayStats.maxQty > 0 ? Math.min(96, Math.round((dayStats.avgQty / dayStats.maxQty) * 100)) : 0;

  return (
    <div className="mt-4 pt-4 border-t border-[#edf0ed]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg bg-[#e8f0eb] text-[#173f2e] grid place-items-center"
            aria-hidden="true"
          >
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-[#17211d]">
              الإحصائية الشهرية المرئية — {periodLabel}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {expanded && (
            <div
              role="group"
              aria-label="نطاق الإحصائية المرئية"
              className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[#f7f8f6] border border-[#d9dfdb]"
            >
              <button
                type="button"
                onClick={() => setVisualScope('sheet')}
                aria-pressed={visualScope === 'sheet'}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  visualScope === 'sheet'
                    ? 'bg-[#173f2e] text-white'
                    : 'text-[#46534b] hover:bg-white'
                }`}
              >
                {SHEETS[sheet]}
              </button>
              <button
                type="button"
                onClick={() => setVisualScope('month_all')}
                aria-pressed={visualScope === 'month_all'}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  visualScope === 'month_all'
                    ? 'bg-[#173f2e] text-white'
                    : 'text-[#46534b] hover:bg-white'
                }`}
              >
                كل فئات الفترة
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#46534b] border border-[#d9dfdb] transition-colors"
          >
            <span>{expanded ? 'إخفاء الرسم' : 'إظهار الإحصائية المرئية'}</span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* 1–31 Days Visual Distribution */}
          <div className="lg:col-span-6 p-3.5 rounded-xl bg-[#fcfdfc] border border-[#e5e9e5] flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-extrabold text-[#17211d]">
                توزيع الصرف اليومي (الأيام ١–٣١)
              </span>
              <span className="text-[11px] font-bold text-[#173f2e] bg-[#e8f0eb] px-2.5 py-0.5 rounded-lg tabular-nums">
                يوم {formatNum(selectedDay, numeralStyle)}:{' '}
                {formatQtyWithUnit(dayStats.totals[selectedDay], numeralStyle, unit)} (
                {formatNum(dayStats.counts[selectedDay], numeralStyle)} قيد)
              </span>
            </div>

            {dayStats.maxQty === 0 ? (
              <div className="h-32 flex items-center justify-center text-xs text-[#647069] border border-dashed border-[#d9dfdb] rounded-lg">
                لا توجد كميات مسجلة لعرض الرسم اليومي.
              </div>
            ) : (
              <div className="relative pt-3">
                {/* Average dashed reference line */}
                {avgLinePct > 0 && (
                  <div
                    className="absolute right-0 left-0 border-t border-dashed border-[#b97723]/70 pointer-events-none z-10 flex justify-end"
                    style={{ bottom: `calc(${avgLinePct * 0.78}% + 20px)` }}
                  >
                    <span className="text-[9px] font-bold text-[#845315] bg-[#fcfdfc]/90 px-1 -mt-2 rounded tabular-nums">
                      المتوسط: {formatNum(Math.round(dayStats.avgQty * 10) / 10, numeralStyle)}
                    </span>
                  </div>
                )}

                <div className="h-32 flex items-end gap-[3px] border-b border-[#d9dfdb] pb-1">
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = i + 1;
                    const qty = dayStats.totals[d];
                    const hPct =
                      qty > 0 ? Math.max(8, Math.round((qty / dayStats.maxQty) * 100)) : 3;
                    const isSelected = d === selectedDay;
                    const isPeak = d === dayStats.peakDay;

                    return (
                      <button
                        key={d}
                        type="button"
                        onMouseEnter={() => setHoveredDay(d)}
                        onFocus={() => setHoveredDay(d)}
                        onClick={() => setHoveredDay(d)}
                        title={`يوم ${d}: ${formatQtyWithUnit(qty, numeralStyle, unit)}`}
                        className="flex-1 h-full flex flex-col items-center justify-end gap-0.5 cursor-pointer focus:outline-none group"
                      >
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t transition-all duration-150 ${
                              qty === 0
                                ? 'bg-[#edf1ee]'
                                : isSelected
                                ? 'bg-[#173f2e]'
                                : isPeak
                                ? 'bg-[#215a41]'
                                : 'bg-[#7fa893] group-hover:bg-[#173f2e]'
                            }`}
                            style={{ height: `${hPct}%` }}
                          />
                        </div>
                        <span
                          className={`text-[9px] tabular-nums leading-none ${
                            d === 1 || d % 5 === 0 || d === 31 || isSelected
                              ? isSelected
                                ? 'font-black text-[#173f2e]'
                                : 'font-bold text-[#647069]'
                              : 'text-transparent sm:text-[#9aa79f]'
                          }`}
                        >
                          {d}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Category Share Donut Chart */}
          <div className="lg:col-span-3 p-3.5 rounded-xl bg-[#fcfdfc] border border-[#e5e9e5] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-extrabold text-[#17211d]">توزيع الفئات</span>
              <PieChart className="w-3.5 h-3.5 text-[#173f2e]" aria-hidden="true" />
            </div>

            <div className="flex items-center gap-3 my-auto">
              <div className="relative w-24 h-24 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#edf1ee"
                    strokeWidth="13"
                  />
                  {catTotal > 0 &&
                    segments.map((seg) =>
                      seg.dash > 0 ? (
                        <circle
                          key={seg.key}
                          cx="50"
                          cy="50"
                          r={radius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="13"
                          strokeDasharray={`${seg.dash} ${circumference}`}
                          strokeDashoffset={seg.offset}
                        />
                      ) : null
                    )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-[10px] font-bold text-[#647069]">الإجمالي</span>
                  <span className="text-xs font-black text-[#173f2e] tabular-nums leading-tight">
                    {formatNum(catTotal, numeralStyle)}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-1.5 text-[11px]">
                {segments.map((seg) => (
                  <div key={seg.key} className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="font-bold text-[#3d4a43] truncate">
                        {SHEETS[seg.key]}
                      </span>
                    </div>
                    <span className="font-black text-[#17211d] tabular-nums shrink-0">
                      {formatNum(seg.pct, numeralStyle)}٪
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top 5 Beneficiaries Horizontal Bars */}
          <div className="lg:col-span-3 p-3.5 rounded-xl bg-[#fcfdfc] border border-[#e5e9e5] flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-extrabold text-[#17211d]">أعلى ٥ مستفيدين</span>
              <span className="text-[10px] font-bold text-[#647069]">انقر للتصفية</span>
            </div>

            {topBeneficiaries.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[#647069]">
                لا توجد قيود بعد
              </div>
            ) : (
              <div className="space-y-2">
                {topBeneficiaries.map(([name, qty]) => {
                  const maxBen = topBeneficiaries[0][1];
                  const pct = maxBen > 0 ? Math.max(8, Math.round((qty / maxBen) * 100)) : 0;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onSelectBeneficiary?.(name)}
                      className="w-full text-right group cursor-pointer focus:outline-none"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-0.5">
                        <span className="font-bold text-[#17211d] group-hover:text-[#173f2e] group-hover:underline truncate">
                          {name}
                        </span>
                        <span className="font-black text-[#173f2e] tabular-nums shrink-0">
                          {formatQtyWithUnit(qty, numeralStyle, unit)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#e8f0eb] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#173f2e] group-hover:bg-[#215a41] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Multi-Month Comparison Strip (appears when data spans multiple months) */}
          {monthlyComparison.items.length > 1 && (
            <div className="lg:col-span-12 p-3 rounded-xl bg-[#fbf8f1] border border-[#e3d9c3]">
              <div className="text-[11px] font-black text-[#645942] mb-2">
                مقارنة إجمالي الصرف الشهري ({formatNum(monthlyComparison.items.length, numeralStyle)}{' '}
                أشهر)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {monthlyComparison.items.map(([mKey, mQty]) => {
                  const pct =
                    monthlyComparison.maxMonth > 0
                      ? Math.max(6, Math.round((mQty / monthlyComparison.maxMonth) * 100))
                      : 0;
                  return (
                    <div
                      key={mKey}
                      className="p-2 rounded-lg bg-white border border-[#e5decb] space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-[#645942] tabular-nums">
                          {formatPeriodLabel(mKey)}
                        </span>
                        <span className="text-[#173f2e] font-black tabular-nums">
                          {formatQtyWithUnit(mQty, numeralStyle, unit)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#ede6d6] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#173f2e]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
