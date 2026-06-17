import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface ElasticHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized Elasticsearch client. */
  client: ElasticClient;
  /** Index name in Elasticsearch. */
  indexName: string;
}

export interface ElasticClient {
  bulk(params: {
    operations: Array<Record<string, unknown>>;
    refresh?: boolean | 'wait_for';
  }): Promise<{ errors: boolean; items: Array<Record<string, unknown>> }>;
  search(params: {
    index: string;
    knn?: {
      field: string;
      query_vector: number[];
      k: number;
      num_candidates: number;
    };
    size?: number;
  }): Promise<{
    hits: {
      total: { value: number };
      hits: Array<{
        _id: string;
        _score: number;
        _source: Record<string, unknown>;
      }>;
    };
  }>;
  count(params: { index: string }): Promise<{ count: number }>;
}

export class ElasticHandshake extends BaseHandshake {
  private client: ElasticClient;
  private indexName: string;

  constructor(options: ElasticHandshakeOptions) {
    super(options);
    this.client = options.client;
    this.indexName = options.indexName;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const operations: Array<Record<string, unknown>> = [];
    for (let i = 0; i < items.length; i++) {
      const chunk = items[i];
      const id = this.generateId(`chunk-${i}:${chunk.text}`);
      operations.push(
        { index: { _index: this.indexName, _id: id } },
        {
          text: chunk.text,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
          tokenCount: chunk.tokenCount,
          embedding: embeddings[i],
        }
      );
    }

    await this.client.bulk({ operations, refresh: 'wait_for' });
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const k = options?.limit ?? 10;

    const result = await this.client.search({
      index: this.indexName,
      knn: {
        field: 'embedding',
        query_vector: embedding,
        k,
        num_candidates: k * 10,
      },
      size: k,
    });

    return result.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      text: (hit._source.text as string) ?? '',
      startIndex: (hit._source.startIndex as number) ?? 0,
      endIndex: (hit._source.endIndex as number) ?? 0,
      tokenCount: (hit._source.tokenCount as number) ?? 0,
    }));
  }

  async count(): Promise<number> {
    const result = await this.client.count({ index: this.indexName });
    return result.count;
  }
}
