import React, { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeToDeleteItemProps {
  disabled?: boolean;
  onDelete: () => void;
  deleteLabel?: string;
  className?: string;
  children: React.ReactNode;
}

const THRESHOLD_PX = 76;
const MAX_OFFSET_PX = 136;

export function SwipeToDeleteItem({
  disabled = false,
  onDelete,
  deleteLabel = 'حذف القيد',
  className = '',
  children,
}: SwipeToDeleteItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);

  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    lock: 'none' | 'horizontal' | 'vertical';
  } | null>(null);

  const resetGesture = () => {
    gestureRef.current = null;
    setDragging(false);
    setOffsetX(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || removing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a, label')) {
      return;
    }

    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      lock: 'none',
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || disabled || removing) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.lock === 'none') {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absY > 9 && absY > absX) {
        g.lock = 'vertical';
        gestureRef.current = null;
        return;
      }
      if (absX > 10 && absX > absY * 1.15) {
        g.lock = 'horizontal';
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture optional
        }
      } else {
        return;
      }
    }

    if (g.lock === 'horizontal') {
      const sign = dx >= 0 ? 1 : -1;
      const absDx = Math.abs(dx);
      const damped =
        absDx <= THRESHOLD_PX
          ? absDx
          : THRESHOLD_PX + (absDx - THRESHOLD_PX) * 0.45;
      setOffsetX(sign * Math.min(MAX_OFFSET_PX, damped));
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) {
      if (dragging) resetGesture();
      return;
    }

    const dx = e.clientX - g.startX;
    const elapsed = Math.max(1, performance.now() - g.startTime);
    const velocity = Math.abs(dx) / elapsed;
    const wasHorizontal = g.lock === 'horizontal';

    gestureRef.current = null;
    setDragging(false);

    if (
      !disabled &&
      wasHorizontal &&
      (Math.abs(offsetX) >= THRESHOLD_PX || (Math.abs(dx) >= 48 && velocity >= 0.45))
    ) {
      const exitDir = offsetX >= 0 ? 1 : -1;
      setRemoving(true);
      setOffsetX(exitDir * 240);
      window.setTimeout(() => {
        onDelete();
      }, 150);
      return;
    }

    setOffsetX(0);
  };

  const absOffset = Math.abs(offsetX);
  const readyToDelete = absOffset >= THRESHOLD_PX;

  return (
    <div
      className={`relative overflow-hidden rounded-xl select-none ${
        removing ? 'opacity-0 transition-opacity duration-150' : ''
      } ${className}`}
    >
      {/* Underlay revealed during horizontal swipe */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-between px-4 transition-colors duration-150 ${
          readyToDelete ? 'bg-[#b93f37] text-white' : 'bg-[#fde2e0] text-[#9e3029]'
        }`}
      >
        <div className="flex items-center gap-1.5 text-xs font-black">
          <Trash2 className="w-4 h-4 shrink-0" />
          <span>{readyToDelete ? `إفلات: ${deleteLabel}` : 'اسحب للحذف'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-black">
          <span>{readyToDelete ? `إفلات: ${deleteLabel}` : 'اسحب للحذف'}</span>
          <Trash2 className="w-4 h-4 shrink-0" />
        </div>
      </div>

      {/* Sliding foreground card */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          transition: dragging
            ? 'none'
            : 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'pan-y',
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}
