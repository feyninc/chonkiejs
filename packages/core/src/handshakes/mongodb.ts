import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface MongoDBHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized MongoDB collection. */
  collection: MongoCollection;
  /** Name of the Atlas vector search index. (default: 'vector_index') */
  indexName?: string;
}

export interface MongoCollection {
  insertMany(docs: Array<Record<string, unknown>>): Promise<{ insertedCount: number }>;
  bulkWrite(ops: Array<Record<string, unknown>>): Promise<unknown>;
  aggregate(pipeline: Array<Record<string, unknown>>): { toArray(): Promise<Array<Record<string, unknown>>> };
  countDocuments(): Promise<number>;
}

export class MongoDBHandshake extends BaseHandshake {
  private collection: MongoCollection;
  private indexName: string;

  constructor(options: MongoDBHandshakeOptions) {
    super(options);
    this.collection = options.collection;
    this.indexName = options.indexName ?? 'vector_index';
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const ops = items.map((chunk, i) => ({
      updateOne: {
        filter: { _id: this.generateId(chunk) },
        update: {
          $set: {
            text: chunk.text,
            startIndex: chunk.startIndex,
            endIndex: chunk.endIndex,
            tokenCount: chunk.tokenCount,
            embedding: embeddings[i],
          },
        },
        upsert: true,
      },
    }));

    await this.collection.bulkWrite(ops);
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const limit = options?.limit ?? 10;

    const pipeline = [
      {
        $vectorSearch: {
          index: this.indexName,
          path: 'embedding',
          queryVector: embedding,
          numCandidates: limit * 10,
          limit,
        },
      },
      {
        $project: {
          _id: 1,
          text: 1,
          startIndex: 1,
          endIndex: 1,
          tokenCount: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    return results.map(doc => ({
      id: String(doc._id),
      score: (doc.score as number) ?? 0,
      text: (doc.text as string) ?? '',
      startIndex: (doc.startIndex as number) ?? 0,
      endIndex: (doc.endIndex as number) ?? 0,
      tokenCount: (doc.tokenCount as number) ?? 0,
    }));
  }

  async count(): Promise<number> {
    return this.collection.countDocuments();
  }
}
