import { init as initChunk, split_offsets, merge_splits } from '@chonkiejs/chunk';
import { toCharOffsets } from './offsets';
import { Tokenizer } from '@/tokenizer';
import { Chunk, RecursiveRules, RecursiveLevel, IncludeDelim } from '@/types';

// Track WASM initialization
let wasmInitialized = false;

/**
 * Initialize the WASM module. Called automatically by RecursiveChunker.create().
 */
export async function initWasm(): Promise<void> {
  if (!wasmInitialized) {
    await initChunk();
    wasmInitialized = true;
  }
}

/**
 * Configuration options for RecursiveChunker.
 */
export interface RecursiveChunkerOptions {
  /** Maximum number of tokens per chunk */
  chunkSize?: number;
  /** Rules defining the recursive chunking hierarchy */
  rules?: RecursiveRules;
  /** Tokenizer instance or model name (default: 'character') */
  tokenizer?: Tokenizer | string;
  /** Minimum number of characters per chunk when merging */
  minCharactersPerChunk?: number;
}

/**
 * Recursively chunks text using a hierarchical set of rules.
 *
 * The chunker splits text at progressively finer granularities:
 * paragraphs → sentences → punctuation → words → characters
 *
 * Each chunk respects the configured chunk size limit.
 */
export class RecursiveChunker {
  public readonly chunkSize: number;
  public readonly rules: RecursiveRules;
  public readonly minCharactersPerChunk: number;
  private tokenizer: Tokenizer;
  private readonly CHARS_PER_TOKEN: number = 6.5;

  private constructor(
    tokenizer: Tokenizer,
    chunkSize: number,
    rules: RecursiveRules,
    minCharactersPerChunk: number
  ) {
    if (chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }
    if (minCharactersPerChunk <= 0) {
      throw new Error('minCharactersPerChunk must be greater than 0');
    }

    this.tokenizer = tokenizer;
    this.chunkSize = chunkSize;
    this.rules = rules;
    this.minCharactersPerChunk = minCharactersPerChunk;
  }

  /**
   * Create a RecursiveChunker instance.
   *
   * @param options - Configuration options
   * @returns Promise resolving to RecursiveChunker instance
   *
   * @example
   * // Character-based (no dependencies)
   * const chunker = await RecursiveChunker.create({ chunkSize: 512 });
   *
   * @example
   * // With HuggingFace tokenizer (requires @chonkiejs/token)
   * const chunker = await RecursiveChunker.create({
   *   tokenizer: 'gpt2',
   *   chunkSize: 512
   * });
   */
  static async create(options: RecursiveChunkerOptions = {}): Promise<RecursiveChunker> {
    // Initialize WASM module
    await initWasm();

    const {
      tokenizer = 'character',
      chunkSize = 512,
      rules = new RecursiveRules(),
      minCharactersPerChunk = 24,
    } = options;

    let tokenizerInstance: Tokenizer;

    if (typeof tokenizer === 'string') {
      tokenizerInstance = await Tokenizer.create(tokenizer);
    } else {
      tokenizerInstance = tokenizer;
    }

    return new RecursiveChunker(
      tokenizerInstance,
      chunkSize,
      rules,
      minCharactersPerChunk
    );
  }

  /**
   * Chunk a single text into an array of chunks.
   *
   * @param text - The text to chunk
   * @returns Array of chunks
   */
  async chunk(text: string): Promise<Chunk[]> {
    return this.recursiveChunk(text, 0, 0);
  }

  /**
   * Estimate token count for a piece of text.
   * Uses a heuristic for quick estimation, falls back to actual counting.
   */
  private async estimateTokenCount(text: string): Promise<number> {
    const estimate = Math.max(1, Math.floor(text.length / this.CHARS_PER_TOKEN));
    return estimate > this.chunkSize
      ? this.chunkSize + 1
      : this.tokenizer.countTokens(text);
  }

