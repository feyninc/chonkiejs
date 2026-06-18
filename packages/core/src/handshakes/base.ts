import { Chunk } from '@/types';
import { createHash } from 'node:crypto';

export type EmbedFunction = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingModel {
  embed(texts: string[]): Promise<number[][]>;
}

export interface HandshakeSearchResult {
  id: string;
  score: number;
  text: string;
  startIndex: number;
  endIndex: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export interface BaseHandshakeOptions {
  embeddings: EmbedFunction | EmbeddingModel;
  idPrefix?: string;
}

export abstract class BaseHandshake {
  protected readonly embed: EmbedFunction;
  protected readonly idPrefix: string;

  constructor(options: BaseHandshakeOptions) {
    const { embeddings } = options;
    this.embed = typeof embeddings === 'function'
      ? embeddings
      : (texts) => embeddings.embed(texts);
    this.idPrefix = options.idPrefix ?? '';
  }

  abstract write(chunks: Chunk | Chunk[]): Promise<void>;
  abstract search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]>;
  abstract searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]>;
  abstract count(): Promise<number>;

  protected generateId(chunk: Chunk): string {
    const input = `${this.idPrefix}${chunk.startIndex}:${chunk.endIndex}:${chunk.text}`;
    return createHash('sha256').update(input).digest('hex').slice(0, 32);
  }

  protected normalizeChunks(chunks: Chunk | Chunk[]): Chunk[] {
    return Array.isArray(chunks) ? chunks : [chunks];
  }
}
