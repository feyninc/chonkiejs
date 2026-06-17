import { Tokenizer } from '@/tokenizer';
import { Chunk } from '@/types';

export interface CodeChunkerBackend {
  hasLanguage(name: string): boolean;
  detectLanguageFromContent(content: string): string | null;
  downloadedLanguages(): string[];
  process(source: string, config: Record<string, unknown>): {
    metrics: { errorCount: number; totalLines: number };
    structure: unknown[];
    imports: unknown[];
    chunks: Array<{ content: string; startByte: number; endByte: number }>;
  };
}

export interface CodeChunkerOptions {
  /** Tokenizer instance or model name (default: 'character') */
  tokenizer?: Tokenizer | string;
  /** Maximum tokens per chunk (default: 2048) */
  chunkSize?: number;
  /**
   * Language name for tree-sitter parsing.
   * Accepts any language supported by tree-sitter-language-pack,
   * or "auto" to detect from content.
   */
  language?: string;
  /**
   * tree-sitter-language-pack backend module.
   *
   * Defaults to auto-importing `@kreuzberg/tree-sitter-language-pack` (native N-API, Node.js only).
   * For other runtimes, provide a custom object implementing `CodeChunkerBackend`.
   */
  backend?: CodeChunkerBackend;
}

export class CodeChunker {
  public readonly chunkSize: number;
  public readonly language: string;
  private tokenizer: Tokenizer;
  private pack: CodeChunkerBackend;

  private constructor(
    tokenizer: Tokenizer,
    chunkSize: number,
    language: string,
    pack: CodeChunkerBackend
  ) {
    this.tokenizer = tokenizer;
    this.chunkSize = chunkSize;
    this.language = language;
    this.pack = pack;
  }

  static async create(options: CodeChunkerOptions = {}): Promise<CodeChunker> {
    const { tokenizer = 'character', chunkSize = 2048, language = 'auto' } = options;

    if (chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }

    let tokenizerInstance: Tokenizer;
    if (typeof tokenizer === 'string') {
      tokenizerInstance = await Tokenizer.create(tokenizer);
    } else {
      tokenizerInstance = tokenizer;
    }

    let pack: CodeChunkerBackend;
    if (options.backend) {
      pack = options.backend;
    } else {
      let mod: any;
      try {
        mod = await import('@kreuzberg/tree-sitter-language-pack');
      } catch (e: any) {
        throw new Error(
          'CodeChunker requires @kreuzberg/tree-sitter-language-pack to be installed.\n' +
            'Install it with: pnpm add @kreuzberg/tree-sitter-language-pack\n' +
            'Or pass a custom backend via the `backend` option.\n' +
            `Underlying error: ${e?.message ?? e}`
        );
      }
      pack = (mod.default ?? mod) as unknown as CodeChunkerBackend;
    }

    const lang = language.toLowerCase().trim();

    if (lang !== 'auto') {
      if (!pack.hasLanguage(lang)) {
        throw new Error(
          `CodeChunker: unsupported language "${lang}". ` +
            'Use availableLanguages() from the backend for a full list, ' +
            'or set language to "auto".'
        );
      }
    }

    return new CodeChunker(tokenizerInstance, chunkSize, lang, pack);
  }

  private detectLanguage(text: string): string {
    const detected = this.pack.detectLanguageFromContent(text);
    if (detected) return detected;

    const languages = this.pack.downloadedLanguages();
    if (languages.length === 0) {
      throw new Error(
        'CodeChunker: could not auto-detect language. No languages downloaded. ' +
          'Call init() or download() first, or specify a language explicitly.'
      );
    }

    type ScoredLang = [string, number, number, number];
    const results: ScoredLang[] = [];

    for (const lang of languages) {
      try {
        const result = this.pack.process(text, { language: lang, structure: true, imports: true });
        const structureScore = result.structure.length + result.imports.length;
        if (result.metrics.errorCount === 0 && structureScore > 0) {
          return lang;
        }
        results.push([lang, result.metrics.errorCount, structureScore, result.metrics.totalLines]);
      } catch {
        continue;
      }
    }

    if (results.length === 0) {
      throw new Error(
        'CodeChunker: could not auto-detect language. ' +
          'Please specify a language explicitly.'
      );
    }

    results.sort((a, b) => a[1] - b[1] || b[2] - a[2] || b[3] - a[3]);
    return results[0][0];
  }

