/**
 * Sentence chunker that splits text into chunks at sentence boundaries.
 */

import { Tokenizer } from '@/tokenizer';
import { Chunk, IncludeDelim } from '@/types';
import { delimiterPattern, mergeShortOffsets, splitOffsets } from '@/split';

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
  private readonly delimPattern: RegExp;
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
    this.delimPattern = delimiterPattern(delim);
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
    const offsets = splitOffsets(text, this.delimPattern, this.includeDelim);
    return mergeShortOffsets(offsets, this.minCharactersPerSentence);
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
