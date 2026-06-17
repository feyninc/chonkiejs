import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface LanceDBHandshakeOptions extends BaseHandshakeOptions {
  /** Pre-initialized LanceDB table. */
  table: LanceTable;
}

export interface LanceTable {
  add(data: Array<Record<string, unknown>>): Promise<void>;
  search(vector: number[]): LanceQuery;
  countRows(): Promise<number>;
}

export interface LanceQuery {
  limit(n: number): LanceQuery;
  toArray(): Promise<Array<Record<string, unknown>>>;
}

export class LanceDBHandshake extends BaseHandshake {
  private table: LanceTable;

  constructor(options: LanceDBHandshakeOptions) {
    super(options);
    this.table = options.table;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    const data = items.map((chunk, i) => ({
      id: this.generateId(`chunk-${i}:${chunk.text}`),
      text: chunk.text,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      tokenCount: chunk.tokenCount,
      vector: embeddings[i],
    }));

    await this.table.add(data);
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const limit = options?.limit ?? 10;
    const results = await this.table.search(embedding).limit(limit).toArray();

    return results.map(row => ({
      id: (row.id as string) ?? '',
      score: (row._distance != null) ? 1 / (1 + (row._distance as number)) : 0,
      text: (row.text as string) ?? '',
      startIndex: (row.startIndex as number) ?? 0,
      endIndex: (row.endIndex as number) ?? 0,
      tokenCount: (row.tokenCount as number) ?? 0,
    }));
  }

  async count(): Promise<number> {
    return this.table.countRows();
  }
}
