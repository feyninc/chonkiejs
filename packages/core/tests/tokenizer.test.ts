import { Tokenizer } from '../src';

describe('Tokenizer', () => {
  describe('encode/decode', () => {
    it('should round-trip ASCII text', () => {
      const tokenizer = new Tokenizer();
      const text = 'Hello world';
      expect(tokenizer.decode(tokenizer.encode(text))).toBe(text);
    });

    it('should round-trip non-BMP Unicode (emoji)', () => {
      const tokenizer = new Tokenizer();
      const text = 'Hello 🦛 world';
      expect(tokenizer.decode(tokenizer.encode(text))).toBe(text);
    });

    it('should round-trip mixed Unicode text', () => {
      const tokenizer = new Tokenizer();
      const text = 'café 世界 🦛 résumé 🎉';
      expect(tokenizer.decode(tokenizer.encode(text))).toBe(text);
    });
  });

  describe('decode with large inputs', () => {
    it('should decode 200,000 tokens without exceeding the call stack', () => {
      const tokenizer = new Tokenizer();
      const tokens = new Array<number>(200_000).fill('x'.codePointAt(0)!);
      const decoded = tokenizer.decode(tokens);
      expect(decoded.length).toBe(200_000);
      expect(decoded).toBe('x'.repeat(200_000));
    });

    it('should round-trip large mixed Unicode text across slice boundaries', () => {
      const tokenizer = new Tokenizer();
      const text = 'a🦛é漢'.repeat(50_000);
      expect(tokenizer.decode(tokenizer.encode(text))).toBe(text);
    });
  });

  describe('countTokens', () => {
    it('should count characters for ASCII', () => {
      const tokenizer = new Tokenizer();
      expect(tokenizer.countTokens('hello')).toBe(5);
    });

    it('should count string length for emoji', () => {
      const tokenizer = new Tokenizer();
      expect(tokenizer.countTokens('🦛')).toBe('🦛'.length);
    });
  });

  describe('create', () => {
    it('should create character tokenizer by default', async () => {
      const tokenizer = await Tokenizer.create();
      expect(tokenizer).toBeInstanceOf(Tokenizer);
    });

    it('should create character tokenizer with explicit string', async () => {
      const tokenizer = await Tokenizer.create('character');
      expect(tokenizer).toBeInstanceOf(Tokenizer);
    });

    it('should throw for unknown model without @chonkiejs/token', async () => {
      await expect(Tokenizer.create('gpt2')).rejects.toThrow('install @chonkiejs/token');
    });
  });

  describe('decodeBatch', () => {
    it('should decode multiple token arrays', () => {
      const tokenizer = new Tokenizer();
      const batch = [
        tokenizer.encode('hello'),
        tokenizer.encode('world'),
      ];
      expect(tokenizer.decodeBatch(batch)).toEqual(['hello', 'world']);
    });
  });
});
