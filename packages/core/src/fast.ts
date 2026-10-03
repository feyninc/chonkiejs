import { chunk_offsets } from '@chonkiejs/chunk';
import { Chunk } from '@/types';
import { initWasm } from '@/wasm';

export interface FastChunkerOptions {
  /** Target chunk size in bytes (default: 4096) */
  chunkSize?: number;
  /** ASCII delimiter characters for splitting (default: "\n.?"). Use `pattern` for non-ASCII delimiters. */
  delimiters?: string;
  /** Multi-byte pattern to split on (overrides delimiters) */
  pattern?: string | Uint8Array;
  /** Put delimiter/pattern at start of next chunk (default: false) */
  prefix?: boolean;
  /** Split at start of consecutive runs (default: false) */
  consecutive?: boolean;
  /** Search forward if no boundary in backward window (default: false) */
  forwardFallback?: boolean;
}

/** True for UTF-8 continuation bytes (10xxxxxx). */
function isContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Move a byte cut position to the nearest UTF-8 character boundary after
 * `start`. Prefers moving back so the chunk stays within its byte budget, and
 * only moves forward when the chunk would otherwise be empty.
 */
function charBoundary(bytes: Uint8Array, start: number, end: number): number {
  if (end >= bytes.length) return bytes.length;
  let cut = end;
  while (cut > start && isContinuationByte(bytes[cut])) cut--;
  if (cut > start) return cut;
  cut = end;
  while (cut < bytes.length && isContinuationByte(bytes[cut])) cut++;
  return cut;
}

/**
 * Fast byte-based chunker using WASM boundary detection.
 */
export class FastChunker {
  public readonly chunkSize: number;
  public readonly delimiters: string;
  public readonly pattern?: string | Uint8Array;
  public readonly prefix: boolean;
  public readonly consecutive: boolean;
  public readonly forwardFallback: boolean;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  private constructor(options: Required<Omit<FastChunkerOptions, 'pattern'>> & { pattern?: string | Uint8Array }) {
    if (options.chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }
    // Delimiters are matched byte by byte, so a multi-byte character would
    // match on each of its bytes separately.
    if (options.pattern === undefined && /[^\x00-\x7f]/.test(options.delimiters)) {
      throw new Error('delimiters must be ASCII characters; use pattern for non-ASCII delimiters');
    }

    this.chunkSize = options.chunkSize;
    this.delimiters = options.delimiters;
    this.pattern = options.pattern;
    this.prefix = options.prefix;
    this.consecutive = options.consecutive;
    this.forwardFallback = options.forwardFallback;
  }

  /**
   * Create a FastChunker instance.
   */
  static async create(options: FastChunkerOptions = {}): Promise<FastChunker> {
    await initWasm();

    const resolvedOptions = {
      chunkSize: options.chunkSize ?? 4096,
      delimiters: options.delimiters ?? '\n.?',
      pattern: options.pattern,
      prefix: options.prefix ?? false,
      consecutive: options.consecutive ?? false,
      forwardFallback: options.forwardFallback ?? false,
    };

    return new FastChunker(resolvedOptions);
  }

  /**
   * Chunk a single text into byte-bounded chunks.
   */
  chunk(text: string): Chunk[] {
    if (!text) {
      return [];
    }

    const bytes = this.encoder.encode(text);
    const options = {
      size: this.chunkSize,
      prefix: this.prefix,
      consecutive: this.consecutive,
      forwardFallback: this.forwardFallback,
      ...(this.pattern !== undefined
        ? { pattern: this.pattern }
        : { delimiters: this.delimiters }),
    };

    const offsets = chunk_offsets(bytes, options);
    const chunks: Chunk[] = [];
    let start = 0;
    let charPos = 0;

    // WASM cuts on exact byte counts, which can land inside a multi-byte
    // UTF-8 character. Move each cut to a character boundary so every chunk
    // decodes cleanly and the chunks still cover the text contiguously.
    const pushChunk = (end: number) => {
      const chunkText = this.decoder.decode(bytes.subarray(start, end));
      chunks.push(new Chunk({
        text: chunkText,
        startIndex: charPos,
        endIndex: charPos + chunkText.length,
        tokenCount: 0,
      }));
      charPos += chunkText.length;
      start = end;
    };

    for (const [, rawEnd] of offsets) {
      const end = charBoundary(bytes, start, rawEnd);
      if (end > start) pushChunk(end);
    }
    if (start < bytes.length) pushChunk(bytes.length);

    return chunks;
  }

  /**
   * Chunk a batch of texts.
   */
  chunkBatch(texts: string[]): Chunk[][] {
    return texts.map(text => this.chunk(text));
  }

  toString(): string {
    return `FastChunker(chunkSize=${this.chunkSize}, delimiters=${JSON.stringify(this.delimiters)}, pattern=${JSON.stringify(this.pattern)}, prefix=${this.prefix}, consecutive=${this.consecutive}, forwardFallback=${this.forwardFallback})`;
  }
}
