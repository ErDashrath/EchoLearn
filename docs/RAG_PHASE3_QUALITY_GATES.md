# RAG Phase 3: Quality Gates and Regression Control

## Objective
Phase 3 adds enforceable quality guardrails so retrieval quality cannot silently regress.

## What This Phase Adds
- report generation command for evaluation metrics output,
- automated quality gate command,
- configurable metric thresholds and regression budgets,
- documentation for local and CI usage.

## New Commands
- `npm run eval:rag`
  - Runs the evaluator and prints metric summaries.

- `npm run eval:rag:report`
  - Generates a report file at `scripts/rag-eval-report.json`.

- `npm run eval:rag:gate`
  - Enforces quality gates using:
    - dataset: `scripts/rag-eval-sample.json`
    - config: `scripts/rag-quality-gate.json`
    - baseline run: `phase1-baseline`
    - candidate run: `phase2-rerank`

## Configuration File
`scripts/rag-quality-gate.json`

Contains two controls per metric:
- `required`: absolute minimum metric value candidate must satisfy.
- `maxRegression`: maximum allowed drop from baseline.

Example metric keys:
- `MRR`
- `Recall@3`, `Recall@5`
- `nDCG@3`, `nDCG@5`

## Gate Behavior
For each metric, gate fails if either condition is true:
1. candidate < required
2. baseline - candidate > maxRegression

The gate exits with non-zero status on failure, making it CI-friendly.

## Files Added
- `scripts/evaluate-rag-gate.js`
- `scripts/rag-quality-gate.json`

## Recommended CI Step
Add a pipeline step:
1. `npm ci`
2. `npm run eval:rag:gate`

Fail deployment if the gate fails.

## Practical Tuning Guidance
- Start with lenient `maxRegression` values (for example 0.02).
- Tighten regression budgets as dataset quality improves.
- Keep a stable holdout set to prevent overfitting benchmark inputs.

## Phase 3 Outcome
RAG quality now has measurable, enforceable protection instead of manual spot checks.
