import {
  DailySummaryRow,
  LedgerPrintPage,
  NumeralStyle,
  ReportScope,
  SheetKey,
  SignerInfo,
} from '../types/ledger';
import {
  BeneficiaryStatement,
  SHEETS,
  SHEET_STYLES,
  formatEntryDateDisplay,
  formatFullDateLabel,
  formatNum,
  formatPeriodLabel,
  formatQtyWithUnit,
  roundQty,
  sanitizeImageDataUrl,
} from './ledgerLogic';

function fmtEn(n: number): string {
  return roundQty(Number(n || 0)).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function drawLedgerPNG(
  p: LedgerPrintPage,
  period: string,
  signer: SignerInfo
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const W = 7680;
    const H = 5432;
    const LOGW = 1123;
    const scale = W / LOGW;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) return reject(new Error('Canvas 2D unavailable'));

    c.scale(scale, scale);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, LOGW, 794);
    c.direction = 'rtl';
    c.textBaseline = 'middle';

    const margin = 21;
    const tableW = LOGW - margin * 2;
    const widths = { num: 29, name: 139, total: 65 };
    const dayW = (tableW - widths.num - widths.name - widths.total) / 31;

    const cols = [
      { key: 'total', w: widths.total },
      ...Array.from({ length: 31 }, (_, i) => ({ key: `d${31 - i}`, w: dayW })),
      { key: 'name', w: widths.name },
      { key: 'num', w: widths.num },
    ];

    c.fillStyle = '#173f2e';
    c.font = '900 22px Cairo, "Noto Sans Arabic", sans-serif';
    c.textAlign = 'center';
    c.fillText(SHEETS[p.sheet], LOGW / 2, 28);

    c.fillStyle = '#647069';
    c.font = '500 10px Cairo, "Noto Sans Arabic", sans-serif';
    c.fillText(
      `الفترة: ${formatPeriodLabel(period)}   •   صفحة ${p.pageNo} من ${p.totalPages}`,
      LOGW / 2,
      50
    );

    let y = 72;
    const headH = 26;
    const rowH = 22;
    const totalH = 24;

    const drawCell = (
      x: number,
      cy: number,
      w: number,
      h: number,
      text: string,
      opts: {
        fill?: string;
        color?: string;
        bold?: boolean;
        size?: number;
        align?: CanvasTextAlign;
      } = {}
    ) => {
      c.fillStyle = opts.fill || '#ffffff';
      c.fillRect(x, cy, w, h);
      c.strokeStyle = '#89968e';
      c.lineWidth = 0.6;
      c.strokeRect(x, cy, w, h);
      if (text) {
        c.fillStyle = opts.color || '#17211d';
        c.font = `${opts.bold ? '800' : '500'} ${opts.size || 10}px Cairo, "Noto Sans Arabic", sans-serif`;
        c.textAlign = opts.align || 'center';
        c.direction = 'rtl';
        c.fillText(
          String(text),
          opts.align === 'right' ? x + w - 4 : x + w / 2,
          cy + h / 2,
          w - 4
        );
      }
    };

    let xx = margin;
    for (const col of cols) {
      const txt =
        col.key === 'total'
          ? 'الإجمالي'
          : col.key === 'name'
          ? 'المستفيد'
          : col.key === 'num'
          ? 'م.'
          : col.key.slice(1);
      drawCell(xx, y, col.w, headH, txt, {
        fill: '#173f2e',
        color: '#ffffff',
        bold: true,
        size: col.key === 'name' ? 12 : 10,
        align: col.key === 'name' ? 'right' : 'center',
      });
      xx += col.w;
    }
    y += headH;

    const padded = [...p.rows];
    while (padded.length < 25) {
      padded.push({ name: '', days: Array(32).fill(0) });
    }

    const colTotals = Array(32).fill(0);
    let grand = 0;
    p.rows.forEach((r) => {
      r.days.forEach((v, d) => {
        colTotals[d] = roundQty(colTotals[d] + (Number(v) || 0));
      });
      grand = roundQty(grand + r.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0));
    });

    padded.forEach((r, idx) => {
      const rowSum = roundQty(r.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0));
      let xx2 = margin;
      for (const col of cols) {
        let text = '';
        let fill = idx % 2 ? '#f8faf8' : '#ffffff';
        if (col.key === 'total') {
          text = r.name && rowSum ? fmtEn(rowSum) : '';
          fill = '#f3f6f3';
        } else if (col.key === 'name') {
          text = r.name;
          fill = '#ede6d6';
        } else if (col.key === 'num') {
          text = r.name ? String(idx + 1) : '';
        } else {
          const d = Number(col.key.slice(1));
          text = r.days[d] ? fmtEn(r.days[d]) : '';
        }
        drawCell(xx2, y, col.w, rowH, text, {
          fill,
          bold: col.key === 'total' || col.key === 'name',
          size: col.key === 'name' ? 11 : 10,
          align: col.key === 'name' ? 'right' : 'center',
        });
        xx2 += col.w;
      }
      y += rowH;
    });

    let xx3 = margin;
    for (const col of cols) {
      let text = '';
      if (col.key === 'total') text = fmtEn(grand);
      else if (col.key === 'name') text = 'الإجمالي';
      else if (col.key !== 'num') {
        const d = Number(col.key.slice(1));
        text = colTotals[d] ? fmtEn(colTotals[d]) : '';
      }
      drawCell(xx3, y, col.w, totalH, text, {
        fill: '#e6ece7',
        bold: true,
        size: col.key === 'name' ? 11 : 10,
        align: col.key === 'name' ? 'right' : 'center',
      });
      xx3 += col.w;
    }
    y += totalH + 23;

    drawSignerOnCanvas(c, signer, LOGW, margin, y, () => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create PNG blob'))),
        'image/png'
      );
    }, reject);
  });
}

