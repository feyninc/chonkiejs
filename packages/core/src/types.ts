/**
 * Base chunk type representing a piece of text with metadata.
 */
export class Chunk {
  /** The text content of the chunk */
  public text: string;
  /** The starting index of the chunk in the original text */
  public startIndex: number;
  /** The ending index of the chunk in the original text */
  public endIndex: number;
  /** The number of tokens in the chunk */
  public tokenCount: number;
  /** Optional embedding vector for the chunk */
  public embedding?: number[];

  constructor(data: {
    text: string;
    startIndex: number;
    endIndex: number;
    tokenCount: number;
    embedding?: number[];
  }) {
    this.text = data.text;
    this.startIndex = data.startIndex;
    this.endIndex = data.endIndex;
    this.tokenCount = data.tokenCount;
    this.embedding = data.embedding;

    if (this.startIndex > this.endIndex) {
      throw new Error('Start index must be less than or equal to end index');
    }
    if (this.tokenCount < 0) {
      throw new Error('Token count must be non-negative');
    }
  }

  /**
   * Get a string representation of the chunk.
   */
  toString(): string {
    return this.text;
  }
}

/**
 * Type for specifying where delimiters should be included in chunks.
 */
export type IncludeDelim = 'prev' | 'next' | 'none';

/**
 * Configuration for a single level in the recursive chunking hierarchy.
 */
export interface RecursiveLevelConfig {
  /** Delimiters to split on at this level */
  delimiters?: string | string[];
  /** Whether to use whitespace as the delimiter */
  whitespace?: boolean;
  /** Where to include the delimiter in the resulting chunks */
  includeDelim?: IncludeDelim;
}

/**
 * Represents one level in the recursive chunking hierarchy.
 */
export class RecursiveLevel {
  public delimiters?: string | string[];
  public whitespace: boolean;
  public includeDelim: IncludeDelim;

  constructor(config: RecursiveLevelConfig = {}) {
    this.delimiters = config.delimiters;
    this.whitespace = config.whitespace ?? false;
    this.includeDelim = config.includeDelim ?? 'prev';

    this.validate();
  }

  private validate(): void {
    if (this.delimiters !== undefined && this.whitespace) {
      throw new Error('Cannot use both custom delimiters and whitespace');
    }
    if (this.delimiters !== undefined) {
      const delims = Array.isArray(this.delimiters) ? this.delimiters : [this.delimiters];
      if (delims.some(d => typeof d !== 'string' || d.length === 0)) {
        throw new Error('Delimiter cannot be empty string');
      }
      if (delims.includes(' ')) {
        throw new Error('Use whitespace option instead of space delimiter');
      }
    }
  }

  toString(): string {
    return `RecursiveLevel(delimiters=${JSON.stringify(this.delimiters)}, whitespace=${this.whitespace}, includeDelim=${this.includeDelim})`;
  }
}

/**
 * Configuration for recursive chunking rules.
 */
export interface RecursiveRulesConfig {
  /** Array of levels to use for recursive chunking */
  levels?: RecursiveLevelConfig[];
}

/**
 * Defines the hierarchy of rules for recursive text chunking.
 *
 * Default hierarchy:
 * 1. Paragraphs (split on \n\n, \r\n, \n, \r)
 * 2. Sentences (split on . ! ?)
 * 3. Openings (split before { [ < ( so brackets and tags start the next chunk)
 * 4. Pauses (split on punctuation that ends a clause: ) ] } > " , ; ': ' — | ... `)
 * 5. Words (split on whitespace)
 * 6. Word parts (split on / - _ . : = & ? ' ~ inside URLs, paths and hyphenated words)
 * 7. Characters (token-level splitting)
 */
export class RecursiveRules {
  public levels: RecursiveLevel[];

  constructor(config: RecursiveRulesConfig = {}) {
    if (config.levels === undefined) {
      // Default hierarchy
      this.levels = [
        new RecursiveLevel({ delimiters: ['\n\n', '\r\n', '\n', '\r'] }), // Paragraphs
        new RecursiveLevel({ delimiters: ['. ', '! ', '? '] }), // Sentences
        new RecursiveLevel({ delimiters: ['{', '[', '<', '('], includeDelim: 'next' }), // Openings
        new RecursiveLevel({
          delimiters: [
            '}', '"', ']', '>', ')', ': ', ';', ',',
            '—', '|', '...', '`'
          ]
        }), // Pauses
        new RecursiveLevel({ whitespace: true }), // Words
        // Characters that usually sit inside a word (device-width, https:, don't)
        // only split once whitespace is not enough.
        new RecursiveLevel({ delimiters: ['/', '-', '_', '.', ':', '=', '&', '?', "'", '~'] }), // Word parts
        new RecursiveLevel() // Characters/tokens
      ];
    } else {
      this.levels = config.levels.map(levelConfig => new RecursiveLevel(levelConfig));
    }
  }

  get length(): number {
    return this.levels.length;
  }

  getLevel(index: number): RecursiveLevel | undefined {
    return this.levels[index];
  }

  toString(): string {
    return `RecursiveRules(${this.levels.length} levels)`;
  }
}
