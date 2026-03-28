# RAG Phase 2 Execution Plan

## Objective
Upgrade retrieval quality from "resilient baseline" to "measurably high-precision production RAG" by adding:
- a stronger lexical retriever,
- a dedicated reranking stage,
- pluggable retrieval strategy interfaces,
- and automated quality evaluation.

## Phase 2 Concept
Phase 1 focused on safety and control.
Phase 2 focuses on quality and measurable relevance.

Core idea:
1. Retrieve broad candidates (lexical + semantic)
2. Fuse candidates into a single shortlist
3. Rerank shortlist with a stronger relevance signal
4. Pack top context within token budget
5. Measure quality continuously (not one-time)

## Scope

### In Scope
- BM25-style lexical retrieval module
- Pluggable retriever/fusion/reranker interfaces
- Lightweight reranking stage (query-document relevance pass)
- Offline evaluation harness with metrics (Recall@k, MRR, nDCG)
- Runtime telemetry extension for quality analysis

### Out of Scope (Phase 2)
- Full distributed vector DB migration
- Online A/B experimentation platform
- Multi-tenant cross-device retrieval infra

## Target Architecture

### Retrieval pipeline (target)
1. Query normalization
2. Lexical retrieval (BM25) -> top N
3. Semantic retrieval (embedding) -> top N
4. Fusion (RRF or weighted) -> fused top M
5. Reranker scoring -> reranked top K
6. Diversity/source constraints
7. Token-budget-aware context assembly

### Interface-first design
Define clear interfaces such as:
- Retriever
- FusionStrategy
- Reranker
- ContextAssembler
- RetrievalEvaluator

Benefit:
- each stage can be upgraded independently without rewiring the whole pipeline.

## Implementation Plan

### Step 1: Retriever abstraction
- Extract current retrieval logic behind strategy interfaces.
- Keep current behavior as default strategy for backward compatibility.
- Add factory/selector based on feature flags.

Done when:
- Existing behavior is unchanged under default configuration.
- New strategies can be plugged without touching chat flow hooks.

### Step 2: BM25-style lexical retriever
- Build local inverted index over stored memory chunks.
- Implement TF/IDF (or BM25 approximation with length normalization).
- Return scored candidates with explainability fields (matched terms, score components).

Done when:
- Lexical search outperforms overlap scoring on keyword-heavy prompts.
- Index refresh behavior is stable after memory updates.

### Step 3: Reranker stage
- Add reranker input as fused candidate set (small shortlist).
- Score query-document pairs and reorder candidates.
- Apply confidence threshold and fallback to fused order on failure.

Done when:
- Top-3 relevance improves on evaluation dataset.
- Pipeline remains robust if reranker is disabled/unavailable.

### Step 4: Evaluation harness
- Create benchmark set from real chat intents (factual, personal-history, task-memory, temporal queries).
- Add scripts to compute:
  - Recall@k
  - MRR
  - nDCG@k
- Compare baseline (Phase 1) vs Phase 2 variants.

Done when:
- Metrics are reproducible locally.
- A report can be generated for each retrieval strategy combination.

### Step 5: Telemetry and quality monitoring
- Extend retrieval telemetry with:
  - per-stage candidate counts,
  - rerank delta (before/after position changes),
  - confidence and fallback reasons,
  - query class/tag.
- Add optional local persistence for telemetry snapshots.

Done when:
- Developers can inspect quality regressions from logs/artifacts without manual tracing.

## Recommended Feature Flags
- mindscribe.rag.pipeline.lexical.bm25
- mindscribe.rag.pipeline.reranker
- mindscribe.rag.pipeline.eval.mode
- mindscribe.rag.pipeline.telemetry.persist

Default rollout:
- Off in production, on in local/dev until benchmark targets are met.

## Acceptance Criteria
- Retrieval quality:
  - Recall@5: improved vs Phase 1 baseline
  - MRR: improved vs Phase 1 baseline
  - nDCG@5: improved vs Phase 1 baseline
- Reliability:
  - No hard failure when lexical/semantic/reranker stage fails
  - Fallback path always returns usable context when memory exists
- Performance:
  - End-to-end retrieval latency remains within acceptable local budget
- Compatibility:
  - Legacy path remains available via feature flags

## Risks and Mitigations
- Risk: Reranker latency increases response time
  - Mitigation: rerank only top M candidates and cache query embeddings

- Risk: Index drift after memory updates
  - Mitigation: incremental index update + periodic full rebuild safeguard

- Risk: Overfitting evaluation set
  - Mitigation: keep holdout set and periodically rotate examples

## Suggested File Areas for Implementation
- src/services/device-memory-service.ts
- src/services/vector-memory-service.ts
- src/services/chat-memory-service.ts
- src/hooks/use-persistent-chat.ts
- scripts/ (evaluation and reporting scripts)
- docs/ (benchmark and rollout notes)

## Execution Order
1. Interfaces and strategy scaffolding
2. BM25 lexical retriever
3. Reranker integration
4. Evaluation harness
5. Telemetry persistence and tuning

## Deliverables
- Working Phase 2 retrieval pipeline behind flags
- Benchmark script and metric report output
- Updated architecture documentation
- Rollout guidance with fallback defaults
