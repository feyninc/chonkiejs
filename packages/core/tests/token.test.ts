import { TokenChunker, Tokenizer } from '../src';

/**
 * A tiny stand-in for a subword tokenizer such as the ones @chonkiejs/token
 * wraps around HuggingFace models: it splits on whitespace boundaries and
 * gives each word (and each run of whitespace) its own token, so a token
 * index has no fixed relationship to a character index. The built-in
 * character tokenizer can never expose that mismatch, since it always
 * emits exactly one token per character.
 */
class WordTokenizer extends Tokenizer {
  private vocab: string[] = [];

  countTokens(text: string): number {
    return this.encode(text).length;
  }

  encode(text: string): number[] {
    const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
    return parts.map((part) => {
      const existing = this.vocab.indexOf(part);
      if (existing !== -1) {
        return existing;
      }
      this.vocab.push(part);
      return this.vocab.length - 1;
    });
  }

  decode(tokens: number[]): string {
    return tokens.map((token) => this.vocab[token]).join('');
  }
}

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

  describe('Tokenizers where a token is not one character', () => {
    it('should keep indices aligned when tokens span multiple characters', async () => {
      const chunker = await TokenChunker.create({
        tokenizer: new WordTokenizer(),
        chunkSize: 2,
      });
      const text = 'the quick brown fox jumps over the lazy dog';
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });

    it('should keep indices aligned with overlap for such tokenizers too', async () => {
      const chunker = await TokenChunker.create({
        tokenizer: new WordTokenizer(),
        chunkSize: 4,
        chunkOverlap: 2,
      });
      const text = 'the quick brown fox jumps over the lazy dog';
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(text.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });
  });
});
