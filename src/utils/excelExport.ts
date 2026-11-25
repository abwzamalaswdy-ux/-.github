import {
  DailySummaryRow,
  NumeralStyle,
  ReportScope,
  SheetKey,
  SignerInfo,
  Entry,
} from '../types/ledger';
import {
  BeneficiaryStatement,
  SHEETS,
  buildBeneficiaryRows,
  filterByPeriod,
  formatEntryDateDisplay,
  formatFullDateLabel,
  formatPeriodLabel,
  roundQty,
} from './ledgerLogic';

/* -------------------------------------------------------------------------- */
/*  Minimal Zero-Dependency OOXML (.xlsx) & PKZIP Builder                     */
/* -------------------------------------------------------------------------- */

const textEncoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, dosDate };
}

function buildZip(files: Array<{ path: string; data: string }>): Blob {
  const { time, dosDate } = dosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.path);
    const dataBytes = textEncoder.encode(file.data);
    const checksum = crc32(dataBytes);

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // STORE (uncompressed)
    lv.setUint16(10, time, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8
    cv.setUint16(10, 0, true); // STORE
    cv.setUint16(12, time, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const part of centralParts) centralSize += part.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [
    ...localParts.map((u) => u.buffer as ArrayBuffer),
    ...centralParts.map((u) => u.buffer as ArrayBuffer),
    eocd.buffer as ArrayBuffer,
  ];
  return new Blob(blobParts, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* -------------------------------------------------------------------------- */
/*  XML Helpers & Formula Injection Guard                                     */
/* -------------------------------------------------------------------------- */

function escapeXml(value: string): string {
  // Strip XML 1.0 invalid control characters first
  const clean = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeExcelText(value: unknown): string {
  let str = String(value ?? '');
  // Neutralize spreadsheet formula prefixes on user-supplied text
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return escapeXml(str);
}

function colLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function sanitizeSheetTitle(raw: string, used: Set<string>): string {
  let base = String(raw || 'كشف')
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  if (!base) base = 'كشف';
  let candidate = base;
  let idx = 2;
  while (used.has(candidate)) {
    const suffix = ` ${idx}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    idx++;
  }
  used.add(candidate);
  return candidate;
}

/* -------------------------------------------------------------------------- */
/*  SpreadsheetML Cell & Worksheet Builders                                   */
/* -------------------------------------------------------------------------- */

const STYLE_DEFAULT = 0;
const STYLE_TITLE = 1;
const STYLE_SUBTITLE = 2;
const STYLE_HEADER = 3;
const STYLE_TEXT_RIGHT = 4;
const STYLE_TEXT_CENTER = 5;
const STYLE_HIGHLIGHT = 6;
const STYLE_ROW_TOTAL = 7;
const STYLE_GRAND_LABEL = 8;
const STYLE_GRAND_NUM = 9;
const STYLE_NUM = 10;
const STYLE_SIGNER = 11;

interface CellSpec {
  col: number; // 0-indexed
  kind: 'text' | 'number' | 'formula';
  value: string | number;
  style: number;
}

interface RowSpec {
  rowNum: number; // 1-indexed
  height?: number;
  cells: CellSpec[];
}

interface SheetSpec {
  name: string;
  colWidths: number[];
  merges?: string[];
  freezeRow?: number; // 1-indexed row to freeze above (e.g. 4 freezes rows 1..4)
  freezeCol?: number; // 0-indexed columns to freeze (e.g. 2 freezes A..B)
  landscape?: boolean;
  rows: RowSpec[];
}

function renderCellXml(rowNum: number, cell: CellSpec): string {
  const ref = `${colLetter(cell.col)}${rowNum}`;
  if (cell.kind === 'number') {
    const n = Number(cell.value);
    const safeNum = Number.isFinite(n) ? n : 0;
    return `<c r="${ref}" s="${cell.style}"><v>${safeNum}</v></c>`;
  }
  if (cell.kind === 'formula') {
    return `<c r="${ref}" s="${cell.style}"><f>${escapeXml(String(cell.value))}</f></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${cell.style}"><is><t xml:space="preserve">${safeExcelText(
    cell.value
  )}</t></is></c>`;
}

function renderWorksheetXml(sheet: SheetSpec): string {
  const colsXml = sheet.colWidths
    .map(
      (width, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`
    )
    .join('');

  const paneXml =
    sheet.freezeRow || sheet.freezeCol
      ? `<pane ${sheet.freezeCol ? `xSplit="${sheet.freezeCol}" ` : ''}${
          sheet.freezeRow ? `ySplit="${sheet.freezeRow}" ` : ''
        }topLeftCell="${colLetter(sheet.freezeCol || 0)}${(sheet.freezeRow || 0) + 1}" activePane="${
          sheet.freezeRow && sheet.freezeCol
            ? 'bottomRight'
            : sheet.freezeRow
            ? 'bottomLeft'
            : 'topRight'
        }" state="frozen"/>`
      : '';

  const rowsXml = sheet.rows
    .map((r) => {
      const htAttr = r.height ? ` ht="${r.height}" customHeight="1"` : '';
      const cellsXml = r.cells.map((c) => renderCellXml(r.rowNum, c)).join('');
      return `<row r="${r.rowNum}"${htAttr}>${cellsXml}</row>`;
    })
    .join('');

  const mergesXml =
    sheet.merges && sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((ref) => `<mergeCell ref="${ref}"/>`)
          .join('')}</mergeCells>`
      : '';

  const orientation = sheet.landscape ? 'landscape' : 'portrait';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0" rightToLeft="1">${paneXml}</sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
  <pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function renderStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.####"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="11"/><color rgb="FF17211D"/><name val="Arial"/></font>
    <font><b/><sz val="14"/><color rgb="FF173F2E"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FF46534B"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF173F2E"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF17211D"/><name val="Arial"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F0EB"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFAFBF9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF173F2E"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF5F0E4"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE6ECE7"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFD9DFDB"/></left>
      <right style="thin"><color rgb="FFD9DFDB"/></right>
      <top style="thin"><color rgb="FFD9DFDB"/></top>
      <bottom style="thin"><color rgb="FFD9DFDB"/></bottom>
    </border>
    <border>
      <left style="thin"><color rgb="FF275943"/></left>
      <right style="thin"><color rgb="FF275943"/></right>
      <top style="thin"><color rgb="FF275943"/></top>
      <bottom style="thin"><color rgb="FF275943"/></bottom>
    </border>
    <border>
      <left style="thin"><color rgb="FFC4D0C7"/></left>
      <right style="thin"><color rgb="FFC4D0C7"/></right>
      <top style="medium"><color rgb="FF173F2E"/></top>
      <bottom style="thin"><color rgb="FF173F2E"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="164" fontId="4" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="6" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
  </cellXfs>
</styleSheet>`;
}

