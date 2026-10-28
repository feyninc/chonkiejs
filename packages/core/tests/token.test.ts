import { TokenChunker } from '../src';

describe('TokenChunker', () => {
  describe('Creation', () => {
    it('should create with default options', async () => {
      const chunker = await TokenChunker.create();
      expect(chunker).toBeInstanceOf(TokenChunker);
      expect(chunker.chunkSize).toBe(512);
      expect(chunker.chunkOverlap).toBe(0);
    });

    it('should create with custom options', async () => {
      const chunker = await TokenChunker.create({
        chunkSize: 100,
        chunkOverlap: 10,
      });
      expect(chunker.chunkSize).toBe(100);
      expect(chunker.chunkOverlap).toBe(10);
    });

    it('should throw for chunkSize <= 0', async () => {
      await expect(TokenChunker.create({ chunkSize: 0 })).rejects.toThrow('chunkSize must be greater than 0');
      await expect(TokenChunker.create({ chunkSize: -1 })).rejects.toThrow('chunkSize must be greater than 0');
    });

    it('should throw for negative chunkOverlap', async () => {
      await expect(TokenChunker.create({ chunkOverlap: -1 })).rejects.toThrow('chunkOverlap must be non-negative');
    });

    it('should throw when chunkOverlap >= chunkSize', async () => {
      await expect(TokenChunker.create({ chunkSize: 10, chunkOverlap: 10 })).rejects.toThrow('chunkOverlap must be less than chunkSize');
      await expect(TokenChunker.create({ chunkSize: 10, chunkOverlap: 15 })).rejects.toThrow('chunkOverlap must be less than chunkSize');
    });
  });

  describe('Chunking', () => {
    it('should return empty array for empty text', async () => {
      const chunker = await TokenChunker.create();
      const chunks = await chunker.chunk('');
      expect(chunks).toEqual([]);
    });

    it('should chunk short text into single chunk', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 100 });
      const text = 'Hello world';
      const chunks = await chunker.chunk(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(text.length);
      expect(chunks[0].tokenCount).toBe(text.length);
    });

    it('should split long text into multiple chunks', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 10 });
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(10);
      }
    });

    it('should maintain correct indices', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 10 });
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = await chunker.chunk(text);
      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });

    it('should reconstruct original text without overlap', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 10 });
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = await chunker.chunk(text);
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should produce valid indices at character boundaries', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 3 });
      const text = 'abcdefghij';
      const chunks = await chunker.chunk(text);
      for (const chunk of chunks) {
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.endIndex).toBeLessThanOrEqual(text.length);
        expect(chunk.startIndex).toBeLessThan(chunk.endIndex);
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });
  });

  describe('Overlap', () => {
    it('should create overlapping chunks', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 10, chunkOverlap: 3 });
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);

      const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
      expect(totalChars).toBeGreaterThan(text.length);
    });

    it('should maintain correct indices with overlap', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 10, chunkOverlap: 3 });
      const text = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = await chunker.chunk(text);
      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });

    it('should not emit a trailing chunk already contained in the previous chunk', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 5, chunkOverlap: 2 });
      const chunks = await chunker.chunk('abcdefghij');
      expect(chunks.map(c => c.text)).toEqual(['abcde', 'defgh', 'ghij']);
      expect(chunks.map(c => [c.startIndex, c.endIndex])).toEqual([[0, 5], [3, 8], [6, 10]]);
    });

    it('should emit a single chunk when the text exactly fits chunkSize', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 5, chunkOverlap: 2 });
      const chunks = await chunker.chunk('abcde');
      expect(chunks.map(c => c.text)).toEqual(['abcde']);
    });

    it('should stop after the window that reaches the end when the length is a multiple of the step', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 4, chunkOverlap: 2 });
      const chunks = await chunker.chunk('abcdefgh');
      expect(chunks.map(c => c.text)).toEqual(['abcd', 'cdef', 'efgh']);
    });

    it('should keep a final partial chunk that still contains new tokens', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 4, chunkOverlap: 2 });
      const chunks = await chunker.chunk('abcdefghi');
      expect(chunks.map(c => c.text)).toEqual(['abcd', 'cdef', 'efgh', 'ghi']);
    });

    it('should never emit a chunk whose range lies inside the previous chunk', async () => {
      for (let chunkSize = 1; chunkSize <= 8; chunkSize++) {
        for (let chunkOverlap = 0; chunkOverlap < chunkSize; chunkOverlap++) {
          const chunker = await TokenChunker.create({ chunkSize, chunkOverlap });
          for (let length = 1; length <= 30; length++) {
            const text = 'abcdefghijklmnopqrstuvwxyz0123'.slice(0, length);
            const chunks = await chunker.chunk(text);
            expect(chunks[chunks.length - 1].endIndex).toBe(length);
            for (let k = 1; k < chunks.length; k++) {
              expect(chunks[k].endIndex).toBeGreaterThan(chunks[k - 1].endIndex);
            }
          }
        }
      }
    });
  });

  describe('Unicode', () => {
    it('should handle emoji text correctly', async () => {
      const chunker = await TokenChunker.create({ chunkSize: 5 });
      const text = 'Hi 🦛 there';
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });
  });
});
