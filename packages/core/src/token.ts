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

    for (let i = 0; i < tokens.length; i += step) {
      const chunkTokens = tokens.slice(i, i + this.chunkSize);
      const chunkText = this.tokenizer.decode(chunkTokens);
      const startCharIndex = i;
      const endCharIndex = Math.min(i + this.chunkSize, allChars.length);
      const startIndex = allChars.slice(0, startCharIndex).join('').length;
      const endIndex = allChars.slice(0, endCharIndex).join('').length;

      chunks.push(new Chunk({
        text: chunkText,
        startIndex,
        endIndex,
        tokenCount: chunkTokens.length,
      }));

      // This window already reaches the end of the text. Any further window
      // would be a suffix of this one (it adds no new tokens), so stop here.
      if (i + this.chunkSize >= tokens.length) {
        break;
      }
    }

    return chunks;
  }

  toString(): string {
    return `TokenChunker(chunkSize=${this.chunkSize}, overlap=${this.chunkOverlap})`;
  }
}
