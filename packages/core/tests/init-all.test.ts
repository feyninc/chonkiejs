import { describe, it, expect } from 'vitest';
import {
  TokenChunker,
  RecursiveChunker,
  SentenceChunker,
  SemanticChunker,
  CodeChunker,
  TableChunker,
  FastChunker,
} from '../src/index';

let nativeBackendAvailable = false;
try {
  const mod = await import('@kreuzberg/tree-sitter-language-pack');
  const pack = (mod as any).default ?? mod;
  nativeBackendAvailable = typeof pack.hasLanguage === 'function';
} catch {}

const sampleText = `The quick brown fox jumps over the lazy dog. This is a sample paragraph for testing chunkers.

Another paragraph here with more text. Sentences should be detected properly! Does this work? Yes it does.

Final paragraph to ensure we have enough content for chunking to produce meaningful results across all chunker types.`;

const sampleCode = `function hello() {
  console.log("Hello, world!");
}

function greet(name: string) {
  return "Hello, " + name;
}`;

const sampleTable = `| Name | Age | City |
|------|-----|------|
| Alice | 30 | NYC |
| Bob | 25 | LA |
| Carol | 35 | SF |
| Dave | 28 | CHI |`;

describe('Chunker Initialization', () => {
  it('TokenChunker initializes and chunks', async () => {
    const chunker = await TokenChunker.create({ chunkSize: 50 });
    expect(chunker).toBeDefined();
    const chunks = await chunker.chunk(sampleText);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`TokenChunker: ${chunks.length} chunks`);
  });

  it('RecursiveChunker initializes and chunks', async () => {
    const chunker = await RecursiveChunker.create({ chunkSize: 50 });
    expect(chunker).toBeDefined();
    const chunks = await chunker.chunk(sampleText);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`RecursiveChunker: ${chunks.length} chunks`);
  });

  it('SentenceChunker initializes and chunks', async () => {
    const chunker = await SentenceChunker.create({ chunkSize: 100 });
    expect(chunker).toBeDefined();
    const chunks = await chunker.chunk(sampleText);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`SentenceChunker: ${chunks.length} chunks`);
  });

  it('SemanticChunker initializes and chunks', async () => {
    // Simple mock embedding function - returns random-ish vectors based on text
    const embeddings = async (texts: string[]): Promise<number[][]> => {
      return texts.map((t) => {
        const vec = new Array(8).fill(0);
        for (let i = 0; i < t.length; i++) {
          vec[i % 8] += t.charCodeAt(i) / 1000;
        }
        return vec;
      });
    };

    const chunker = await SemanticChunker.create({
      embeddings,
      chunkSize: 200,
      threshold: 0.5,
    });
    expect(chunker).toBeDefined();
    const chunks = await chunker.chunk(sampleText);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`SemanticChunker: ${chunks.length} chunks`);
  });

  it.skipIf(!nativeBackendAvailable)('CodeChunker initializes and chunks', async () => {
    const chunker = await CodeChunker.create({
      language: 'javascript',
      chunkSize: 100,
    });
    expect(chunker).toBeDefined();
    const chunks = chunker.chunk(sampleCode);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`CodeChunker: ${chunks.length} chunks`);
  });

  it('TableChunker initializes and chunks', async () => {
    const chunker = await TableChunker.create({
      tokenizer: 'row',
      chunkSize: 2,
    });
    expect(chunker).toBeDefined();
    const chunks = chunker.chunk(sampleTable);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`TableChunker: ${chunks.length} chunks`);
  });

  it('FastChunker initializes and chunks', async () => {
    const chunker = await FastChunker.create({
      chunkSize: 64,
    });
    expect(chunker).toBeDefined();
    const chunks = chunker.chunk(sampleText);
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`FastChunker: ${chunks.length} chunks`);
  });
});
