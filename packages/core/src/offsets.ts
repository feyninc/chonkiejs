/**
 * Helpers for moving between the WASM splitter's coordinate system and
 * JavaScript's.
 *
 * `split_offsets` and `chunk_offsets` return **UTF-8 byte** offsets, while
 * `String.prototype.slice` indexes **UTF-16 code units**. The two only agree
 * for ASCII text, so byte offsets must be converted before they touch a string.
 */

/**
 * Number of UTF-8 bytes needed to encode a single code point.
 */
function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Convert UTF-8 byte offsets into UTF-16 code-unit offsets for the given text.
 *
 * Walks the string once, so the cost is linear in the length of the text
 * regardless of how many offsets are supplied. ASCII-only text is detected up
 * front and returned untouched, which keeps the common case free.
 *
 * @param text - The text the offsets refer to
 * @param byteOffsets - Array of [start, end] UTF-8 byte offset pairs
 * @returns Array of [start, end] UTF-16 code-unit offset pairs
 */
export function toCharOffsets(
  text: string,
  byteOffsets: Array<[number, number]>
): Array<[number, number]> {
  if (byteOffsets.length === 0) return [];

  // Byte and code-unit offsets coincide for ASCII, which is the common case.
  if (!/[^\x00-\x7F]/.test(text)) return byteOffsets;

  const targets = new Set<number>();
  for (const [start, end] of byteOffsets) {
    targets.add(start);
    targets.add(end);
  }

  const sorted = [...targets].sort((a, b) => a - b);
  const charByByte = new Map<number, number>();

  let bytePos = 0;
  let unitPos = 0;
  let cursor = 0;

  for (const char of text) {
    while (cursor < sorted.length && sorted[cursor] <= bytePos) {
      charByByte.set(sorted[cursor], unitPos);
      cursor++;
    }
    bytePos += utf8Length(char.codePointAt(0)!);
    unitPos += char.length;
  }

  // Any remaining target is at or past the end of the text.
  while (cursor < sorted.length) {
    charByByte.set(sorted[cursor], unitPos);
    cursor++;
  }

  return byteOffsets.map(([start, end]) => [
    charByByte.get(start)!,
    charByByte.get(end)!,
  ]);
}
