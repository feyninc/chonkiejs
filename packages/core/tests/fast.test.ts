import { FastChunker } from '../src';

describe('FastChunker', () => {
  describe('Creation', () => {
    it('should create a chunker with default options', async () => {
      const chunker = await FastChunker.create();
      expect(chunker).toBeInstanceOf(FastChunker);
      expect(chunker.chunkSize).toBe(4096);
      expect(chunker.delimiters).toBe('\n.?');
      expect(chunker.prefix).toBe(false);
      expect(chunker.consecutive).toBe(false);
      expect(chunker.forwardFallback).toBe(false);
    });

    it('should create with custom options', async () => {
      const chunker = await FastChunker.create({
        chunkSize: 128,
        delimiters: ',;',
        prefix: true,
        consecutive: true,
        forwardFallback: true,
      });

      expect(chunker.chunkSize).toBe(128);
      expect(chunker.delimiters).toBe(',;');
      expect(chunker.prefix).toBe(true);
      expect(chunker.consecutive).toBe(true);
      expect(chunker.forwardFallback).toBe(true);
    });

    it('should throw error for invalid chunkSize', async () => {
      await expect(FastChunker.create({ chunkSize: 0 })).rejects.toThrow('chunkSize must be greater than 0');
      await expect(FastChunker.create({ chunkSize: -1 })).rejects.toThrow('chunkSize must be greater than 0');
    });
  });

  describe('Chunking', () => {
    it('should return empty array for empty text', async () => {
      const chunker = await FastChunker.create();
      expect(chunker.chunk('')).toEqual([]);
    });

    it('should reconstruct original text after chunking', async () => {
      const chunker = await FastChunker.create({ chunkSize: 24, delimiters: ' .!?\n' });
      const text = 'First sentence. Second sentence! Third sentence?\nFourth line.';
      const chunks = chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.map(chunk => chunk.text).join('')).toBe(text);
    });

    it('should maintain correct and continuous indices for ASCII text', async () => {
      const chunker = await FastChunker.create({ chunkSize: 12, delimiters: ' ' });
      const text = 'one two three four five six';
      const chunks = chunker.chunk(text);

      let pos = 0;
      for (const chunk of chunks) {
        expect(chunk.startIndex).toBe(pos);
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
        expect(chunk.tokenCount).toBe(0);
        pos = chunk.endIndex;
      }
      expect(pos).toBe(text.length);
    });

    it('should maintain correct and continuous indices for Unicode text', async () => {
      const chunker = await FastChunker.create({ chunkSize: 11, delimiters: ' !' });
      const text = 'Hello 世界! 🦛 emoji café résumé';
      const chunks = chunker.chunk(text);

      let pos = 0;
      for (const chunk of chunks) {
        expect(chunk.startIndex).toBe(pos);
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
        pos = chunk.endIndex;
      }
      expect(chunks.map(chunk => chunk.text).join('')).toBe(text);
      expect(pos).toBe(text.length);
    });

    it('should prefer pattern over delimiters when pattern is provided', async () => {
      const chunker = await FastChunker.create({
        chunkSize: 9,
        delimiters: '|',
        pattern: '||',
      });

      const text = 'alpha||beta||gamma||delta';
      const chunks = chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].text.endsWith('||')).toBe(true);
      }
      expect(chunks.map(chunk => chunk.text).join('')).toBe(text);
    });

    it('should support prefix, consecutive, and forwardFallback options', async () => {
      const chunker = await FastChunker.create({
        chunkSize: 8,
        delimiters: '.',
        prefix: true,
        consecutive: true,
        forwardFallback: true,
      });

      const text = 'aaa....bbb....ccc';
      const chunks = chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.map(chunk => chunk.text).join('')).toBe(text);
    });
  });

  describe('Batch', () => {
    it('should chunk batches of texts', async () => {
      const chunker = await FastChunker.create({ chunkSize: 10, delimiters: ' ' });
      const results = chunker.chunkBatch([
        'one two three four',
        'alpha beta gamma delta',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].map(chunk => chunk.text).join('')).toBe('one two three four');
      expect(results[1].map(chunk => chunk.text).join('')).toBe('alpha beta gamma delta');
    });
  });

  describe('UTF-8 boundaries', () => {
    it('should never cut inside a multi-byte character', async () => {
      const text = 'Hello 世界! 🦛 emoji café résumé. 日本語のテキスト. naïve—done';
      for (let chunkSize = 1; chunkSize <= 20; chunkSize++) {
        const chunker = await FastChunker.create({ chunkSize });
        const chunks = chunker.chunk(text);
        expect(chunks.map(c => c.text).join('')).toBe(text);
        let pos = 0;
        for (const chunk of chunks) {
          expect(chunk.text).not.toContain('\uFFFD');
          expect(chunk.startIndex).toBe(pos);
          expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
          pos = chunk.endIndex;
        }
      }
    });

    it('should reject non-ASCII delimiters', async () => {
      await expect(FastChunker.create({ delimiters: '。' })).rejects.toThrow('delimiters must be ASCII');
    });

    it('should ignore non-ASCII delimiters when a pattern overrides them', async () => {
      const chunker = await FastChunker.create({ delimiters: '。', pattern: 'x' });
      expect(chunker.pattern).toBe('x');
    });
  });
});
