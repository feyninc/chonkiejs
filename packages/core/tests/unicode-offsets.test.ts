import { RecursiveChunker, SentenceChunker } from '../src';
import { toCharOffsets } from '../src/offsets';

// The WASM splitter reports UTF-8 byte offsets while String.prototype.slice
// indexes UTF-16 code units. The two agree only for ASCII, so these tests pair
// each non-ASCII input with an ASCII input of identical code-unit length:
// chunking must not care which one it is given.
//   'é' / '–' -> 1 code unit, 2-3 UTF-8 bytes  (ASCII twin: 'e' / '-')
//   '🔗'      -> 2 code units, 4 UTF-8 bytes   (ASCII twin: 'ab')
const PARITY_CASES = {
  accented: { wide: 'café '.repeat(400), ascii: 'cafe '.repeat(400) },
  dashed: { wide: 'a – b '.repeat(400), ascii: 'a - b '.repeat(400) },
  emoji: { wide: '🔗 link '.repeat(300), ascii: 'ab link '.repeat(300) },
};

describe('Unicode offset handling', () => {
  describe('toCharOffsets', () => {
    it('should leave ASCII offsets untouched', () => {
      expect(toCharOffsets('ab cd', [[0, 2], [3, 5]])).toEqual([[0, 2], [3, 5]]);
    });

    it('should convert byte offsets for two-byte characters', () => {
      expect(toCharOffsets('é cd', [[0, 2], [3, 5]])).toEqual([[0, 1], [2, 4]]);
    });

    it('should convert byte offsets for astral characters', () => {
      expect(toCharOffsets('🔗 cd', [[0, 4], [5, 7]])).toEqual([[0, 2], [3, 5]]);
    });

    it('should handle an empty offset list', () => {
      expect(toCharOffsets('🔗', [])).toEqual([]);
    });
  });

  describe('RecursiveChunker', () => {
    // A long line without sentence delimiters forces the recursion down to the
    // whitespace level, which is where offsets are applied to the string.
    for (const [name, { wide, ascii }] of Object.entries(PARITY_CASES)) {
      for (const chunkSize of [64, 256, 1024]) {
        it(`should chunk ${name} text like its ASCII twin (chunkSize ${chunkSize})`, async () => {
          const chunker = await RecursiveChunker.create({
            chunkSize,
            minCharactersPerChunk: 16,
          });

          const wideChunks = await chunker.chunk(wide);
          const asciiChunks = await chunker.chunk(ascii);

          expect(wideChunks.map(chunk => chunk.text.length)).toEqual(
            asciiChunks.map(chunk => chunk.text.length)
          );
          expect(wideChunks.map(chunk => chunk.startIndex)).toEqual(
            asciiChunks.map(chunk => chunk.startIndex)
          );
        });
      }
    }

    it('should not drop characters from the middle of the text', async () => {
      const chunker = await RecursiveChunker.create({
        chunkSize: 64,
        minCharactersPerChunk: 16,
      });
      const text = 'café '.repeat(400);

      const chunks = await chunker.chunk(text);

      // The whitespace level drops the final delimiter for ASCII text too, so
      // compare against the trimmed source rather than the raw input.
      expect(chunks.map(chunk => chunk.text).join('')).toBe(text.trimEnd());
    });

    it('should never split a surrogate pair', async () => {
      const chunker = await RecursiveChunker.create({
        chunkSize: 64,
        minCharactersPerChunk: 16,
      });

      const chunks = await chunker.chunk(PARITY_CASES.emoji.wide);

      for (const chunk of chunks) {
        expect(chunk.text.isWellFormed()).toBe(true);
      }
    });

    it('should report offsets that index back into the source text', async () => {
      const chunker = await RecursiveChunker.create({
        chunkSize: 64,
        minCharactersPerChunk: 16,
      });
      const text = 'café '.repeat(400);

      const chunks = await chunker.chunk(text);

      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });
  });

  describe('SentenceChunker', () => {
    // Single-character delimiters take the WASM path; the multi-character
    // defaults are split in JS and were never affected.
    const delim = ['.', '!', '?'];
    const text = 'Le café était très bon. Un peu cher. Mais bon quand même. Voilà.';

    it('should not run offsets past the end of the text', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 32,
        minCharactersPerSentence: 4,
        delim,
      });

      const chunks = await chunker.chunk(text);

      expect(chunks[chunks.length - 1].endIndex).toBe(text.length);
    });

    it('should split sentences at delimiters rather than mid-word', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 32,
        minCharactersPerSentence: 4,
        delim,
      });

      const chunks = await chunker.chunk(text);

      for (const chunk of chunks) {
        expect(chunk.text.trimEnd().endsWith('.')).toBe(true);
      }
    });

    it('should never split a surrogate pair', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 64,
        minCharactersPerSentence: 8,
        delim,
      });

      const chunks = await chunker.chunk('Voir le lien 🔗 ici. '.repeat(60));

      for (const chunk of chunks) {
        expect(chunk.text.isWellFormed()).toBe(true);
      }
    });
  });
});
