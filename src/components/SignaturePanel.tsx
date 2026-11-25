import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eraser, Save, Trash2, X } from 'lucide-react';
import { SignPosition, SignerInfo } from '../types/ledger';
import { sanitizeImageDataUrl } from '../utils/ledgerLogic';

interface SignaturePanelProps {
  signer: SignerInfo;
  readOnly?: boolean;
  onUpdateSigner: (next: SignerInfo) => void;
  onNotify: (msg: string) => void;
  onClose?: () => void;
}

export function SignaturePanel({
  signer,
  readOnly = false,
  onUpdateSigner,
  onNotify,
  onClose,
}: SignaturePanelProps) {
  const [open, setOpen] = useState(Boolean(onClose));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
    canvas.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPointRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#173f2e';
    ctx.lineWidth = 5;

    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  };

  const stopDrawing = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const saveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const safeImg = sanitizeImageDataUrl(canvas.toDataURL('image/png'));
    onUpdateSigner({ ...signer, image: safeImg });
    onNotify('تم حفظ التوقيع على هذا الجهاز.');
  };

  const removeSavedSignature = () => {
    onUpdateSigner({ ...signer, image: '' });
    onNotify('تمت إزالة التوقيع المحفوظ.');
  };

  return (
    <section className="bg-white border border-[#d9dfdb] rounded-2xl shadow-[0_8px_28px_rgba(24,44,34,0.06)] overflow-hidden">
      {onClose ? (
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[#edf0ed]">
          <div>
            <h3 className="text-base font-extrabold text-[#17211d]">التوقيع والمخوّل</h3>
            <p className="text-xs text-[#647069] mt-0.5">
              ارسم التوقيع وحدد الاسم والوظيفة ومكان الظهور في التقارير المطبوعة والصور.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg grid place-items-center bg-[#f7f8f6] text-[#647069] hover:text-[#17211d]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 text-right hover:bg-[#fafbf9] transition-colors"
        >
          <div>
            <h3 className="text-base font-extrabold text-[#17211d]">التوقيع والمخوّل</h3>
            <p className="text-xs text-[#647069] mt-0.5">
              ارسم التوقيع وحدد الاسم والوظيفة ومكان الظهور في التقارير المطبوعة والصور.
            </p>
          </div>
          {open ? (
            <ChevronUp className="w-5 h-5 text-[#647069] shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#647069] shrink-0" aria-hidden="true" />
          )}
        </button>
      )}

      {(onClose || open) && (
        <div className="p-5 border-t border-[#edf0ed] grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-extrabold text-[#46534b] mb-2">
              ارسم التوقيع داخل المربع
            </label>
            <canvas
              ref={canvasRef}
              width={900}
              height={220}
              aria-label="مساحة رسم التوقيع"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              className={`block w-full h-[132px] bg-white border border-dashed border-[#adb9b0] rounded-xl touch-none ${
                readOnly ? 'opacity-60 pointer-events-none cursor-default' : 'cursor-crosshair'
              }`}
            />
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button
                type="button"
                disabled={readOnly}
                onClick={saveCanvas}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold bg-[#173f2e] hover:bg-[#215a41] disabled:opacity-45 disabled:pointer-events-none text-white transition-colors"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>حفظ التوقيع</span>
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={clearCanvas}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold bg-[#f7f8f6] hover:bg-[#edf0ed] disabled:opacity-45 disabled:pointer-events-none text-[#17211d] border border-[#d9dfdb] transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                <span>مسح الرسم</span>
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={removeSavedSignature}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold bg-[#fff0ef] hover:bg-[#fde2e0] disabled:opacity-45 disabled:pointer-events-none text-[#9e3029] border border-[#f0ceca] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إزالة التوقيع المحفوظ</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-[#46534b] mb-2">
              معاينة بلوك التوقيع
            </label>
            <div className="flex items-center justify-start gap-3 min-h-[132px] p-3 border border-dashed border-[#cbd4cd] rounded-xl bg-[#fbfcfb]">
              {sanitizeImageDataUrl(signer.image) && (
                <img
                  src={sanitizeImageDataUrl(signer.image)}
                  alt="التوقيع المحفوظ"
                  className="max-w-[160px] max-h-[76px] object-contain"
                />
              )}
              <div>
                <div className="font-extrabold text-sm text-[#17211d]">
                  {signer.name || 'اسم المخوّل'}
                </div>
                <div className="text-xs font-semibold text-[#647069]">
                  {signer.job || 'الوظيفة'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                  اسم المخوّل
                </span>
                <input
                  type="text"
                  value={signer.name}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => !readOnly && onUpdateSigner({ ...signer, name: e.target.value })}
                  placeholder="الاسم"
                  className="w-full min-h-[40px] px-3 py-2 text-sm rounded-lg border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] disabled:text-[#647069] disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </label>

              <label className="block">
                <span className="block text-xs font-extrabold text-[#46534b] mb-1">
                  الوظيفة
                </span>
                <input
                  type="text"
                  value={signer.job}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => !readOnly && onUpdateSigner({ ...signer, job: e.target.value })}
                  placeholder="الوظيفة"
                  className="w-full min-h-[40px] px-3 py-2 text-sm rounded-lg border border-[#d8dfda] bg-white disabled:bg-[#f2f4f2] disabled:text-[#647069] disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#173f2e]/30"
                />
              </label>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap mt-3 text-xs text-[#647069]">
              <label htmlFor="signPositionSelect" className="font-bold">
                مكان التوقيع في الصفحة
              </label>
              <select
                id="signPositionSelect"
                value={signer.position}
                disabled={readOnly}
                onChange={(e) =>
                  !readOnly && onUpdateSigner({ ...signer, position: e.target.value as SignPosition })
                }
                className="border border-[#d8dfda] rounded-lg bg-white disabled:bg-[#f2f4f2] disabled:text-[#647069] disabled:cursor-not-allowed px-2.5 py-1.5 text-xs font-bold text-[#17211d]"
              >
                <option value="right">يمين الصفحة</option>
                <option value="center">وسط الصفحة</option>
                <option value="left">يسار الصفحة</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
