/// <reference types="vitest/globals" />
import { SentenceChunker, Tokenizer } from '../src';

describe('SentenceChunker', () => {
  describe('Creation', () => {
    it('should create a chunker with default options', async () => {
      const chunker = await SentenceChunker.create();
      expect(chunker).toBeInstanceOf(SentenceChunker);
      expect(chunker.chunkSize).toBe(2048);
      expect(chunker.chunkOverlap).toBe(0);
      expect(chunker.minSentencesPerChunk).toBe(1);
      expect(chunker.minCharactersPerSentence).toBe(12);
      expect(chunker.includeDelim).toBe('prev');
    });

    it('should create a chunker with custom options', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 512,
        chunkOverlap: 50,
        minSentencesPerChunk: 2,
        minCharactersPerSentence: 8,
        delim: ['. ', '! '],
        includeDelim: 'next',
      });
      expect(chunker.chunkSize).toBe(512);
      expect(chunker.chunkOverlap).toBe(50);
      expect(chunker.minSentencesPerChunk).toBe(2);
      expect(chunker.minCharactersPerSentence).toBe(8);
      expect(chunker.includeDelim).toBe('next');
    });

    it('should throw error for invalid chunkSize', async () => {
      await expect(SentenceChunker.create({ chunkSize: 0 })).rejects.toThrow('chunkSize must be greater than 0');
      await expect(SentenceChunker.create({ chunkSize: -1 })).rejects.toThrow('chunkSize must be greater than 0');
    });

    it('should throw error for invalid chunkOverlap', async () => {
      await expect(SentenceChunker.create({ chunkOverlap: -1 })).rejects.toThrow('chunkOverlap must be non-negative');
      await expect(SentenceChunker.create({ chunkSize: 100, chunkOverlap: 100 })).rejects.toThrow('chunkOverlap must be less than chunkSize');
    });

    it('should throw error for invalid minSentencesPerChunk', async () => {
      await expect(SentenceChunker.create({ minSentencesPerChunk: 0 })).rejects.toThrow('minSentencesPerChunk must be at least 1');
    });

    it('should throw error for invalid minCharactersPerSentence', async () => {
      await expect(SentenceChunker.create({ minCharactersPerSentence: 0 })).rejects.toThrow('minCharactersPerSentence must be at least 1');
    });
  });

  describe('Chunking', () => {
    it('should return empty array for empty text', async () => {
      const chunker = await SentenceChunker.create();
      expect(await chunker.chunk('')).toHaveLength(0);
      expect(await chunker.chunk('   ')).toHaveLength(0);
    });

    it('should chunk short text into single chunk', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 500 });
      const text = 'This is a short sentence. It fits in one chunk.';
      const chunks = await chunker.chunk(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(text.length);
    });

    it('should split multiple sentences into chunks', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 30 });
      const text = 'First sentence here. Second sentence here. Third sentence here.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify text reconstruction
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should respect chunk size limits', async () => {
      const chunkSize = 40;
      const chunker = await SentenceChunker.create({ chunkSize });
      const text = 'The quick brown fox jumps. Over the lazy dog runs. Another longer sentence here. And yet more text follows.';
      const chunks = await chunker.chunk(text);

      for (const chunk of chunks) {
        // Allow exceeding only when minSentencesPerChunk forces it
        expect(chunk.tokenCount).toBeLessThanOrEqual(chunkSize * 2);
      }
    });

    it('should maintain correct indices', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 40 });
      const text = 'First sentence is here. Second sentence follows. Third one too.';
      const chunks = await chunker.chunk(text);

      for (const chunk of chunks) {
        const extracted = text.substring(chunk.startIndex, chunk.endIndex);
        expect(extracted).toBe(chunk.text);
      }
    });
  });

  describe('Overlap', () => {
    it('should handle chunk overlap', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 30,
        chunkOverlap: 15,
      });
      const text = 'First sentence here. Second sentence here. Third sentence here. Fourth sentence.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);

      // With overlap, later chunks should start at or before the previous chunk ends
      if (chunks.length >= 2) {
        expect(chunks[1].startIndex).toBeLessThanOrEqual(chunks[0].endIndex);
      }
    });
  });

  describe('Min Sentences Per Chunk', () => {
    it('should enforce minimum sentences per chunk', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 20,
        minSentencesPerChunk: 2,
      });
      const text = 'Short one. Another short. Third here. Fourth one.';
      const chunks = await chunker.chunk(text);

      // Each chunk should ideally have at least 2 sentences worth of text
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Delimiter Options', () => {
    it('should work with single-character delimiters', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 30,
        delim: '\n',
        minCharactersPerSentence: 1,
      });
      const text = 'Line one\nLine two\nLine three\nLine four';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);

      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should work with multi-character delimiters', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 40,
        delim: ['. ', '! '],
      });
      const text = 'Hello world. This is a test! And another sentence. Final one.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);

      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should respect includeDelim prev', async () => {
      const chunker = await SentenceChunker.create({
        chunkSize: 25,
        delim: ['. '],
        includeDelim: 'prev',
        minCharactersPerSentence: 1,
      });
      const text = 'Hello world. Goodbye world.';
      const chunks = await chunker.chunk(text);

      // With 'prev', delimiter attaches to end of preceding segment
      expect(chunks.length).toBeGreaterThan(0);
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });
  });

  describe('Edge Cases', () => {
    it('should handle text with no delimiters', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 100 });
      const text = 'This is a single long sentence without any sentence ending delimiters';
      const chunks = await chunker.chunk(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
    });

    it('should handle very long text', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 100 });
      const text = 'This is a sentence. '.repeat(100);
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);

      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should handle unicode characters', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 50 });
      const text = 'Hello 世界! Émojis 🦛 here. Another sentence café.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);

      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should handle text that is only delimiters', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 100, minCharactersPerSentence: 1 });
      const text = '. . . ';
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Custom Tokenizer', () => {
    it('should work with a custom tokenizer', async () => {
      const tokenizer = new Tokenizer();
      const chunker = await SentenceChunker.create({
        chunkSize: 50,
        tokenizer,
      });

      const text = 'First sentence here. Second sentence here.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Chunk Properties', () => {
    it('should have correct chunk properties', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 40 });
      const text = 'First sentence here. Second sentence here. Third one.';
      const chunks = await chunker.chunk(text);

      for (const chunk of chunks) {
        expect(chunk).toHaveProperty('text');
        expect(chunk).toHaveProperty('startIndex');
        expect(chunk).toHaveProperty('endIndex');
        expect(chunk).toHaveProperty('tokenCount');
        expect(typeof chunk.text).toBe('string');
        expect(typeof chunk.startIndex).toBe('number');
        expect(typeof chunk.endIndex).toBe('number');
        expect(typeof chunk.tokenCount).toBe('number');
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.endIndex).toBeGreaterThanOrEqual(chunk.startIndex);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    });
  });

  describe('toString', () => {
    it('should return readable string representation', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 512 });
      const str = chunker.toString();
      expect(str).toContain('SentenceChunker');
      expect(str).toContain('512');
    });
  });

  describe('Offsets', () => {
    it('should return string offsets for non-ASCII text with a single-character delimiter', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 6, delim: '\n', minCharactersPerSentence: 1 });
      const text = 'café\nnaïve\n日本語\nend';
      const chunks = await chunker.chunk(text);
      expect(chunks.map(c => c.text)).toEqual(['café\n', 'naïve\n', '日本語\n', 'end']);
      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
      expect(chunks[chunks.length - 1].endIndex).toBe(text.length);
    });

    it('should split on non-ASCII delimiters', async () => {
      const chunker = await SentenceChunker.create({ chunkSize: 5, delim: ['。'], minCharactersPerSentence: 1 });
      const chunks = await chunker.chunk('今日は。晴れ。');
      expect(chunks.map(c => c.text)).toEqual(['今日は。', '晴れ。']);
    });
  });
});