  /**
   * Split text according to a recursive level's rules using WASM.
   */
  private splitText(text: string, level: RecursiveLevel): string[] {
    // Whitespace splitting - use WASM split with space delimiter
    if (level.whitespace) {
      const offsets = toCharOffsets(text, split_offsets(text, {
        delimiters: ' ',
        includeDelim: 'none',
        minChars: 0
      }));
      return offsets.map(([start, end]) => text.slice(start, end));
    }

    // Delimiter splitting - use WASM split
    if (level.delimiters) {
      // WASM split_offsets treats each character in the delimiters string as a
      // separate single-char delimiter. When the level uses multi-character
      // delimiters (e.g. ['. ', '! ', '? ']), joining them naively would turn
      // space into a delimiter too, collapsing all segments via minChars.
      // Extract unique non-space characters to preserve the intended split.
      const rawDelims = Array.isArray(level.delimiters)
        ? level.delimiters.join('')
        : level.delimiters;
      const delims = [...new Set(rawDelims)].filter(c => c !== ' ').join('');

      // Map includeDelim to WASM format
      const includeDelim: 'prev' | 'next' | 'none' =
        level.includeDelim === 'prev' ? 'prev' :
        level.includeDelim === 'next' ? 'next' : 'none';

      const offsets = toCharOffsets(text, split_offsets(text, {
        delimiters: delims,
        includeDelim,
        minChars: this.minCharactersPerChunk
      }));

      return offsets.map(([start, end]) => text.slice(start, end));
    }

    // Token-based splitting (final level)
    const encoded = this.tokenizer.encode(text);
    const tokenSplits: number[][] = [];
    for (let i = 0; i < encoded.length; i += this.chunkSize) {
      tokenSplits.push(encoded.slice(i, i + this.chunkSize));
    }
    return this.tokenizer.decodeBatch(tokenSplits);
  }

  /**
   * Create a chunk with proper metadata.
   */
  private makeChunk(text: string, tokenCount: number, startOffset: number): Chunk {
    return new Chunk({
      text,
      startIndex: startOffset,
      endIndex: startOffset + text.length,
      tokenCount
    });
  }

  /**
   * Merge splits to respect chunk size limits using WASM.
   */
  private mergeSplits(
    splits: string[],
    tokenCounts: number[],
    combineWhitespace: boolean = false
  ): [string[], number[]] {
    if (!splits.length || !tokenCounts.length) {
      return [[], []];
    }

    if (splits.length !== tokenCounts.length) {
      throw new Error('Mismatch between splits and token counts');
    }

    // If all splits exceed chunk size, return as-is
    if (tokenCounts.every(count => count > this.chunkSize)) {
      return [splits, tokenCounts];
    }

    // Use WASM merge_splits
    const result = merge_splits(tokenCounts, this.chunkSize, combineWhitespace);

    // Build merged strings from indices
    const merged: string[] = [];
    const combinedTokenCounts: number[] = [];
    let currentIndex = 0;

    for (let i = 0; i < result.indices.length; i++) {
      const endIndex = result.indices[i];
      const slicedSplits = splits.slice(currentIndex, endIndex);

      if (combineWhitespace) {
        merged.push(slicedSplits.join(' '));
      } else {
        merged.push(slicedSplits.join(''));
      }

      combinedTokenCounts.push(result.tokenCounts[i]);
      currentIndex = endIndex;
    }

    return [merged, combinedTokenCounts];
  }

  /**
   * Core recursive chunking logic.
   */
  private async recursiveChunk(
    text: string,
    level: number,
    startOffset: number
  ): Promise<Chunk[]> {
    if (!text) {
      return [];
    }

    // Base case: no more levels
    if (level >= this.rules.length) {
      const tokenCount = await this.estimateTokenCount(text);
      return [this.makeChunk(text, tokenCount, startOffset)];
    }

    const currRule = this.rules.getLevel(level);
    if (!currRule) {
      throw new Error(`No rule found at level ${level}`);
    }

    // Split according to current level's rules (using WASM)
    const splits = this.splitText(text, currRule);
    const tokenCounts = await Promise.all(
      splits.map(split => this.estimateTokenCount(split))
    );

    // Merge splits based on level type (using WASM)
    let merged: string[];
    let combinedTokenCounts: number[];

    if (currRule.delimiters === undefined && !currRule.whitespace) {
      // Token level - no merging
      [merged, combinedTokenCounts] = [splits, tokenCounts];
    } else if (currRule.delimiters === undefined && currRule.whitespace) {
      // Whitespace level - merge with spaces
      [merged, combinedTokenCounts] = this.mergeSplits(splits, tokenCounts, true);
      // Add space prefix to all but first split
      merged = merged.slice(0, 1).concat(merged.slice(1).map(t => ' ' + t));
    } else {
      // Delimiter level - merge without spaces
      [merged, combinedTokenCounts] = this.mergeSplits(splits, tokenCounts, false);
    }

    // Recursively process merged splits
    const chunks: Chunk[] = [];
    let currentOffset = startOffset;

    for (let i = 0; i < merged.length; i++) {
      const split = merged[i];
      const tokenCount = combinedTokenCounts[i];

      if (tokenCount > this.chunkSize) {
        // Recursively chunk oversized splits
        chunks.push(...await this.recursiveChunk(split, level + 1, currentOffset));
      } else {
        chunks.push(this.makeChunk(split, tokenCount, currentOffset));
      }

      currentOffset += split.length;
    }

    return chunks;
  }

  toString(): string {
    return `RecursiveChunker(chunkSize=${this.chunkSize}, levels=${this.rules.length})`;
  }
}
