import { describe, it, expect } from 'vitest';
import { Chunk } from '../src/types';
import {
  ChromaHandshake,
  PineconeHandshake,
  QdrantHandshake,
  WeaviateHandshake,
  MilvusHandshake,
  MongoDBHandshake,
  ElasticHandshake,
  LanceDBHandshake,
  TurbopufferHandshake,
  PgvectorHandshake,
} from '../src/handshakes';
import type { EmbedFunction } from '../src/handshakes/base';

const mockEmbed: EmbedFunction = async (texts) =>
  texts.map(() => [0.1, 0.2, 0.3, 0.4]);

const sampleChunks = [
  new Chunk({ text: 'Hello world', startIndex: 0, endIndex: 11, tokenCount: 2 }),
  new Chunk({ text: 'Foo bar baz', startIndex: 12, endIndex: 23, tokenCount: 3 }),
];

describe('ChromaHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<{ id: string; embedding: number[]; metadata: Record<string, unknown>; document: string }> = [];

    const collection = {
      async add({ ids, embeddings, metadatas, documents }: any) {
        for (let i = 0; i < ids.length; i++) {
          store.push({ id: ids[i], embedding: embeddings[i], metadata: metadatas[i], document: documents[i] });
        }
      },
      async query({ queryEmbeddings, nResults }: any) {
        return {
          ids: [store.slice(0, nResults).map(s => s.id)],
          distances: [store.slice(0, nResults).map(() => 0.1)],
          metadatas: [store.slice(0, nResults).map(s => s.metadata)],
          documents: [store.slice(0, nResults).map(s => s.document)],
        };
      },
      async count() { return store.length; },
    };

    const hs = new ChromaHandshake({ embeddings: mockEmbed, collection });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello', { limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('Hello world');
    expect(results[0].score).toBeCloseTo(0.9);
  });
});

describe('PineconeHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }> = [];

    const index = {
      namespace() {
        return {
          async upsert(vectors: any[]) { store.push(...vectors); },
          async query({ vector, topK, includeMetadata }: any) {
            return {
              matches: store.slice(0, topK).map(v => ({
                id: v.id,
                score: 0.95,
                metadata: v.metadata,
              })),
            };
          },
        };
      },
      async describeIndexStats() {
        return { totalRecordCount: store.length, namespaces: {} };
      },
    };

    const hs = new PineconeHandshake({ embeddings: mockEmbed, index });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello', { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
    expect(results[0].text).toBe('Hello world');
  });
});

describe('QdrantHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

    const client = {
      async upsert(_: string, { points }: any) { store.push(...points); },
      async search(_: string, { vector, limit }: any) {
        return store.slice(0, limit).map(p => ({
          id: p.id,
          score: 0.88,
          payload: p.payload,
        }));
      },
      async getCollection() { return { points_count: store.length }; },
    };

    const hs = new QdrantHandshake({ embeddings: mockEmbed, client, collectionName: 'test' });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('query');
    expect(results[0].score).toBe(0.88);
  });
});

describe('LanceDBHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<Record<string, unknown>> = [];

    const table = {
      async add(data: any[]) { store.push(...data); },
      search() {
        return {
          limit(n: number) {
            return {
              async toArray() {
                return store.slice(0, n).map(r => ({ ...r, _distance: 0.05 }));
              },
            };
          },
        };
      },
      async countRows() { return store.length; },
    };

    const hs = new LanceDBHandshake({ embeddings: mockEmbed, table });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello', { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('Hello world');
    expect(results[0].score).toBeGreaterThan(0);
  });
});

describe('MongoDBHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<Record<string, unknown>> = [];

    const collection = {
      async insertMany(docs: any[]) {
        store.push(...docs);
        return { insertedCount: docs.length };
      },
      aggregate() {
        return {
          async toArray() {
            return store.map(d => ({ ...d, score: 0.92 }));
          },
        };
      },
      async countDocuments() { return store.length; },
    };

    const hs = new MongoDBHandshake({ embeddings: mockEmbed, collection });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello');
    expect(results[0].score).toBe(0.92);
  });
});

