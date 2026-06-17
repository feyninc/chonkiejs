import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface WeaviateHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized Weaviate collection/class accessor. */
  collection: WeaviateCollection;
}

export interface WeaviateCollection {
  data: {
    insertMany(objects: Array<{
      properties: Record<string, unknown>;
      vectors: number[];
    }>): Promise<{ uuids: string[] }>;
  };
  query: {
    nearVector(vector: number[], opts?: {
      limit?: number;
      returnProperties?: string[];
      includeVector?: boolean;
    }): Promise<{
      objects: Array<{
        uuid: string;
        properties: Record<string, unknown>;
        metadata?: { distance?: number; certainty?: number };
      }>;
    }>;
  };
  aggregate: {
    overAll(): Promise<{ totalCount: number }>;
  };
}

export class WeaviateHandshake extends BaseHandshake {
  private collection: WeaviateCollection;

  constructor(options: WeaviateHandshakeOptions) {
    super(options);
    this.collection = options.collection;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const objects = items.map((chunk, i) => ({
      properties: {
        text: chunk.text,
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
        tokenCount: chunk.tokenCount,
        chunkId: this.generateId(`chunk-${i}:${chunk.text}`),
      },
      vectors: embeddings[i],
    }));

    await this.collection.data.insertMany(objects);
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const limit = options?.limit ?? 10;
    const result = await this.collection.query.nearVector(embedding, {
      limit,
      returnProperties: ['text', 'startIndex', 'endIndex', 'tokenCount', 'chunkId'],
    });

    return result.objects.map(obj => {
      const props = obj.properties;
      const distance = obj.metadata?.distance ?? 0;
      return {
        id: (props.chunkId as string) ?? obj.uuid,
        score: 1 - distance,
        text: (props.text as string) ?? '',
        startIndex: (props.startIndex as number) ?? 0,
        endIndex: (props.endIndex as number) ?? 0,
        tokenCount: (props.tokenCount as number) ?? 0,
      };
    });
  }

  async count(): Promise<number> {
    const result = await this.collection.aggregate.overAll();
    return result.totalCount;
  }
}
