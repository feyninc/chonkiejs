/**
 * @chonkie/core
 * Core chunking library for Chonkie - lightweight and efficient text chunking
 */

export { RecursiveChunker } from '@/recursive';
export { initWasm } from '@/wasm';
export type { RecursiveChunkerOptions } from '@/recursive';

export { TokenChunker } from '@/token';
export type { TokenChunkerOptions } from '@/token';

export { TableChunker } from '@/table';
export type { TableChunkerOptions } from '@/table';

export { FastChunker } from '@/fast';
export type { FastChunkerOptions } from '@/fast';

export { SentenceChunker } from '@/sentence';
export type { SentenceChunkerOptions } from '@/sentence';

export { CodeChunker } from '@/code';
export type { CodeChunkerOptions, CodeChunkerBackend } from '@/code';

export { SemanticChunker } from '@/semantic';
export type { SemanticChunkerOptions, EmbedFunction, EmbeddingModel } from '@/semantic';

export { Tokenizer } from '@/tokenizer';

export { Chunk, RecursiveLevel, RecursiveRules } from '@/types';
export type { RecursiveLevelConfig, RecursiveRulesConfig, IncludeDelim } from '@/types';

// Handshakes (vector DB wrappers)
export {
  BaseHandshake,
  ChromaHandshake,
  PineconeHandshake,
  QdrantHandshake,
  WeaviateHandshake,
  MilvusHandshake,
  MongoDBHandshake,
  ElasticHandshake,
  LanceDBHandshake,
  TurbopufferHandshake,
  PgvectorHandshake,
} from '@/handshakes';
export type {
  BaseHandshakeOptions,
  EmbedFunction as HandshakeEmbedFunction,
  EmbeddingModel as HandshakeEmbeddingModel,
  HandshakeSearchResult,
  ChromaHandshakeOptions,
  ChromaCollection,
  PineconeHandshakeOptions,
  PineconeIndex,
  PineconeNamespace,
  QdrantHandshakeOptions,
  QdrantClient,
  WeaviateHandshakeOptions,
  WeaviateCollection,
  MilvusHandshakeOptions,
  MilvusClient,
  MongoDBHandshakeOptions,
  MongoCollection,
  ElasticHandshakeOptions,
  ElasticClient,
  LanceDBHandshakeOptions,
  LanceTable,
  LanceQuery,
  TurbopufferHandshakeOptions,
  TurbopufferNamespace,
  PgvectorHandshakeOptions,
  PgClient,
} from '@/handshakes';

// Re-export low-level chunk functions from @chonkiejs/chunk
export {
  chunk,
  chunk_offsets,
  split,
  split_offsets,
  merge_splits,
  init,
  Chunker,
  default_target_size,
  default_delimiters,
} from '@chonkiejs/chunk';
