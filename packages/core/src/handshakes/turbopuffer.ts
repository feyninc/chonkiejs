import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface TurbopufferHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized Turbopuffer namespace. */
  namespace: TurbopufferNamespace;
}

export interface TurbopufferNamespace {
  upsert(params: {
    ids: string[];
    vectors: number[][];
    attributes?: Record<string, Array<string | number | boolean | null>>;
  }): Promise<void>;
  query(params: {
    vector: number[];
    top_k: number;
    include_attributes?: boolean;
  }): Promise<Array<{
    id: string;
    dist: number;
    attributes?: Record<string, string | number | boolean | null>;
  }>>;
  exists(): Promise<{ approx_count?: number }>;
}

export class TurbopufferHandshake extends BaseHandshake {
  private namespace: TurbopufferNamespace;

  constructor(options: TurbopufferHandshakeOptions) {
    super(options);
    this.namespace = options.namespace;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const ids = items.map((chunk) => this.generateId(chunk));
    const attributes: Record<string, Array<string | number | boolean | null>> = {
      text: items.map(c => c.text),
      startIndex: items.map(c => c.startIndex),
      endIndex: items.map(c => c.endIndex),
      tokenCount: items.map(c => c.tokenCount),
    };

    await this.namespace.upsert({
      ids,
      vectors: embeddings,
      attributes,
    });
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const topK = options?.limit ?? 10;
    const results = await this.namespace.query({
      vector: embedding,
      top_k: topK,
      include_attributes: true,
    });

    return results.map(r => ({
      id: r.id,
      score: 1 - r.dist,
      text: (r.attributes?.text as string) ?? '',
      startIndex: (r.attributes?.startIndex as number) ?? 0,
      endIndex: (r.attributes?.endIndex as number) ?? 0,
      tokenCount: (r.attributes?.tokenCount as number) ?? 0,
    }));
  }

  async count(): Promise<number> {
    const info = await this.namespace.exists();
    return info.approx_count ?? 0;
  }
}
