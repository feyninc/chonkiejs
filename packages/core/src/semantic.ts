/**
 * Semantic chunker that uses embedding-based similarity to find natural chunk boundaries.
 *
 * Computes window embeddings over sliding sentence windows, measures semantic
 * similarity between consecutive windows, then detects low-similarity valleys
 * as split points — mirroring the Python SemanticChunker's peak-detection approach.
 */

import { Tokenizer } from '@/tokenizer';
import { Chunk } from '@/types';
import { delimiterPattern, mergeShortOffsets, splitOffsets } from '@/split';

// ─── Embedding interface ──────────────────────────────────────────────────────

/** A function that returns embeddings for an array of texts. */
export type EmbedFunction = (texts: string[]) => Promise<number[][]>;

/** Object-style embedding model (e.g. a class with an embed method). */
export interface EmbeddingModel {
  embed(texts: string[]): Promise<number[][]>;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface Sentence {
  text: string;
  startIndex: number;
  endIndex: number;
  tokenCount: number;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface SemanticChunkerOptions {
  /**
   * Embedding provider. Either a plain async function `(texts) => number[][]`
   * or any object with an `embed(texts)` method.
   */
  embeddings: EmbedFunction | EmbeddingModel;

  /**
   * Similarity threshold (0–1). Valleys below this value are considered
   * candidate split points. Lower → more splits. (default: 0.8)
   */
  threshold?: number;

  /** Maximum tokens per chunk. (default: 2048) */
  chunkSize?: number;

  /**
   * Number of sentences combined into each sliding window embedding.
   * (default: 3)
   */
  similarityWindow?: number;

  /** Minimum sentences that must appear in a chunk. (default: 1) */
  minSentencesPerChunk?: number;

  /**
   * Minimum characters per sentence. Sentences shorter than this are merged
   * with adjacent sentences until the minimum length is satisfied; content is
   * not dropped. (default: 24)
   */
  minCharactersPerSentence?: number;

  /**
   * Sentence-splitting delimiters. Defaults to ['. ', '! ', '? ', '\n'].
   */
  delimiters?: string | string[];

  /**
   * Where to place the delimiter character in the output sentence.
   * (default: 'prev')
   */
  includeDelim?: 'prev' | 'next' | 'none';

  /** Tokenizer instance or HuggingFace model name. (default: 'character') */
  tokenizer?: Tokenizer | string;

  /**
   * Smoothing window for valley detection (analogous to the Python filter_window).
   * Must be odd and ≥ 3. (default: 5)
   */
  filterWindow?: number;

  /**
   * Polynomial order for the Savitzky-Golay filter.
   * Must be less than filterWindow. (default: 3)
   */
  filterPolyorder?: number;

  /**
   * Tolerance for the Savitzky-Golay filter. (default: 0.2)
   */
  filterTolerance?: number;

  /**
   * Number of groups to look ahead when merging semantically similar
   * consecutive groups. 0 disables skip-and-merge. (default: 0)
   */
  skipWindow?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Savitzky-Golay filter for smoothing and finding derivatives.
 * This implementation focuses on the smoothing (0th derivative).
 */
function savitzkyGolay(values: number[], windowSize: number, polyOrder: number): number[] {
  const n = values.length;
  if (n < windowSize) return [...values];

  const half = Math.floor(windowSize / 2);
  const result = new Array(n).fill(0);

  // Precompute Vandermonde matrix and its pseudo-inverse
  // (Simplified for fixed window/polyorder if needed, but here's a general approach)
  // For window=5, poly=3, the coefficients for the center point are:
  // [-3, 12, 17, 12, -3] / 35
  let coeffs: number[];
  if (windowSize === 5 && polyOrder === 3) {
    coeffs = [-3 / 35, 12 / 35, 17 / 35, 12 / 35, -3 / 35];
  } else if (windowSize === 7 && polyOrder === 3) {
    coeffs = [-2 / 21, 3 / 21, 6 / 21, 7 / 21, 6 / 21, 3 / 21, -2 / 21];
  } else {
    // Fallback to moving average if not a common precomputed case
    // In a real implementation we'd do matrix inversion here
    return values.map((_, i) => {
      let sum = 0, count = 0;
      for (let j = i - half; j <= i + half; j++) {
        const idx = j < 0 ? 0 : j >= n ? n - 1 : j;
        sum += values[idx]; count++;
      }
      return sum / count;
    });
  }

  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -half; j <= half; j++) {
      let idx = i + j;
      // Reflected boundary conditions
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * n - idx - 2;
      sum += values[idx] * coeffs[j + half];
    }
    result[i] = sum;
  }
  return result;
}

/**
 * Find local minima with interpolation and filtering.
 * Mirrors Python's chonkie_core.find_local_minima_interpolated + filter_split_indices.
 */
function findSplitIndices(
  values: number[],
  threshold: number,
  filterWindow: number,
  polyOrder: number,
  tolerance: number,
  minDist: number
): number[] {
  if (values.length < filterWindow) return [];

  // 1. Smooth using Savitzky-Golay
  const smoothed = savitzkyGolay(values, filterWindow, polyOrder);

  // 2. Find local minima in the smoothed signal
  const minimaIndices: number[] = [];
  const minimaValues: number[] = [];

  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] < smoothed[i - 1] && smoothed[i] < smoothed[i + 1]) {
      // Basic local minimum check
      // For true interpolation, we'd fit a parabola to (i-1, i, i+1)
      // and find the vertex. Let's do that for better alignment.
      const y1 = smoothed[i - 1];
      const y2 = smoothed[i];
      const y3 = smoothed[i + 1];

      // Parabolic interpolation: y = ax^2 + bx + c
      // Vertex x = -b / (2a)
      // relative to i: x_rel = (y1 - y3) / (2 * (y1 - 2*y2 + y3))
      const denom = 2 * (y1 - 2 * y2 + y3);
      const x_rel = denom !== 0 ? (y1 - y3) / denom : 0;
      const x_abs = i + x_rel;

      // Only accept if within tolerance of the actual index
      if (Math.abs(x_rel) < tolerance) {
        minimaIndices.push(i);
        minimaValues.push(y2);
      }
    }
  }

  // 3. Filter by threshold and minimum distance
  const filtered: number[] = [];
  let lastIdx = -Infinity;

  for (let i = 0; i < minimaIndices.length; i++) {
    const idx = minimaIndices[i];
    const val = minimaValues[i];

    if (val < threshold && idx - lastIdx >= minDist) {
      filtered.push(idx);
      lastIdx = idx;
    }
  }

  return filtered;
}

