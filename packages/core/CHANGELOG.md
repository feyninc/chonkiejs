# @chonkiejs/core

## 0.0.12

### Patch Changes

- Fix delimiter splitting for non-ASCII text. `RecursiveChunker`, `SentenceChunker` and `SemanticChunker` now split with a shared JS-native splitter (`src/split.ts`) that returns UTF-16 offsets and supports multi-character delimiters (longest match first). Before this, they relied on WASM byte offsets, which produced wrong `startIndex`/`endIndex` and mangled text around multi-byte characters. `FastChunker` now snaps cut points to UTF-8 character boundaries.

  Updated the default `RecursiveRules` hierarchy: opening brackets (`{ [ < (`) now start the next chunk, `:` only splits as `': '`, and a new "word parts" level (`/ - _ . : = & ? ' ~`) runs after whitespace, so URLs, paths and hyphenated words stay intact unless they have to be split.

## 0.0.10

### Patch Changes

- Fix CodeChunker, update CI workflow

## 0.0.5

### Patch Changes

- Fix: Added full path resolution for .js files

## 0.0.4

### Patch Changes

- Fix: Add `embedding` to the `Chunk` for `EmbeddingsRefinery`

## 0.0.3

### Patch Changes

- Add Huggingface Tokenizer and TokenChunker support
- Updated dependencies
  - @chonkiejs/core@0.0.3
