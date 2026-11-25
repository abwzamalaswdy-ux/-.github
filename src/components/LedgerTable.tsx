import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  Download,
  Eye,
  FileSpreadsheet,
  GitMerge,
  LayoutGrid,
  Lock,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { BeneficiaryRow, Entry, NumeralStyle, SheetKey } from '../types/ledger';
import { HighlightText } from '../utils/highlightMatch';
import {
  SHEETS,
  digits,
  formatEntryDateDisplay,
  formatNum,
  formatQtyWithUnit,
  norm,
  roundQty,
} from '../utils/ledgerLogic';
import { SwipeToDeleteItem } from './SwipeToDeleteItem';

interface HighlightedTarget {
  name: string;
  day?: number;
  nonce: number;
}

interface LedgerTableProps {
  sheet: SheetKey;
  periodLabel: string;
  rows: BeneficiaryRow[];
  sheetEntries: Entry[];
  totalEntriesCount: number;
  search: string;
  onSearchChange: (val: string) => void;
  canUndo: boolean;
  readOnly: boolean;
  unit: string;
  numeralStyle: NumeralStyle;
  highlightedTarget?: HighlightedTarget | null;
  onJumpToTarget?: (name: string, day?: number) => void;
  onOpenDayEntries: (day: number | null) => void;
  onUndo: () => void;
  onSetCell: (name: string, day: number, qty: number) => void;
  onAddBeneficiary: (name: string) => void;
  onRenameBeneficiary: (oldName: string, newName: string) => void;
  onDeleteBeneficiary: (name: string) => void;
  onDeleteSelected: (names: string[]) => void;
  onMergeBeneficiaries: (names: string[], targetName: string) => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onOpenBeneficiaryReport: (name: string) => void;
  onEditEntry?: (entry: Entry) => void;
  onDeleteEntry?: (entryId: string) => void;
}

type BeneficiarySort = 'default' | 'name_asc' | 'name_desc' | 'total_desc' | 'total_asc';

const SORT_OPTIONS: Array<{ value: BeneficiarySort; label: string }> = [
  { value: 'default', label: 'الافتراضي (حسب الإدخال)' },
  { value: 'name_asc', label: 'أبجديًا (أ ← ي)' },
  { value: 'name_desc', label: 'أبجديًا (ي ← أ)' },
  { value: 'total_desc', label: 'إجمالي الكمية (الأعلى أولًا)' },
  { value: 'total_asc', label: 'إجمالي الكمية (الأقل أولًا)' },
];

