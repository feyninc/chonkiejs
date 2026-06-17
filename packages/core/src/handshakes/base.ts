import { Chunk } from '@/types';
import { createHash } from 'crypto';

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
}

export abstract class BaseHandshake {
  protected readonly embed: EmbedFunction;

  constructor(options: BaseHandshakeOptions) {
    const { embeddings } = options;
    this.embed = typeof embeddings === 'function'
      ? embeddings
      : (texts) => embeddings.embed(texts);
  }

  abstract write(chunks: Chunk | Chunk[]): Promise<void>;
  abstract search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]>;
  abstract searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]>;
  abstract count(): Promise<number>;

  protected generateId(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
  }

  protected normalizeChunks(chunks: Chunk | Chunk[]): Chunk[] {
    return Array.isArray(chunks) ? chunks : [chunks];
  }

  protected buildMetadata(chunk: Chunk, index: number, containerName: string): Record<string, unknown> {
    return {
      text: chunk.text,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      tokenCount: chunk.tokenCount,
    };
  }

  protected parseResult(
    id: string,
    score: number,
    data: Record<string, unknown>
  ): HandshakeSearchResult {
    const { text, startIndex, endIndex, tokenCount, ...rest } = data;
    return {
      id,
      score,
      text: text as string,
      startIndex: startIndex as number,
      endIndex: endIndex as number,
      tokenCount: tokenCount as number,
      metadata: Object.keys(rest).length > 0 ? rest : undefined,
    };
  }
}