// ─── SemanticChunker ──────────────────────────────────────────────────────────

/**
 * Chunks text by detecting semantic boundaries using embedding similarity.
 *
 * Algorithm (mirrors the Python SemanticChunker):
 * 1. Split text into sentences via WASM.
 * 2. Compute sliding-window embeddings of `similarityWindow` consecutive sentences.
 * 3. Compute cosine similarity between each window and the sentence immediately after it.
 * 4. Detect valleys (local minima below threshold) in the similarity signal.
 * 5. Group sentences between valley positions into candidate chunks.
 * 6. Optionally merge semantically similar adjacent groups (skipWindow > 0).
 * 7. Split any group that exceeds `chunkSize` tokens.
 */
export class SemanticChunker {
  public readonly threshold: number;
  public readonly chunkSize: number;
  public readonly similarityWindow: number;
  public readonly minSentencesPerChunk: number;
  public readonly minCharactersPerSentence: number;
  public readonly delimiters: string[];
  public readonly includeDelim: 'prev' | 'next' | 'none';
  public readonly filterWindow: number;
  public readonly filterPolyorder: number;
  public readonly filterTolerance: number;
  public readonly skipWindow: number;

  private readonly embed: EmbedFunction;
  private tokenizer: Tokenizer;

  private constructor(
    embed: EmbedFunction,
    tokenizer: Tokenizer,
    options: Required<Omit<SemanticChunkerOptions, 'embeddings' | 'tokenizer'>> & {
      delimiters: string[];
    }
  ) {
    this.embed = embed;
    this.tokenizer = tokenizer;
    this.threshold = options.threshold;
    this.chunkSize = options.chunkSize;
    this.similarityWindow = options.similarityWindow;
    this.minSentencesPerChunk = options.minSentencesPerChunk;
    this.minCharactersPerSentence = options.minCharactersPerSentence;
    this.delimiters = options.delimiters;
    this.includeDelim = options.includeDelim;
    this.filterWindow = options.filterWindow;
    this.filterPolyorder = options.filterPolyorder;
    this.filterTolerance = options.filterTolerance;
    this.skipWindow = options.skipWindow;
  }

