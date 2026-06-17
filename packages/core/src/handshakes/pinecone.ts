import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface PineconeHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized Pinecone index instance. */
  index: PineconeIndex;
  /** Namespace within the index. */
  namespace?: string;
}

export interface PineconeIndex {
  namespace(ns: string): PineconeNamespace;
  describeIndexStats(): Promise<{ totalRecordCount?: number; namespaces?: Record<string, { recordCount: number }> }>;
}

export interface PineconeNamespace {
  upsert(vectors: Array<{
    id: string;
    values: number[];
    metadata?: Record<string, string | number | boolean | string[]>;
  }>): Promise<void>;
  query(params: {
    vector: number[];
    topK: number;
    includeMetadata?: boolean;
  }): Promise<{
    matches: Array<{
      id: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

export class PineconeHandshake extends BaseHandshake {
  private index: PineconeIndex;
  private namespace: string;
  private ns: PineconeNamespace;

  constructor(options: PineconeHandshakeOptions) {
    super(options);
    this.index = options.index;
    this.namespace = options.namespace ?? '';
    this.ns = this.index.namespace(this.namespace);
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const vectors = items.map((chunk, i) => ({
      id: this.generateId(`chunk-${i}:${chunk.text}`),
      values: embeddings[i],
      metadata: {
        text: chunk.text,
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
        tokenCount: chunk.tokenCount,
      },
    }));

    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      await this.ns.upsert(vectors.slice(i, i + batchSize));
    }
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const topK = options?.limit ?? 10;
    const result = await this.ns.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });

    return result.matches.map(match => ({
      id: match.id,
      score: match.score ?? 0,
      text: (match.metadata?.text as string) ?? '',
      startIndex: (match.metadata?.startIndex as number) ?? 0,
      endIndex: (match.metadata?.endIndex as number) ?? 0,
      tokenCount: (match.metadata?.tokenCount as number) ?? 0,
      metadata: (() => {
        if (!match.metadata) return undefined;
        const { text, startIndex, endIndex, tokenCount, ...rest } = match.metadata;
        return Object.keys(rest).length > 0 ? rest : undefined;
      })(),
    }));
  }

  async count(): Promise<number> {
    const stats = await this.index.describeIndexStats();
    if (this.namespace && stats.namespaces) {
      return stats.namespaces[this.namespace]?.recordCount ?? 0;
    }
    return stats.totalRecordCount ?? 0;
  }
}
