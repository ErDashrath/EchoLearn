# EchoLearn Memory System — Production Architecture

> **Problem solved:** A 2048-token SLM was consuming ~1500–1900 tokens on memory overhead, leaving only 100–600 tokens for replies—causing truncation, repetition, and context confusion.

## Token Budget Summary

| Layer | Char Limit | ~Tokens | Purpose |
|-------|------------|---------|---------|
| Entity Memory | 160 | 40 | Pinned user facts (name, goal, concern) |
| Rolling Summary | 280 | 70 | Compressed session history |
| RAG Context | 480 | 120 | Semantic retrieval (conditional) |
| **Total Overhead** | **920** | **~230** | Leaves ~1800 tokens free on 2048-ctx model |

---

## Layer 1 — Intent Detection

**File:** `src/services/chat-memory-service.ts`

```typescript
export type MessageIntent = 'crisis' | 'distress' | 'question' | 'positive' | 'goal' | 'neutral';

export function detectIntent(content: string): MessageIntent
```

- **Zero LLM calls** — pure regex classification
- Tags stored with every message in SQLite (`intent TEXT` column)
- Auto-migrates existing databases safely

**Patterns detected:**
- `crisis`: suicide, self-harm keywords
- `distress`: anxiety, depression, overwhelmed
- `positive`: better, grateful, progress
- `goal`: "I want to", "working on"
- `question`: ends with `?` or contains "how do I"

---

## Layer 2 — Entity/Pinned Memory

**File:** `src/services/chat-memory-service.ts`

```typescript
export interface EntityMemory {
  name: string | null;           // "My name is Alex"
  currentGoal: string | null;    // "I want to quit smoking"
  primaryConcern: string | null; // "worried about my job"
  recentMood: 'positive' | 'distressed' | 'neutral';
  lastUpdatedAt: string;
}

export function extractEntities(existing: EntityMemory | null, messages: ChatMessage[]): EntityMemory
export function formatEntityMemory(entity: EntityMemory): string
```

- Runs on **every message** (regex only — negligible cost)
- Persisted in `ChatSession.entityMemory`
- **Always injected first** so the model never forgets the user
- Rendered as: `[User — name: Alex, goal: quit smoking, mood: distressed]`

---

## Layer 3 — Compact Rolling Summary

**Configuration (`chat-memory-service.ts`):**

```typescript
const DEFAULT_CONFIG: MemoryConfig = {
  recentWindowSize: 4,      // 4 turns (was 6) — saves ~150 tokens
  summarizeThreshold: 4,
  maxSummaryLength: 200,    // compact (was 500)
};
```

**Summary prompt:** Outputs tight JSON that small LLMs can parse:
```json
{
  "summary": "1-2 sentences under 50 words",
  "keyTopics": ["topic1", "topic2"]
}
```

**Rendered as:** `[Prior context: User discussed work stress and sleep issues. Topics: anxiety, work.]`

---

## Layer 4 — Budget-Aware Context Assembly

**File:** `src/services/chat-memory-service.ts`

```typescript
buildContextPacket(session: ChatSession, ragContext?: string): string
```

Assembles all memory layers within **hard character limits**:

```typescript
const CONTEXT_BUDGET = {
  ENTITY_CHARS: 160,   // ~40 tokens
  SUMMARY_CHARS: 280,  // ~70 tokens
  RAG_CHARS: 480,      // ~120 tokens
} as const;
```

**Priority order:**
1. Entity memory (always)
2. Rolling summary or fallback hints
3. RAG context (only if available and non-empty)

---

## Layer 5 — Smarter Semantic Retrieval

### Rust Backend (`src-tauri/src/rag_service.rs`)

```rust
impl Default for RAGConfig {
    fn default() -> Self {
        Self {
            top_k: 3,              // was 5 — fewer, higher-quality
            min_similarity: 0.6,   // was 0.3 — only genuinely related
            context_window: 600,   // was 2000 — hard cap
            include_sources: vec!["message".into(), "journal".into()],
        }
    }
}
```

