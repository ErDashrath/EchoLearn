# Phase 6: Memory Intelligence and Effective Context Expansion

## Goal
Reduce redundant memory, store richer high-value understanding, and improve effective context usage without changing native model context window.

## Why this phase
The app currently stores chat/journal/voice interactions, but low-signal turns and repeated talk can still dilute retrieval quality.

## Implementation Plan

### 1. Write-time memory value classification
- Add a classifier that labels turns as noise, useful, or durable-fact-candidate.
- Skip memory insertion for low-signal chatter.

### 2. Novelty and dedup gate
- Add near-duplicate detection for chat memory writes.
- Use lexical overlap and normalized similarity to block repeated copies.

### 3. Richer structured understanding
- Extend durable fact extraction beyond names:
  - preferences
  - goals
  - role/occupation
- Keep facts normalized and retrievable.

### 4. Multi-horizon episodic summaries
- Auto-maintain rolling summaries from recent chat memory:
  - short horizon
  - long horizon
- Save them as retrievable memory records.

### 5. Intent-aware memory routing
- Update source quotas by intent (remember/trend/distress/general).
- Prioritize relevant memory families per user query intent.

### 6. Context budget partitioning and query-focused compression
- Partition prompt chars by section (facts/journal/chat/profile).
- Compress memory lines toward query terms before packing.

## Acceptance Criteria
- Repeated small-talk turns are mostly ignored or deduped.
- Durable facts include goals/preferences where expressed.
- Retrieval prompt includes rolling summaries when useful.
- Retrieval output is better targeted by intent.
- Prompt packing remains under budget while preserving key anchors.

## Risks and Mitigation
- Risk: over-filtering useful memory
  - Mitigation: conservative thresholds and role-aware logic.
- Risk: summary drift
  - Mitigation: recompute rolling summaries from recent records frequently.
- Risk: retrieval omission due to strict quotas
  - Mitigation: intent-aware quotas with fallback headroom.

## Implemented In
- src/services/device-memory-service.ts
