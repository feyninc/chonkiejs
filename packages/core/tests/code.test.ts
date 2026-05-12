/// <reference types="vitest/globals" />
import { CodeChunker } from '../src';

let nativeBackendAvailable = false;
try {
  const mod = await import('@kreuzberg/tree-sitter-language-pack');
  const pack = (mod as any).default ?? mod;
  nativeBackendAvailable = typeof pack.hasLanguage === 'function';
} catch {}

const describeWithBackend = nativeBackendAvailable ? describe : describe.skip;

describe('CodeChunker', () => {
  describeWithBackend('Creation', () => {
    it('should create a chunker with a specific language', async () => {
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 512 });
      expect(chunker).toBeInstanceOf(CodeChunker);
      expect(chunker.chunkSize).toBe(512);
      expect(chunker.language).toBe('javascript');
    });

    it('should use default chunkSize of 2048', async () => {
      const chunker = await CodeChunker.create({ language: 'python' });
      expect(chunker.chunkSize).toBe(2048);
    });

    it('should default to language "auto"', async () => {
      const chunker = await CodeChunker.create({});
      expect(chunker.language).toBe('auto');
    });

    it('should reject unsupported language names', async () => {
      await expect(CodeChunker.create({ language: 'zzznonexistentlang999' })).rejects.toThrow(
        /unsupported language/
      );
    });

    it('should throw for invalid chunkSize', async () => {
      await expect(CodeChunker.create({ language: 'python', chunkSize: 0 })).rejects.toThrow(
        'chunkSize must be greater than 0'
      );
      await expect(CodeChunker.create({ language: 'python', chunkSize: -1 })).rejects.toThrow(
        'chunkSize must be greater than 0'
      );
    });
  });

  describeWithBackend('Chunking', () => {
    it('should return empty array for empty text', async () => {
      const chunker = await CodeChunker.create({ language: 'javascript' });
      expect(chunker.chunk('')).toHaveLength(0);
      expect(chunker.chunk('   ')).toHaveLength(0);
    });

    it('should produce chunks for simple code', async () => {
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 512 });
      const code = 'const x = 1;\nconst y = 2;\n';
      const chunks = chunker.chunk(code);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text.trim()).toBeTruthy();
    });

    it('should split large code into multiple chunks', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => `const var${i} = ${i + 100};`);
      const code = lines.join('\n');
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 30 });
      const chunks = chunker.chunk(code);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should return a single fallback chunk when process returns no chunks', async () => {
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 100000 });
      const code = 'x';
      const chunks = chunker.chunk(code);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].text).toContain('x');
    });

    it('should have correct chunk properties', async () => {
      const code = 'function foo() { return 1; }\nfunction bar() { return 2; }\n';
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 512 });
      const chunks = chunker.chunk(code);

      for (const chunk of chunks) {
        expect(chunk).toHaveProperty('text');
        expect(chunk).toHaveProperty('startIndex');
        expect(chunk).toHaveProperty('endIndex');
        expect(chunk).toHaveProperty('tokenCount');
        expect(typeof chunk.text).toBe('string');
        expect(typeof chunk.startIndex).toBe('number');
        expect(typeof chunk.endIndex).toBe('number');
        expect(typeof chunk.tokenCount).toBe('number');
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have startByte offsets that are non-negative', async () => {
      const code = 'function foo() {}\nfunction bar() {}\n';
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 512 });
      const chunks = chunker.chunk(code);

      for (const chunk of chunks) {
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.endIndex).toBeGreaterThanOrEqual(chunk.startIndex);
      }
    });
  });

  describeWithBackend('Auto-detection', () => {
    it('should auto-detect Python from shebang', async () => {
      const chunker = await CodeChunker.create({ language: 'auto' });
      const code = '#!/usr/bin/env python3\ndef hello():\n    print("hi")\n';
      const chunks = chunker.chunk(code);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should auto-detect from code content when languages are downloaded', async () => {
      const chunker = await CodeChunker.create({ language: 'auto' });
      const code = 'fn main() {\n    println!("Hello, world!");\n}\n';
      const chunks = chunker.chunk(code);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Custom backend', () => {
    it('should accept a custom backend object', async () => {
      const mockBackend = {
        hasLanguage: (name: string) => name === 'mock',
        detectLanguageFromContent: () => null,
        downloadedLanguages: () => ['mock'],
        process: (source: string, _config: Record<string, unknown>) => ({
          metrics: { errorCount: 0, totalLines: source.split('\n').length },
          structure: [],
          imports: [],
          chunks: [{ content: source, startByte: 0, endByte: Buffer.byteLength(source, 'utf8') }],
        }),
      };

      const chunker = await CodeChunker.create({ language: 'mock', backend: mockBackend });
      const chunks = chunker.chunk('hello world');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('hello world');
      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(11);
    });
  });

  describeWithBackend('Multi-byte character handling', () => {
    it('should produce correct char offsets for multi-byte content', async () => {
      const code = '// 日本語コメント\nconst x = 1;\n';
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 512 });
      const chunks = chunker.chunk(code);

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.startIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.endIndex).toBeLessThanOrEqual(code.length);
        expect(code.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });

    it('should handle emoji in code correctly', async () => {
      const code = 'const emoji = "🎉";\nconsole.log(emoji);\n';
      const chunker = await CodeChunker.create({ language: 'javascript', chunkSize: 512 });
      const chunks = chunker.chunk(code);

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(code.slice(chunk.startIndex, chunk.endIndex)).toBe(chunk.text);
      }
    });
  });

  describeWithBackend('toString', () => {
    it('should return readable string representation', async () => {
      const chunker = await CodeChunker.create({ language: 'python', chunkSize: 256 });
      const str = chunker.toString();
      expect(str).toContain('CodeChunker');
      expect(str).toContain('256');
      expect(str).toContain('python');
    });
  });
});
