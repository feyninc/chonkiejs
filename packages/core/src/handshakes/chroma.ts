import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface ChromaHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized ChromaDB collection. */
  collection: ChromaCollection;
}

export interface ChromaCollection {
  add(params: {
    ids: string[];
    embeddings: number[][];
    metadatas: Record<string, string | number | boolean>[];
    documents: string[];
  }): Promise<void>;
  query(params: {
    queryEmbeddings: number[][];
    nResults?: number;
  }): Promise<{
    ids: string[][];
    distances: number[][] | null;
    metadatas: (Record<string, string | number | boolean> | null)[][] | null;
    documents: (string | null)[][] | null;
  }>;
  count(): Promise<number>;
}

export class ChromaHandshake extends BaseHandshake {
  private collection: ChromaCollection;

  constructor(options: ChromaHandshakeOptions) {
    super(options);
    this.collection = options.collection;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const ids: string[] = [];
    const metadatas: Record<string, string | number | boolean>[] = [];
    const documents: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const chunk = items[i];
      ids.push(this.generateId(`chunk-${i}:${chunk.text}`));
      documents.push(chunk.text);
      metadatas.push({
        startIndex: chunk.startIndex,
        endIndex: chunk.endIndex,
        tokenCount: chunk.tokenCount,
      });
    }

    await this.collection.add({ ids, embeddings, metadatas, documents });
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const nResults = options?.limit ?? 10;
    const result = await this.collection.query({
      queryEmbeddings: [embedding],
      nResults,
    });

    const results: HandshakeSearchResult[] = [];
    const ids = result.ids[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const documents = result.documents?.[0] ?? [];

    for (let i = 0; i < ids.length; i++) {
      const meta = metadatas[i] ?? {};
      results.push({
        id: ids[i],
        score: 1 - (distances[i] ?? 0),
        text: (documents[i] as string) ?? '',
        startIndex: (meta.startIndex as number) ?? 0,
        endIndex: (meta.endIndex as number) ?? 0,
        tokenCount: (meta.tokenCount as number) ?? 0,
      });
    }

    return results;
  }

  async count(): Promise<number> {
    return this.collection.count();
  }
}