export function drawDailyReportPNG(params: {
  rows: DailySummaryRow[];
  period: string;
  scope: ReportScope;
  unit: string;
  numeralStyle: NumeralStyle;
  showSheetBreakdown: boolean;
  signer: SignerInfo;
}): Promise<Blob> {
  const { rows, period, scope, unit, numeralStyle, showSheetBreakdown, signer } = params;

  return new Promise((resolve, reject) => {
    const LOGW = 840;
    const headerH = 92;
    const tableHeadH = 34;
    const rowH = 30;
    const totalH = 34;
    const footerH = 110;
    const LOGH = Math.max(620, headerH + tableHeadH + rows.length * rowH + totalH + footerH);
    const scale = 3; // 2520px crisp high-DPI portrait output

    const canvas = document.createElement('canvas');
    canvas.width = LOGW * scale;
    canvas.height = LOGH * scale;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) return reject(new Error('Canvas 2D unavailable'));

    c.scale(scale, scale);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, LOGW, LOGH);
    c.direction = 'rtl';
    c.textBaseline = 'middle';

    const margin = 36;
    const tableW = LOGW - margin * 2;

    c.fillStyle = '#173f2e';
    c.font = '900 22px Cairo, "Noto Sans Arabic", sans-serif';
    c.textAlign = 'center';
    c.fillText('تقرير المنصرف الإجمالي بحسب التاريخ', LOGW / 2, 34);

    const scopeLabel = scope === 'all' ? 'جميع الكشوفات' : SHEETS[scope];
    c.fillStyle = '#647069';
    c.font = '600 12px Cairo, "Noto Sans Arabic", sans-serif';
    c.fillText(
      `الفترة: ${formatPeriodLabel(period)}   •   النطاق: ${scopeLabel}`,
      LOGW / 2,
      62
    );

    const cols = showSheetBreakdown
      ? [
          { key: 'count', label: 'عدد القيود', w: tableW * 0.14 },
          { key: 'single', label: 'التفريدة', w: tableW * 0.14 },
          { key: 'dispatch', label: 'التفويج', w: tableW * 0.14 },
          { key: 'order', label: 'بأمر', w: tableW * 0.14 },
          { key: 'qty', label: 'الكمية', w: tableW * 0.22 },
          { key: 'date', label: 'التاريخ', w: tableW * 0.22 },
        ]
      : [
          { key: 'count', label: 'عدد القيود', w: tableW * 0.3 },
          { key: 'qty', label: 'الكمية', w: tableW * 0.38 },
          { key: 'date', label: 'التاريخ', w: tableW * 0.32 },
        ];

    const drawCell = (
      x: number,
      cy: number,
      w: number,
      h: number,
      text: string,
      opts: { fill?: string; color?: string; bold?: boolean; size?: number } = {}
    ) => {
      c.fillStyle = opts.fill || '#ffffff';
      c.fillRect(x, cy, w, h);
      c.strokeStyle = '#9aa79f';
      c.lineWidth = 0.7;
      c.strokeRect(x, cy, w, h);
      if (text) {
        c.fillStyle = opts.color || '#17211d';
        c.font = `${opts.bold ? '800' : '600'} ${opts.size || 12}px Cairo, "Noto Sans Arabic", sans-serif`;
        c.textAlign = 'center';
        c.direction = 'rtl';
        c.fillText(String(text), x + w / 2, cy + h / 2, w - 10);
      }
    };

    let y = headerH;
    let xx = margin;
    for (const col of cols) {
      drawCell(xx, y, col.w, tableHeadH, col.label, {
        fill: '#173f2e',
        color: '#ffffff',
        bold: true,
        size: 13,
      });
      xx += col.w;
    }
    y += tableHeadH;

    let grandQty = 0;
    let grandCount = 0;
    let grandOrder = 0;
    let grandDispatch = 0;
    let grandSingle = 0;

    rows.forEach((r, idx) => {
      grandQty = roundQty(grandQty + r.totalQty);
      grandCount += r.entryCount;
      grandOrder = roundQty(grandOrder + r.bySheet.order);
      grandDispatch = roundQty(grandDispatch + r.bySheet.dispatch);
      grandSingle = roundQty(grandSingle + r.bySheet.single);

      const dateLabel = formatFullDateLabel(r, period, numeralStyle).primary;
      let cx = margin;
      for (const col of cols) {
        let text = '';
        let fill = idx % 2 ? '#f8faf8' : '#ffffff';
        if (col.key === 'date') {
          text = dateLabel;
          fill = '#ede6d6';
        } else if (col.key === 'qty') {
          text = formatQtyWithUnit(r.totalQty, numeralStyle, unit);
        } else if (col.key === 'count') {
          text = formatNum(r.entryCount, numeralStyle);
        } else if (col.key === 'order') {
          text = r.bySheet.order ? formatNum(r.bySheet.order, numeralStyle) : '—';
        } else if (col.key === 'dispatch') {
          text = r.bySheet.dispatch ? formatNum(r.bySheet.dispatch, numeralStyle) : '—';
        } else if (col.key === 'single') {
          text = r.bySheet.single ? formatNum(r.bySheet.single, numeralStyle) : '—';
        }

        drawCell(cx, y, col.w, rowH, text, {
          fill,
          bold: col.key === 'date' || col.key === 'qty',
          size: 12,
        });
        cx += col.w;
      }
      y += rowH;
    });

    let cxTotal = margin;
    for (const col of cols) {
      let text = '';
      if (col.key === 'date') text = 'الإجمالي الكلي';
      else if (col.key === 'qty') text = formatQtyWithUnit(grandQty, numeralStyle, unit);
      else if (col.key === 'count') text = formatNum(grandCount, numeralStyle);
      else if (col.key === 'order') text = formatNum(grandOrder, numeralStyle);
      else if (col.key === 'dispatch') text = formatNum(grandDispatch, numeralStyle);
      else if (col.key === 'single') text = formatNum(grandSingle, numeralStyle);

      drawCell(cxTotal, y, col.w, totalH, text, {
        fill: '#e6ece7',
        color: '#173f2e',
        bold: true,
        size: 13,
      });
      cxTotal += col.w;
    }
    y += totalH + 26;

    drawSignerOnCanvas(
      c,
      signer,
      LOGW,
      margin,
      y,
      () => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create PNG blob'))),
          'image/png'
        );
      },
      reject
    );
  });
}

