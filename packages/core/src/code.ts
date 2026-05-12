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

  private estimateChunkMaxBytes(text: string): number {
    const textBytes = new TextEncoder().encode(text).length;
    const textTokens = this.tokenizer.countTokens(text);
    if (textTokens === 0) return textBytes;
    const bytesPerToken = textBytes / textTokens;
    return Math.max(1, Math.floor(this.chunkSize * bytesPerToken));
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

    const chunkMaxBytes = this.estimateChunkMaxBytes(text);
    const result = this.pack.process(text, { language, chunkMaxSize: chunkMaxBytes });

    if (!result.chunks || result.chunks.length === 0) {
      const tokenCount = this.tokenizer.countTokens(text);
      return [
        new Chunk({
          text,
          startIndex: 0,
          endIndex: text.length,
          tokenCount,
        }),
      ];
    }

    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(text);
    const byteToChar = this.buildByteToCharMap(fullBytes, text);

    const chunks: Chunk[] = [];
    for (const codeChunk of result.chunks) {
      const content: string = codeChunk.content;
      const tokenCount = this.tokenizer.countTokens(content);
      const startIndex = byteToChar.get(codeChunk.startByte) ?? 0;
      const endIndex = byteToChar.get(codeChunk.endByte) ?? text.length;
      chunks.push(
        new Chunk({
          text: content,
          startIndex,
          endIndex,
          tokenCount,
        })
      );
    }

    return chunks;
  }

  private buildByteToCharMap(bytes: Uint8Array, text: string): Map<number, number> {
    const map = new Map<number, number>();
    let byteIdx = 0;
    for (let charIdx = 0; charIdx <= text.length; charIdx++) {
      map.set(byteIdx, charIdx);
      if (charIdx < text.length) {
        const code = text.codePointAt(charIdx)!;
        if (code <= 0x7f) byteIdx += 1;
        else if (code <= 0x7ff) byteIdx += 2;
        else if (code <= 0xffff) byteIdx += 3;
        else {
          byteIdx += 4;
          charIdx++; // surrogate pair
        }
      }
    }
    return map;
  }

  toString(): string {
    return `CodeChunker(chunkSize=${this.chunkSize}, language="${this.language}")`;
  }
}