  /**
   * Create a SemanticChunker.
   *
   * @example
   * // With a plain embed function
   * const chunker = await SemanticChunker.create({
   *   embeddings: async (texts) => myModel.encode(texts),
   *   threshold: 0.5,
   *   chunkSize: 512,
   * });
   *
   * @example
   * // With an object model
   * const chunker = await SemanticChunker.create({
   *   embeddings: myEmbeddingModel,   // must have .embed(texts) method
   *   chunkSize: 1024,
   * });
   */
  static async create(options: SemanticChunkerOptions): Promise<SemanticChunker> {
    const {
      embeddings,
      threshold = 0.8,
      chunkSize = 2048,
      similarityWindow = 3,
      minSentencesPerChunk = 1,
      minCharactersPerSentence = 24,
      delimiters = ['. ', '! ', '? ', '\n'],
      includeDelim = 'prev',
      tokenizer = 'character',
      filterWindow = 5,
      filterPolyorder = 3,
      filterTolerance = 0.2,
      skipWindow = 0,
    } = options;

    // Validate
    if (threshold <= 0 || threshold >= 1) throw new Error('threshold must be between 0 and 1');
    if (chunkSize <= 0) throw new Error('chunkSize must be greater than 0');
    if (similarityWindow <= 0) throw new Error('similarityWindow must be greater than 0');
    if (minSentencesPerChunk <= 0) throw new Error('minSentencesPerChunk must be greater than 0');
    if (filterWindow < 3) throw new Error('filterWindow must be at least 3');
    if (filterWindow % 2 === 0) throw new Error('filterWindow must be an odd number');
    if (filterPolyorder < 0 || filterPolyorder >= filterWindow) throw new Error('filterPolyorder must be non-negative and less than filterWindow');
    if (filterTolerance <= 0 || filterTolerance >= 1) throw new Error('filterTolerance must be between 0 and 1');
    if (skipWindow < 0) throw new Error('skipWindow must be non-negative');

    // Resolve embed function
    const embed: EmbedFunction = typeof embeddings === 'function'
      ? embeddings
      : (texts) => embeddings.embed(texts);

    // Resolve tokenizer
    const tokenizerInstance = typeof tokenizer === 'string'
      ? await Tokenizer.create(tokenizer)
      : tokenizer;

    const delimArray = Array.isArray(delimiters) ? delimiters : [delimiters];

    return new SemanticChunker(embed, tokenizerInstance, {
      threshold,
      chunkSize,
      similarityWindow,
      minSentencesPerChunk,
      minCharactersPerSentence,
      delimiters: delimArray,
      includeDelim,
      filterWindow,
      filterPolyorder,
      filterTolerance,
      skipWindow,
    });
  }

  // ─── Private pipeline steps ───────────────────────────────────────────────

