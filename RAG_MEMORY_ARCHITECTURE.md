# MindScribe RAG Memory Architecture

This document describes the current Retrieval-Augmented Generation (RAG) memory system in MindScribe, including ingestion, chunking, embedding, storage, retrieval/ranking, and production-grade practices.

## 1. Goals

- Preserve meaningful user context across sessions.
- Retrieve relevant memory for each turn without polluting prompts.
- Run locally-first with offline capability in desktop mode.
- Maintain privacy by storing memory on-device.

## 2. Core Components

- Memory orchestration: src/services/device-memory-service.ts
- Semantic vector index and search: src/services/vector-memory-service.ts
- Generic device store bridge (Tauri + fallback behavior): src/services/device-store-service.ts
- App storage abstraction (Tauri + localforage fallback): src/services/storage-service.ts
- Tauri memory DB commands: src-tauri/src/memory_store.rs
- Tauri key-value DB commands: src-tauri/src/device_store.rs

## 3. Memory Data Model

Primary record type: MemoryRecord

Key fields:

- id: stable unique key
- userId: user scope key
- source: assessmentProfile | chatMessage | chatSummary | journalEntry | journalChunk | durableFact
- sourceId: upstream source identifier
- sessionId: optional chat session linkage
- title: optional title
- content: canonical full text
- excerpt: compact display/retrieval text
- tags: semantic tags
- terms: lexical index terms
- importance: [0..1] weighting
- salience: [0..1] weighting
- occurredAt, createdAt, updatedAt: timeline fields
- metadata: structured source-specific metadata

## 4. Ingestion Pipeline

### 4.1 Assessment Memory

Assessment baseline is stored as one high-importance record with scores/severity metadata.

### 4.2 Chat Message Memory

Chat ingestion is selective.

User message write gate:

- Always keep if durable facts are detected.
- Keep if high-signal patterns are present (goals, distress, plans, personal context, time/details, etc.).
- Skip short low-signal chatter (for example hi/hello/ok-only turns).

Assistant message write gate:

- Skip generic filler responses.
- Keep informative assistant outputs only.

Why: reduce memory pollution while preserving important context.

### 4.3 Conversation Summary Memory

Summaries are persisted as chatSummary records with key topics, emotional themes, and mentions.

### 4.4 Journal Memory

Per journal entry, the system stores:

- Overview record (journalEntry)
- Multiple chunk records (journalChunk)
- Derived durable fact records (when detectable)

## 5. Chunking Method (Journal)

Current chunking strategy is sentence-aware and overlap-based:

1. Split input by paragraph boundaries.
2. For long paragraphs, tokenize into sentences.
3. Accumulate sentences up to max chunk size.
4. Split oversized sentences by word boundaries when needed.
5. Merge very short trailing chunks into previous chunk where possible.
6. Add sentence overlap from previous chunk to next chunk.

Key controls (current):

- MAX_JOURNAL_CHUNK_CHARS = 560
- MIN_JOURNAL_CHUNK_CHARS = 120
- CHUNK_SENTENCE_OVERLAP = 1 sentence
- JOURNAL_CHUNK_OVERLAP_CHARS = 72 fallback

Benefits:

- Better semantic integrity than naive char-splitting
- Better continuity across neighboring chunks
- Fewer noisy tiny chunks

## 6. Durable Fact Extraction

Durable facts are extracted from user/journal content (currently focused on relation-like facts such as best friend name patterns).

Fact records are stored as source durableFact with maximum importance/salience and explicit answer metadata for direct recall.

## 7. Embedding Architecture

Vector embedding service supports two modes:

- quality mode: transformer feature extraction using Xenova/all-MiniLM-L6-v2
- performance mode: deterministic hash embedding fallback

Important constants:

- FALLBACK_DIMENSIONS = 384
- MAX_QUERY_TEXT_LENGTH = 1400
- MAX_RECORD_TEXT_LENGTH = 2400
- LOW_MEMORY_GB_THRESHOLD = 8

Runtime behavior:

- In low-memory mode, transformer extractor is skipped.
- Embeddings are quantized (rounded precision) before storage.
- Query embeddings are cached briefly for repeated queries.