function buildWorkbookBlob(sheets: SheetSpec[]): Blob {
  const usedTitles = new Set<string>();
  const normalizedSheets = sheets.map((s) => ({
    ...s,
    name: sanitizeSheetTitle(s.name, usedTitles),
  }));

  const files: Array<{ path: string; data: string }> = [];

  const sheetOverrides = normalizedSheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${
          i + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  files.push({
    path: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`,
  });

  files.push({
    path: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  });

  const workbookSheetsXml = normalizedSheets
    .map(
      (s, i) =>
        `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('');

  files.push({
    path: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`,
  });

  const wbRels = normalizedSheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${
          i + 1
        }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
          i + 1
        }.xml"/>`
    )
    .join('');

  files.push({
    path: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${wbRels}
  <Relationship Id="rId${
    normalizedSheets.length + 1
  }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  });

  files.push({
    path: 'xl/styles.xml',
    data: renderStylesXml(),
  });

  normalizedSheets.forEach((s, i) => {
    files.push({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      data: renderWorksheetXml(s),
    });
  });

  return buildZip(files);
}

/* -------------------------------------------------------------------------- */
/*  Public Exporters for Ledgers, Daily Summary, and Beneficiary Statements   */
/* -------------------------------------------------------------------------- */

export function buildLedgersExcelBlob({
  entries,
  sheets,
  period,
  unit,
  signer,
}: {
  entries: Entry[];
  sheets: SheetKey[];
  period: string;
  unit: string;
  signer?: SignerInfo;
}): { blob: Blob; filename: string } {
  const periodScoped = filterByPeriod(entries, period);
  const periodLabel = formatPeriodLabel(period);
  const targetSheets: SheetKey[] = sheets.length ? sheets : ['order'];

  const sheetSpecs: SheetSpec[] = targetSheets.map((sheetKey) => {
    const sheetRows = buildBeneficiaryRows(
      periodScoped.filter((e) => e.sheet === sheetKey),
      ''
    );

    const lastCol = colLetter(33); // AH (0=A, 1=B, 2..32=days 1..31, 33=AH Total)
    const rows: RowSpec[] = [];

    // Row 1: Title
    rows.push({
      rowNum: 1,
      height: 28,
      cells: [
        {
          col: 0,
          kind: 'text',
          value: `كشف ${SHEETS[sheetKey]} — الفترة: ${periodLabel}`,
          style: STYLE_TITLE,
        },
        ...Array.from({ length: 33 }, (_, i) => ({
          col: i + 1,
          kind: 'text' as const,
          value: '',
          style: STYLE_TITLE,
        })),
      ],
    });

    // Row 2: Subtitle
    rows.push({
      rowNum: 2,
      height: 22,
      cells: [
        {
          col: 0,
          kind: 'text',
          value: `عدد المستفيدين: ${sheetRows.length} · وحدة القياس: ${unit || 'لتر'} · النظام: كشوفات المنصرف`,
          style: STYLE_SUBTITLE,
        },
        ...Array.from({ length: 33 }, (_, i) => ({
          col: i + 1,
          kind: 'text' as const,
          value: '',
          style: STYLE_SUBTITLE,
        })),
      ],
    });

    // Row 3: Blank spacer
    rows.push({ rowNum: 3, height: 8, cells: [] });

    // Row 4: Table Headers
    const headerCells: CellSpec[] = [
      { col: 0, kind: 'text', value: 'م.', style: STYLE_HEADER },
      { col: 1, kind: 'text', value: 'المستفيد', style: STYLE_HEADER },
      ...Array.from({ length: 31 }, (_, i) => ({
        col: i + 2,
        kind: 'number' as const,
        value: i + 1,
        style: STYLE_HEADER,
      })),
      { col: 33, kind: 'text', value: 'الإجمالي', style: STYLE_HEADER },
    ];
    rows.push({ rowNum: 4, height: 24, cells: headerCells });

    const firstDataRow = 5;
    sheetRows.forEach((r, idx) => {
      const excelRow = firstDataRow + idx;
      const cells: CellSpec[] = [
        { col: 0, kind: 'number', value: idx + 1, style: STYLE_TEXT_CENTER },
        { col: 1, kind: 'text', value: r.name, style: STYLE_TEXT_RIGHT },
      ];
      for (let d = 1; d <= 31; d++) {
        const qty = roundQty(Number(r.days[d]) || 0);
        if (qty > 0) {
          cells.push({ col: d + 1, kind: 'number', value: qty, style: STYLE_NUM });
        } else {
          cells.push({ col: d + 1, kind: 'text', value: '', style: STYLE_TEXT_CENTER });
        }
      }
      cells.push({
        col: 33,
        kind: 'formula',
        value: `SUM(C${excelRow}:AG${excelRow})`,
        style: STYLE_ROW_TOTAL,
      });
      rows.push({ rowNum: excelRow, height: 20, cells });
    });

    const lastDataRow = firstDataRow + sheetRows.length - 1;
    const totalRowNum = firstDataRow + sheetRows.length;

    // Total Row
    const totalCells: CellSpec[] = [
      { col: 0, kind: 'text', value: '', style: STYLE_GRAND_LABEL },
      { col: 1, kind: 'text', value: 'الإجمالي', style: STYLE_GRAND_LABEL },
    ];

    for (let d = 1; d <= 31; d++) {
      const col = colLetter(d + 1);
      if (sheetRows.length > 0) {
        totalCells.push({
          col: d + 1,
          kind: 'formula',
          value: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`,
          style: STYLE_GRAND_NUM,
        });
      } else {
        totalCells.push({ col: d + 1, kind: 'number', value: 0, style: STYLE_GRAND_NUM });
      }
    }

    totalCells.push(
      sheetRows.length > 0
        ? {
            col: 33,
            kind: 'formula',
            value: `SUM(AH${firstDataRow}:AH${lastDataRow})`,
            style: STYLE_GRAND_NUM,
          }
        : { col: 33, kind: 'number', value: 0, style: STYLE_GRAND_NUM }
    );
    rows.push({ rowNum: totalRowNum, height: 24, cells: totalCells });

    const merges = [`A1:${lastCol}1`, `A2:${lastCol}2`];

    // Optional Signer line
    if (signer && (signer.name.trim() || signer.job.trim())) {
      const signerRowNum = totalRowNum + 2;
      const signerText = [
        signer.job.trim() ? `المخوّل (${signer.job.trim()})` : 'المخوّل',
        signer.name.trim(),
      ]
        .filter(Boolean)
        .join(': ');
      rows.push({
        rowNum: signerRowNum,
        height: 22,
        cells: [
          { col: 0, kind: 'text', value: signerText, style: STYLE_SIGNER },
          ...Array.from({ length: 10 }, (_, i) => ({
            col: i + 1,
            kind: 'text' as const,
            value: '',
            style: STYLE_SIGNER,
          })),
        ],
      });
      merges.push(`A${signerRowNum}:K${signerRowNum}`);
    }

    return {
      name: SHEETS[sheetKey],
      colWidths: [6, 28, ...Array(31).fill(7.5), 13],
      merges,
      freezeRow: 4,
      freezeCol: 2,
      landscape: true,
      rows,
    };
  });

  const periodSlug = periodLabel.replace('/', '-');
  const filename =
    targetSheets.length === 1
      ? `كشف_${SHEETS[targetSheets[0]]}_${periodSlug}.xlsx`
      : `كشوفات_المنصرف_${periodSlug}.xlsx`;

  return {
    blob: buildWorkbookBlob(sheetSpecs),
    filename,
  };
}

export function buildDailySummaryExcelBlob({
  rows: summaryRows,
  period,
  scope,
  unit,
  showSheetBreakdown,
  numeralStyle,
  signer,
}: {
  rows: DailySummaryRow[];
  period: string;
  scope: ReportScope;
  unit: string;
  showSheetBreakdown: boolean;
  numeralStyle: NumeralStyle;
  signer?: SignerInfo;
}): { blob: Blob; filename: string } {
  const periodLabel = formatPeriodLabel(period);
  const scopeLabel = scope === 'all' ? 'جميع الكشوفات' : SHEETS[scope];
  const headers = showSheetBreakdown
    ? [
        'التاريخ',
        `الكمية (${unit || 'لتر'})`,
        'عدد القيود',
        'عدد المستفيدين',
        SHEETS.order,
        SHEETS.dispatch,
        SHEETS.single,
      ]
    : ['التاريخ', `الكمية (${unit || 'لتر'})`, 'عدد القيود', 'عدد المستفيدين'];

  const colCount = headers.length;
  const lastCol = colLetter(colCount - 1);
  const rows: RowSpec[] = [];

  rows.push({
    rowNum: 1,
    height: 28,
    cells: [
      {
        col: 0,
        kind: 'text',
        value: `تقرير المنصرف الإجمالي بحسب التاريخ — ${periodLabel}`,
        style: STYLE_TITLE,
      },
      ...Array.from({ length: colCount - 1 }, (_, i) => ({
        col: i + 1,
        kind: 'text' as const,
        value: '',
        style: STYLE_TITLE,
      })),
    ],
  });

  rows.push({
    rowNum: 2,
    height: 22,
    cells: [
      {
        col: 0,
        kind: 'text',
        value: `النطاق: ${scopeLabel} · عدد الأيام: ${summaryRows.length} · الوحدة: ${unit || 'لتر'}`,
        style: STYLE_SUBTITLE,
      },
      ...Array.from({ length: colCount - 1 }, (_, i) => ({
        col: i + 1,
        kind: 'text' as const,
        value: '',
        style: STYLE_SUBTITLE,
      })),
    ],
  });

  rows.push({ rowNum: 3, height: 8, cells: [] });

  rows.push({
    rowNum: 4,
    height: 24,
    cells: headers.map((h, col) => ({
      col,
      kind: 'text',
      value: h,
      style: STYLE_HEADER,
    })),
  });

  const firstDataRow = 5;
  summaryRows.forEach((r, idx) => {
    const excelRow = firstDataRow + idx;
    const dateInfo = formatFullDateLabel(r, period, numeralStyle);
    const dateLabel =
      period !== 'all' && dateInfo.secondary
        ? `${dateInfo.primary} (${dateInfo.secondary})`
        : dateInfo.primary;

    const cells: CellSpec[] = [
      { col: 0, kind: 'text', value: dateLabel, style: STYLE_HIGHLIGHT },
      { col: 1, kind: 'number', value: r.totalQty, style: STYLE_ROW_TOTAL },
      { col: 2, kind: 'number', value: r.entryCount, style: STYLE_NUM },
      { col: 3, kind: 'number', value: r.beneficiaryCount, style: STYLE_NUM },
    ];

    if (showSheetBreakdown) {
      cells.push(
        { col: 4, kind: 'number', value: r.bySheet.order, style: STYLE_NUM },
        { col: 5, kind: 'number', value: r.bySheet.dispatch, style: STYLE_NUM },
        { col: 6, kind: 'number', value: r.bySheet.single, style: STYLE_NUM }
      );
    }

    rows.push({ rowNum: excelRow, height: 22, cells });
  });

  const lastDataRow = firstDataRow + summaryRows.length - 1;
  const totalRowNum = firstDataRow + summaryRows.length;

  const totalCells: CellSpec[] = [
    { col: 0, kind: 'text', value: 'الإجمالي الكلي', style: STYLE_GRAND_LABEL },
    {
      col: 1,
      kind: summaryRows.length > 0 ? 'formula' : 'number',
      value: summaryRows.length > 0 ? `SUM(B${firstDataRow}:B${lastDataRow})` : 0,
      style: STYLE_GRAND_NUM,
    },
    {
      col: 2,
      kind: summaryRows.length > 0 ? 'formula' : 'number',
      value: summaryRows.length > 0 ? `SUM(C${firstDataRow}:C${lastDataRow})` : 0,
      style: STYLE_GRAND_NUM,
    },
    { col: 3, kind: 'text', value: '—', style: STYLE_GRAND_LABEL },
  ];

  if (showSheetBreakdown) {
    totalCells.push(
      {
        col: 4,
        kind: summaryRows.length > 0 ? 'formula' : 'number',
        value: summaryRows.length > 0 ? `SUM(E${firstDataRow}:E${lastDataRow})` : 0,
        style: STYLE_GRAND_NUM,
      },
      {
        col: 5,
        kind: summaryRows.length > 0 ? 'formula' : 'number',
        value: summaryRows.length > 0 ? `SUM(F${firstDataRow}:F${lastDataRow})` : 0,
        style: STYLE_GRAND_NUM,
      },
      {
        col: 6,
        kind: summaryRows.length > 0 ? 'formula' : 'number',
        value: summaryRows.length > 0 ? `SUM(G${firstDataRow}:G${lastDataRow})` : 0,
        style: STYLE_GRAND_NUM,
      }
    );
  }

  rows.push({ rowNum: totalRowNum, height: 24, cells: totalCells });

  const merges = [`A1:${lastCol}1`, `A2:${lastCol}2`];
  if (signer && (signer.name.trim() || signer.job.trim())) {
    const signerRowNum = totalRowNum + 2;
    const signerText = [
      signer.job.trim() ? `المخوّل (${signer.job.trim()})` : 'المخوّل',
      signer.name.trim(),
    ]
      .filter(Boolean)
      .join(': ');
    rows.push({
      rowNum: signerRowNum,
      height: 22,
      cells: [
        { col: 0, kind: 'text', value: signerText, style: STYLE_SIGNER },
        ...Array.from({ length: colCount - 1 }, (_, i) => ({
          col: i + 1,
          kind: 'text' as const,
          value: '',
          style: STYLE_SIGNER,
        })),
      ],
    });
    merges.push(`A${signerRowNum}:${lastCol}${signerRowNum}`);
  }

  const colWidths = showSheetBreakdown ? [24, 18, 14, 16, 18, 18, 22] : [26, 20, 16, 18];

  const blob = buildWorkbookBlob([
    {
      name: 'التقرير الإجمالي بالتاريخ',
      colWidths,
      merges,
      freezeRow: 4,
      landscape: showSheetBreakdown,
      rows,
    },
  ]);

  return {
    blob,
    filename: `تقرير_المنصرف_حسب_التاريخ_${periodLabel.replace('/', '-')}.xlsx`,
  };
}

export function buildBeneficiaryStatementExcelBlob({
  statement,
  period,
  scope,
  unit,
  numeralStyle,
  signer,
}: {
  statement: BeneficiaryStatement;
  period: string;
  scope: ReportScope;
  unit: string;
  numeralStyle: NumeralStyle;
  signer?: SignerInfo;
}): { blob: Blob; filename: string } {
  const periodLabel = formatPeriodLabel(period);
  const scopeLabel = scope === 'all' ? 'جميع الفئات' : SHEETS[scope];
  const rows: RowSpec[] = [];

  rows.push({
    rowNum: 1,
    height: 28,
    cells: [
      {
        col: 0,
        kind: 'text',
        value: `تقرير منصرف المستفيد: ${statement.beneficiaryName}`,
        style: STYLE_TITLE,
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        col: i + 1,
        kind: 'text' as const,
        value: '',
        style: STYLE_TITLE,
      })),
    ],
  });

  rows.push({
    rowNum: 2,
    height: 22,
    cells: [
      {
        col: 0,
        kind: 'text',
        value: `الفترة: ${periodLabel} · النطاق: ${scopeLabel} · الوحدة: ${unit || 'لتر'}`,
        style: STYLE_SUBTITLE,
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        col: i + 1,
        kind: 'text' as const,
        value: '',
        style: STYLE_SUBTITLE,
      })),
    ],
  });

  rows.push({ rowNum: 3, height: 8, cells: [] });

  rows.push({
    rowNum: 4,
    height: 24,
    cells: [
      { col: 0, kind: 'text', value: 'م.', style: STYLE_HEADER },
      { col: 1, kind: 'text', value: 'التاريخ', style: STYLE_HEADER },
      { col: 2, kind: 'text', value: 'فئة المنصرف', style: STYLE_HEADER },
      { col: 3, kind: 'text', value: 'الوصف / الملاحظات', style: STYLE_HEADER },
      { col: 4, kind: 'text', value: `الكمية (${unit || 'لتر'})`, style: STYLE_HEADER },
    ],
  });

  const firstDataRow = 5;
  statement.entries.forEach((entry, idx) => {
    const excelRow = firstDataRow + idx;
    rows.push({
      rowNum: excelRow,
      height: 22,
      cells: [
        { col: 0, kind: 'number', value: idx + 1, style: STYLE_TEXT_CENTER },
        {
          col: 1,
          kind: 'text',
          value: formatEntryDateDisplay(entry, numeralStyle),
          style: STYLE_HIGHLIGHT,
        },
        { col: 2, kind: 'text', value: SHEETS[entry.sheet], style: STYLE_TEXT_CENTER },
        { col: 3, kind: 'text', value: entry.desc || '—', style: STYLE_TEXT_RIGHT },
        { col: 4, kind: 'number', value: roundQty(entry.qty), style: STYLE_ROW_TOTAL },
      ],
    });
  });

  const lastDataRow = firstDataRow + statement.entries.length - 1;
  const totalRowNum = firstDataRow + statement.entries.length;
  rows.push({
    rowNum: totalRowNum,
    height: 24,
    cells: [
      { col: 0, kind: 'text', value: '', style: STYLE_GRAND_LABEL },
      { col: 1, kind: 'text', value: 'الإجمالي الكلي', style: STYLE_GRAND_LABEL },
      {
        col: 2,
        kind: 'text',
        value: `${statement.totalCount} قيد`,
        style: STYLE_GRAND_LABEL,
      },
      { col: 3, kind: 'text', value: '', style: STYLE_GRAND_LABEL },
      {
        col: 4,
        kind: statement.entries.length > 0 ? 'formula' : 'number',
        value: statement.entries.length > 0 ? `SUM(E${firstDataRow}:E${lastDataRow})` : 0,
        style: STYLE_GRAND_NUM,
      },
    ],
  });

  // Category Breakdown mini-table below
  const summaryHeaderRow = totalRowNum + 2;
  rows.push({
    rowNum: summaryHeaderRow,
    height: 22,
    cells: [
      { col: 1, kind: 'text', value: 'ملخص حسب الفئة', style: STYLE_HEADER },
      { col: 2, kind: 'text', value: `إجمالي الكمية (${unit || 'لتر'})`, style: STYLE_HEADER },
      { col: 3, kind: 'text', value: 'عدد القيود', style: STYLE_HEADER },
    ],
  });

  (['order', 'dispatch', 'single'] as SheetKey[]).forEach((sk, i) => {
    rows.push({
      rowNum: summaryHeaderRow + 1 + i,
      height: 20,
      cells: [
        { col: 1, kind: 'text', value: SHEETS[sk], style: STYLE_HIGHLIGHT },
        { col: 2, kind: 'number', value: statement.bySheet[sk].qty, style: STYLE_NUM },
        { col: 3, kind: 'number', value: statement.bySheet[sk].count, style: STYLE_TEXT_CENTER },
      ],
    });
  });

  const merges = ['A1:E1', 'A2:E2'];
  if (signer && (signer.name.trim() || signer.job.trim())) {
    const signerRowNum = summaryHeaderRow + 5;
    const signerText = [
      signer.job.trim() ? `المخوّل (${signer.job.trim()})` : 'المخوّل',
      signer.name.trim(),
    ]
      .filter(Boolean)
      .join(': ');
    rows.push({
      rowNum: signerRowNum,
      height: 22,
      cells: [
        { col: 0, kind: 'text', value: signerText, style: STYLE_SIGNER },
        ...Array.from({ length: 4 }, (_, i) => ({
          col: i + 1,
          kind: 'text' as const,
          value: '',
          style: STYLE_SIGNER,
        })),
      ],
    });
    merges.push(`A${signerRowNum}:E${signerRowNum}`);
  }

  const blob = buildWorkbookBlob([
    {
      name: 'تقرير المستفيد',
      colWidths: [8, 18, 22, 34, 18],
      merges,
      freezeRow: 4,
      landscape: false,
      rows,
    },
  ]);

  return {
    blob,
    filename: `تقرير_المستفيد_${statement.beneficiaryName}_${periodLabel.replace('/', '-')}.xlsx`,
  };
}