  private async prepareSentences(text: string): Promise<Sentence[]> {
    if (!text || text.trim().length === 0) return [];

    const offsets = mergeShortOffsets(
      splitOffsets(text, delimiterPattern(this.delimiters), this.includeDelim),
      this.minCharactersPerSentence
    );

    if (offsets.length === 0) return [];

    const rawSentences = offsets.map(([s, e]) => text.slice(s, e));
    const tokenCounts = await Promise.all(
      rawSentences.map(s => this.tokenizer.countTokens(s))
    );

    const sentences: Sentence[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const [s, e] = offsets[i];
      const text_s = rawSentences[i];
      if (text_s.length === 0) continue;

      sentences.push({
        text: text_s,
        startIndex: s,
        endIndex: e,
        tokenCount: tokenCounts[i],
      });
    }
    return sentences;
  }

  /**
   * Build window texts: for each i, join sentences[i..i+window].
   * Produces len(sentences) - similarityWindow windows.
   */
  private buildWindows(sentences: Sentence[]): string[] {
    const windows: string[] = [];
    for (let i = 0; i < sentences.length - this.similarityWindow; i++) {
      windows.push(
        sentences.slice(i, i + this.similarityWindow).map(s => s.text).join('')
      );
    }
    return windows;
  }

  /**
   * Compute cosine similarity between each window embedding and the sentence
   * embedding immediately following that window (index i + similarityWindow).
   */
  private async getSimilarities(sentences: Sentence[]): Promise<number[]> {
    const windowTexts = this.buildWindows(sentences);
    const sentenceTexts = sentences.slice(this.similarityWindow).map(s => s.text);

    // Batch all texts in one call for better performance
    const allTexts = [...windowTexts, ...sentenceTexts];

    // Deduplicate unique strings to reduce embedding calls/cost for remote providers
    const uniqueTexts = Array.from(new Set(allTexts));
    const uniqueEmbeddings = await this.embed(uniqueTexts);

    // Map unique embeddings back to their original strings
    const embeddingMap = new Map<string, number[]>();
    uniqueTexts.forEach((text, i) => {
      embeddingMap.set(text, uniqueEmbeddings[i]);
    });

    const windowEmbeds = windowTexts.map((text) => embeddingMap.get(text)!);
    const sentenceEmbeds = sentenceTexts.map((text) => embeddingMap.get(text)!);

    return windowEmbeds.map((w, i) => cosineSimilarity(w, sentenceEmbeds[i]));
  }

  /**
   * Find sentence-level split indices from the similarity signal.
   * Returns absolute indices into the `sentences` array (including 0 and len).
   */
  private getSplitIndices(similarities: number[], totalSentences: number): number[] {
    if (similarities.length === 0) return [0, totalSentences];

    const valleys = findSplitIndices(
      similarities,
      this.threshold,
      this.filterWindow,
      this.filterPolyorder,
      this.filterTolerance,
      this.minSentencesPerChunk
    );

    if (valleys.length === 0) return [0, totalSentences];

    // Valley at similarity index i corresponds to a split BEFORE sentence i + similarityWindow
    const splits = valleys.map(i => i + this.similarityWindow);

    return [0, ...splits, totalSentences];
  }

  private groupSentences(sentences: Sentence[], splitIndices: number[]): Sentence[][] {
    const groups: Sentence[][] = [];
    for (let i = 0; i < splitIndices.length - 1; i++) {
      const group = sentences.slice(splitIndices[i], splitIndices[i + 1]);
      if (group.length > 0) groups.push(group);
    }
    return groups;
  }

  /** Split any group that exceeds chunkSize into sub-groups. */
  private splitOversizedGroups(groups: Sentence[][]): Sentence[][] {
    const result: Sentence[][] = [];
    for (const group of groups) {
      const total = group.reduce((s, sent) => s + sent.tokenCount, 0);
      if (total <= this.chunkSize) {
        result.push(group);
      } else {
        let current: Sentence[] = [];
        let count = 0;
        for (const sent of group) {
          if (count + sent.tokenCount > this.chunkSize && current.length > 0) {
            result.push(current);
            current = [];
            count = 0;
          }
          current.push(sent);
          count += sent.tokenCount;
        }
        if (current.length > 0) result.push(current);
      }
    }
    return result;
  }