## 8. Vector Index and Persistence

Vector index store name: vector_memory_v1

Per user index contains:

- version
- model
- dimensions
- updatedAt
- items[] with id/source/sourceId/sessionId/timestamps/embedding

Index management:

- Upsert by id
- Prefix delete support
- Pruning with source-priority retention

Source priority prefers keeping:

- durableFact
- assessmentProfile
- chatSummary
- journalEntry
- journalChunk
- others

Capacity limits:

- low-memory: 1400 items
- standard: 3000 items

## 9. Retrieval Pipeline

### 9.1 Query Processing

- Normalize query
- Determine intent class (distress, reflection, remember, trend, general)
- Extract lexical terms

### 9.2 Candidate Scoring

Hybrid score combines lexical and semantic:

- lexical score from term overlap, tag overlap, phrase match, session boost, source boost, recency, importance, salience
- semantic score from cosine similarity in vector index

Fusion:

- final = lexical * 0.64 + semantic * 0.36 + semanticBoost(when semantic >= threshold)

### 9.3 Thresholding

Minimum score is dynamic by source + intent.
Semantic-strong matches can lower threshold adaptively.

### 9.4 Selection and De-duplication

Selected records are capped by:

- limit
- max per source
- family dedupe (same journal family, same fact relation, etc.)

### 9.5 Prompt Assembly

Context is formatted into sections:

- stable user context
- relevant personal facts
- relevant journal memory
- related conversation memory

Prompt length is compacted with max context char budget.

## 10. Storage Backends

### Desktop (Tauri)

- Memory DB file: memory-db-v1.json
- Device key-value DB file: device-store-v1.json
- Tauri commands guard writes/reads with mutex and app-local-data path

### Browser

- Generic app storage has localforage fallback
- Device-memory RAG command path is Tauri-first; browser parity is partial unless explicit browser fallback is implemented for memory record store and vector index persistence

## 11. Safety and Quality Controls

- Small-talk query suppression for retrieval context building
- Source-aware thresholds to avoid irrelevant retrieval
- Assistant chatter write filtering
- User low-signal write filtering with durable-fact override
- Family dedupe to avoid repetitive prompt context

## 12. Current Limitations

- Browser mode is not yet full parity for durable memory command path.
- Fact extraction is intentionally narrow and can be expanded.
- No offline benchmark dashboard for retrieval quality metrics yet.
- Embedding model version migration/reindex workflow is not yet formalized.

## 13. Production-Grade Practices (Recommended)

### 13.1 Data Lifecycle

- Add embedding version field per record/index item.
- Add background re-embed/reindex jobs on model change.
- Add TTL/decay for low-importance chat records.

### 13.2 Retrieval Quality

- Maintain evaluation dataset (queries + expected memories).
- Track recall@k, MRR, and factual correctness.
- Add score trace logging (lexical vs semantic components) for tuning.

### 13.3 Chunking and Content Hygiene

- Add token-aware chunk sizing (not only char-based).
- Preserve source provenance metadata (entry id, paragraph id, sentence span).
- Add duplicate chunk suppression by normalized fingerprint.

### 13.4 Reliability

- Add retry + backoff around storage and embedding writes.
- Add integrity checks for index dimensions/model mismatch.
- Add fail-open lexical retrieval when vector path unavailable.

### 13.5 Privacy and Security

- Keep local-only by default.
- Ensure encrypted stores for sensitive user memory contexts when required.
- Offer user controls for deleting specific memory categories.

## 14. Operational Checklist

For each release touching RAG:

1. Validate memory write gates with sample conversations.
2. Validate chunking output on long/short journal samples.
3. Validate vector upsert + prefix delete correctness.
4. Validate retrieval relevance across intent classes.
5. Validate desktop and browser behavior separately.
6. Run build and type checks.

## 15. Suggested Next Implementation Steps

1. Add browser-native memory record persistence parity (non-Tauri).
2. Add embedding version + incremental reindex path.
3. Add RAG diagnostics panel showing retrieved items and score breakdown.
4. Add automated retrieval regression test suite.

