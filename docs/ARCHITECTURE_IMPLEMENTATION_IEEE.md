# EchoLearn System Architecture (IEEE Implementation Draft)

## 1. Architectural Overview

EchoLearn follows a hybrid local-first architecture that combines a modern web client stack with desktop-native services for persistence, voice processing, and offline AI execution. The design separates user interaction, orchestration logic, local AI inference, and durable memory storage into distinct layers to improve modularity, maintainability, and reproducibility for research publication.

The system supports two execution modes:

- Browser mode (Vite web runtime): chat and UI services with limited local persistence fallbacks.
- Desktop mode (Tauri runtime): full local capability including native storage commands, offline voice pipeline, and device-local memory databases.

## 2. Layered Architecture

### 2.1 Presentation Layer

- React + TypeScript pages and components under `src/pages` and `src/components`.
- Interaction surfaces: companion chat, journal, voice therapy, dashboard, reports, and check-in.
- Shared layout shell (`AppLayout`) with responsive/collapsible navigation.

### 2.2 Application Orchestration Layer

- Hooks in `src/hooks` control stateful orchestration (`use-persistent-chat`, `use-voice`, etc.).
- Service modules in `src/services` encapsulate domain logic:
  - Chat/session lifecycle
  - Journal analysis pipelines
  - Voice STT/TTS control and fallback chains
  - Device memory retrieval and ranking
  - WebLLM model loading and generation

### 2.3 AI Inference Layer

- LLM inference: WebLLM service (`webllm-service.ts`) running local models in browser/desktop web context.
- STT/TTS inference:
  - Online-first Web Speech path (when available)
  - Offline local fallback via Whisper/Piper stacks
  - Native desktop acceleration through Tauri Rust commands

### 2.4 Memory and RAG Layer

- `device-memory-service.ts` handles memory ingestion, scoring, selection, and prompt-context assembly.
- `vector-memory-service.ts` manages embedding generation, vector indexing, and semantic retrieval.
- Hybrid retrieval fusion combines lexical overlap and vector similarity with source-aware boosts.

### 2.5 Persistence Layer

- Browser fallback: LocalForage-backed stores.
- Desktop persistence:
  - `memory-db-v1.json` for memory records
  - `device-store-v1.json` for key-value/vector index stores
- Tauri Rust command handlers in `src-tauri/src/memory_store.rs` and `src-tauri/src/device_store.rs`.

## 3. End-to-End Data Flow

1. User submits input (text/voice/journal) from Presentation Layer.
2. Orchestration services normalize and classify input intent.
3. Memory ingestion writes selective high-signal records to RAG stores.
4. Retrieval stage queries lexical + vector stores, applies ranking and de-duplication.
5. Retrieved context is assembled into structured prompt sections.
6. WebLLM generates response tokens.
7. Output is rendered to chat UI and optionally synthesized through TTS.
8. Session artifacts and long-term memory are persisted locally.

## 4. Reliability and Fallback Strategy

- Voice pipeline implements multi-stage fallback and timeout guards.
- Storage layer gracefully skips corrupt entries during batch reads (`getAll` path).
- Memory write gates reduce low-signal pollution while preserving durable facts.
- Vector embedding pipeline supports quality mode (transformer embeddings) and performance mode (hash fallback).

## 5. Security and Privacy Properties

- Local-first persistence avoids mandatory cloud upload of sensitive conversational data.
- Optional encrypted storage channels are supported by crypto utilities in storage service.
- User-scoped memory indexing isolates records across accounts.

## 6. IEEE Figure Integration Guidance

The IEEE-ready figure pack is now organized as five publication figures:

1. Hero architecture: `docs/architecture/ieee-01-hero-architecture.svg`
2. Core AI pipeline: `docs/architecture/ieee-02-core-ai-pipeline.svg`
3. Zero-knowledge encryption flow: `docs/architecture/ieee-03-zero-knowledge-encryption.svg`
4. Performance graph A (throughput): `docs/architecture/ieee-04a-performance-tps.svg`
5. Performance graph B (memory): `docs/architecture/ieee-04b-performance-memory.svg`

For complete placement guidance and ready-to-copy LaTeX blocks, use:

- `docs/architecture/IEEE_FIGURE_PACK.md`

## 7. Mermaid Sources (Canonical)

Canonical editable Mermaid sources:

- `docs/architecture/ieee-01-hero-architecture.mmd`
- `docs/architecture/ieee-02-core-ai-pipeline.mmd`
- `docs/architecture/ieee-03-zero-knowledge-encryption.mmd`
- `docs/architecture/ieee-04a-performance-tps.mmd`
- `docs/architecture/ieee-04b-performance-memory.mmd`

Exported artifacts:

- `docs/architecture/ieee-01-hero-architecture.svg`
- `docs/architecture/ieee-02-core-ai-pipeline.svg`
- `docs/architecture/ieee-03-zero-knowledge-encryption.svg`
- `docs/architecture/ieee-04a-performance-tps.svg`
- `docs/architecture/ieee-04b-performance-memory.svg`
