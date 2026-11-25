import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Entry, SheetKey } from '../types/ledger';
import {
  SHEETS,
  clampDateToPeriod,
  classify,
  isValidCalendarDate,
  makeEntry,
} from '../utils/ledgerLogic';

interface QuickEntryModalProps {
  open: boolean;
  defaultPeriod: string;
  defaultSheet: SheetKey;
  onClose: () => void;
  onSave: (entry: Entry) => void;
}

export function QuickEntryModal({
  open,
  defaultPeriod,
  defaultSheet,
  onClose,
  onSave,
}: QuickEntryModalProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(() =>
    clampDateToPeriod(defaultPeriod, new Date().toISOString().slice(0, 10))
  );
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('');
  const [sheet, setSheet] = useState<SheetKey>(defaultSheet);
  const [manualSheet, setManualSheet] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (open) {
      const todayIso = new Date().toISOString().slice(0, 10);
      setDate(clampDateToPeriod(defaultPeriod, todayIso));
      setSheet(defaultSheet);
      setManualSheet(false);
      setError('');
    }
  }, [open, defaultPeriod, defaultSheet]);

  if (!open) return null;

  const handleDescChange = (val: string) => {
    setDesc(val);
    if (!manualSheet && val.trim()) {
      setSheet(classify(val));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const numericQty = Number(qty);
    const [year, month, day] = date.split('-').map(Number);

    if (!cleanName) {
      setError('يرجى إدخال اسم المستفيد.');
      return;
    }
    if (!date || !isValidCalendarDate(year, month, day)) {
      setError('يرجى اختيار تاريخ صحيح.');
      return;
    }
    if (!Number.isFinite(numericQty) || numericQty <= 0) {
      setError('يرجى إدخال كمية أكبر من صفر.');
      return;
    }

    const entry = makeEntry(cleanName, day, desc.trim(), numericQty, date, sheet);
    if (!entry) {
      setError('تعذر إنشاء القيد، تحقق من المدخلات.');
      return;
    }

    onSave(entry);
    setName('');
    setDesc('');
    setQty('');
    setError('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-entry-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/60 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9]">
          <h3 id="quick-entry-title" className="text-base font-extrabold text-[#17211d]">
            إضافة قيد منصرف مباشر
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-[#fff0ef] border border-[#f0ceca] text-xs font-bold text-[#9e3029]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="qe-name" className="block text-xs font-extrabold text-[#46534b] mb-1.5">
              اسم المستفيد
            </label>
            <input
              id="qe-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أنس محمد علي"
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="qe-date"
                className="block text-xs font-extrabold text-[#46534b] mb-1.5"
              >
                تاريخ الصرف
              </label>
              <input
                id="qe-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              />
            </div>

            <div>
              <label
                htmlFor="qe-qty"
                className="block text-xs font-extrabold text-[#46534b] mb-1.5"
              >
                الكمية
              </label>
              <input
                id="qe-qty"
                type="number"
                step="any"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="مثال: 40"
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="qe-desc"
                className="block text-xs font-extrabold text-[#46534b] mb-1.5"
              >
                الوصف / البيان
              </label>
              <input
                id="qe-desc"
                type="text"
                value={desc}
                onChange={(e) => handleDescChange(e.target.value)}
                placeholder="مثال: أمر من قائد اللواء"
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              />
            </div>

            <div>
              <label
                htmlFor="qe-sheet"
                className="block text-xs font-extrabold text-[#46534b] mb-1.5"
              >
                الكشف
              </label>
              <select
                id="qe-sheet"
                value={sheet}
                onChange={(e) => {
                  setSheet(e.target.value as SheetKey);
                  setManualSheet(true);
                }}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              >
                {Object.entries(SHEETS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] text-white"
            >
              حفظ القيد
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
