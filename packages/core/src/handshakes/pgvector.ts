import { Chunk } from '@/types';
import {
  BaseHandshake,
  BaseHandshakeOptions,
  HandshakeSearchResult,
} from './base';

export interface PgvectorHandshakeOptions extends BaseHandshakeOptions {
  /** A pg Pool or Client instance with pgvector extension enabled. */
  client: PgClient;
  /** Table name. (default: 'chunks') */
  tableName?: string;
  /** Whether to auto-create the table on first write. (default: true) */
  autoCreateTable?: boolean;
}

export interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }>;
}

export class PgvectorHandshake extends BaseHandshake {
  private client: PgClient;
  private tableName: string;
  private autoCreateTable: boolean;
  private tableCreated = false;

  constructor(options: PgvectorHandshakeOptions) {
    super(options);
    this.client = options.client;
    this.tableName = options.tableName ?? 'chunks';
    this.autoCreateTable = options.autoCreateTable ?? true;
  }

  private async ensureTable(dimension: number): Promise<void> {
    if (this.tableCreated || !this.autoCreateTable) return;

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        start_index INTEGER NOT NULL,
        end_index INTEGER NOT NULL,
        token_count INTEGER NOT NULL,
        embedding vector(${dimension})
      )
    `);
    this.tableCreated = true;
  }

  async write(chunks: Chunk | Chunk[]): Promise<void> {
    const items = this.normalizeChunks(chunks);
    if (items.length === 0) return;

    const texts = items.map(c => c.text);
    const embeddings = await this.embed(texts);

    await this.ensureTable(embeddings[0].length);

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (let i = 0; i < items.length; i++) {
      const chunk = items[i];
      const id = this.generateId(`chunk-${i}:${chunk.text}`);
      const vecStr = `[${embeddings[i].join(',')}]`;
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
      values.push(id, chunk.text, chunk.startIndex, chunk.endIndex, chunk.tokenCount, vecStr);
      idx += 6;
    }

    await this.client.query(
      `INSERT INTO ${this.tableName} (id, text, start_index, end_index, token_count, embedding)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO UPDATE SET
         text = EXCLUDED.text,
         start_index = EXCLUDED.start_index,
         end_index = EXCLUDED.end_index,
         token_count = EXCLUDED.token_count,
         embedding = EXCLUDED.embedding`,
      values
    );
  }

  async search(query: string, options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const [embedding] = await this.embed([query]);
    return this.searchByVector(embedding, options);
  }

  async searchByVector(embedding: number[], options?: { limit?: number }): Promise<HandshakeSearchResult[]> {
    const limit = options?.limit ?? 10;
    const vecStr = `[${embedding.join(',')}]`;

    const result = await this.client.query(
      `SELECT id, text, start_index, end_index, token_count,
              1 - (embedding <=> $1::vector) AS score
       FROM ${this.tableName}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vecStr, limit]
    );

    return result.rows.map(row => ({
      id: row.id as string,
      score: row.score as number,
      text: row.text as string,
      startIndex: row.start_index as number,
      endIndex: row.end_index as number,
      tokenCount: row.token_count as number,
    }));
  }

  async count(): Promise<number> {
    const result = await this.client.query(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    return Number(result.rows[0].count);
  }
}