**Deduplication in `augment_messages()`:**
- Collects last 8 turns' content (first 60 chars each)
- Skips any retrieved item that already appears in recent window
- Prevents re-injecting content the model can already see

### Frontend (`use-persistent-chat.ts`)

**Conditional retrieval:**
```typescript
const hasEnoughHistory = aiService.supportsRAG() && totalMsgs > recentWindowSize + 4;
```
→ RAG only runs when session has meaningful history

**Dual deduplication:**
```typescript
const formatRetrievedHistory = (
  memory: RAGContext,
  recentContentSet: ReadonlySet<string>,
): string
```
- Applies frontend dedup against recent window
- 400-char hard cap
- Minimum similarity threshold of 0.55

---

## Database Schema Change

**Migration in `db_service.rs`:**

```sql
ALTER TABLE messages ADD COLUMN intent TEXT
```

- Safe migration: ignored if column already exists
- Scoped in separate transaction to avoid deadlocks

---

## Files Modified

| File | Changes |
|------|---------|
| `src-tauri/src/db_service.rs` | Added `intent` column, migration, updated `store_message()` |
| `src-tauri/src/rag_service.rs` | Tightened defaults, added dedup in `augment_messages()`, intent param |
| `src-tauri/src/commands.rs` | Forward `intent` through `store_message` command |
| `src/services/chat-memory-service.ts` | Intent detection, entity memory, budget constants, `buildContextPacket()` |
| `src/hooks/use-persistent-chat.ts` | Wire entity updates, intent tagging, conditional RAG, dedup |
| `src/services/ai-service.ts` | `storeMessage()` now accepts `intent` param |
| `src/services/providers/ai-provider.ts` | Interface updated for intent |
| `src/services/providers/tauri-provider.ts` | Invoke with intent, raised min score to 0.6 |

---

---

## Layer 6 — Message Indexing & RAG Retrieval

Every chat message is stored in SQLite with an embedding for semantic retrieval.

### Message Flow

```
User sends message
       │
       ├── Frontend: storeMessage(sessionId, "user", content, intent)
       │         └── Tauri command: store_message
       │                    └── index_message() → stores message + embedding
       │
       ├── Generate response (Rust)
       │         ├── If use_rag=true:
       │         │       └── RAGService::generate_with_context()
       │         │               ├── Embed user query (cached)
       │         │               ├── Search similar: message, journal, summary
       │         │               ├── Augment prompt with retrieved context
       │         │               └── Generate
       │         └── Index response as assistant message + embedding
       │
       └── Frontend: storeMessage(sessionId, "assistant", response, "neutral")
                (already indexed by backend — this is idempotent)
```

### Query Embedding Cache (LRU)

**File:** `src-tauri/src/embedding_service.rs`

```rust
const QUERY_CACHE_SIZE: usize = 32;

struct CacheEntry {
    hash: u64,
    embedding: Vec<f32>,
}
```

- FNV-1a hash for fast lookup
- LRU eviction when cache exceeds 32 entries
- Avoids redundant embedding calls for repeated/similar queries

### Summary Indexing

**File:** `src-tauri/src/rag_service.rs`

```rust
pub fn index_summary(
    embedder: &EmbeddingService,
    db: &DBService,
    session_id: &str,
    summary_text: &str,
    key_topics: Option<&str>,
) -> Result<()>
```

- Rolling summaries are embedded with `source_type="summary"`
- Retrieved alongside messages & journals during RAG
- Call via Tauri: `invoke('store_summary', { sessionId, summary, keyTopics })`

### RAG Config (Used by Frontend)

```typescript
// tauri-provider.ts
ragConfig: {
  topK: 3,
  minSimilarity: 0.6,
  contextWindow: 600,
  includeSources: ['message', 'journal', 'summary'],
}
```

---

## Result

- **Before:** ~1500–1900 tokens consumed by memory → 100–600 left for generation
- **After:** ~230 tokens consumed → **~1800 tokens free** for generation on 2048-ctx models

Small LLMs can now hold coherent multi-turn conversations without context overflow.
