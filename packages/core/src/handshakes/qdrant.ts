import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface QdrantHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized Qdrant client. */
  client: QdrantClient;
  /** Collection name in Qdrant. */
  collectionName: string;
}

export interface QdrantClient {
  upsert(collectionName: string, params: {
    points: Array<{
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }>;
  }): Promise<void>;
  search(collectionName: string, params: {
    vector: number[];
    limit: number;
    with_payload?: boolean;
  }): Promise<Array<{
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
  }>>;
  getCollection(collectionName: string): Promise<{
    points_count?: number;
    vectors_count?: number;
  }>;
}

export class QdrantHandshake extends BaseHandshake {
  private client: QdrantClient;
  private collectionName: string;

  constructor(options: QdrantHandshakeOptions) {
    super(options);
    this.client = options.client;
    this.collectionName = options.collectionName;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const points = items.map((chunk, i) => ({
      id: this.generateId(`chunk-${i}:${chunk.text}`),
      vector: embeddings[i],
      payload: {
        text: chunk.text,
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
        tokenCount: chunk.tokenCount,
      },
    }));

    await this.client.upsert(this.collectionName, { points });
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const limit = options?.limit ?? 10;
    const results = await this.client.search(this.collectionName, {
      vector: embedding,
      limit,
      with_payload: true,
    });

    return results.map(r => ({
      id: String(r.id),
      score: r.score,
      text: (r.payload?.text as string) ?? '',
      startIndex: (r.payload?.startIndex as number) ?? 0,
      endIndex: (r.payload?.endIndex as number) ?? 0,
      tokenCount: (r.payload?.tokenCount as number) ?? 0,
      metadata: (() => {
        if (!r.payload) return undefined;
        const { text, startIndex, endIndex, tokenCount, ...rest } = r.payload;
        return Object.keys(rest).length > 0 ? rest : undefined;
      })(),
    }));
  }

  async count(): Promise<number> {
    const info = await this.client.getCollection(this.collectionName);
    return info.points_count ?? info.vectors_count ?? 0;
  }
}
