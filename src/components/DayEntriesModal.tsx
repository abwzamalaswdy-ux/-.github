import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Pencil, Trash2, X } from 'lucide-react';
import { Entry, NumeralStyle, SheetKey } from '../types/ledger';
import {
  SHEETS,
  formatEntryDateDisplay,
  formatNum,
  formatQtyWithUnit,
  roundQty,
} from '../utils/ledgerLogic';
import { SwipeToDeleteItem } from './SwipeToDeleteItem';

interface DayEntriesModalProps {
  open: boolean;
  initialDay: number | null;
  sheet: SheetKey;
  periodLabel: string;
  entries: Entry[];
  unit: string;
  numeralStyle: NumeralStyle;
  readOnly: boolean;
  onClose: () => void;
  onEditEntry: (entry: Entry) => void;
  onDeleteEntry: (entryId: string) => void;
  onDeleteDayEntries: (day: number, entryIds: string[]) => void;
}

export function DayEntriesModal({
  open,
  initialDay,
  sheet,
  periodLabel,
  entries,
  unit,
  numeralStyle,
  readOnly,
  onClose,
  onEditEntry,
  onDeleteEntry,
  onDeleteDayEntries,
}: DayEntriesModalProps) {
  const realEntries = useMemo(
    () => entries.filter((e) => Number(e.qty) > 0 || e.desc.trim().length > 0),
    [entries]
  );

  const dayGroups = useMemo(() => {
    const map = new Map<number, { day: number; entries: Entry[]; totalQty: number }>();
    for (const e of realEntries) {
      if (!map.has(e.day)) {
        map.set(e.day, { day: e.day, entries: [], totalQty: 0 });
      }
      const g = map.get(e.day)!;
      g.entries.push(e);
      g.totalQty = roundQty(g.totalQty + (Number(e.qty) || 0));
    }
    return [...map.values()].sort((a, b) => a.day - b.day);
  }, [realEntries]);

  const [selectedDay, setSelectedDay] = useState<number>(initialDay ?? 1);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDeleteDay(false);
    if (initialDay && dayGroups.some((g) => g.day === initialDay)) {
      setSelectedDay(initialDay);
    } else if (dayGroups.length > 0) {
      setSelectedDay(dayGroups[0].day);
    }
  }, [open, initialDay, dayGroups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeGroup = dayGroups.find((g) => g.day === selectedDay) ?? dayGroups[0] ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-entries-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#101a14]/65 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e8ece9] bg-[#fafbf9]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center shrink-0"
              aria-hidden="true"
            >
              <CalendarDays className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="day-entries-title" className="text-base font-black text-[#17211d] truncate">
                إدارة قيود يوم محدد — {SHEETS[sheet]}
              </h3>
              <p className="text-xs text-[#647069]">
                الفترة: {periodLabel} · استعرض وعدّل أو احذف كل قيد على حدة أو احذف جميع قيود اليوم
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {dayGroups.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#647069] border border-dashed border-[#d9dfdb] rounded-xl">
              لا توجد قيود مسجلة في {SHEETS[sheet]} ضمن الفترة الحالية.
            </div>
          ) : (
            <>
              {/* Active Day Selector Pills */}
              <div>
                <div className="text-xs font-extrabold text-[#46534b] mb-2">
                  اختر اليوم ({formatNum(dayGroups.length, numeralStyle)} أيام نشطة):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dayGroups.map((g) => {
                    const active = activeGroup?.day === g.day;
                    return (
                      <button
                        key={g.day}
                        type="button"
                        onClick={() => {
                          setSelectedDay(g.day);
                          setConfirmDeleteDay(false);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors ${
                          active
                            ? 'bg-[#173f2e] text-white border-[#173f2e]'
                            : 'bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border-[#d9dfdb]'
                        }`}
                      >
                        <span>يوم {formatNum(g.day, numeralStyle)}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] tabular-nums ${
                            active ? 'bg-white/20 text-white' : 'bg-white text-[#647069]'
                          }`}
                        >
                          {formatNum(g.entries.length, numeralStyle)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeGroup && (
                <>
                  {/* Day Summary & Bulk Day Delete Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#f7f8f6] border border-[#e5e9e5]">
                    <div className="text-xs font-bold text-[#46534b] flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-[#17211d]">
                        قيود يوم {formatNum(activeGroup.day, numeralStyle)}
                      </span>
                      <span>·</span>
                      <span>{formatNum(activeGroup.entries.length, numeralStyle)} قيد</span>
                      <span>·</span>
                      <span className="text-[#173f2e] font-black">
                        الإجمالي: {formatQtyWithUnit(activeGroup.totalQty, numeralStyle, unit)}
                      </span>
                    </div>

                    {!readOnly && (
                      confirmDeleteDay ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteDayEntries(
                                activeGroup.day,
                                activeGroup.entries.map((e) => e.id)
                              );
                              setConfirmDeleteDay(false);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#b93f37] hover:bg-[#9e3029] text-white transition-colors"
                          >
                            تأكيد حذف كل قيود يوم {formatNum(activeGroup.day, numeralStyle)}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDay(false)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-[#647069] border border-[#d9dfdb]"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDay(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] text-[#9e3029] border border-[#f0ceca] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>حذف قيود يوم {formatNum(activeGroup.day, numeralStyle)}</span>
                        </button>
                      )
                    )}
                  </div>

                  {/* Tablet / Touch Swipe-to-Delete Cards */}
                  <div className="lg:hidden space-y-2.5">
                    {!readOnly && (
                      <p className="text-[11px] font-bold text-[#647069]">
                        اسحب أي قيد يمينًا أو يسارًا للحذف السريع، أو اضغط تعديل لتحرير تفاصيله.
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {activeGroup.entries.map((entry, idx) => (
                        <SwipeToDeleteItem
                          key={entry.id}
                          disabled={readOnly}
                          deleteLabel="حذف القيد"
                          onDelete={() => onDeleteEntry(entry.id)}
                          className="border border-[#d9dfdb]"
                        >
                          <div className="p-3.5 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-black text-[#17211d] truncate">
                                  {formatNum(idx + 1, numeralStyle)}. {entry.name}
                                </div>
                                <div className="text-[11px] text-[#647069] mt-0.5">
                                  {formatEntryDateDisplay(entry, numeralStyle)}
                                  {entry.desc ? ` · ${entry.desc}` : ''}
                                </div>
                              </div>
                              <span className="text-xs font-black text-[#173f2e] tabular-nums shrink-0">
                                {formatQtyWithUnit(entry.qty, numeralStyle, unit)}
                              </span>
                            </div>

                            {!readOnly && (
                              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[#edf0ed]">
                                <button
                                  type="button"
                                  onClick={() => onEditEntry(entry)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border border-[#d9dfdb]"
                                >
                                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>تعديل</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteEntry(entry.id)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] text-[#9e3029] border border-[#f0ceca]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </SwipeToDeleteItem>
                      ))}
                    </div>
                  </div>

                  {/* Desktop Individual Entries Table */}
                  <div className="hidden lg:block overflow-x-auto rounded-xl border border-[#d9dfdb]">
                    <table className="w-full text-right border-collapse text-xs tabular-nums" dir="rtl">
                      <thead>
                        <tr className="bg-[#173f2e] text-white font-extrabold">
                          <th className="py-2.5 px-3 border-l border-[#275943] w-10 text-center">
                            م.
                          </th>
                          <th className="py-2.5 px-3 border-l border-[#275943]">المستفيد</th>
                          <th className="py-2.5 px-3 border-l border-[#275943]">التاريخ</th>
                          <th className="py-2.5 px-3 border-l border-[#275943]">الوصف / البيان</th>
                          <th className="py-2.5 px-3 border-l border-[#275943] text-center">
                            الكمية
                          </th>
                          <th className="py-2.5 px-3 text-center w-28">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf0ed]">
                        {activeGroup.entries.map((entry, idx) => (
                          <tr key={entry.id} className="hover:bg-[#f7faf8]">
                            <td className="py-2.5 px-3 border-l border-[#edf0ed] text-center text-[#647069]">
                              {formatNum(idx + 1, numeralStyle)}
                            </td>
                            <td className="py-2.5 px-3 border-l border-[#edf0ed] font-bold text-[#17211d]">
                              {entry.name}
                            </td>
                            <td className="py-2.5 px-3 border-l border-[#edf0ed] whitespace-nowrap text-[#46534b]">
                              {formatEntryDateDisplay(entry, numeralStyle)}
                            </td>
                            <td className="py-2.5 px-3 border-l border-[#edf0ed] text-[#647069]">
                              {entry.desc || '—'}
                            </td>
                            <td className="py-2.5 px-3 border-l border-[#edf0ed] text-center font-black text-[#173f2e] whitespace-nowrap">
                              {formatQtyWithUnit(entry.qty, numeralStyle, unit)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  disabled={readOnly}
                                  onClick={() => onEditEntry(entry)}
                                  title="تعديل هذا القيد"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-40 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb]"
                                >
                                  <Pencil className="w-3 h-3" aria-hidden="true" />
                                  <span>تعديل</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={readOnly}
                                  onClick={() => onDeleteEntry(entry.id)}
                                  title="حذف هذا القيد"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-40 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca]"
                                >
                                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
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
