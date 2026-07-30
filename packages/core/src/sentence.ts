/**
 * Sentence chunker that splits text into chunks at sentence boundaries.
 */

import { split_offsets, merge_splits } from '@chonkiejs/chunk';
import { toCharOffsets } from './offsets';
import { initWasm } from '@/wasm';
import { Tokenizer } from '@/tokenizer';
import { Chunk, IncludeDelim } from '@/types';

interface Sentence {
  text: string;
  startIndex: number;
  endIndex: number;
  tokenCount: number;
}

export interface SentenceChunkerOptions {
  /** Tokenizer instance or model name (default: 'character') */
  tokenizer?: Tokenizer | string;
  /** Maximum tokens per chunk (default: 2048) */
  chunkSize?: number;
  /** Number of overlapping tokens between chunks (default: 0) */
  chunkOverlap?: number;
  /** Minimum number of sentences per chunk (default: 1) */
  minSentencesPerChunk?: number;
  /** Minimum characters for a segment to count as a sentence (default: 12) */
  minCharactersPerSentence?: number;
  /** Sentence boundary delimiters (default: ['. ', '! ', '? ', '\n']) */
  delim?: string | string[];
  /** Where to attach the delimiter after splitting (default: 'prev') */
  includeDelim?: IncludeDelim;
}

/**
 * Splits text into chunks at sentence boundaries.
 *
 * Detects sentence boundaries using configurable delimiters, then groups
 * sentences into chunks that respect token size limits.
 */
export class SentenceChunker {
  public readonly chunkSize: number;
  public readonly chunkOverlap: number;
  public readonly minSentencesPerChunk: number;
  public readonly minCharactersPerSentence: number;
  public readonly delim: string[];
  public readonly includeDelim: IncludeDelim;
  private tokenizer: Tokenizer;

  private constructor(
    tokenizer: Tokenizer,
    chunkSize: number,
    chunkOverlap: number,
    minSentencesPerChunk: number,
    minCharactersPerSentence: number,
    delim: string[],
    includeDelim: IncludeDelim
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
    if (minSentencesPerChunk < 1) {
      throw new Error('minSentencesPerChunk must be at least 1');
    }
    if (minCharactersPerSentence < 1) {
      throw new Error('minCharactersPerSentence must be at least 1');
    }

    this.tokenizer = tokenizer;
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.minSentencesPerChunk = minSentencesPerChunk;
    this.minCharactersPerSentence = minCharactersPerSentence;
    this.delim = delim;
    this.includeDelim = includeDelim;
  }

  /**
   * Create a SentenceChunker instance.
   *
   * @param options - Configuration options
   * @returns Promise resolving to SentenceChunker instance
   *
   * @example
   * const chunker = await SentenceChunker.create({ chunkSize: 512 });
   *
   * @example
   * const chunker = await SentenceChunker.create({
   *   tokenizer: 'gpt2',
   *   chunkSize: 512,
   *   chunkOverlap: 50
   * });
   */
  static async create(options: SentenceChunkerOptions = {}): Promise<SentenceChunker> {
    await initWasm();

    const {
      tokenizer = 'character',
      chunkSize = 2048,
      chunkOverlap = 0,
      minSentencesPerChunk = 1,
      minCharactersPerSentence = 12,
      delim = ['. ', '! ', '? ', '\n'],
      includeDelim = 'prev',
    } = options;

    const normalizedDelim = typeof delim === 'string' ? [delim] : delim;

    let tokenizerInstance: Tokenizer;
    if (typeof tokenizer === 'string') {
      tokenizerInstance = await Tokenizer.create(tokenizer);
    } else {
      tokenizerInstance = tokenizer;
    }

    return new SentenceChunker(
      tokenizerInstance,
      chunkSize,
      chunkOverlap,
      minSentencesPerChunk,
      minCharactersPerSentence,
      normalizedDelim,
      includeDelim
    );
  }

  /**
   * Split text into sentence segments using delimiters and return their offsets.
   */
  private splitTextOffsets(text: string): [number, number][] {
    const hasMultiByte = this.delim.some(d => d.length > 1);

    if (hasMultiByte) {
      return this.splitByPatternsOffsets(text);
    }

    // All single-byte delimiters: use WASM split_offsets
    const delimStr = this.delim.join('');
    return toCharOffsets(text, split_offsets(text, {
      delimiters: delimStr,
      includeDelim: this.includeDelim,
      minChars: this.minCharactersPerSentence,
    }));
  }

  /**
   * Split text by multi-byte delimiter patterns and return offsets.
   */
  private splitByPatternsOffsets(text: string): [number, number][] {
    const delimPositions: { index: number; length: number }[] = [];
    for (const d of this.delim) {
      let pos = 0;
      while (pos < text.length) {
        const idx = text.indexOf(d, pos);
        if (idx === -1) break;
        delimPositions.push({ index: idx, length: d.length });
        pos = idx + d.length;
      }
    }

    if (delimPositions.length === 0) {
      return text.length > 0 ? [[0, text.length]] : [];
    }

    delimPositions.sort((a, b) => a.index - b.index);

    const filtered: typeof delimPositions = [delimPositions[0]];
    for (let i = 1; i < delimPositions.length; i++) {
      const prev = filtered[filtered.length - 1];
      if (delimPositions[i].index >= prev.index + prev.length) {
        filtered.push(delimPositions[i]);
      }
    }

    const offsets: [number, number][] = [];
    let cursor = 0;

    for (const dp of filtered) {
      const delimEnd = dp.index + dp.length;

      if (this.includeDelim === 'prev') {
        const end = delimEnd;
        if (end > cursor) offsets.push([cursor, end]);
        cursor = end;
      } else if (this.includeDelim === 'next') {
        const end = dp.index;
        if (end > cursor) offsets.push([cursor, end]);
        cursor = dp.index;
      } else {
        const end = dp.index;
        if (end > cursor) offsets.push([cursor, end]);
        cursor = delimEnd;
      }
    }

    if (cursor < text.length) {
      offsets.push([cursor, text.length]);
    }

    return this.mergeShortOffsets(text, offsets);
  }

