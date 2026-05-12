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