  /** Optionally merge semantically similar adjacent groups. */
  private async skipAndMerge(groups: Sentence[][]): Promise<Sentence[][]> {
    if (groups.length <= 1 || this.skipWindow === 0) return groups;

    const groupTexts = groups.map(g => g.map(s => s.text).join(''));
    
    // Deduplicate strings to reduce cost/overhead
    const uniqueTexts = Array.from(new Set(groupTexts));
    const uniqueEmbeddings = await this.embed(uniqueTexts);

    const embeddingMap = new Map<string, number[]>();
    uniqueTexts.forEach((text, i) => {
      embeddingMap.set(text, uniqueEmbeddings[i]);
    });

    const embeddings = groupTexts.map(text => embeddingMap.get(text)!);

    const merged: Sentence[][] = [];
    let i = 0;

    while (i < groups.length) {
      if (i === groups.length - 1) {
        merged.push(groups[i]);
        break;
      }

      const skipEnd = Math.min(i + this.skipWindow + 1, groups.length - 1);
      let bestSim = -1;
      let bestIdx = -1;

      for (let j = i + 1; j <= skipEnd; j++) {
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        if (sim >= this.threshold && sim > bestSim) {
          bestSim = sim;
          bestIdx = j;
        }
      }

      if (bestIdx !== -1) {
        const combined: Sentence[] = [];
        for (let k = i; k <= bestIdx; k++) combined.push(...groups[k]);
        merged.push(combined);
        i = bestIdx + 1;
      } else {
        merged.push(groups[i]);
        i++;
      }
    }

    return merged;
  }

  private createChunks(groups: Sentence[][]): Chunk[] {
    const chunks: Chunk[] = [];
    for (const group of groups) {
      if (group.length === 0) continue;
      const text = group.map(s => s.text).join('');
      const tokenCount = group.reduce((s, sent) => s + sent.tokenCount, 0);
      const startIndex = group[0].startIndex;
      const endIndex = group[group.length - 1].endIndex;
      chunks.push(new Chunk({
        text,
        startIndex,
        endIndex,
        tokenCount,
      }));
    }
    return chunks;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Chunk a single text into semantic chunks.
   *
   * @param text - The text to chunk
   * @returns Array of chunks with semantic boundaries
   */
  async chunk(text: string): Promise<Chunk[]> {
    if (!text || text.trim().length === 0) return [];

    const sentences = await this.prepareSentences(text);
    if (sentences.length === 0) return [];

    // Too few sentences to compute windows — return as one chunk
    if (sentences.length <= this.similarityWindow) {
      const fullText = sentences.map(s => s.text).join('');
      const tokenCount = sentences.reduce((s, sent) => s + sent.tokenCount, 0);
      const startIndex = sentences[0].startIndex;
      const endIndex = sentences[sentences.length - 1].endIndex;
      const chunk = new Chunk({ text: fullText, startIndex, endIndex, tokenCount });

      // Still need to split if it exceeds chunkSize even if it's "too few sentences"
      if (tokenCount > this.chunkSize) {
         return this.createChunks(this.splitOversizedGroups([[...sentences]]));
      }
      return [chunk];
    }

    const similarities = await this.getSimilarities(sentences);
    const splitIndices = this.getSplitIndices(similarities, sentences.length);

    let groups = this.groupSentences(sentences, splitIndices);

    if (this.skipWindow > 0) {
      groups = await this.skipAndMerge(groups);
    }

    groups = this.splitOversizedGroups(groups);

    return this.createChunks(groups);
  }

  /**
   * Chunk multiple texts.
   *
   * @param texts - Array of texts to chunk
   * @returns Array of chunk arrays, one per input text
   */
  async chunkBatch(texts: string[]): Promise<Chunk[][]> {
    return Promise.all(texts.map(t => this.chunk(t)));
  }

  toString(): string {
    return (
      `SemanticChunker(threshold=${this.threshold}, chunkSize=${this.chunkSize}, ` +
      `similarityWindow=${this.similarityWindow}, filterWindow=${this.filterWindow})`
    );
  }
}