function drawSignerOnCanvas(
  c: CanvasRenderingContext2D,
  s: SignerInfo,
  logW: number,
  margin: number,
  y: number,
  onDone: () => void,
  onError: (err: unknown) => void
) {
  const safeImage = sanitizeImageDataUrl(s.image);
  if (safeImage) {
    const img = new Image();
    img.onload = () => {
      const maxW = 148;
      const maxH = 48;
      let w = img.width;
      let h = img.height;
      const s2 = Math.min(maxW / w, maxH / h, 1);
      w *= s2;
      h *= s2;
      const sx =
        s.position === 'right'
          ? logW - margin - w
          : s.position === 'left'
          ? margin
          : (logW - w) / 2;
      c.drawImage(img, sx, y, w, h);
      c.fillStyle = '#17211d';
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.font = '800 11px Cairo, "Noto Sans Arabic", sans-serif';
      c.fillText(s.name || '', sx + w / 2, y + h + 12);
      c.fillStyle = '#647069';
      c.font = '500 9.5px Cairo, "Noto Sans Arabic", sans-serif';
      c.fillText(s.job || '', sx + w / 2, y + h + 26);
      onDone();
    };
    img.onerror = () => onError(new Error('Failed to load signature image'));
    img.src = safeImage;
  } else {
    c.fillStyle = '#17211d';
    c.textAlign = s.position === 'right' ? 'right' : s.position === 'left' ? 'left' : 'center';
    c.direction = 'rtl';
    const sx =
      s.position === 'right' ? logW - margin : s.position === 'left' ? margin : logW / 2;
    c.font = '800 11px Cairo, "Noto Sans Arabic", sans-serif';
    c.fillText(s.name || '', sx, y + 10);
    c.fillStyle = '#647069';
    c.font = '500 9.5px Cairo, "Noto Sans Arabic", sans-serif';
    c.fillText(s.job || '', sx, y + 25);
    onDone();
  }
}