describe('ElasticHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<Record<string, unknown>> = [];

    const client = {
      async bulk({ operations }: any) {
        for (let i = 0; i < operations.length; i += 2) {
          store.push({ _id: operations[i].index._id, ...operations[i + 1] });
        }
        return { errors: false, items: [] };
      },
      async search({ index, knn }: any) {
        return {
          hits: {
            total: { value: store.length },
            hits: store.slice(0, knn?.k ?? 10).map(s => ({
              _id: s._id as string,
              _score: 0.9,
              _source: s,
            })),
          },
        };
      },
      async count() { return { count: store.length }; },
    };

    const hs = new ElasticHandshake({ embeddings: mockEmbed, client, indexName: 'test' });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello', { limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.9);
  });
});

describe('MilvusHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<Record<string, unknown>> = [];

    const client = {
      async insert({ data }: any) {
        store.push(...data);
        return { insert_cnt: data.length };
      },
      async search({ vectors, limit }: any) {
        return {
          results: store.slice(0, limit).map(r => ({
            id: r.id,
            score: 0.85,
            text: r.text,
            startIndex: r.startIndex,
            endIndex: r.endIndex,
            tokenCount: r.tokenCount,
          })),
        };
      },
      async getCollectionStatistics() { return { data: { row_count: store.length } }; },
    };

    const hs = new MilvusHandshake({ embeddings: mockEmbed, client, collectionName: 'test' });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello', { limit: 1 });
    expect(results[0].score).toBe(0.85);
  });
});

describe('TurbopufferHandshake', () => {
  it('writes and searches chunks', async () => {
    let storedIds: string[] = [];
    let storedAttrs: Record<string, Array<unknown>> = {};

    const namespace = {
      async upsert({ ids, vectors, attributes }: any) {
        storedIds = ids;
        storedAttrs = attributes;
      },
      async query({ vector, top_k }: any) {
        return storedIds.slice(0, top_k).map((id, i) => ({
          id,
          dist: 0.1,
          attributes: {
            text: storedAttrs.text[i],
            startIndex: storedAttrs.startIndex[i],
            endIndex: storedAttrs.endIndex[i],
            tokenCount: storedAttrs.tokenCount[i],
          },
        }));
      },
      async exists() { return { approx_count: storedIds.length }; },
    };

    const hs = new TurbopufferHandshake({ embeddings: mockEmbed, namespace });
    await hs.write(sampleChunks);

    const results = await hs.search('hello', { limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('Hello world');
    expect(results[0].score).toBeGreaterThan(0);
  });
});

describe('PgvectorHandshake', () => {
  it('writes and searches chunks', async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];

    const client = {
      async query(text: string, values?: unknown[]) {
        queries.push({ text, values: values ?? [] });
        if (text.includes('SELECT COUNT')) {
          return { rows: [{ count: 2 }], rowCount: 1 };
        }
        if (text.includes('ORDER BY')) {
          return {
            rows: [
              { id: 'abc', text: 'Hello world', start_index: 0, end_index: 11, token_count: 2, score: 0.95 },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    const hs = new PgvectorHandshake({ embeddings: mockEmbed, client, tableName: 'chunks' });
    await hs.write(sampleChunks);

    const results = await hs.search('hello', { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('Hello world');
    expect(results[0].score).toBe(0.95);
    expect(await hs.count()).toBe(2);
  });
});

describe('WeaviateHandshake', () => {
  it('writes and searches chunks', async () => {
    const store: Array<Record<string, unknown>> = [];

    const collection = {
      data: {
        async insertMany(objects: any[]) {
          store.push(...objects.map(o => o.properties));
          return { uuids: objects.map((_, i) => `uuid-${i}`) };
        },
      },
      query: {
        async nearVector(vector: number[], opts?: any) {
          return {
            objects: store.slice(0, opts?.limit ?? 10).map((props, i) => ({
              uuid: `uuid-${i}`,
              properties: props,
              metadata: { distance: 0.1 },
            })),
          };
        },
      },
      aggregate: {
        async overAll() { return { totalCount: store.length }; },
      },
    };

    const hs = new WeaviateHandshake({ embeddings: mockEmbed, collection });
    await hs.write(sampleChunks);
    expect(await hs.count()).toBe(2);

    const results = await hs.search('hello', { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('Hello world');
    expect(results[0].score).toBeCloseTo(0.9);
  });
});
