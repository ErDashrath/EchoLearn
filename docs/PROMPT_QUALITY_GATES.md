# Prompt Quality Gates

## Objective
Prevent prompt drift and inconsistent assistant behavior across chat, voice, and journaling.

## What is enforced
The prompt gate validates prompt contracts in source files:
- central prompt service contains app moto and core compose APIs,
- chat, persistent chat, and voice use the centralized composePrompt flow,
- journal analysis uses centralized buildJournalAnalysisPrompt,
- banned legacy hardcoded prompt strings are not reintroduced.

## Gate Files
- scripts/evaluate-prompt-gate.js
- scripts/prompt-quality-gate.json

## Command
- npm run eval:prompt:gate

## CI Enforcement
The workflow now runs Prompt Quality Gate before Windows build:
- .github/workflows/tauri-windows-build.yml

Build dependency:
- build-windows needs rag-quality-gate and prompt-quality-gate.

## Updating checks
Edit scripts/prompt-quality-gate.json and add or adjust checks:
- contains
- notContains
- regex

Keep checks focused on stable architecture contracts, not fragile wording details.