  /**
   * Merge short offsets with the following segment.
   */
  private mergeShortOffsets(text: string, offsets: [number, number][]): [number, number][] {
    if (offsets.length <= 1) return offsets;

    const result: [number, number][] = [];
    let currentStart = offsets[0][0];

    for (let i = 0; i < offsets.length; i++) {
      const [_s, e] = offsets[i];
      const length = e - currentStart;

      if (length >= this.minCharactersPerSentence || i === offsets.length - 1) {
        // If this is the last one and it's still too short, merge it into the previous if it exists
        if (i === offsets.length - 1 && length < this.minCharactersPerSentence && result.length > 0) {
          const last = result[result.length - 1];
          result[result.length - 1] = [last[0], e];
        } else {
          result.push([currentStart, e]);
          if (i < offsets.length - 1) {
            currentStart = offsets[i + 1][0];
          }
        }
      }
    }
    return result;
  }

  /**
   * Prepare sentence objects with position and token metadata.
   */
  private prepareSentences(text: string): Sentence[] {
    const offsets = this.splitTextOffsets(text);
    if (offsets.length === 0) return [];

    const sentences: Sentence[] = [];

    for (const [start, end] of offsets) {
      const sentText = text.slice(start, end);
      const tokenCount = this.tokenizer.countTokens(sentText);

      sentences.push({
        text: sentText,
        startIndex: start,
        endIndex: end,
        tokenCount,
      });
    }

    return sentences;
  }

  /**
   * Create a chunk from a group of sentences.
   * Recounts tokens on joined text since tokenizers may differ on joined vs separate text.
   */
  private createChunk(sentences: Sentence[]): Chunk {
    const chunkText = sentences.map(s => s.text).join('');
    const tokenCount = this.tokenizer.countTokens(chunkText);

    return new Chunk({
      text: chunkText,
      startIndex: sentences[0].startIndex,
      endIndex: sentences[sentences.length - 1].endIndex,
      tokenCount,
    });
  }

  /**
   * Chunk text into sentence-aware chunks.
   *
   * @param text - The text to chunk
   * @returns Array of chunks
   */
  async chunk(text: string): Promise<Chunk[]> {
    if (!text || !text.trim()) {
      return [];
    }

    const sentences = this.prepareSentences(text);
    if (sentences.length === 0) {
      return [];
    }

    const chunks: Chunk[] = [];
    // Precompute token counts once to avoid repeated slice/map calls.
    const tokenCounts = sentences.map(s => s.tokenCount);
    let pos = 0;

    while (pos < sentences.length) {
      let currentTokens = 0;
      let splitIdx = pos;

      // Greedily extend the chunk while respecting chunkSize, but always
      // include at least minSentencesPerChunk sentences.
      while (splitIdx < sentences.length) {
        const nextTokens = currentTokens + tokenCounts[splitIdx];
        const sentencesInChunk = splitIdx - pos + 1;

        if (nextTokens > this.chunkSize && sentencesInChunk > this.minSentencesPerChunk) {
          break;
        }

        currentTokens = nextTokens;
        splitIdx++;
      }

      // Fallback: ensure at least minSentencesPerChunk sentences per chunk.
      if (splitIdx - pos < this.minSentencesPerChunk) {
        if (pos + this.minSentencesPerChunk <= sentences.length) {
          splitIdx = pos + this.minSentencesPerChunk;
        } else {
          splitIdx = sentences.length;
        }
      }

      // Create the chunk
      const chunkSentences = sentences.slice(pos, splitIdx);
      chunks.push(this.createChunk(chunkSentences));

      // Handle overlap
      if (this.chunkOverlap > 0 && splitIdx < sentences.length) {
        let overlapTokens = 0;
        let overlapIdx = splitIdx - 1;

        while (overlapIdx >= pos) {
          const sent = sentences[overlapIdx];
          const nextTokens = overlapTokens + sent.tokenCount;
          if (nextTokens > this.chunkOverlap && overlapTokens > 0) {
            break;
          }
          overlapTokens = nextTokens;
          overlapIdx--;
        }

        const nextPos = overlapIdx + 1;
        // Ensure progress to avoid infinite loops when overlap > sentence size
        pos = nextPos > pos ? nextPos : splitIdx;
      } else {
        pos = splitIdx;
      }
    }

    return chunks;
  }

  toString(): string {
    return `SentenceChunker(chunkSize=${this.chunkSize}, overlap=${this.chunkOverlap}, delim=${JSON.stringify(this.delim)})`;
  }
}
