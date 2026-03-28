# RAG Phase 4: CI Enforcement

## Goal
Make retrieval quality gates mandatory in CI so regressions are blocked automatically before packaging and release.

## What Was Implemented
- Added a new GitHub Actions job named RAG Quality Gate.
- The job runs npm install and executes the RAG quality gate command.
- Windows installer build now depends on quality-gate success.

## Workflow Changes
Updated workflow:
- .github/workflows/tauri-windows-build.yml

New job:
- rag-quality-gate
  - runner: ubuntu-latest
  - steps:
    - checkout
    - setup node
    - npm ci
    - npm run eval:rag:gate

Dependency:
- build-windows now uses needs: rag-quality-gate

## Why This Matters
- Prevents retrieval quality regressions from reaching release artifacts.
- Converts evaluation from manual checks into an enforceable contract.
- Keeps model/retrieval quality checks tied to deployment readiness.

## Operational Notes
- Gate thresholds come from scripts/rag-quality-gate.json.
- Update thresholds gradually as dataset quality and coverage improve.
- Keep baseline and candidate run names stable in scripts and datasets.

## Local Validation
You can run the same gate locally:
- npm run eval:rag:gate

## Outcome
Phase 4 introduces hard CI protection for RAG quality.
