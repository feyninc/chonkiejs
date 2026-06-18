# 🦛 Contributing to Chonkie

> "I like them big, I like them CONTRIBUTING" ~ Moto Moto, probably

Welcome fellow CHONKer! We're thrilled you want to contribute to Chonkie. Every contribution—whether fixing bugs, adding features, or improving documentation—makes Chonkie better for everyone.

## 🚀 Getting Started

### Before You Dive In

1. **Check existing issues** or open a new one to start a discussion
2. **Read [Chonkie's documentation](https://docs.chonkie.ai)** and core [concepts](https://docs.chonkie.ai/getting-started/concepts)
3. **Set up your development environment** using the guide below

### Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/chonkie-inc/chonkiejs.git
cd chonkiejs

# 2. Install dependencies   
pnpm install
```

## 🧪 Testing & Code Quality

### Running Tests

```bash
cd packages/core
pnpm run test                              # Run all tests
pnpm vitest run tests/handshakes.test.ts   # Run specific test file
```

### Documentation Style

We follow Google-style docstrings:

```typescript
/**
 * Splits text into chunks of specified size.
 * 
 * @param text - Input text to chunk
 * @param chunk_size - Maximum size of each chunk
 * 
 * @returns List of text chunks
 * 
 * @throws ValueError if chunk_size <= 0
 */
function chunk_text(text: string, chunk_size: number): string[] {
    return text.split(' ').slice(0, chunk_size);
}
```

## 📦 Project Structure

```
packages/core/src/
├── types.ts          # Chunk class & shared types
├── tokenizer.ts      # Tokenizer abstraction
├── wasm.ts           # WASM initialization
├── recursive.ts      # RecursiveChunker
├── token.ts          # TokenChunker
├── fast.ts           # FastChunker (WASM byte-based)
├── sentence.ts       # SentenceChunker
├── semantic.ts       # SemanticChunker (embedding-based)
├── code.ts           # CodeChunker (tree-sitter)
├── table.ts          # TableChunker
├── handshakes/       # Vector DB wrappers
│   ├── base.ts       # BaseHandshake abstract class
│   ├── chroma.ts     # ChromaDB
│   ├── pinecone.ts   # Pinecone
│   ├── qdrant.ts     # Qdrant
│   ├── weaviate.ts   # Weaviate
│   ├── milvus.ts     # Milvus
│   ├── mongodb.ts    # MongoDB Atlas Vector Search
│   ├── elastic.ts    # Elasticsearch
│   ├── lancedb.ts    # LanceDB
│   ├── turbopuffer.ts # Turbopuffer
│   └── pgvector.ts   # pgvector (PostgreSQL)
```

## 🎯 Contribution Opportunities

### For Beginners

Start with issues labeled [`good-first-issue`](https://github.com/chonkie-inc/chonkie/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22)

### Documentation

- Improve existing docs
- Add examples or tutorials
- Fix typos

### Code Improvements

- Implement new chunking strategies
- Add tokenizer support
- Optimize existing chunkers
- Improve test coverage
- Bring to feature parity with Python library

### Performance Enhancements

- Profile and optimize code
- Add benchmarks
- Improve memory usage

### New Features

Look for issues with [FEAT] labels, especially those from Chonkie Maintainers

## 🚦 Pull Request Process

### 1. Branch Naming

- `feature/description` for new features
- `fix/description` for bug fixes
- `docs/description` for documentation changes

### 2. Commit Messages

Write clear, descriptive commit messages:

```
feat: add batch processing to WordChunker

- Implement batch_process method
- Add tests for batch processing
- Update documentation
```

### 3. Code Review

- **Make sure your PR is for the `development` branch**
- All PRs need at least one review
- Maintainers will review for:
  - Code quality
  - Test coverage
  - Performance impact
  - Documentation completeness

## 🦛 Technical Details

### Semantic Versioning

Chonkie does not follow strict semantic versioning. We follow the following rules:

- 'MAJOR' version when we refactor/rewrite large parts of the codebase
- 'MINOR' version when we add breaking changes (e.g. changing a public API)
- 'PATCH' version when we add non-breaking features (e.g. adding a new chunker) or fix bugs

## 💡 Getting Help

- **Chat?** [Join our Discord!](https://discord.gg/Q6zkP8w6ur)
- **Questions?** Open an issue or ask in Discord
- **Bugs?** Open an issue or report in Discord
- **Email?** Contact [support@chonkie.ai](mailto:support@chonkie.ai)

## 🙏 Thank You

Every contribution helps make Chonkie better! We appreciate your time and effort in helping make Chonkie the CHONKiest it can be!

Remember:
> "A journey of a thousand CHONKs begins with a single commit" ~ Ancient Proverb, probably
