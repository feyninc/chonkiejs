import { Tokenizer } from '@/tokenizer';
import { Chunk, RecursiveRules, RecursiveLevel, IncludeDelim } from '@/types';
import { delimiterPattern, splitOffsets } from '@/split';

/** Matches runs of whitespace for the word level. */
const WHITESPACE_PATTERN = /\s+/g;

/**
 * Split text at every match of `pattern`, keeping every character.
 *
 * `splits.join('')` always equals `text`. With `includeDelim: 'none'` the
 * delimiter becomes its own split rather than being dropped, so offsets stay
 * correct. Consecutive splits shorter than `minChars` are merged together.
 */
function splitByPattern(
  text: string,
  pattern: RegExp,
  includeDelim: IncludeDelim,
  minChars: number
): string[] {
  const segments: string[] = [];
  let cursor = 0;
  for (const [start, end] of splitOffsets(text, pattern, includeDelim)) {
    if (start > cursor) segments.push(text.slice(cursor, start));
    segments.push(text.slice(start, end));
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  if (minChars <= 1) {
    return segments;
  }

  const merged: string[] = [];
  let current = '';
  for (const segment of segments) {
    current += segment;
    if (current.length >= minChars) {
      merged.push(current);
      current = '';
    }
  }
  if (current) {
    merged.push(current);
  }
  return merged;
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
  private readonly patternCache = new Map<RecursiveLevel, RegExp>();

  private constructor(
    tokenizer: Tokenizer,
    chunkSize: number,
    rules: RecursiveRules,
    minCharactersPerChunk: number
  ) {
    if (chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }
    if (!Number.isInteger(chunkSize)) {
      throw new Error('chunkSize must be an integer');
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
   * Build (and cache) the delimiter pattern for a level.
   */
  private delimiterPattern(level: RecursiveLevel): RegExp {
    let pattern = this.patternCache.get(level);
    if (!pattern) {
      const delims = Array.isArray(level.delimiters) ? level.delimiters : [level.delimiters ?? ''];
      pattern = delimiterPattern(delims);
      this.patternCache.set(level, pattern);
    }
    return pattern;
  }

  /**
   * Split text according to a recursive level's rules.
   */
  private splitText(text: string, level: RecursiveLevel, minChars: number): string[] {
    // Whitespace splitting - keep whitespace attached to the preceding word
    if (level.whitespace) {
      return splitByPattern(text, WHITESPACE_PATTERN, 'prev', 1);
    }

    // Delimiter splitting
    if (level.delimiters) {
      return splitByPattern(text, this.delimiterPattern(level), level.includeDelim, minChars);
    }

    // Token-based splitting (final level). A window of chunkSize tokens can
    // decode to text that counts as more (e.g. the character tokenizer encodes
    // an emoji as one code point but counts two UTF-16 units), so shrink the
    // window until the decoded text fits. A single token is never split.
    const encoded = this.tokenizer.encode(text);
    const splits: string[] = [];
    for (let i = 0; i < encoded.length;) {
      let size = Math.min(this.chunkSize, encoded.length - i);
      let decoded = this.tokenizer.decode(encoded.slice(i, i + size));
      let count = this.tokenizer.countTokens(decoded);
      while (count > this.chunkSize && size > 1) {
        size = Math.max(1, size - (count - this.chunkSize));
        decoded = this.tokenizer.decode(encoded.slice(i, i + size));
        count = this.tokenizer.countTokens(decoded);
      }
      splits.push(decoded);
      i += size;
    }
    return splits;
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
   * Greedily merge consecutive splits while the combined token count stays
   * within chunkSize. Splits that are already too large are kept on their own.
   */
  private mergeSplits(splits: string[], tokenCounts: number[]): [string[], number[]] {
    if (splits.length !== tokenCounts.length) {
      throw new Error('Mismatch between splits and token counts');
    }

    const merged: string[] = [];
    const combinedTokenCounts: number[] = [];
    let current = '';
    let currentCount = 0;

    for (let i = 0; i < splits.length; i++) {
      if (current && currentCount + tokenCounts[i] > this.chunkSize) {
        merged.push(current);
        combinedTokenCounts.push(currentCount);
        current = '';
        currentCount = 0;
      }
      current += splits[i];
      currentCount += tokenCounts[i];
    }
    if (current) {
      merged.push(current);
      combinedTokenCounts.push(currentCount);
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

    let splits = this.splitText(text, currRule, this.minCharactersPerChunk);
    let tokenCounts = await Promise.all(
      splits.map(split => this.estimateTokenCount(split))
    );

    // Merging short segments up to minCharactersPerChunk can glue together
    // pieces that no longer fit. Re-split those at exact delimiter boundaries
    // before falling through to a finer level.
    if (currRule.delimiters !== undefined && this.minCharactersPerChunk > 1) {
      const refined: string[] = [];
      const refinedCounts: number[] = [];
      for (let i = 0; i < splits.length; i++) {
        if (tokenCounts[i] > this.chunkSize) {
          const parts = this.splitText(splits[i], currRule, 1);
          refined.push(...parts);
          refinedCounts.push(...await Promise.all(parts.map(p => this.estimateTokenCount(p))));
        } else {
          refined.push(splits[i]);
          refinedCounts.push(tokenCounts[i]);
        }
      }
      splits = refined;
      tokenCounts = refinedCounts;
    }

    // Token level - no merging; otherwise pack splits up to chunkSize
    const [merged, combinedTokenCounts] =
      currRule.delimiters === undefined && !currRule.whitespace
        ? [splits, tokenCounts]
        : this.mergeSplits(splits, tokenCounts);

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
