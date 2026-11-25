import { useMemo } from 'react';
import { Award, CalendarClock, TrendingUp, Users } from 'lucide-react';
import { Entry, NumeralStyle, SheetKey } from '../types/ledger';
import {
  SHEETS,
  buildBeneficiaryRows,
  formatNum,
  formatQtyWithUnit,
  roundQty,
} from '../utils/ledgerLogic';

import { MonthlyVisualStats } from './MonthlyVisualStats';

interface BeneficiariesDashboardProps {
  sheet: SheetKey;
  periodLabel: string;
  entries: Entry[];
  periodScopedEntries: Entry[];
  allEntries: Entry[];
  unit: string;
  numeralStyle: NumeralStyle;
  onSelectBeneficiary?: (name: string) => void;
}

export function BeneficiariesDashboard({
  sheet,
  periodLabel,
  entries,
  periodScopedEntries,
  allEntries,
  unit,
  numeralStyle,
  onSelectBeneficiary,
}: BeneficiariesDashboardProps) {
  const stats = useMemo(() => {
    const rows = buildBeneficiaryRows(entries, '');
    const dailyTotals = Array(32).fill(0);

    let totalQty = 0;
    let topName = '';
    let topQty = 0;
    let activeBeneficiaries = 0;

    for (const r of rows) {
      let rowSum = 0;
      for (let d = 1; d <= 31; d++) {
        const val = roundQty(Number(r.days[d]) || 0);
        rowSum = roundQty(rowSum + val);
        dailyTotals[d] = roundQty(dailyTotals[d] + val);
      }
      totalQty = roundQty(totalQty + rowSum);
      if (rowSum > 0) activeBeneficiaries++;
      if (rowSum > topQty) {
        topQty = rowSum;
        topName = r.name;
      }
    }

    let activeDays = 0;
    let peakDay = 0;
    let peakDayQty = 0;

    for (let d = 1; d <= 31; d++) {
      if (dailyTotals[d] > 0) {
        activeDays++;
        if (dailyTotals[d] > peakDayQty) {
          peakDayQty = dailyTotals[d];
          peakDay = d;
        }
      }
    }

    const dailyAvg = activeDays > 0 ? totalQty / activeDays : 0;
    const beneficiaryAvg = activeBeneficiaries > 0 ? totalQty / activeBeneficiaries : 0;
    const topSharePct = totalQty > 0 ? Math.round((topQty / totalQty) * 100) : 0;

    return {
      totalQty,
      topName,
      topQty,
      topSharePct,
      activeDays,
      dailyAvg,
      peakDay,
      peakDayQty,
      activeBeneficiaries,
      beneficiaryAvg,
    };
  }, [entries]);

  return (
    <section
      aria-label={`لوحة مؤشرات ${SHEETS[sheet]}`}
      className="bg-white border border-[#d9dfdb] rounded-2xl p-4 shadow-[0_4px_16px_rgba(24,44,34,0.04)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black text-[#17211d]">
            لوحة مؤشرات المستفيدين — {SHEETS[sheet]}
          </h3>
        </div>
        <span className="text-[11px] font-bold text-[#647069]">
          إحصائيات فورية للكميات المنصرفة في الكشف المحدد
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Top Consuming Beneficiary */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#fbf8f1] border border-[#e3d9c3]">
          <div
            className="w-9 h-9 rounded-lg bg-[#ede6d6] text-[#173f2e] grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <Award className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-[#645942]">
              أكثر مستفيد استهلاكًا
            </div>
            {stats.topName ? (
              <>
                <button
                  type="button"
                  onClick={() => onSelectBeneficiary?.(stats.topName)}
                  title={`تصفية الجدول باسم ${stats.topName}`}
                  className="mt-0.5 block max-w-full truncate text-sm font-black text-[#17211d] hover:text-[#173f2e] hover:underline text-right cursor-pointer"
                >
                  {stats.topName}
                </button>
                <div className="mt-0.5 text-xs font-bold text-[#173f2e] tabular-nums">
                  {formatQtyWithUnit(stats.topQty, numeralStyle, unit)} ·{' '}
                  <span className="text-[#645942]">
                    {formatNum(stats.topSharePct, numeralStyle)}٪ من الكشف
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-1 text-xs font-bold text-[#8a8270]">لا توجد بيانات صرف بعد</div>
            )}
          </div>
        </div>

        {/* Daily Average Disbursement */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
          <div
            className="w-9 h-9 rounded-lg bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-[#647069]">متوسط الصرف اليومي</div>
            <div className="mt-0.5 text-base font-black text-[#173f2e] tabular-nums">
              {stats.activeDays > 0
                ? formatQtyWithUnit(Math.round(stats.dailyAvg * 10) / 10, numeralStyle, unit)
                : '—'}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#647069] tabular-nums">
              {stats.activeDays > 0
                ? `عبر ${formatNum(stats.activeDays, numeralStyle)} يوم صرف نشط`
                : 'بدون أيام صرف مسجلة'}
            </div>
          </div>
        </div>

        {/* Peak Disbursement Day */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
          <div
            className="w-9 h-9 rounded-lg bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <CalendarClock className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-[#647069]">أعلى يوم صرفًا</div>
            <div className="mt-0.5 text-base font-black text-[#173f2e] tabular-nums">
              {stats.peakDay > 0
                ? `اليوم ${formatNum(stats.peakDay, numeralStyle)}`
                : '—'}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#647069] tabular-nums">
              {stats.peakDay > 0
                ? formatQtyWithUnit(stats.peakDayQty, numeralStyle, unit)
                : 'لا توجد كميات مسجلة'}
            </div>
          </div>
        </div>

        {/* Average per Beneficiary */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
          <div
            className="w-9 h-9 rounded-lg bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
            aria-hidden="true"
          >
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-[#647069]">
              متوسط استهلاك المستفيد
            </div>
            <div className="mt-0.5 text-base font-black text-[#173f2e] tabular-nums">
              {stats.activeBeneficiaries > 0
                ? formatQtyWithUnit(
                    Math.round(stats.beneficiaryAvg * 10) / 10,
                    numeralStyle,
                    unit
                  )
                : '—'}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-[#647069] tabular-nums">
              {stats.activeBeneficiaries > 0
                ? `${formatNum(stats.activeBeneficiaries, numeralStyle)} مستفيد فعّال`
                : 'لا يوجد مستفيدون بكميات'}
            </div>
          </div>
        </div>
      </div>

      <MonthlyVisualStats
        sheet={sheet}
        periodLabel={periodLabel}
        sheetEntries={entries}
        periodScopedEntries={periodScopedEntries}
        allEntries={allEntries}
        unit={unit}
        numeralStyle={numeralStyle}
        onSelectBeneficiary={onSelectBeneficiary}
      />
    </section>
  );
}
