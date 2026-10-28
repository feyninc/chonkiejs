/**
 * Token chunker that splits text into fixed-size token chunks.
 */

import { Tokenizer } from '@/tokenizer';
import { Chunk } from '@/types';

export interface TokenChunkerOptions {
  /** Tokenizer instance or model name (default: 'character') */
  tokenizer?: Tokenizer | string;
  /** Maximum tokens per chunk (default: 512) */
  chunkSize?: number;
  /** Number of tokens to overlap between chunks (default: 0) */
  chunkOverlap?: number;
}

/**
 * Splits text into fixed-size token chunks with optional overlap.
 *
 * Uses character-based tokenization by default, but can use advanced
 * tokenizers from @chonkiejs/token package.
 */
export class TokenChunker {
  public readonly chunkSize: number;
  public readonly chunkOverlap: number;
  private tokenizer: Tokenizer;

  private constructor(
    tokenizer: Tokenizer,
    chunkSize: number,
    chunkOverlap: number
  ) {
    if (chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }
    if (chunkOverlap < 0) {
      throw new Error('chunkOverlap must be non-negative');
    }
    if (chunkOverlap >= chunkSize) {
      throw new Error('chunkOverlap must be less than chunkSize');
    }

    this.tokenizer = tokenizer;
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Create a TokenChunker instance.
   *
   * @param options - Configuration options
   * @returns Promise resolving to TokenChunker instance
   *
   * @example
   * // Character-based (no dependencies)
   * const chunker = await TokenChunker.create({ chunkSize: 512 });
   *
   * @example
   * // With HuggingFace tokenizer (requires @chonkiejs/token)
   * const chunker = await TokenChunker.create({
   *   tokenizer: 'gpt2',
   *   chunkSize: 512,
   *   chunkOverlap: 50
   * });
   */
  static async create(options: TokenChunkerOptions = {}): Promise<TokenChunker> {
    const {
      tokenizer = 'character',
      chunkSize = 512,
      chunkOverlap = 0,
    } = options;

    let tokenizerInstance: Tokenizer;

    if (typeof tokenizer === 'string') {
      tokenizerInstance = await Tokenizer.create(tokenizer);
    } else {
      tokenizerInstance = tokenizer;
    }

    return new TokenChunker(tokenizerInstance, chunkSize, chunkOverlap);
  }

  /**
   * Chunk a single text into fixed-size token chunks.
   *
   * @param text - The text to chunk
   * @returns Array of chunks
   */
  async chunk(text: string): Promise<Chunk[]> {
    if (!text) {
      return [];
    }

    const tokens = this.tokenizer.encode(text);
    const chunks: Chunk[] = [];
    const step = this.chunkSize - this.chunkOverlap;
    const allChars = Array.from(text);

    // charOffsets[k] is the UTF-16 length of the first k characters, so each
    // chunk's indices are looked up instead of re-joining a prefix of the text
    // for every chunk (which is quadratic in the text length).
    const charOffsets: number[] = new Array(allChars.length + 1);
    charOffsets[0] = 0;
    for (let k = 0; k < allChars.length; k++) {
      charOffsets[k + 1] = charOffsets[k] + allChars[k].length;
    }

    for (let i = 0; i < tokens.length; i += step) {
      const chunkTokens = tokens.slice(i, i + this.chunkSize);
      const chunkText = this.tokenizer.decode(chunkTokens);
      // slice() truncates fractional bounds, so do the same for the lookups
      const startCharIndex = Math.trunc(i);
      const endCharIndex = Math.min(Math.trunc(i + this.chunkSize), allChars.length);
      const startIndex = charOffsets[Math.min(startCharIndex, allChars.length)];
      const endIndex = charOffsets[Math.min(endCharIndex, allChars.length)];

      chunks.push(new Chunk({
        text: chunkText,
        startIndex,
        endIndex,
        tokenCount: chunkTokens.length,
      }));
    }

    return chunks;
  }

  toString(): string {
    return `TokenChunker(chunkSize=${this.chunkSize}, overlap=${this.chunkOverlap})`;
  }
}
