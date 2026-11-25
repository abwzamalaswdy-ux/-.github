import React from 'react';

function normalizeChar(ch: string): string {
  if (/[\u064B-\u065F\u0670\u0640]/.test(ch)) return '';
  if (ch === 'أ' || ch === 'إ' || ch === 'آ' || ch === 'ٱ') return 'ا';
  if (ch === 'ى') return 'ي';
  if (ch === 'ة') return 'ه';
  return ch.toLowerCase();
}

function normalizeDigitsChar(ch: string): string {
  const arIdx = '٠١٢٣٤٥٦٧٨٩'.indexOf(ch);
  if (arIdx >= 0) return String(arIdx);
  const faIdx = '۰۱۲۳۴۵۶۷۸۹'.indexOf(ch);
  if (faIdx >= 0) return String(faIdx);
  return ch;
}

function normalizeWithMap(input: string): { normalized: string; indexMap: number[] } {
  let normalized = '';
  const indexMap: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = normalizeChar(normalizeDigitsChar(input[i]));
    if (ch) {
      normalized += ch;
      indexMap.push(i);
    }
  }
  return { normalized, indexMap };
}

interface HighlightTextProps {
  text: string;
  query: string;
  markClassName?: string;
}

/**
 * Safely highlights all Arabic/digit-normalized occurrences of `query` inside `text`
 * using React <mark> elements (no raw HTML injection).
 */
export const HighlightText: React.FC<HighlightTextProps> = ({
  text,
  query,
  markClassName = 'bg-[#fde68a] text-[#17211d] rounded px-0.5 font-black',
}) => {
  const cleanQuery = query.trim();
  if (!cleanQuery || !text) {
    return <>{text}</>;
  }

  const { normalized: normText, indexMap } = normalizeWithMap(text);
  const { normalized: normQuery } = normalizeWithMap(cleanQuery);

  if (!normQuery || !normText) {
    return <>{text}</>;
  }

  const ranges: Array<[number, number]> = [];
  let searchFrom = 0;
  while (searchFrom <= normText.length - normQuery.length) {
    const matchIdx = normText.indexOf(normQuery, searchFrom);
    if (matchIdx === -1) break;
    const origStart = indexMap[matchIdx];
    const lastNormIdx = matchIdx + normQuery.length - 1;
    let origEnd = indexMap[lastNormIdx] + 1;
    // Include trailing Arabic diacritics attached to the last matched character
    while (origEnd < text.length && /[\u064B-\u065F\u0670]/.test(text[origEnd])) {
      origEnd++;
    }
    ranges.push([origStart, origEnd]);
    searchFrom = matchIdx + normQuery.length;
  }

  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) {
      nodes.push(<React.Fragment key={`t-${i}`}>{text.slice(cursor, start)}</React.Fragment>);
    }
    nodes.push(
      <mark key={`m-${i}`} className={markClassName}>
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });

  if (cursor < text.length) {
    nodes.push(<React.Fragment key="t-end">{text.slice(cursor)}</React.Fragment>);
  }

  return <>{nodes}</>;
};
