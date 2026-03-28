# RAG Phase 1 Production Upgrade Notes

## Purpose
This document captures what was implemented in Phase 1, why it was introduced, and how it changes retrieval behavior toward a production-grade RAG pipeline.

## Phase 1 Goal
Move from a single-pass retrieval flow to a safer production baseline with:
- predictable context budgeting,
- retrieval observability,
- resilient semantic fallback behavior,
- and configurable ranking/fusion controls.

## What Was Implemented

### 1. Production pipeline controls in retrieval
Implemented in memory retrieval orchestration.

Key additions:
- Production pipeline feature switch (on by default, overridable via localStorage flags).
- Optional RRF fusion pass after initial scoring.
- Optional semantic retrieval stage toggle.
- Optional telemetry capture for every retrieval call.

Result:
- Retrieval behavior can be tuned and rolled back without code changes.

### 2. Token-budget-aware prompt packing
Added dynamic prompt budget estimation using:
- model context size,
- reserved response tokens,
- chars-per-token heuristic,
- optional hard max prompt chars.

Result:
- Retrieved memory prompt is constrained by estimated model budget instead of a fixed character budget only.

### 3. Retrieval telemetry object
Added telemetry payload returned by retrieval call with:
- mode (legacy/production),
- intent,
- candidate counts,
- selected count,
- prompt size,
- stage timings,
- degraded-state reasons.

Result:
- Enables debugging, regression checks, and future quality dashboards.

### 4. Vector retrieval circuit breaker
Added resilient semantic behavior:
- catches vector search failures,
- falls back to lexical-only retrieval,
- opens temporary circuit after repeated failures,
- auto-recovers after cooldown.

Result:
- Retrieval remains available under embedding/index instability.

### 5. Hook wiring for runtime usage
Persistent chat retrieval invocation now passes:
- context budget parameters,
- semantic enablement,
- telemetry enablement.

Development mode logs telemetry to console for fast iteration.

## New Retrieval Inputs
Extended retrieval options now support:
- maxPromptChars
- modelContextTokens
- reservedResponseTokens
- charsPerToken
- enableSemantic
- enableRrf
- enableTelemetry

## New Runtime Feature Flags
Using localStorage keys:
- mindscribe.rag.pipeline.production
- mindscribe.rag.pipeline.rrf
- mindscribe.rag.pipeline.telemetry

Expected values:
- true/false or 1/0

Default behavior if unset:
- enabled (true)

## Ranking and Fusion Behavior
Current production-mode ranking flow:
1. Lexical scoring
2. Semantic scoring (if enabled and circuit closed)
3. Weighted blend
4. Optional RRF re-fusion
5. Intent-aware thresholding
6. Diversity-aware source selection
7. Token-budget context packing

## Backward Compatibility
Legacy retrieval behavior is preserved behind production mode control.
If production mode is disabled, retrieval still works with prior style blending and formatting.

## Validation Completed
- Type diagnostics: clean for modified files.
- Full project build: successful.

## Why This Matters
This phase reduces production risk by addressing common real-world failure modes:
- prompt overflow,
- semantic retriever outages,
- unobservable retrieval quality,
- and brittle fixed ranking behavior.

## Known Limits After Phase 1
Still pending for full industry benchmark quality:
- true BM25/inverted-index lexical retriever,
- explicit reranker stage (cross-encoder or lightweight rerank model),
- retrieval quality regression harness (MRR/nDCG/Recall@k),
- persisted metrics dashboard and SLO alerts.

## Recommended Phase 2
- Introduce pluggable retriever interfaces.
- Add lexical index-based retriever (BM25-style).
- Add reranking stage after fusion.
- Add evaluation dataset + automated retrieval quality tests.
