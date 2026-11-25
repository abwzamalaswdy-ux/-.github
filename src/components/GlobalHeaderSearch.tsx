import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpLeft, FileText, Search, User, X } from 'lucide-react';
import { Entry, NumeralStyle, SheetKey } from '../types/ledger';
import { HighlightText } from '../utils/highlightMatch';
import {
  SHEET_STYLES,
  digits,
  formatEntryDateDisplay,
  formatNum,
  formatQtyWithUnit,
  norm,
  roundQty,
} from '../utils/ledgerLogic';

interface GlobalHeaderSearchProps {
  entries: Entry[];
  unit: string;
  numeralStyle: NumeralStyle;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onJumpToBeneficiarySheet: (
    name: string,
    sheet: SheetKey,
    entryDate?: string,
    day?: number,
    highlightQuery?: string
  ) => void;
  onOpenBeneficiaryReport: (name: string, entryDate?: string) => void;
}

type AutocompleteItem =
  | {
      kind: 'beneficiary';
      id: string;
      name: string;
      totalQty: number;
      count: number;
      sheets: SheetKey[];
      primarySheet: SheetKey;
      latestDate?: string;
    }
  | {
      kind: 'entry';
      id: string;
      entry: Entry;
    };

export function GlobalHeaderSearch({
  entries,
  unit,
  numeralStyle,
  inputRef,
  onJumpToBeneficiarySheet,
  onOpenBeneficiaryReport,
}: GlobalHeaderSearchProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const { matchedBeneficiaries, matchedEntries, flatItems } = useMemo(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed) {
      return {
        matchedBeneficiaries: [],
        matchedEntries: [],
        flatItems: [] as AutocompleteItem[],
      };
    }

    const qNorm = norm(trimmed);
    const qDigits = digits(trimmed).trim();

    const benMap = new Map<
      string,
      {
        name: string;
        totalQty: number;
        count: number;
        sheets: Set<SheetKey>;
        primarySheet: SheetKey;
        latestDate?: string;
      }
    >();

    const entryHits: Entry[] = [];

    for (const e of entries) {
      const isPlaceholder = Number(e.qty) === 0 && !e.desc.trim();
      const nameMatch = norm(e.name).includes(qNorm);
      const descMatch = norm(e.desc).includes(qNorm);
      const sheetMatch = norm(SHEET_STYLES[e.sheet].label).includes(qNorm);
      const dateAr = formatEntryDateDisplay(e, 'ar');
      const dateEn = formatEntryDateDisplay(e, 'en');
      const dateMatch =
        (e.date &&
          (e.date.includes(qDigits) || dateEn.includes(qDigits) || dateAr.includes(trimmed))) ||
        (qDigits.length > 0 && /^\d+$/.test(qDigits) && e.day === Number(qDigits));

      if (nameMatch) {
        if (!benMap.has(e.name)) {
          benMap.set(e.name, {
            name: e.name,
            totalQty: 0,
            count: 0,
            sheets: new Set<SheetKey>(),
            primarySheet: e.sheet,
            latestDate: e.date || undefined,
          });
        }
        const bucket = benMap.get(e.name)!;
        bucket.sheets.add(e.sheet);
        if (!isPlaceholder) {
          bucket.totalQty = roundQty(bucket.totalQty + (Number(e.qty) || 0));
          bucket.count += 1;
        }
        if (e.date && (!bucket.latestDate || e.date > bucket.latestDate)) {
          bucket.latestDate = e.date;
        }
      }

      if (!isPlaceholder && (nameMatch || descMatch || sheetMatch || dateMatch)) {
        entryHits.push(e);
      }
    }

    const sortedBeneficiaries = [...benMap.values()]
      .sort((a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name, 'ar'))
      .slice(0, 6);

    const sortedEntries = entryHits
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.day - a.day)
      .slice(0, 8);

    const items: AutocompleteItem[] = [
      ...sortedBeneficiaries.map((b) => ({
        kind: 'beneficiary' as const,
        id: `ben-${b.name}`,
        name: b.name,
        totalQty: b.totalQty,
        count: b.count,
        sheets: [...b.sheets],
        primarySheet: b.primarySheet,
        latestDate: b.latestDate,
      })),
      ...sortedEntries.map((entry) => ({
        kind: 'entry' as const,
        id: `entry-${entry.id}`,
        entry,
      })),
    ];

    return {
      matchedBeneficiaries: sortedBeneficiaries,
      matchedEntries: sortedEntries,
      flatItems: items,
    };
  }, [entries, deferredQuery]);

  useEffect(() => {
    setActiveIndex(flatItems.length > 0 ? 0 : -1);
  }, [deferredQuery, flatItems.length]);

  const hasQuery = query.trim().length > 0;
  const totalResults = flatItems.length;
  const activeItem = activeIndex >= 0 && activeIndex < flatItems.length ? flatItems[activeIndex] : null;

  const selectItem = (item: AutocompleteItem) => {
    setOpen(false);
    if (item.kind === 'beneficiary') {
      onJumpToBeneficiarySheet(item.name, item.primarySheet, item.latestDate, undefined, item.name);
    } else {
      onJumpToBeneficiarySheet(
        item.entry.name,
        item.entry.sheet,
        item.entry.date || undefined,
        item.entry.day,
        query.trim() || item.entry.name
      );
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md min-w-0">
      <div className="relative flex items-center">
        <Search
          className="w-4 h-4 text-[#d6e2da] absolute right-3 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && hasQuery}
          aria-controls="global-search-listbox"
          aria-activedescendant={open && hasQuery && activeItem ? activeItem.id : undefined}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || !hasQuery || flatItems.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => (prev + 1) % flatItems.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => (prev <= 0 ? flatItems.length - 1 : prev - 1));
            } else if (e.key === 'Enter' && activeItem) {
              e.preventDefault();
              selectItem(activeItem);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="ابحث بالاسم أو التاريخ أو الوصف… (Ctrl+K)"
          aria-label="بحث شامل عن مستفيد أو قيد بالاسم أو التاريخ أو ملاحظات الوصف"
          className="w-full min-h-[40px] pr-9 pl-8 py-1.5 rounded-xl bg-white/15 hover:bg-white/20 focus:bg-white text-white focus:text-[#17211d] placeholder:text-[#d6e2da] focus:placeholder:text-[#647069] border border-white/25 focus:border-white text-xs sm:text-sm font-semibold transition-colors focus:outline-none"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            aria-label="مسح البحث"
            className="absolute left-2 w-6 h-6 rounded-md grid place-items-center text-current opacity-75 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Results Dropdown */}
      {open && hasQuery && (
        <div
          id="global-search-listbox"
          role="listbox"
          aria-label="قائمة نتائج البحث التلقائي"
          className="absolute right-0 left-0 sm:min-w-[460px] mt-2 rounded-2xl bg-white text-[#17211d] border border-[#d9dfdb] shadow-2xl z-50 overflow-hidden max-h-[75vh] flex flex-col"
        >
          {totalResults === 0 ? (
            <div className="p-6 text-center text-xs text-[#647069]">
              لا توجد نتائج مطابقة لـ «<strong className="text-[#17211d]">{query.trim()}</strong>»
              في الاسم أو التاريخ أو الوصف.
            </div>
          ) : (
            <div className="overflow-y-auto divide-y divide-[#edf0ed]">
              {/* Matching Beneficiaries */}
              {matchedBeneficiaries.length > 0 && (
                <div className="p-3">
                  <div className="px-2 pb-2 text-[11px] font-black text-[#647069] flex items-center justify-between">
                    <span>
                      المستفيدون ({formatNum(matchedBeneficiaries.length, numeralStyle)})
                    </span>
                    <span className="text-[10px] font-semibold">انقر للانتقال المباشر وتظليل الاسم</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedBeneficiaries.map((b, idx) => {
                      const isActive = activeIndex === idx;
                      return (
                        <div
                          key={b.name}
                          id={`ben-${b.name}`}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() =>
                            selectItem({
                              kind: 'beneficiary',
                              id: `ben-${b.name}`,
                              name: b.name,
                              totalQty: b.totalQty,
                              count: b.count,
                              sheets: [...b.sheets],
                              primarySheet: b.primarySheet,
                              latestDate: b.latestDate,
                            })
                          }
                          className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#e8f0eb] border-[#9bbca8]'
                              : 'bg-[#fafbf9] hover:bg-[#f2f6f3] border-[#e5e9e5]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[#173f2e] shrink-0" aria-hidden="true" />
                              <span className="font-extrabold text-sm text-[#17211d] truncate">
                                <HighlightText text={b.name} query={query} />
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-[#647069]">
                              <span className="font-bold text-[#173f2e] tabular-nums">
                                {formatQtyWithUnit(b.totalQty, numeralStyle, unit)}
                              </span>
                              <span>·</span>
                              <span className="tabular-nums">
                                {formatNum(b.count, numeralStyle)} قيد
                              </span>
                              <span>·</span>
                              <span className="flex flex-wrap gap-1">
                                {[...b.sheets].map((sk) => (
                                  <span
                                    key={sk}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SHEET_STYLES[sk].badgeClass}`}
                                  >
                                    {SHEET_STYLES[sk].label}
                                  </span>
                                ))}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onOpenBeneficiaryReport(b.name, b.latestDate);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#173f2e] hover:bg-[#215a41] text-white transition-colors whitespace-nowrap"
                            >
                              <FileText className="w-3 h-3" aria-hidden="true" />
                              <span>تقرير</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                selectItem({
                                  kind: 'beneficiary',
                                  id: `ben-${b.name}`,
                                  name: b.name,
                                  totalQty: b.totalQty,
                                  count: b.count,
                                  sheets: [...b.sheets],
                                  primarySheet: b.primarySheet,
                                  latestDate: b.latestDate,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-[#edf0ed] text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
                            >
                              <ArrowUpLeft className="w-3 h-3" aria-hidden="true" />
                              <span>انتقال</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Matching Entries */}
              {matchedEntries.length > 0 && (
                <div className="p-3">
                  <div className="px-2 pb-2 text-[11px] font-black text-[#647069]">
                    القيود المطابقة ({formatNum(matchedEntries.length, numeralStyle)})
                  </div>
                  <div className="space-y-1">
                    {matchedEntries.map((entry, idx) => {
                      const flatIdx = matchedBeneficiaries.length + idx;
                      const isActive = activeIndex === flatIdx;
                      return (
                        <button
                          key={entry.id}
                          id={`entry-${entry.id}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onClick={() =>
                            selectItem({
                              kind: 'entry',
                              id: `entry-${entry.id}`,
                              entry,
                            })
                          }
                          className={`w-full text-right p-2.5 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                            isActive
                              ? 'bg-[#e8f0eb] border-[#9bbca8]'
                              : 'hover:bg-[#f7f8f6] border-transparent hover:border-[#e5e9e5]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-xs text-[#17211d]">
                                <HighlightText text={entry.name} query={query} />
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  SHEET_STYLES[entry.sheet].badgeClass
                                }`}
                              >
                                <HighlightText
                                  text={SHEET_STYLES[entry.sheet].label}
                                  query={query}
                                />
                              </span>
                            </div>
                            <div className="text-[11px] text-[#647069] mt-0.5 truncate">
                              <span className="font-semibold text-[#173f2e] tabular-nums">
                                <HighlightText
                                  text={formatEntryDateDisplay(entry, numeralStyle)}
                                  query={query}
                                />
                              </span>
                              {entry.desc ? (
                                <>
                                  {' · '}
                                  <HighlightText text={entry.desc} query={query} />
                                </>
                              ) : null}
                            </div>
                          </div>

                          <span className="text-xs font-black text-[#173f2e] tabular-nums shrink-0">
                            {formatQtyWithUnit(entry.qty, numeralStyle, unit)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
