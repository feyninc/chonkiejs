import { RecursiveChunker, RecursiveRules, Tokenizer } from '../src';

describe('RecursiveChunker', () => {
  describe('Basic Functionality', () => {
    it('should create a chunker with default options', async () => {
      const chunker = await RecursiveChunker.create();
      expect(chunker).toBeInstanceOf(RecursiveChunker);
      expect(chunker.chunkSize).toBe(512);
      expect(chunker.minCharactersPerChunk).toBe(24);
    });

    it('should create a chunker with custom options', async () => {
      const chunker = await RecursiveChunker.create({
        chunkSize: 256,
        minCharactersPerChunk: 10
      });
      expect(chunker.chunkSize).toBe(256);
      expect(chunker.minCharactersPerChunk).toBe(10);
    });

    it('should throw error for invalid chunkSize', async () => {
      await expect(RecursiveChunker.create({ chunkSize: 0 })).rejects.toThrow('chunkSize must be greater than 0');
      await expect(RecursiveChunker.create({ chunkSize: -1 })).rejects.toThrow('chunkSize must be greater than 0');
    });

    it('should throw error for invalid minCharactersPerChunk', async () => {
      await expect(RecursiveChunker.create({ minCharactersPerChunk: 0 })).rejects.toThrow('minCharactersPerChunk must be greater than 0');
      await expect(RecursiveChunker.create({ minCharactersPerChunk: -1 })).rejects.toThrow('minCharactersPerChunk must be greater than 0');
    });
  });

  describe('Chunking', () => {
    it('should chunk short text into single chunk', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 100 });
      const text = 'This is a short text.';
      const chunks = await chunker.chunk(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(text.length);
      expect(chunks[0].tokenCount).toBe(text.length);
    });

    it('should chunk text with paragraphs', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 50 });
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify chunks reconstruct original text
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should chunk text with sentences', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 30 });
      const text = 'First sentence. Second sentence. Third sentence.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify text reconstruction
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should handle empty text', async () => {
      const chunker = await RecursiveChunker.create();
      const chunks = await chunker.chunk('');
      expect(chunks).toHaveLength(0);
    });

    it('should maintain correct indices', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 20 });
      const text = 'Hello world. How are you? I am fine.';
      const chunks = await chunker.chunk(text);

      // Verify each chunk's indices are correct
      for (const chunk of chunks) {
        const extractedText = text.substring(chunk.startIndex, chunk.endIndex);
        expect(extractedText).toBe(chunk.text);
      }
    });

    it('should respect chunk size limits', async () => {
      const chunkSize = 50;
      const chunker = await RecursiveChunker.create({ chunkSize });
      const text = 'A'.repeat(200); // Long text without delimiters
      const chunks = await chunker.chunk(text);

      // Each chunk should not exceed chunk size (except possibly last one)
      for (const chunk of chunks) {
        expect(chunk.tokenCount).toBeLessThanOrEqual(chunkSize);
      }
    });
  });

  describe('Custom Rules', () => {
    it('should work with custom rules', async () => {
      const rules = new RecursiveRules({
        levels: [
          { delimiters: ['\n\n'] },  // Paragraphs
          { whitespace: true },       // Words
          {}                          // Characters
        ]
      });

      const chunker = await RecursiveChunker.create({ chunkSize: 30, rules });
      const text = 'First paragraph.\n\nSecond paragraph.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);

      // Verify reconstruction
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should handle single-level rules', async () => {
      const rules = new RecursiveRules({
        levels: [{ whitespace: true }]
      });

      const chunker = await RecursiveChunker.create({ chunkSize: 10, rules });
      const text = 'one two three four five';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('Custom Tokenizer', () => {
    it('should work with custom tokenizer', async () => {
      const tokenizer = new Tokenizer();
      const chunker = await RecursiveChunker.create({
        chunkSize: 50,
        tokenizer
      });

      const text = 'Testing custom tokenizer functionality.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].tokenCount).toBe(tokenizer.countTokens(chunks[0].text));
    });
  });

  describe('Edge Cases', () => {
    it('should handle text with only delimiters', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 10 });
      const text = '\n\n\n\n';
      const chunks = await chunker.chunk(text);

      // Should handle gracefully
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long text', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 100 });
      const text = 'Lorem ipsum dolor sit amet. '.repeat(100);
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify reconstruction
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should handle text with mixed delimiters', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 30 });
      const text = 'Line one.\nLine two.\n\nParagraph.\rAnother line.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);

      // Verify reconstruction
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });

    it('should handle unicode characters', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 50 });
      const text = 'Hello 世界! 🦛 Émojis and spëcial çhars.';
      const chunks = await chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(0);

      // Verify reconstruction
      const reconstructed = chunks.map(c => c.text).join('');
      expect(reconstructed).toBe(text);
    });
  });

  describe('Chunk Properties', () => {
    it('should have correct chunk properties', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 30 });
      const text = 'First sentence. Second sentence.';
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
        expect(chunk.endIndex).toBeGreaterThan(chunk.startIndex);
      }
    });
  });

  describe('HTML and Unicode', () => {
    // Every chunk must be an exact, contiguous slice of the input.
    function expectLossless(text: string, chunks: Awaited<ReturnType<RecursiveChunker['chunk']>>, chunkSize: number) {
      expect(chunks.map(c => c.text).join('')).toBe(text);
      let pos = 0;
      for (const chunk of chunks) {
        expect(chunk.startIndex).toBe(pos);
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
        expect(chunk.tokenCount).toBe(chunk.text.length);
        expect(chunk.tokenCount).toBeLessThanOrEqual(chunkSize);
        pos = chunk.endIndex;
      }
    }

    it('should not corrupt non-ASCII text', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 15 });
      const text = '<p>Café — naïve 日本語テキスト 😀 emoji.</p>\n<p>More “quoted” text… here, ok.</p>';
      expectLossless(text, await chunker.chunk(text), 15);
    });

    it('should keep repeated, leading and trailing spaces', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 5 });
      for (const text of ['<p>a    b</p>', '   <p>hello world foo bar</p>   ', '     ']) {
        expectLossless(text, await chunker.chunk(text), 5);
      }
    });

    it('should count whitespace-level chunks exactly and pack up to chunkSize', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 8, minCharactersPerChunk: 1 });
      const chunks = await chunker.chunk('abc defg hij');
      expect(chunks.map(c => c.text)).toEqual(['abc ', 'defg hij']);
      expect(chunks.map(c => c.tokenCount)).toEqual([4, 8]);
    });

    it('should honor multi-character delimiters', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 25, minCharactersPerChunk: 1 });
      const text = 'Version 2.0 shipped. It is fast. See v1.2.3 notes.';
      const chunks = await chunker.chunk(text);
      expect(chunks.map(c => c.text)).toEqual(['Version 2.0 shipped. ', 'It is fast. ', 'See v1.2.3 notes.']);
    });

    it('should keep CRLF together', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 20, minCharactersPerChunk: 1 });
      const text = '<p>first line</p>\r\n<p>second line</p>\r\n<p>third</p>';
      const chunks = await chunker.chunk(text);
      expect(chunks.map(c => c.text)).toEqual(['<p>first line</p>\r\n', '<p>second line</p>\r\n', '<p>third</p>']);
    });

    it('should split before opening tags', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 32, minCharactersPerChunk: 1 });
      const text = '<div class="a"><div class="b"><div class="c"><div class="d">x</div></div></div></div>';
      const chunks = await chunker.chunk(text);
      expectLossless(text, chunks, 32);
      expect(chunks.slice(1).every(c => c.text.startsWith('<'))).toBe(true);
    });

    it('should prefer line boundaries even when lines are shorter than minCharactersPerChunk', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 32 });
      const text = '<ul>\n<li>one</li>\n<li>two</li>\n<li>three</li>\n<li>four</li>\n</ul>\n';
      const chunks = await chunker.chunk(text);
      expectLossless(text, chunks, 32);
      expect(chunks.every(c => c.text.endsWith('\n'))).toBe(true);
    });

    it('should keep delimiters with includeDelim none', async () => {
      const rules = new RecursiveRules({
        levels: [{ delimiters: ['</p>', '</div>'], includeDelim: 'none' }, { whitespace: true }, {}]
      });
      const chunker = await RecursiveChunker.create({ chunkSize: 20, minCharactersPerChunk: 1, rules });
      const text = '<div><p>First para.</p><p>Second para here</p></div>';
      expectLossless(text, await chunker.chunk(text), 20);
    });

    it('should not exceed chunkSize at the token level with emoji', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 4 });
      const text = '😀😀😀😀😀ab😀';
      expectLossless(text, await chunker.chunk(text), 4);
    });

    it('should reject a space string delimiter and non-integer chunkSize', async () => {
      expect(() => new RecursiveRules({ levels: [{ delimiters: ' ' }] })).toThrow('Use whitespace option');
      await expect(RecursiveChunker.create({ chunkSize: 1.5 })).rejects.toThrow('chunkSize must be an integer');
    });
  });

  describe('Default punctuation', () => {
    it('should split on whitespace before splitting inside words', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 30, minCharactersPerChunk: 1 });
      const text = "<meta name=viewport content=device-width> don't visit https://example.com/a-b";
      const chunks = await chunker.chunk(text);
      expect(chunks.map(c => c.text).join('')).toBe(text);
      const joined = chunks.map(c => c.text).join('|');
      for (const word of ['device-width', "don't", 'https://example.com/a-b']) {
        expect(joined).toContain(word);
      }
    });

    it('should split inside a word that is longer than chunkSize', async () => {
      const chunker = await RecursiveChunker.create({ chunkSize: 12, minCharactersPerChunk: 1 });
      const text = 'https://example.com/docs/getting-started';
      const chunks = await chunker.chunk(text);
      expect(chunks.map(c => c.text)).toEqual(['https://', 'example.com/', 'docs/', 'getting-', 'started']);
    });
  });
});
