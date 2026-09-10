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

    // startIndex is derived from decoding the tokens that precede each chunk,
    // not from the token index itself. Those only line up for a tokenizer
    // where every token is exactly one character (the built-in 'character'
    // tokenizer); for a real subword tokenizer (HuggingFace, tiktoken, etc.)
    // a handful of tokens can cover many characters, so treating the token
    // index as a character offset silently produces the wrong slice.
    // We walk the token stream once, decoding only the newly-seen slice on
    // each iteration and accumulating its length, so the cost stays linear
    // in the number of tokens rather than re-decoding the whole prefix.
    let previousTokenIndex = 0;
    let startIndex = 0;

    for (let i = 0; i < tokens.length; i += step) {
      startIndex += this.tokenizer.decode(tokens.slice(previousTokenIndex, i)).length;
      previousTokenIndex = i;

      const chunkTokens = tokens.slice(i, i + this.chunkSize);
      const chunkText = this.tokenizer.decode(chunkTokens);
      const endIndex = startIndex + chunkText.length;

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