export function drawBeneficiaryReportPNG(params: {
  statement: BeneficiaryStatement;
  period: string;
  scope: ReportScope;
  unit: string;
  numeralStyle: NumeralStyle;
  signer: SignerInfo;
}): Promise<Blob> {
  const { statement, period, scope, unit, numeralStyle, signer } = params;

  return new Promise((resolve, reject) => {
    const LOGW = 860;
    const headerH = 88;
    const cardsH = 66;
    const gapAfterCards = 18;
    const tableHeadH = 34;
    const rowH = 30;
    const totalH = 34;
    const footerH = 115;
    const LOGH = Math.max(
      640,
      headerH +
        cardsH +
        gapAfterCards +
        tableHeadH +
        statement.entries.length * rowH +
        totalH +
        footerH
    );
    const scale = 3;

    const canvas = document.createElement('canvas');
    canvas.width = LOGW * scale;
    canvas.height = LOGH * scale;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) return reject(new Error('Canvas 2D unavailable'));

    c.scale(scale, scale);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, LOGW, LOGH);
    c.direction = 'rtl';
    c.textBaseline = 'middle';

    const margin = 36;
    const contentW = LOGW - margin * 2;

    c.fillStyle = '#173f2e';
    c.font = '900 22px Cairo, "Noto Sans Arabic", sans-serif';
    c.textAlign = 'center';
    c.fillText(`تقرير المنصرف للمستفيد: ${statement.beneficiaryName}`, LOGW / 2, 34);

    const scopeLabel = scope === 'all' ? 'جميع الفئات' : SHEETS[scope];
    c.fillStyle = '#647069';
    c.font = '600 12px Cairo, "Noto Sans Arabic", sans-serif';
    c.fillText(
      `الفترة: ${formatPeriodLabel(period)}   •   الفئة: ${scopeLabel}   •   إجمالي القيود: ${formatNum(
        statement.totalCount,
        numeralStyle
      )}`,
      LOGW / 2,
      62
    );

    // 4 summary boxes (3 categories + grand total)
    const cards: Array<{
      title: string;
      qty: number;
      count: number;
      bg: string;
      border: string;
      color: string;
    }> = [
      {
        title: SHEETS.order,
        qty: statement.bySheet.order.qty,
        count: statement.bySheet.order.count,
        bg: SHEET_STYLES.order.hexBg,
        border: SHEET_STYLES.order.hexBorder,
        color: SHEET_STYLES.order.hexText,
      },
      {
        title: SHEETS.dispatch,
        qty: statement.bySheet.dispatch.qty,
        count: statement.bySheet.dispatch.count,
        bg: SHEET_STYLES.dispatch.hexBg,
        border: SHEET_STYLES.dispatch.hexBorder,
        color: SHEET_STYLES.dispatch.hexText,
      },
      {
        title: SHEETS.single,
        qty: statement.bySheet.single.qty,
        count: statement.bySheet.single.count,
        bg: SHEET_STYLES.single.hexBg,
        border: SHEET_STYLES.single.hexBorder,
        color: SHEET_STYLES.single.hexText,
      },
      {
        title: 'الإجمالي الكلي',
        qty: statement.totalQty,
        count: statement.totalCount,
        bg: '#173f2e',
        border: '#173f2e',
        color: '#ffffff',
      },
    ];

    const cardGap = 10;
    const cardW = (contentW - cardGap * 3) / 4;
    // Draw RTL right-to-left
    cards.forEach((card, idx) => {
      const cx = LOGW - margin - (idx + 1) * cardW - idx * cardGap;
      c.fillStyle = card.bg;
      c.fillRect(cx, headerH, cardW, cardsH);
      c.strokeStyle = card.border;
      c.lineWidth = 1;
      c.strokeRect(cx, headerH, cardW, cardsH);

      c.fillStyle = card.color;
      c.textAlign = 'center';
      c.direction = 'rtl';
      c.font = '700 11px Cairo, "Noto Sans Arabic", sans-serif';
      c.fillText(card.title, cx + cardW / 2, headerH + 17, cardW - 12);

      c.font = '900 15px Cairo, "Noto Sans Arabic", sans-serif';
      c.fillText(
        formatQtyWithUnit(card.qty, numeralStyle, unit),
        cx + cardW / 2,
        headerH + 38,
        cardW - 12
      );

      c.font = '600 10px Cairo, "Noto Sans Arabic", sans-serif';
      c.fillText(
        `${formatNum(card.count, numeralStyle)} قيد`,
        cx + cardW / 2,
        headerH + 54,
        cardW - 12
      );
    });

    const cols = [
      { key: 'qty', label: 'الكمية', w: contentW * 0.18 },
      { key: 'desc', label: 'الوصف / البيان', w: contentW * 0.31 },
      { key: 'sheet', label: 'فئة المنصرف', w: contentW * 0.23 },
      { key: 'date', label: 'التاريخ', w: contentW * 0.19 },
      { key: 'num', label: 'م.', w: contentW * 0.09 },
    ];

    const drawCell = (
      x: number,
      cy: number,
      w: number,
      h: number,
      text: string,
      opts: {
        fill?: string;
        color?: string;
        bold?: boolean;
        size?: number;
        align?: CanvasTextAlign;
      } = {}
    ) => {
      c.fillStyle = opts.fill || '#ffffff';
      c.fillRect(x, cy, w, h);
      c.strokeStyle = '#9aa79f';
      c.lineWidth = 0.7;
      c.strokeRect(x, cy, w, h);
      if (text) {
        c.fillStyle = opts.color || '#17211d';
        c.font = `${opts.bold ? '800' : '600'} ${opts.size || 11.5}px Cairo, "Noto Sans Arabic", sans-serif`;
        c.textAlign = opts.align || 'center';
        c.direction = 'rtl';
        const tx = opts.align === 'right' ? x + w - 8 : x + w / 2;
        c.fillText(String(text), tx, cy + h / 2, w - 14);
      }
    };

    let y = headerH + cardsH + gapAfterCards;
    let xx = margin;
    for (const col of cols) {
      drawCell(xx, y, col.w, tableHeadH, col.label, {
        fill: '#173f2e',
        color: '#ffffff',
        bold: true,
        size: 12.5,
      });
      xx += col.w;
    }
    y += tableHeadH;

    statement.entries.forEach((entry, idx) => {
      const sheetStyle = SHEET_STYLES[entry.sheet as SheetKey];
      let cx = margin;
      for (const col of cols) {
        let text = '';
        let fill = idx % 2 ? '#f8faf8' : '#ffffff';
        let color = '#17211d';
        let bold = false;
        let align: CanvasTextAlign = 'center';

        if (col.key === 'num') {
          text = formatNum(idx + 1, numeralStyle);
          color = '#647069';
        } else if (col.key === 'date') {
          text = formatEntryDateDisplay(entry, numeralStyle);
          fill = '#ede6d6';
          bold = true;
        } else if (col.key === 'sheet') {
          text = sheetStyle.label;
          fill = sheetStyle.hexBg;
          color = sheetStyle.hexText;
          bold = true;
        } else if (col.key === 'desc') {
          text = entry.desc || '—';
          align = 'right';
        } else if (col.key === 'qty') {
          text = formatQtyWithUnit(entry.qty, numeralStyle, unit);
          color = '#173f2e';
          bold = true;
        }

        drawCell(cx, y, col.w, rowH, text, { fill, color, bold, align });
        cx += col.w;
      }
      y += rowH;
    });

    // Total Row
    let cxTotal = margin;
    for (const col of cols) {
      let text = '';
      if (col.key === 'date') text = 'الإجمالي الكلي';
      else if (col.key === 'sheet') text = `${formatNum(statement.totalCount, numeralStyle)} قيد`;
      else if (col.key === 'qty') text = formatQtyWithUnit(statement.totalQty, numeralStyle, unit);

      drawCell(cxTotal, y, col.w, totalH, text, {
        fill: '#e6ece7',
        color: '#173f2e',
        bold: true,
        size: 12.5,
      });
      cxTotal += col.w;
    }
    y += totalH + 26;

    drawSignerOnCanvas(
      c,
      signer,
      LOGW,
      margin,
      y,
      () => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create PNG blob'))),
          'image/png'
        );
      },
      reject
    );
  });
}
