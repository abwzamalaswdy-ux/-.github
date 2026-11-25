import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Entry, SheetKey } from '../types/ledger';
import {
  SHEETS,
  digits,
  isValidCalendarDate,
  roundQty,
} from '../utils/ledgerLogic';

interface EntryEditModalProps {
  entry: Entry | null;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (updated: Entry) => void;
  onDelete: (entryId: string) => void;
}

export function EntryEditModal({
  entry,
  readOnly = false,
  onClose,
  onSave,
  onDelete,
}: EntryEditModalProps) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [dayInput, setDayInput] = useState('1');
  const [qty, setQty] = useState('');
  const [desc, setDesc] = useState('');
  const [sheet, setSheet] = useState<SheetKey>('order');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setDate(entry.date || '');
    setDayInput(String(entry.day || 1));
    setQty(String(entry.qty ?? 0));
    setDesc(entry.desc || '');
    setSheet(entry.sheet);
    setConfirmingDelete(false);
    setError('');
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entry, onClose]);

  if (!entry) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      setError('وضع القراءة فقط نشط — لا يمكن حفظ التعديلات.');
      return;
    }

    const cleanName = name.trim().slice(0, 160);
    if (!cleanName) {
      setError('يرجى إدخال اسم المستفيد.');
      return;
    }

    const normalizedQty = digits(qty).replace(/[,،\s]/g, '').replace(/[٫]/g, '.').trim();
    const numericQty = Number(normalizedQty);
    if (!normalizedQty || !Number.isFinite(numericQty) || numericQty <= 0) {
      setError('يرجى إدخال كمية صحيحة أكبر من صفر.');
      return;
    }

    let finalDate = '';
    let finalDay = Math.trunc(Number(digits(dayInput)));

    if (date.trim()) {
      const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        setError('يرجى اختيار تاريخ صحيح.');
        return;
      }
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      if (!isValidCalendarDate(y, m, d)) {
        setError('التاريخ المختار غير صالح تقويميًا.');
        return;
      }
      finalDate = date.trim();
      finalDay = d;
    } else if (!Number.isInteger(finalDay) || finalDay < 1 || finalDay > 31) {
      setError('يرجى إدخال رقم يوم بين 1 و 31.');
      return;
    }

    onSave({
      id: entry.id,
      name: cleanName,
      day: finalDay,
      date: finalDate,
      desc: desc.trim().slice(0, 400),
      qty: roundQty(numericQty),
      sheet,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101a14]/65 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl border border-[#d9dfdb] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ece9] bg-[#fafbf9]">
          <div>
            <h3 id="edit-entry-title" className="text-base font-extrabold text-[#17211d]">
              تعديل القيد الفردي
            </h3>
            <p className="text-xs text-[#647069] mt-0.5">
              عدّل بيانات القيد أو غيّر التاريخ أو الفئة، أو احذف القيد نهائيًا.
            </p>
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-[#fff0ef] border border-[#f0ceca] text-xs font-bold text-[#9e3029]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="ee-name" className="block text-xs font-extrabold text-[#46534b] mb-1.5">
              اسم المستفيد
            </label>
            <input
              id="ee-name"
              type="text"
              value={name}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {date ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="ee-date" className="text-xs font-extrabold text-[#46534b]">
                    تاريخ الصرف
                  </label>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setDate('')}
                      className="text-[11px] font-bold text-[#647069] hover:text-[#173f2e]"
                    >
                      تحديد اليوم فقط
                    </button>
                  )}
                </div>
                <input
                  id="ee-date"
                  type="date"
                  value={date}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => {
                    setDate(e.target.value);
                    const d = Number(e.target.value.slice(8, 10));
                    if (d >= 1 && d <= 31) setDayInput(String(d));
                  }}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="ee-day" className="text-xs font-extrabold text-[#46534b]">
                    اليوم (1–31)
                  </label>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                      className="text-[11px] font-bold text-[#173f2e] hover:underline"
                    >
                      تحديد تاريخ كامل
                    </button>
                  )}
                </div>
                <input
                  id="ee-day"
                  type="number"
                  min={1}
                  max={31}
                  value={dayInput}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => setDayInput(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </div>
            )}

            <div>
              <label htmlFor="ee-qty" className="block text-xs font-extrabold text-[#46534b] mb-1.5">
                الكمية
              </label>
              <input
                id="ee-qty"
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={qty}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={(e) => setQty(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] text-right focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="ee-desc" className="block text-xs font-extrabold text-[#46534b] mb-1.5">
                الوصف / البيان
              </label>
              <input
                id="ee-desc"
                type="text"
                value={desc}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="مثال: أمر من قائد اللواء"
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              />
            </div>

            <div>
              <label htmlFor="ee-sheet" className="block text-xs font-extrabold text-[#46534b] mb-1.5">
                الكشف / الفئة
              </label>
              <select
                id="ee-sheet"
                value={sheet}
                disabled={readOnly}
                onChange={(e) => setSheet(e.target.value as SheetKey)}
                className="w-full min-h-[42px] px-3 py-2 text-sm rounded-xl border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
              >
                {Object.entries(SHEETS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#edf0ed]">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={readOnly}
                className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none text-white transition-colors"
              >
                حفظ التعديلات
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold bg-[#f7f8f6] text-[#17211d] border border-[#d9dfdb]"
              >
                إلغاء
              </button>
            </div>

            {!readOnly && (
              confirmingDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(entry.id);
                      onClose();
                    }}
                    className="px-3 py-2 min-h-[38px] rounded-xl text-xs font-extrabold bg-[#b93f37] hover:bg-[#9e3029] text-white transition-colors"
                  >
                    تأكيد حذف القيد
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="px-2.5 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#f7f8f6] text-[#647069] border border-[#d9dfdb]"
                  >
                    تراجع
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] text-[#9e3029] border border-[#f0ceca] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>حذف القيد</span>
                </button>
              )
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