export function LedgerTable({
  sheet,
  periodLabel,
  rows,
  sheetEntries,
  totalEntriesCount,
  search,
  onSearchChange,
  canUndo,
  readOnly,
  unit,
  numeralStyle,
  highlightedTarget,
  onJumpToTarget,
  onOpenDayEntries,
  onUndo,
  onSetCell,
  onAddBeneficiary,
  onRenameBeneficiary,
  onDeleteBeneficiary,
  onDeleteSelected,
  onMergeBeneficiaries,
  onExportCsv,
  onExportExcel,
  onOpenBeneficiaryReport,
  onEditEntry,
  onDeleteEntry,
}: LedgerTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<BeneficiarySort>('default');
  const [focusMode, setFocusMode] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024 ? 'cards' : 'table'
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newBenName, setNewBenName] = useState('');

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergedName, setMergedName] = useState('');

  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    { type: 'single'; name: string } | { type: 'bulk'; names: string[] } | null
  >(null);

  useEffect(() => {
    if (!readOnly) return;
    setAddModalOpen(false);
    setRenameTarget(null);
    setMergeOpen(false);
    setConfirmDeleteTarget(null);
    setSelected(new Set());
  }, [readOnly]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!searchDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchDropdownOpen]);

  const sortedRows = useMemo(() => {
    if (sortBy === 'default') return rows;
    const copy = [...rows];
    const rowSum = (r: BeneficiaryRow) =>
      roundQty(r.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0));

    copy.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'ar');
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name, 'ar');
      if (sortBy === 'total_desc') {
        return rowSum(b) - rowSum(a) || a.name.localeCompare(b.name, 'ar');
      }
      return rowSum(a) - rowSum(b) || a.name.localeCompare(b.name, 'ar');
    });
    return copy;
  }, [rows, sortBy]);

  const visibleSelected = useMemo(() => {
    const visibleSet = new Set(sortedRows.map((r) => r.name));
    return [...selected].filter((name) => visibleSet.has(name));
  }, [sortedRows, selected]);

  const allSelected = sortedRows.length > 0 && visibleSelected.length === sortedRows.length;

  const activeSortLabel =
    SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label ?? 'ترتيب المستفيدين';

  const { colTotals, grandTotal } = useMemo(() => {
    const col = Array(32).fill(0);
    let grand = 0;
    for (const r of rows) {
      for (let d = 1; d <= 31; d++) {
        const val = roundQty(Number(r.days[d]) || 0);
        col[d] = roundQty(col[d] + val);
        grand = roundQty(grand + val);
      }
    }
    return { colTotals: col, grandTotal: grand };
  }, [rows]);

  const visibleDays = useMemo(() => {
    const allDays = Array.from({ length: 31 }, (_, i) => i + 1);
    if (!focusMode) return allDays;
    return allDays.filter((d) => colTotals[d] > 0);
  }, [focusMode, colTotals]);

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (readOnly) return;
      if (checked) {
        setSelected(new Set(rows.map((r) => r.name)));
      } else {
        setSelected(new Set());
      }
    },
    [rows, readOnly]
  );

  const toggleOne = useCallback(
    (name: string, checked: boolean) => {
      if (readOnly) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (checked) next.add(name);
        else next.delete(name);
        return next;
      });
    },
    [readOnly]
  );

  const handleRenameClick = useCallback(
    (name: string) => {
      if (readOnly) return;
      setRenameTarget(name);
      setRenameValue(name);
    },
    [readOnly]
  );

  const handleDeleteClick = useCallback(
    (name: string) => {
      if (readOnly) return;
      setConfirmDeleteTarget({ type: 'single', name });
    },
    [readOnly]
  );

  const tableRef = useRef<HTMLTableElement>(null);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const deferredSearch = useDeferredValue(search);

  const realEntriesByBeneficiary = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of sheetEntries) {
      if (Number(e.qty) === 0 && !e.desc.trim()) continue;
      const list = map.get(e.name);
      if (list) list.push(e);
      else map.set(e.name, [e]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.day - b.day || (a.date || '').localeCompare(b.date || ''));
    }
    return map;
  }, [sheetEntries]);

  const matchedDayNumber = useMemo(() => {
    const qDigits = digits(deferredSearch).trim();
    if (!qDigits || !/^\d+$/.test(qDigits)) return null;
    const n = Number(qDigits);
    return n >= 1 && n <= 31 ? n : null;
  }, [deferredSearch]);

  const entryMatchHintsByBeneficiary = useMemo(() => {
    const trimmed = deferredSearch.trim();
    const map = new Map<string, { descs: string[]; days: Set<number> }>();
    if (!trimmed) return map;
    const qNorm = norm(trimmed);
    const qDigits = digits(trimmed).trim();

    for (const e of sheetEntries) {
      if (Number(e.qty) === 0 && !e.desc.trim()) continue;
      const descHit = Boolean(e.desc && norm(e.desc).includes(qNorm));
      const dateAr = formatEntryDateDisplay(e, 'ar');
      const dateEn = formatEntryDateDisplay(e, 'en');
      const dateHit =
        (e.date &&
          (e.date.includes(qDigits) || dateEn.includes(qDigits) || dateAr.includes(trimmed))) ||
        (qDigits.length > 0 && /^\d+$/.test(qDigits) && e.day === Number(qDigits));

      if (descHit || dateHit) {
        if (!map.has(e.name)) {
          map.set(e.name, { descs: [], days: new Set<number>() });
        }
        const bucket = map.get(e.name)!;
        bucket.days.add(e.day);
        if (descHit && e.desc && !bucket.descs.includes(e.desc)) {
          bucket.descs.push(e.desc);
        }
      }
    }
    return map;
  }, [sheetEntries, deferredSearch]);

  const localAutocompleteSuggestions = useMemo(() => {
    const trimmed = deferredSearch.trim();
    if (!trimmed) return [] as Array<{
      id: string;
      name: string;
      day?: number;
      subtitle: string;
      qty?: number;
    }>;

    const qNorm = norm(trimmed);
    const qDigits = digits(trimmed).trim();

    const benTotals = new Map<string, { total: number; count: number }>();
    const entryResults: Array<{
      id: string;
      name: string;
      day: number;
      subtitle: string;
      qty: number;
    }> = [];

    for (const e of sheetEntries) {
      const isPlaceholder = Number(e.qty) === 0 && !e.desc.trim();
      if (!benTotals.has(e.name)) {
        benTotals.set(e.name, { total: 0, count: 0 });
      }
      if (!isPlaceholder) {
        const b = benTotals.get(e.name)!;
        b.total = roundQty(b.total + (Number(e.qty) || 0));
        b.count += 1;
      }

      if (!isPlaceholder) {
        const nameHit = norm(e.name).includes(qNorm);
        const descHit = norm(e.desc).includes(qNorm);
        const dateAr = formatEntryDateDisplay(e, 'ar');
        const dateEn = formatEntryDateDisplay(e, 'en');
        const dateHit =
          (e.date &&
            (e.date.includes(qDigits) || dateEn.includes(qDigits) || dateAr.includes(trimmed))) ||
          (qDigits.length > 0 && /^\d+$/.test(qDigits) && e.day === Number(qDigits));

        if (nameHit || descHit || dateHit) {
          entryResults.push({
            id: `entry-${e.id}`,
            name: e.name,
            day: e.day,
            subtitle: `${formatEntryDateDisplay(e, numeralStyle)}${e.desc ? ` · ${e.desc}` : ''}`,
            qty: e.qty,
          });
        }
      }
    }

    const benResults: Array<{
      id: string;
      name: string;
      day?: number;
      subtitle: string;
      qty?: number;
    }> = [];

    for (const [name, stats] of benTotals.entries()) {
      if (norm(name).includes(qNorm)) {
        benResults.push({
          id: `ben-${name}`,
          name,
          subtitle: `${formatNum(stats.count, numeralStyle)} قيد في ${SHEETS[sheet]}`,
          qty: stats.total,
        });
      }
    }

    benResults.sort((a, b) => (b.qty || 0) - (a.qty || 0) || a.name.localeCompare(b.name, 'ar'));
    return [...benResults.slice(0, 5), ...entryResults.slice(0, 6)];
  }, [sheetEntries, deferredSearch, numeralStyle, sheet]);

  useEffect(() => {
    setActiveSuggestionIdx(localAutocompleteSuggestions.length > 0 ? 0 : -1);
  }, [deferredSearch, localAutocompleteSuggestions.length]);

  useEffect(() => {
    if (!highlightedTarget) return;
    const timer = window.setTimeout(() => {
      const rowIdx = sortedRows.findIndex((r) => r.name === highlightedTarget.name);
      if (rowIdx === -1) return;

      if (viewMode === 'cards') {
        const cardEl = cardsContainerRef.current?.querySelector<HTMLDivElement>(
          `div[data-card-ben-idx="${rowIdx}"]`
        );
        cardEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (highlightedTarget.day) {
        const cellInput = tableRef.current?.querySelector<HTMLInputElement>(
          `input[data-cell="${rowIdx}-${highlightedTarget.day}"]`
        );
        if (cellInput) {
          cellInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          return;
        }
      }

      const rowEl = tableRef.current?.querySelector<HTMLTableRowElement>(
        `tr[data-row-idx="${rowIdx}"]`
      );
      rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [highlightedTarget, sortedRows, viewMode]);

  const handleNavigateCell = useCallback(
    (rowIdx: number, day: number, dir: 'left' | 'right' | 'up' | 'down') => {
      let nextRow = rowIdx;
      let nextDay = day;
      const dayPos = visibleDays.indexOf(day);
      // In RTL table: earlier day is right, later day is left
      if (dir === 'left') {
        if (dayPos >= 0 && dayPos + 1 < visibleDays.length) nextDay = visibleDays[dayPos + 1];
        else return;
      } else if (dir === 'right') {
        if (dayPos > 0) nextDay = visibleDays[dayPos - 1];
        else return;
      } else if (dir === 'up') nextRow = rowIdx - 1;
      else if (dir === 'down') nextRow = rowIdx + 1;

      if (nextRow < 0 || nextRow >= sortedRows.length) return;
      const target = tableRef.current?.querySelector<HTMLInputElement>(
        `input[data-cell="${nextRow}-${nextDay}"]`
      );
      if (target) {
        target.focus();
        target.select();
      }
    },
    [sortedRows.length, visibleDays]
  );

  const handleOpenMerge = () => {
    if (visibleSelected.length < 2) return;
    setMergedName(visibleSelected[0]);
    setMergeOpen(true);
  };

  const submitAddBeneficiary = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBenName.trim();
    if (!clean) return;
    onAddBeneficiary(clean);
    setNewBenName('');
    setAddModalOpen(false);
  };

  const submitRename = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = renameValue.trim();
    if (!clean || !renameTarget) return;
    onRenameBeneficiary(renameTarget, clean);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(renameTarget);
      return next;
    });
    setRenameTarget(null);
  };

  const submitMerge = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = mergedName.trim();
    if (!clean || visibleSelected.length < 2) return;
    onMergeBeneficiaries(visibleSelected, clean);
    setSelected(new Set());
    setMergeOpen(false);
  };

  const confirmDelete = () => {
    if (!confirmDeleteTarget) return;
    if (confirmDeleteTarget.type === 'single') {
      onDeleteBeneficiary(confirmDeleteTarget.name);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(confirmDeleteTarget.name);
        return next;
      });
    } else {
      onDeleteSelected(confirmDeleteTarget.names);
      setSelected(new Set());
    }
    setConfirmDeleteTarget(null);
  };

  return (
    <section className="bg-white border border-[#d9dfdb] rounded-2xl shadow-[0_8px_28px_rgba(24,44,34,0.06)] overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3.5 border-b border-[#edf0ed] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={searchBoxRef}>
            <Search
              className="w-4 h-4 text-[#647069] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchDropdownOpen && search.trim().length > 0}
              aria-controls="table-search-listbox"
              aria-activedescendant={
                searchDropdownOpen &&
                activeSuggestionIdx >= 0 &&
                localAutocompleteSuggestions[activeSuggestionIdx]
                  ? localAutocompleteSuggestions[activeSuggestionIdx].id
                  : undefined
              }
              value={search}
              onFocus={() => setSearchDropdownOpen(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setSearchDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (
                  !searchDropdownOpen ||
                  !search.trim() ||
                  localAutocompleteSuggestions.length === 0
                ) {
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveSuggestionIdx((p) => (p + 1) % localAutocompleteSuggestions.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveSuggestionIdx((p) =>
                    p <= 0 ? localAutocompleteSuggestions.length - 1 : p - 1
                  );
                } else if (e.key === 'Enter' && activeSuggestionIdx >= 0) {
                  const chosen = localAutocompleteSuggestions[activeSuggestionIdx];
                  if (chosen) {
                    e.preventDefault();
                    setSearchDropdownOpen(false);
                    onSearchChange(chosen.name);
                    onJumpToTarget?.(chosen.name, chosen.day);
                  }
                } else if (e.key === 'Escape') {
                  setSearchDropdownOpen(false);
                }
              }}
              placeholder="بحث باسم المستفيد أو الوصف أو اليوم…"
              aria-label="بحث في جدول المستفيدين والقيود"
              className="w-60 sm:w-72 min-h-[40px] pr-9 pl-7 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white text-[#17211d] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30 focus:border-[#173f2e]"
            />
            {search.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  setSearchDropdownOpen(false);
                }}
                aria-label="مسح بحث الجدول"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded grid place-items-center text-[#647069] hover:text-[#17211d]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchDropdownOpen && search.trim().length > 0 && (
              <div
                id="table-search-listbox"
                role="listbox"
                aria-label="اقتراحات البحث التلقائي في الكشف"
                className="absolute right-0 mt-1.5 w-80 sm:w-96 max-w-[90vw] rounded-2xl bg-white border border-[#d9dfdb] shadow-2xl z-40 overflow-hidden max-h-72 overflow-y-auto divide-y divide-[#edf0ed]"
              >
                {localAutocompleteSuggestions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#647069]">
                    لا توجد نتائج مطابقة داخل {SHEETS[sheet]}.
                  </div>
                ) : (
                  localAutocompleteSuggestions.map((item, idx) => {
                    const isActive = activeSuggestionIdx === idx;
                    return (
                      <button
                        key={item.id}
                        id={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveSuggestionIdx(idx)}
                        onClick={() => {
                          setSearchDropdownOpen(false);
                          onSearchChange(item.name);
                          onJumpToTarget?.(item.name, item.day);
                        }}
                        className={`w-full text-right px-3.5 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                          isActive ? 'bg-[#e8f0eb]' : 'hover:bg-[#f7f8f6]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold text-[#17211d] truncate">
                            <HighlightText text={item.name} query={search} />
                          </div>
                          <div className="text-[11px] text-[#647069] truncate mt-0.5">
                            <HighlightText text={item.subtitle} query={search} />
                          </div>
                        </div>
                        {item.qty !== undefined && (
                          <span className="text-[11px] font-black text-[#173f2e] tabular-nums shrink-0">
                            {formatQtyWithUnit(item.qty, numeralStyle, unit)}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-white hover:bg-[#f7f8f6] disabled:opacity-45 disabled:pointer-events-none text-[#173f2e] border border-[#d8e2dc] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>مستفيد</span>
          </button>

          <button
            type="button"
            onClick={handleOpenMerge}
            disabled={readOnly || visibleSelected.length < 2}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#fbf1df] hover:bg-[#f6e6c8] disabled:opacity-45 disabled:pointer-events-none text-[#845315] border border-[#f2e0bd] transition-colors whitespace-nowrap"
          >
            <GitMerge className="w-4 h-4" aria-hidden="true" />
            <span>دمج المحددين</span>
          </button>

          <button
            type="button"
            onClick={() =>
              !readOnly &&
              visibleSelected.length &&
              setConfirmDeleteTarget({ type: 'bulk', names: visibleSelected })
            }
            disabled={readOnly || visibleSelected.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-45 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca] transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>حذف المحددين</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenDayEntries(null)}
            title="استعراض وتعديل القيود الفردية أو حذف قيود يوم محدد"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] hover:bg-[#e8f0eb] text-[#173f2e] border border-[#d8e2dc] transition-colors whitespace-nowrap"
          >
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
            <span>قيود / حذف يوم</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="نمط عرض الجدول"
            className="inline-flex items-center p-0.5 rounded-xl bg-[#f1f4f2] border border-[#d9dfdb]"
          >
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              title="عرض الجدول الشبكي الكامل (مناسب للكمبيوتر)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-[10px] text-xs font-extrabold transition-colors whitespace-nowrap ${
                viewMode === 'table'
                  ? 'bg-[#173f2e] text-white shadow-sm'
                  : 'text-[#46534b] hover:text-[#17211d]'
              }`}
            >
              <Table2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>عرض الجدول</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
              title="عرض بطاقات متجاوبة للأجهزة اللوحية مع السحب للحذف"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-[10px] text-xs font-extrabold transition-colors whitespace-nowrap ${
                viewMode === 'cards'
                  ? 'bg-[#173f2e] text-white shadow-sm'
                  : 'text-[#46534b] hover:text-[#17211d]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>بطاقات لمسية</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFocusMode((prev) => !prev)}
            aria-pressed={focusMode}
            title="إخفاء الأعمدة الفارغة لتبسيط عرض الجدول"
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[42px] rounded-xl text-xs font-bold border transition-colors whitespace-nowrap ${
              focusMode
                ? 'bg-[#173f2e] text-white border-[#173f2e] shadow-[0_2px_8px_rgba(23,63,46,0.18)]'
                : 'bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border-[#d9dfdb]'
            }`}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {focusMode
                ? `عرض القيود فقط (${formatNum(visibleDays.length, numeralStyle)})`
                : 'عرض القيود فقط'}
            </span>
          </button>

          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setSortMenuOpen((prev) => !prev)}
              aria-expanded={sortMenuOpen}
              aria-haspopup="menu"
              className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-colors whitespace-nowrap ${
                sortBy !== 'default'
                  ? 'bg-[#e8f0eb] text-[#173f2e] border-[#b7cbbe]'
                  : 'bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border-[#d9dfdb]'
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {sortBy === 'default' ? 'ترتيب المستفيدين' : `الترتيب: ${activeSortLabel}`}
              </span>
            </button>

            {sortMenuOpen && (
              <div
                role="menu"
                aria-label="خيارات ترتيب المستفيدين"
                className="absolute left-0 sm:right-0 sm:left-auto mt-1.5 w-60 rounded-xl bg-white border border-[#d9dfdb] shadow-xl py-1.5 z-30"
              >
                {SORT_OPTIONS.map((opt) => {
                  const isActive = sortBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => {
                        setSortBy(opt.value);
                        setSortMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-right text-xs font-bold transition-colors ${
                        isActive
                          ? 'bg-[#e8f0eb] text-[#173f2e]'
                          : 'text-[#17211d] hover:bg-[#f7f8f6]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isActive && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => toggleAll(true)}
            disabled={readOnly || rows.length === 0}
            className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-45 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
          >
            تحديد الكل
          </button>

          <button
            type="button"
            onClick={() => toggleAll(false)}
            disabled={readOnly || visibleSelected.length === 0}
            className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-45 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
          >
            إلغاء التحديد
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={readOnly || !canUndo}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-white hover:bg-[#f7f8f6] disabled:opacity-45 disabled:pointer-events-none text-[#173f2e] border border-[#d8e2dc] transition-colors whitespace-nowrap"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>تراجع</span>
          </button>

          <button
            type="button"
            onClick={onExportExcel}
            title="تصدير هذا الكشف كملف Excel (.xlsx)"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-[#e8f0eb] hover:bg-[#dce8e1] text-[#173f2e] border border-[#b7cbbe] transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] text-[#17211d] border border-[#d9dfdb] transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Table or Empty State */}
      {rows.length === 0 ? (
        <div className="py-12 px-5 text-center text-[#647069]">
          <div className="w-12 h-12 rounded-2xl bg-[#e8f0eb] text-[#173f2e] grid place-items-center mx-auto mb-3 text-xl font-bold">
            ▦
          </div>
          <strong className="block text-base text-[#17211d] mb-1">
            {deferredSearch ? 'لا توجد نتائج مطابقة' : 'لا توجد قيود في هذا الكشف'}
          </strong>
          <p className="text-sm">
            {deferredSearch
              ? 'جرّب كلمة بحث أخرى أو امسح مربع البحث.'
              : 'استورد ملف CSV أو الصق القيود أو أدرج بيانات تجريبية لبدء تكوين الكشف.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div ref={cardsContainerRef} className="bg-[#f8faf8]">
          {!readOnly && (
            <div className="px-4 py-2.5 bg-[#f2f7f4] border-b border-[#e2ece6] flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#173f2e]">
              <span>
                وضع الأجهزة اللوحية واللمس: اسحب أي قيد يمينًا أو يسارًا للحذف السريع (يمكنك التراجع بـ Ctrl+Z أو زر تراجع).
              </span>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#cfe0d5] text-[11px] font-extrabold text-[#173f2e] hover:bg-[#e8f0eb] transition-colors"
              >
                التبديل للجدول الكامل
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 p-3.5 sm:p-4 max-h-[72vh] overflow-y-auto table-scroll-region">
            {sortedRows.map((r, idx) => {
              const hints = entryMatchHintsByBeneficiary.get(r.name);
              const isTargetRow = highlightedTarget?.name === r.name;
              const benEntries = realEntriesByBeneficiary.get(r.name) ?? [];
              return (
                <BeneficiaryTouchCard
                  key={r.name}
                  row={r}
                  rowIdx={idx}
                  entries={benEntries}
                  visibleDays={visibleDays}
                  isChecked={selected.has(r.name)}
                  readOnly={readOnly}
                  unit={unit}
                  numeralStyle={numeralStyle}
                  searchQuery={deferredSearch}
                  matchedDayNumber={matchedDayNumber}
                  highlightedTargetDay={isTargetRow ? highlightedTarget?.day : undefined}
                  isHighlightedRow={isTargetRow}
                  matchedDescHint={hints?.descs[0]}
                  onToggle={toggleOne}
                  onSetCell={onSetCell}
                  onOpenBeneficiaryReport={onOpenBeneficiaryReport}
                  onRename={handleRenameClick}
                  onDeleteBeneficiary={handleDeleteClick}
                  onEditEntry={onEditEntry}
                  onDeleteEntry={onDeleteEntry}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-auto max-h-[68vh] table-scroll-region">
          {focusMode && visibleDays.length === 0 && (
            <div className="px-4 py-2.5 bg-[#fbf6ea] border-b border-[#e3d4b4] flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#725020]">
              <span>وضع «عرض القيود فقط» نشط — جميع أيام هذا الكشف فارغة حاليًا.</span>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#dcd1b8] text-[#173f2e] hover:bg-[#f5ebd6] transition-colors"
              >
                إظهار كل الأيام (١–٣١)
              </button>
            </div>
          )}
          <table ref={tableRef} className="ledger-table" dir="rtl">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={readOnly}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="تحديد جميع المستفيدين"
                    className="w-4 h-4 accent-[#ede6d6] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </th>
                <th className="col-num">م.</th>
                <th
                  className="col-name"
                  aria-sort={
                    sortBy === 'name_asc'
                      ? 'ascending'
                      : sortBy === 'name_desc'
                      ? 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((prev) =>
                        prev === 'name_asc'
                          ? 'name_desc'
                          : prev === 'name_desc'
                          ? 'default'
                          : 'name_asc'
                      )
                    }
                    title="ترتيب المستفيدين أبجديًا"
                    className="w-full flex items-center justify-between gap-1.5 text-white hover:text-[#ede6d6] transition-colors cursor-pointer"
                  >
                    <span>المستفيد</span>
                    {sortBy === 'name_asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 shrink-0 text-[#ede6d6]" aria-hidden="true" />
                    ) : sortBy === 'name_desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 shrink-0 text-[#ede6d6]" aria-hidden="true" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
                    )}
                  </button>
                </th>
                {visibleDays.map((d) => {
                  const hasDayEntries = colTotals[d] > 0;
                  const isDayHighlighted =
                    matchedDayNumber === d || highlightedTarget?.day === d;
                  return (
                    <th
                      key={d}
                      className={`min-w-[52px] w-[52px] ${
                        isDayHighlighted ? '!bg-[#845315] text-[#fde68a]' : ''
                      }`}
                    >
                      {hasDayEntries ? (
                        <button
                          type="button"
                          onClick={() => onOpenDayEntries(d)}
                          title={`عرض وتعديل أو حذف قيود يوم ${formatNum(d, numeralStyle)}`}
                          className="w-full py-0.5 rounded hover:bg-white/15 underline decoration-dotted underline-offset-4 cursor-pointer transition-colors"
                        >
                          {formatNum(d, numeralStyle)}
                        </button>
                      ) : (
                        formatNum(d, numeralStyle)
                      )}
                    </th>
                  );
                })}
                <th
                  className="min-w-[92px] w-[92px] px-1.5"
                  aria-sort={
                    sortBy === 'total_asc'
                      ? 'ascending'
                      : sortBy === 'total_desc'
                      ? 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((prev) =>
                        prev === 'total_desc'
                          ? 'total_asc'
                          : prev === 'total_asc'
                          ? 'default'
                          : 'total_desc'
                      )
                    }
                    title="ترتيب حسب إجمالي الكمية المنصرفة"
                    className="w-full inline-flex items-center justify-center gap-1 text-white hover:text-[#ede6d6] transition-colors cursor-pointer"
                  >
                    <span>الإجمالي</span>
                    {sortBy === 'total_desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 shrink-0 text-[#ede6d6]" aria-hidden="true" />
                    ) : sortBy === 'total_asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 shrink-0 text-[#ede6d6]" aria-hidden="true" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
                    )}
                  </button>
                </th>
                <th className="min-w-[106px] px-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, idx) => {
                const hints = entryMatchHintsByBeneficiary.get(r.name);
                const isTargetRow = highlightedTarget?.name === r.name;
                return (
                  <BeneficiaryTableRow
                    key={r.name}
                    row={r}
                    rowIdx={idx}
                    visibleDays={visibleDays}
                    isChecked={selected.has(r.name)}
                    readOnly={readOnly}
                    numeralStyle={numeralStyle}
                    searchQuery={deferredSearch}
                    matchedDayNumber={matchedDayNumber}
                    highlightedTargetDay={isTargetRow ? highlightedTarget?.day : undefined}
                    isHighlightedRow={isTargetRow}
                    matchedDescHint={hints?.descs[0]}
                    onToggle={toggleOne}
                    onSetCell={onSetCell}
                    onNavigateCell={handleNavigateCell}
                    onOpenBeneficiaryReport={onOpenBeneficiaryReport}
                    onRename={handleRenameClick}
                    onDelete={handleDeleteClick}
                  />
                );
              })}

              <tr className="summary-row">
                <td className="col-check" />
                <td className="col-num" />
                <td className="col-name">الإجمالي</td>
                {visibleDays.map((d) => {
                  const total = colTotals[d];
                  return (
                    <td key={d} className="px-1">
                      {total ? formatNum(total, numeralStyle) : ''}
                    </td>
                  );
                })}
                <td className="col-total px-2">
                  {grandTotal ? formatNum(grandTotal, numeralStyle) : ''}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 text-xs text-[#647069] flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0ed] bg-[#fafbf9]">
        <span>
          {formatNum(rows.length, numeralStyle)} مستفيد ·{' '}
          {formatNum(totalEntriesCount, numeralStyle)} قيد · الإجمالي{' '}
          <strong className="text-[#173f2e]">{formatNum(grandTotal, numeralStyle)}</strong>
          {focusMode && (
            <span className="mr-2 text-[#173f2e] font-bold">
              · وضع القيود فقط ({formatNum(visibleDays.length, numeralStyle)} من{' '}
              {formatNum(31, numeralStyle)} يومًا)
            </span>
          )}
        </span>
        <span>
          {readOnly ? (
            <span className="inline-flex items-center gap-1 text-[#845315] font-bold">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>وضع القراءة فقط نشط: حقول الإدخال وأزرار التعديل والحذف معطلة.</span>
            </span>
          ) : (
            'عدّل الرقم مباشرة داخل الخلية، أو امسحه لإزالة كمية اليوم.'
          )}
        </span>
      </div>

      {/* Add Beneficiary Modal */}
      {addModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-ben-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
              <h3 id="add-ben-title" className="text-base font-extrabold text-[#17211d]">
                إضافة مستفيد جديد
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069] hover:text-[#17211d]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitAddBeneficiary} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="newBenInput"
                  className="block text-xs font-extrabold text-[#46534b] mb-1.5"
                >
                  اسم المستفيد ({SHEETS[sheet]})
                </label>
                <input
                  id="newBenInput"
                  type="text"
                  autoFocus
                  value={newBenName}
                  onChange={(e) => setNewBenName(e.target.value)}
                  placeholder="أدخل اسم المستفيد..."
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </div>
              <div className="flex items-center justify-start gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] text-white"
                >
                  إضافة المستفيد
                </button>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-ben-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
              <h3 id="rename-ben-title" className="text-base font-extrabold text-[#17211d]">
                تعديل اسم المستفيد
              </h3>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069] hover:text-[#17211d]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitRename} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="renameInput"
                  className="block text-xs font-extrabold text-[#46534b] mb-1.5"
                >
                  الاسم الجديد
                </label>
                <input
                  id="renameInput"
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </div>
              <div className="flex items-center justify-start gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] text-white"
                >
                  حفظ الاسم
                </button>
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-ben-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
              <h3 id="merge-ben-title" className="text-base font-extrabold text-[#17211d]">
                دمج المستفيدين
              </h3>
              <button
                type="button"
                onClick={() => setMergeOpen(false)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069] hover:text-[#17211d]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitMerge} className="p-5 space-y-4">
              <p className="text-xs text-[#647069]">
                سيتم دمج: <strong className="text-[#17211d]">{visibleSelected.join(' + ')}</strong>{' '}
                ضمن الكشف الحالي والفترة المحددة. تُجمع كميات الأيام تلقائيًا.
              </p>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#173f2e] text-white">
                    <th className="p-2 text-right border border-[#d9dfdb]">المستفيد</th>
                    <th className="p-2 text-center border border-[#d9dfdb]">إجمالي الفترة</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSelected.map((n) => {
                    const row = rows.find((x) => x.name === n);
                    const sum = row ? row.days.reduce((a, b) => a + b, 0) : 0;
                    return (
                      <tr key={n}>
                        <td className="p-2 text-right border border-[#d9dfdb] font-semibold">
                          {n}
                        </td>
                        <td className="p-2 text-center border border-[#d9dfdb] tabular-nums">
                          {formatNum(sum, numeralStyle)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div>
                <label
                  htmlFor="mergedNameInput"
                  className="block text-xs font-extrabold text-[#46534b] mb-1.5"
                >
                  اسم المستفيد بعد الدمج
                </label>
                <input
                  id="mergedNameInput"
                  type="text"
                  value={mergedName}
                  onChange={(e) => setMergedName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </div>

              <div className="flex items-center justify-start gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#fbf1df] hover:bg-[#f6e6c8] text-[#845315] border border-[#f2e0bd]"
                >
                  تأكيد الدمج
                </button>
                <button
                  type="button"
                  onClick={() => setMergeOpen(false)}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
              <h3 id="delete-confirm-title" className="text-base font-extrabold text-[#9e3029]">
                تأكيد الحذف
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-[#17211d] leading-relaxed">
                {confirmDeleteTarget.type === 'single'
                  ? `هل تريد حذف جميع قيود «${confirmDeleteTarget.name}» من ${SHEETS[sheet]} في ${periodLabel}؟`
                  : `هل تريد حذف ${confirmDeleteTarget.names.length} مستفيدين محددين من ${SHEETS[sheet]} في ${periodLabel}؟`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#b93f37] hover:bg-[#9e3029] text-white"
                >
                  تأكيد الحذف
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTarget(null)}
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

interface BeneficiaryTableRowProps {
  row: BeneficiaryRow;
  rowIdx: number;
  visibleDays: number[];
  isChecked: boolean;
  readOnly: boolean;
  numeralStyle: NumeralStyle;
  searchQuery: string;
  matchedDayNumber: number | null;
  highlightedTargetDay?: number;
  isHighlightedRow: boolean;
  matchedDescHint?: string;
  onToggle: (name: string, checked: boolean) => void;
  onSetCell: (name: string, day: number, qty: number) => void;
  onNavigateCell: (rowIdx: number, day: number, dir: 'left' | 'right' | 'up' | 'down') => void;
  onOpenBeneficiaryReport: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}

const BeneficiaryTableRow = memo(function BeneficiaryTableRow({
  row,
  rowIdx,
  visibleDays,
  isChecked,
  readOnly,
  numeralStyle,
  searchQuery,
  matchedDayNumber,
  highlightedTargetDay,
  isHighlightedRow,
  matchedDescHint,
  onToggle,
  onSetCell,
  onNavigateCell,
  onOpenBeneficiaryReport,
  onRename,
  onDelete,
}: BeneficiaryTableRowProps) {
  const rowSum = roundQty(row.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0));

  return (
    <tr
      data-row-idx={rowIdx}
      className={isHighlightedRow ? 'bg-[#fef9e7] ring-2 ring-inset ring-[#eab308]/60' : undefined}
    >
      <td className="col-check">
        <input
          type="checkbox"
          checked={isChecked}
          disabled={readOnly}
          onChange={(e) => onToggle(row.name, e.target.checked)}
          aria-label={`تحديد ${row.name}`}
          className="w-4 h-4 accent-[#173f2e] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </td>
      <td className="col-num font-semibold">{formatNum(rowIdx + 1, numeralStyle)}</td>
      <td className="col-name max-w-[230px]" title={row.name}>
        <div className="truncate font-bold">
          <HighlightText text={row.name} query={searchQuery} />
        </div>
        {matchedDescHint && searchQuery.trim() && (
          <div className="text-[10px] text-[#647069] font-normal truncate mt-0.5">
            <HighlightText text={matchedDescHint} query={searchQuery} />
          </div>
        )}
      </td>
      {visibleDays.map((d) => {
        const val = row.days[d] || 0;
        const isCellHighlighted =
          (highlightedTargetDay === d && isHighlightedRow) ||
          (matchedDayNumber === d && val > 0);
        return (
          <DayCellInput
            key={d}
            name={row.name}
            rowIdx={rowIdx}
            day={d}
            value={val}
            readOnly={readOnly}
            highlighted={isCellHighlighted}
            onCommit={onSetCell}
            onNavigate={onNavigateCell}
          />
        );
      })}
      <td className="col-total bg-[#f5f7f5] font-extrabold text-[#173f2e] px-2">
        {rowSum ? formatNum(rowSum, numeralStyle) : ''}
      </td>
      <td className="px-2">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onOpenBeneficiaryReport(row.name)}
            title={`تصدير تقرير ${row.name} من جميع الفئات`}
            className="min-h-[34px] lg:min-h-0 px-2.5 lg:px-2 py-1 rounded-md text-xs font-bold bg-[#e8f0eb] hover:bg-[#dce8e1] text-[#173f2e] border border-[#c4d6ca] transition-colors"
          >
            تقرير
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onRename(row.name)}
            className="min-h-[34px] lg:min-h-0 px-2.5 lg:px-2 py-1 rounded-md text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-40 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb] transition-colors"
          >
            تعديل
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onDelete(row.name)}
            className="min-h-[34px] lg:min-h-0 px-2.5 lg:px-2 py-1 rounded-md text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-40 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca] transition-colors"
          >
            حذف
          </button>
        </div>
      </td>
    </tr>
  );
});

interface DayCellInputProps {
  name: string;
  rowIdx: number;
  day: number;
  value: number;
  readOnly: boolean;
  highlighted?: boolean;
  onCommit: (name: string, day: number, val: number) => void;
  onNavigate: (rowIdx: number, day: number, dir: 'left' | 'right' | 'up' | 'down') => void;
}

const DayCellInput = memo(function DayCellInput({
  name,
  rowIdx,
  day,
  value,
  readOnly,
  highlighted = false,
  onCommit,
  onNavigate,
}: DayCellInputProps) {
  const [draft, setDraft] = useState<string>(value ? String(value) : '');

  useEffect(() => {
    setDraft(value ? String(value) : '');
  }, [value]);

  const commit = () => {
    if (readOnly) {
      setDraft(value ? String(value) : '');
      return;
    }
    const normalized = digits(draft).replace(/[,،\s]/g, '').replace(/[٫]/g, '.').trim();
    if (!normalized) {
      if (value !== 0) onCommit(name, day, 0);
      else setDraft('');
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(value ? String(value) : '');
      return;
    }
    const cleaned = roundQty(parsed);
    if (cleaned !== value) {
      onCommit(name, day, cleaned);
    } else {
      setDraft(value ? String(value) : '');
    }
  };

  return (
    <td
      className={`min-w-[52px] w-[52px] p-0.5 ${
        highlighted ? 'bg-[#fde68a]/70' : ''
      }`}
    >
      <input
        type="text"
        inputMode="decimal"
        dir="ltr"
        data-cell={`${rowIdx}-${day}`}
        aria-label={`كمية ${name} اليوم ${day}`}
        value={draft}
        disabled={readOnly}
        readOnly={readOnly}
        onChange={(e) => {
          if (!readOnly) setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (readOnly) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            onNavigate(rowIdx, day, 'down');
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onNavigate(rowIdx, day, 'up');
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onNavigate(rowIdx, day, 'down');
          } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
            e.preventDefault();
            onNavigate(rowIdx, day, 'left');
          } else if (
            e.key === 'ArrowRight' &&
            e.currentTarget.selectionEnd === e.currentTarget.value.length
          ) {
            e.preventDefault();
            onNavigate(rowIdx, day, 'right');
          } else if (e.key === 'Escape') {
            setDraft(value ? String(value) : '');
            e.currentTarget.blur();
          }
        }}
        className={`w-full min-w-[44px] border hover:border-[#d5ddd7] hover:bg-white focus:border-[#8ab7ed] focus:bg-white focus:outline-none disabled:hover:border-transparent disabled:hover:bg-transparent disabled:text-[#2a3831] disabled:cursor-default rounded-md py-1 px-0.5 text-center text-xs transition-colors ${
          highlighted
            ? 'border-[#d97706] bg-[#fef3c7] font-black text-[#17211d]'
            : 'border-transparent text-[#17211d] bg-transparent'
        }`}
      />
    </td>
  );
});

interface BeneficiaryTouchCardProps {
  row: BeneficiaryRow;
  rowIdx: number;
  entries: Entry[];
  visibleDays: number[];
  isChecked: boolean;
  readOnly: boolean;
  unit: string;
  numeralStyle: NumeralStyle;
  searchQuery: string;
  matchedDayNumber: number | null;
  highlightedTargetDay?: number;
  isHighlightedRow: boolean;
  matchedDescHint?: string;
  onToggle: (name: string, checked: boolean) => void;
  onSetCell: (name: string, day: number, qty: number) => void;
  onOpenBeneficiaryReport: (name: string) => void;
  onRename: (name: string) => void;
  onDeleteBeneficiary: (name: string) => void;
  onEditEntry?: (entry: Entry) => void;
  onDeleteEntry?: (entryId: string) => void;
}

const BeneficiaryTouchCard = memo(function BeneficiaryTouchCard({
  row,
  rowIdx,
  entries,
  visibleDays,
  isChecked,
  readOnly,
  unit,
  numeralStyle,
  searchQuery,
  matchedDayNumber,
  highlightedTargetDay,
  isHighlightedRow,
  matchedDescHint,
  onToggle,
  onSetCell,
  onOpenBeneficiaryReport,
  onRename,
  onDeleteBeneficiary,
  onEditEntry,
  onDeleteEntry,
}: BeneficiaryTouchCardProps) {
  const rowSum = roundQty(row.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0));
  const defaultDay =
    highlightedTargetDay ??
    (entries.length > 0 ? entries[0].day : visibleDays[0] ?? 1);
  const [quickDay, setQuickDay] = useState<number>(defaultDay);
  const [quickQty, setQuickQty] = useState<string>(
    row.days[defaultDay] ? String(row.days[defaultDay]) : ''
  );

  useEffect(() => {
    setQuickQty(row.days[quickDay] ? String(row.days[quickDay]) : '');
  }, [quickDay, row.days]);

  const handleSaveQuickDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const normalized = digits(quickQty).replace(/[,،\s]/g, '').replace(/[٫]/g, '.').trim();
    if (!normalized) {
      if ((row.days[quickDay] || 0) !== 0) onSetCell(row.name, quickDay, 0);
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onSetCell(row.name, quickDay, roundQty(parsed));
  };

  return (
    <div
      data-card-ben-idx={rowIdx}
      className={`rounded-2xl bg-white border p-3.5 flex flex-col gap-3 shadow-[0_2px_10px_rgba(20,40,28,0.04)] ${
        isHighlightedRow
          ? 'border-[#d97706] ring-2 ring-[#eab308]/50 bg-[#fffdf5]'
          : 'border-[#d9dfdb]'
      }`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <label className="w-9 h-9 -m-1 rounded-lg grid place-items-center shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={isChecked}
              disabled={readOnly}
              onChange={(e) => onToggle(row.name, e.target.checked)}
              aria-label={`تحديد ${row.name}`}
              className="w-4 h-4 accent-[#173f2e] cursor-pointer disabled:opacity-40"
            />
          </label>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-lg bg-[#edf1ee] text-[#173f2e] text-[11px] font-black tabular-nums">
                {formatNum(rowIdx + 1, numeralStyle)}
              </span>
              <h3 className="text-sm font-black text-[#17211d] truncate">
                <HighlightText text={row.name} query={searchQuery} />
              </h3>
            </div>
            {matchedDescHint && searchQuery.trim() && (
              <div className="text-[11px] text-[#647069] truncate mt-0.5">
                <HighlightText text={matchedDescHint} query={searchQuery} />
              </div>
            )}
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-xl bg-[#e8f0eb] text-[#173f2e] text-xs font-black tabular-nums shrink-0">
          {formatQtyWithUnit(rowSum, numeralStyle, unit)}
        </span>
      </div>

      {/* Card Actions */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => onOpenBeneficiaryReport(row.name)}
          className="min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-extrabold bg-[#e8f0eb] hover:bg-[#dce8e1] text-[#173f2e] border border-[#c4d6ca] transition-colors"
        >
          تقرير شامل
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onRename(row.name)}
          className="min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-40 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb] transition-colors"
        >
          تعديل الاسم
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onDeleteBeneficiary(row.name)}
          className="min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-40 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca] transition-colors"
        >
          حذف المستفيد
        </button>
      </div>

      {/* Quick Inline Day Edit */}
      <form
        onSubmit={handleSaveQuickDay}
        className="flex items-center gap-1.5 p-2 rounded-xl bg-[#fafbf9] border border-[#e6ebe8]"
      >
        <select
          value={quickDay}
          disabled={readOnly}
          onChange={(e) => setQuickDay(Number(e.target.value))}
          aria-label={`اختر اليوم للمستفيد ${row.name}`}
          className="min-h-[38px] px-2 py-1 rounded-lg border border-[#d8dfda] bg-white text-xs font-bold text-[#17211d] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/25 disabled:opacity-50"
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              يوم {formatNum(d, numeralStyle)}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          dir="ltr"
          disabled={readOnly}
          value={quickQty}
          onChange={(e) => setQuickQty(e.target.value)}
          placeholder="الكمية"
          aria-label={`كمية اليوم ${quickDay} للمستفيد ${row.name}`}
          className="flex-1 min-w-0 min-h-[38px] px-2.5 py-1 rounded-lg border border-[#d8dfda] bg-white text-center text-xs font-bold text-[#17211d] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/25 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={readOnly}
          className="min-h-[38px] px-3 py-1 rounded-lg text-xs font-extrabold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none text-white transition-colors whitespace-nowrap"
        >
          حفظ اليوم
        </button>
      </form>

      {/* Individual Entries List (Swipe to Delete) */}
      <div className="space-y-1.5">
        {entries.length === 0 ? (
          <div className="text-[11px] text-[#647069] text-center py-2.5 rounded-xl border border-dashed border-[#dde3df]">
            لا توجد قيود كمية مسجلة حاليًا — استخدم الحقل أعلاه للإضافة.
          </div>
        ) : (
          entries.map((entry) => {
            const isHighlightedEntry =
              (highlightedTargetDay === entry.day && isHighlightedRow) ||
              matchedDayNumber === entry.day;
            return (
              <SwipeToDeleteItem
                key={entry.id}
                disabled={readOnly || !onDeleteEntry}
                deleteLabel="حذف القيد"
                onDelete={() => onDeleteEntry?.(entry.id)}
                className={`border ${
                  isHighlightedEntry
                    ? 'border-[#d97706] ring-1 ring-[#eab308]/50'
                    : 'border-[#e4eae6]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-[#173f2e] tabular-nums">
                        {formatEntryDateDisplay(entry, numeralStyle)}
                      </span>
                      <span className="text-xs font-black text-[#17211d] tabular-nums">
                        {formatQtyWithUnit(entry.qty, numeralStyle, unit)}
                      </span>
                    </div>
                    {entry.desc && (
                      <div className="text-[11px] text-[#647069] truncate mt-0.5">
                        <HighlightText text={entry.desc} query={searchQuery} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {onEditEntry && (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onEditEntry(entry)}
                        title="تعديل القيد"
                        aria-label={`تعديل قيد ${entry.name}`}
                        className="w-9 h-9 rounded-lg grid place-items-center bg-[#f7f8f6] hover:bg-[#e8f0eb] text-[#173f2e] border border-[#d9dfdb] disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {onDeleteEntry && (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onDeleteEntry(entry.id)}
                        title="حذف القيد"
                        aria-label={`حذف قيد ${entry.name}`}
                        className="w-9 h-9 rounded-lg grid place-items-center bg-[#fff0ef] hover:bg-[#fde2e0] text-[#9e3029] border border-[#f0ceca] disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </SwipeToDeleteItem>
            );
          })
        )}
      </div>
    </div>
  );
});
