import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface MilvusHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized Milvus client. */
  client: MilvusClient;
  /** Collection name in Milvus. */
  collectionName: string;
}

export interface MilvusClient {
  insert(params: {
    collection_name: string;
    data: Array<Record<string, unknown>>;
  }): Promise<{ insert_cnt: number }>;
  search(params: {
    collection_name: string;
    vectors: number[][];
    limit: number;
    output_fields?: string[];
  }): Promise<{
    results: Array<{
      id: string | number;
      score: number;
      [key: string]: unknown;
    }>;
  }>;
  getCollectionStatistics(params: {
    collection_name: string;
  }): Promise<{ data: { row_count: number } }>;
}

export class MilvusHandshake extends BaseHandshake {
  private client: MilvusClient;
  private collectionName: string;

  constructor(options: MilvusHandshakeOptions) {
    super(options);
    this.client = options.client;
    this.collectionName = options.collectionName;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const data = items.map((chunk, i) => ({
      id: this.generateId(`chunk-${i}:${chunk.text}`),
      vector: embeddings[i],
      text: chunk.text,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      tokenCount: chunk.tokenCount,
    }));

    await this.client.insert({
      collection_name: this.collectionName,
      data,
    });
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const limit = options?.limit ?? 10;
    const result = await this.client.search({
      collection_name: this.collectionName,
      vectors: [embedding],
      limit,
      output_fields: ['text', 'startIndex', 'endIndex', 'tokenCount'],
    });

    return result.results.map(r => ({
      id: String(r.id),
      score: r.score,
      text: (r.text as string) ?? '',
      startIndex: (r.startIndex as number) ?? 0,
      endIndex: (r.endIndex as number) ?? 0,
      tokenCount: (r.tokenCount as number) ?? 0,
    }));
  }

  async count(): Promise<number> {
    const stats = await this.client.getCollectionStatistics({
      collection_name: this.collectionName,
    });
    return stats.data.row_count;
  }
}