  chunk(text: string): Chunk[] {
    if (!text || !text.trim()) {
      return [];
    }

    let language: string;
    if (this.language === 'auto') {
      language = this.detectLanguage(text);
    } else {
      language = this.language;
    }

    const textByteLength = this.computeByteLength(text);
    const textTokens = this.tokenizer.countTokens(text);
    const chunkMaxBytes = textTokens === 0
      ? textByteLength
      : Math.max(1, Math.floor(this.chunkSize * (textByteLength / textTokens)));

    const result = this.pack.process(text, { language, chunkMaxSize: chunkMaxBytes });

    if (!result.chunks || result.chunks.length === 0) {
      return [
        new Chunk({
          text,
          startIndex: 0,
          endIndex: text.length,
          tokenCount: textTokens,
        }),
      ];
    }

    const byteOffsets = new Set<number>();
    for (const codeChunk of result.chunks) {
      byteOffsets.add(codeChunk.startByte);
      byteOffsets.add(codeChunk.endByte);
    }
    const byteToChar = this.resolveByteOffsets(text, byteOffsets);

    const chunks: Chunk[] = [];
    for (const codeChunk of result.chunks) {
      const content: string = codeChunk.content;
      const tokenCount = this.tokenizer.countTokens(content);
      const startIndex = byteToChar.get(codeChunk.startByte) ?? 0;
      const endIndex = byteToChar.get(codeChunk.endByte) ?? text.length;
      if (tokenCount > this.chunkSize) {
        const subChunks = this.splitOversizedChunk(content, startIndex);
        chunks.push(...subChunks);
      } else {
        chunks.push(
          new Chunk({ text: content, startIndex, endIndex, tokenCount })
        );
      }
    }

    return chunks;
  }

  private splitOversizedChunk(text: string, baseOffset: number): Chunk[] {
    const chunks: Chunk[] = [];
    let pos = 0;
    while (pos < text.length) {
      let lo = pos + 1;
      let hi = text.length;
      let best = pos + 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (this.tokenizer.countTokens(text.slice(pos, mid)) <= this.chunkSize) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const slice = text.slice(pos, best);
      chunks.push(new Chunk({
        text: slice,
        startIndex: baseOffset + pos,
        endIndex: baseOffset + best,
        tokenCount: this.tokenizer.countTokens(slice),
      }));
      pos = best;
    }
    return chunks;
  }

  private computeByteLength(text: string): number {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.codePointAt(i)!;
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code <= 0xffff) bytes += 3;
      else { bytes += 4; i++; }
    }
    return bytes;
  }

  private resolveByteOffsets(text: string, offsets: Set<number>): Map<number, number> {
    const map = new Map<number, number>();
    if (offsets.size === 0) return map;
    const sorted = [...offsets].sort((a, b) => a - b);
    let target = 0;
    let byteIdx = 0;
    for (let charIdx = 0; charIdx <= text.length && target < sorted.length; charIdx++) {
      while (target < sorted.length && sorted[target] === byteIdx) {
        map.set(byteIdx, charIdx);
        target++;
      }
      if (charIdx < text.length) {
        const code = text.codePointAt(charIdx)!;
        if (code <= 0x7f) byteIdx += 1;
        else if (code <= 0x7ff) byteIdx += 2;
        else if (code <= 0xffff) byteIdx += 3;
        else { byteIdx += 4; charIdx++; }
      }
    }
    while (target < sorted.length) {
      map.set(sorted[target], text.length);
      target++;
    }
    return map;
  }

  toString(): string {
    return `CodeChunker(chunkSize=${this.chunkSize}, language="${this.language}")`;
  }
}
