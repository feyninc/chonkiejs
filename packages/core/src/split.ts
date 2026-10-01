import { IncludeDelim } from '@/types';

/**
 * Escape a string for literal use inside a RegExp.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a global RegExp matching any of the given literal delimiters.
 * Longer delimiters are tried first, so '\r\n' wins over '\r' and '...'
 * wins over '.'.
 */
export function delimiterPattern(delimiters: string[]): RegExp {
  if (delimiters.some(d => d.length === 0)) {
    throw new Error('Delimiter cannot be empty string');
  }
  if (delimiters.length === 0) {
    // Never matches, so the text stays in one piece
    return /(?!)/g;
  }
  const alternatives = [...new Set(delimiters)]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return new RegExp(alternatives.join('|'), 'g');
}

/**
 * Split text at every match of `pattern` and return [start, end] offsets.
 *
 * Offsets are JS string (UTF-16) indices, safe to use with `text.slice`.
 * With 'prev' / 'next' the segments cover the text contiguously. With
 * 'none' the delimiter characters fall in the gaps between segments.
 * Empty segments are never returned.
 */
export function splitOffsets(
  text: string,
  pattern: RegExp,
  includeDelim: IncludeDelim
): [number, number][] {
  const offsets: [number, number][] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    if (includeDelim === 'prev') {
      offsets.push([cursor, end]);
      cursor = end;
    } else {
      if (start > cursor) offsets.push([cursor, start]);
      cursor = includeDelim === 'next' ? start : end;
    }
  }
  if (cursor < text.length) {
    offsets.push([cursor, text.length]);
  }

  return offsets;
}

/**
 * Merge segments shorter than `minChars` into the following segment. A short
 * final segment is merged into the previous one.
 */
export function mergeShortOffsets(
  offsets: [number, number][],
  minChars: number
): [number, number][] {
  if (offsets.length <= 1) return offsets;

  const result: [number, number][] = [];
  let currentStart = offsets[0][0];

  for (let i = 0; i < offsets.length; i++) {
    const e = offsets[i][1];
    const length = e - currentStart;

    if (length >= minChars || i === offsets.length - 1) {
      if (i === offsets.length - 1 && length < minChars && result.length > 0) {
        const last = result[result.length - 1];
        result[result.length - 1] = [last[0], e];
      } else {
        result.push([currentStart, e]);
        if (i < offsets.length - 1) {
          currentStart = offsets[i + 1][0];
        }
      }
    }
  }
  return result;
}
