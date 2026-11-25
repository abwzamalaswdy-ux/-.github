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
} from '../utils/ledgerLogic';

export type PrintPayload =
  | {
      kind: 'ledger';
      pages: LedgerPrintPage[];
      period: string;
    }
  | {
      kind: 'daily';
      rows: DailySummaryRow[];
      period: string;
      scope: ReportScope;
      unit: string;
      numeralStyle: NumeralStyle;
      showSheetBreakdown: boolean;
    }
  | {
      kind: 'beneficiary';
      statement: BeneficiaryStatement;
      period: string;
      scope: ReportScope;
      unit: string;
      numeralStyle: NumeralStyle;
    };

interface PrintViewProps {
  payload: PrintPayload | null;
  signer: SignerInfo;
}

export function PrintView({ payload, signer }: PrintViewProps) {
  if (!payload) return <div id="printRoot" aria-hidden="true" />;

  const safeSigImg = sanitizeImageDataUrl(signer.image);
  const sigBlock =
    signer.name || signer.job || safeSigImg ? (
      <div className={`print-signature pos-${signer.position}`}>
        {safeSigImg && <img src={safeSigImg} alt="التوقيع" />}
        <div className="print-name">{signer.name}</div>
        <div className="print-job">{signer.job}</div>
      </div>
    ) : null;

  if (payload.kind === 'ledger') {
    return (
      <div id="printRoot" aria-hidden="true">
        {payload.pages.map((p, pageIdx) => {
          const colTotal = Array(32).fill(0);
          let grand = 0;
          p.rows.forEach((r) => {
            r.days.forEach((v, d) => {
              colTotal[d] = roundQty(colTotal[d] + (Number(v) || 0));
            });
            grand = roundQty(
              grand + r.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0)
            );
          });

          const padded = [...p.rows];
          while (padded.length < 25) {
            padded.push({ name: '', days: Array(32).fill(0) });
          }

          return (
            <section key={`${p.sheet}-${pageIdx}`} className="print-page-landscape">
              <h1 className="print-title">{SHEETS[p.sheet]}</h1>
              <p className="print-subtitle">
                الفترة: {formatPeriodLabel(payload.period)} · صفحة {p.pageNo} من {p.totalPages}
              </p>

              <table className="print-table" dir="rtl">
                <colgroup>
                  <col style={{ width: '7mm' }} />
                  <col style={{ width: '38mm' }} />
                  {Array.from({ length: 31 }, (_, i) => (
                    <col key={i} />
                  ))}
                  <col style={{ width: '17mm' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>م.</th>
                    <th>المستفيد</th>
                    {Array.from({ length: 31 }, (_, i) => (
                      <th key={i}>{i + 1}</th>
                    ))}
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {padded.map((r, i) => {
                    const rowSum = roundQty(
                      r.days.reduce((a, b) => roundQty(a + (Number(b) || 0)), 0)
                    );
                    return (
                      <tr key={i}>
                        <td>{r.name ? i + 1 : ''}</td>
                        <td className="name-cell">{r.name}</td>
                        {Array.from({ length: 31 }, (_, dIdx) => {
                          const d = dIdx + 1;
                          return (
                            <td key={d}>{r.days[d] ? r.days[d].toLocaleString('en-US') : ''}</td>
                          );
                        })}
                        <td className="total-cell">
                          {r.name && rowSum ? rowSum.toLocaleString('en-US') : ''}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td />
                    <td className="name-cell">الإجمالي</td>
                    {Array.from({ length: 31 }, (_, dIdx) => {
                      const d = dIdx + 1;
                      return (
                        <td key={d}>{colTotal[d] ? colTotal[d].toLocaleString('en-US') : ''}</td>
                      );
                    })}
                    <td>{grand ? grand.toLocaleString('en-US') : ''}</td>
                  </tr>
                </tbody>
              </table>

              {sigBlock}
              <div className="print-page-meta">
                <strong>{SHEETS[p.sheet]}</strong> · {new Date().toLocaleDateString('ar')}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  if (payload.kind === 'beneficiary') {
    const { statement, period, scope, unit, numeralStyle } = payload;
    const scopeLabel = scope === 'all' ? 'جميع الفئات' : SHEETS[scope];

    return (
      <div id="printRoot" aria-hidden="true">
        <section className="print-page-portrait">
          <h1 className="print-title">تقرير المنصرف للمستفيد: {statement.beneficiaryName}</h1>
          <p className="print-subtitle">
            الفترة: {formatPeriodLabel(period)} · النطاق: {scopeLabel} · إجمالي القيود:{' '}
            {formatNum(statement.totalCount, numeralStyle)}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '2.5mm',
              marginBottom: '4mm',
              direction: 'rtl',
            }}
          >
            {(['order', 'dispatch', 'single'] as SheetKey[]).map((sk) => {
              const st = SHEET_STYLES[sk];
              const bucket = statement.bySheet[sk];
              return (
                <div
                  key={sk}
                  style={{
                    background: st.hexBg,
                    color: st.hexText,
                    border: `0.25mm solid ${st.hexBorder}`,
                    padding: '2mm',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '7.5pt', fontWeight: 800 }}>{st.label}</div>
                  <div style={{ fontSize: '10pt', fontWeight: 900, marginTop: '0.6mm' }}>
                    {formatQtyWithUnit(bucket.qty, numeralStyle, unit)}
                  </div>
                  <div style={{ fontSize: '7pt' }}>
                    {formatNum(bucket.count, numeralStyle)} قيد
                  </div>
                </div>
              );
            })}
            <div
              style={{
                background: '#173f2e',
                color: '#ffffff',
                border: '0.25mm solid #173f2e',
                padding: '2mm',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '7.5pt', fontWeight: 800 }}>الإجمالي الكلي</div>
              <div style={{ fontSize: '10pt', fontWeight: 900, marginTop: '0.6mm' }}>
                {formatQtyWithUnit(statement.totalQty, numeralStyle, unit)}
              </div>
              <div style={{ fontSize: '7pt' }}>
                {formatNum(statement.totalCount, numeralStyle)} قيد
              </div>
            </div>
          </div>

          <table className="print-daily-table" dir="rtl">
            <thead>
              <tr>
                <th style={{ width: '10mm' }}>م.</th>
                <th style={{ width: '28mm' }}>التاريخ</th>
                <th style={{ width: '38mm' }}>فئة المنصرف</th>
                <th>الوصف / الملاحظات</th>
                <th style={{ width: '28mm' }}>الكمية</th>
              </tr>
            </thead>
            <tbody>
              {statement.entries.map((entry, idx) => {
                const st = SHEET_STYLES[entry.sheet];
                return (
                  <tr key={entry.id}>
                    <td>{formatNum(idx + 1, numeralStyle)}</td>
                    <td style={{ background: '#ede6d6', fontWeight: 800 }}>
                      {formatEntryDateDisplay(entry, numeralStyle)}
                    </td>
                    <td
                      style={{
                        background: st.hexBg,
                        color: st.hexText,
                        fontWeight: 800,
                      }}
                    >
                      {st.label}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '2.5mm' }}>
                      {entry.desc || '—'}
                    </td>
                    <td style={{ fontWeight: 900, color: '#173f2e' }}>
                      {formatQtyWithUnit(entry.qty, numeralStyle, unit)}
                    </td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td />
                <td>الإجمالي الكلي</td>
                <td>{formatNum(statement.totalCount, numeralStyle)} قيد</td>
                <td />
                <td>{formatQtyWithUnit(statement.totalQty, numeralStyle, unit)}</td>
              </tr>
            </tbody>
          </table>

          {sigBlock}
          <div className="print-page-meta">
            <strong>تقرير المستفيد: {statement.beneficiaryName}</strong> ·{' '}
            {new Date().toLocaleDateString('ar')}
          </div>
        </section>
      </div>
    );
  }

  // Daily Summary Report print view
  const { rows, period, scope, unit, numeralStyle, showSheetBreakdown } = payload;
  const scopeLabel = scope === 'all' ? 'جميع الكشوفات' : SHEETS[scope];

  const grandQty = roundQty(rows.reduce((s, r) => roundQty(s + r.totalQty), 0));
  const grandCount = rows.reduce((s, r) => s + r.entryCount, 0);
  const grandOrder = roundQty(rows.reduce((s, r) => roundQty(s + r.bySheet.order), 0));
  const grandDispatch = roundQty(rows.reduce((s, r) => roundQty(s + r.bySheet.dispatch), 0));
  const grandSingle = roundQty(rows.reduce((s, r) => roundQty(s + r.bySheet.single), 0));

  return (
    <div id="printRoot" aria-hidden="true">
      <section className="print-page-portrait">
        <h1 className="print-title">تقرير المنصرف الإجمالي بحسب التاريخ</h1>
        <p className="print-subtitle">
          الفترة: {formatPeriodLabel(period)} · النطاق: {scopeLabel}
        </p>

        <table className="print-daily-table" dir="rtl">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الكمية</th>
              <th>عدد القيود</th>
              {showSheetBreakdown && (
                <>
                  <th>{SHEETS.order}</th>
                  <th>{SHEETS.dispatch}</th>
                  <th>{SHEETS.single}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dateLabel = formatFullDateLabel(r, period, numeralStyle).primary;
              return (
                <tr key={r.key}>
                  <td style={{ background: '#ede6d6', fontWeight: 800 }}>{dateLabel}</td>
                  <td style={{ fontWeight: 800 }}>
                    {formatQtyWithUnit(r.totalQty, numeralStyle, unit)}
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatNum(r.entryCount, numeralStyle)}</td>
                  {showSheetBreakdown && (
                    <>
                      <td>{r.bySheet.order ? formatNum(r.bySheet.order, numeralStyle) : '—'}</td>
                      <td>
                        {r.bySheet.dispatch ? formatNum(r.bySheet.dispatch, numeralStyle) : '—'}
                      </td>
                      <td>{r.bySheet.single ? formatNum(r.bySheet.single, numeralStyle) : '—'}</td>
                    </>
                  )}
                </tr>
              );
            })}
            <tr className="total-row">
              <td>الإجمالي الكلي</td>
              <td>{formatQtyWithUnit(grandQty, numeralStyle, unit)}</td>
              <td>{formatNum(grandCount, numeralStyle)}</td>
              {showSheetBreakdown && (
                <>
                  <td>{formatNum(grandOrder, numeralStyle)}</td>
                  <td>{formatNum(grandDispatch, numeralStyle)}</td>
                  <td>{formatNum(grandSingle, numeralStyle)}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>

        {sigBlock}
        <div className="print-page-meta">
          <strong>تقرير المنصرف حسب التاريخ</strong> · {new Date().toLocaleDateString('ar')}
        </div>
      </section>
    </div>
  );
}
