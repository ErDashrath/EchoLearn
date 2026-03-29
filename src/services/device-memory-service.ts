import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  ChatSession,
  ConversationSummary,
} from "./chat-memory-service";
import { vectorMemoryService } from "./vector-memory-service";
import type { JournalAnalysis, JournalEntry } from "./journal-service";
import type { DASS21Results } from "./mental-health-prompt-service";

export type MemorySource =
  | "assessmentProfile"
  | "chatMessage"
  | "chatSummary"
  | "journalEntry"
  | "journalChunk"
  | "durableFact";

export interface MemoryRecord {
  id: string;
  userId: string;
  source: MemorySource;
  sourceId: string;
  sessionId?: string | null;
  title?: string | null;
  content: string;
  excerpt: string;
  tags: string[];
  terms: string[];
  importance: number;
  salience: number;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

interface RetrievedMemory {
  record: MemoryRecord;
  score: number;
  lexicalScore?: number;
  semanticScore?: number;
}

interface RetrievalScoringInput {
  records: MemoryRecord[];
  sessionId: string | null;
  intent: MemoryIntent;
  normalizedQuery: string;
  queryTerms: string[];
  excludedSourceIds: Set<string>;
  vectorScoreById: Map<string, number>;
}

interface RetrieverStrategy {
  name: "legacy" | "production";
  retrieve: (input: RetrievalScoringInput) => RetrievedMemory[];
}

interface FusionStrategy {
  name: "none" | "rrf";
  apply: (ranked: RetrievedMemory[]) => RetrievedMemory[];
}

interface RerankerInput {
  ranked: RetrievedMemory[];
  normalizedQuery: string;
  queryTerms: string[];
  intent: MemoryIntent;
}

interface RerankerStrategy {
  name: "none" | "heuristic";
  apply: (input: RerankerInput) => RetrievedMemory[];
}

type MemoryIntent = "distress" | "reflection" | "remember" | "trend" | "general";

interface BuildContextOptions {
  userId: string;
  query: string;
  sessionId?: string | null;
  recentMessages?: ChatMessage[];
  limit?: number;
  maxPromptChars?: number;
  modelContextTokens?: number;
  reservedResponseTokens?: number;
  charsPerToken?: number;
  enableSemantic?: boolean;
  enableRrf?: boolean;
  enableReranker?: boolean;
  enableTelemetry?: boolean;
}

interface RetrievalTelemetry {
  mode: "legacy" | "production";
  intent: MemoryIntent;
  recordsScanned: number;
  vectorCandidates: number;
  rankedCandidates: number;
  fusedCandidates: number;
  rerankedCandidates: number;
  selectedCount: number;
  promptChars: number;
  stageCandidates: {
    lexical: number;
    semantic: number;
    ranked: number;
    fused: number;
    reranked: number;
  };
  reranker: {
    enabled: boolean;
    strategy: "none" | "heuristic";
    changedPositions: number;
    confidence: number;
    fallbackUsed: boolean;
    reason?: string;
  };
  timingsMs: {
    total: number;
    fetchRecords: number;
    vectorSearch: number;
    ranking: number;
    packing: number;
  };
  degraded: {
    vectorSkipped: boolean;
    reason?: string;
  };
}

interface BuildContextResult {
  prompt: string;
  items: MemoryRecord[];
  telemetry?: RetrievalTelemetry;
}

interface ExtractedFact {
  relation: string;
  relationLabel: string;
  personName: string;
  answer: string;
  tags: string[];
}

type MemoryValueClass = "noise" | "useful" | "durable";

interface MemoryClassificationResult {
  label: MemoryValueClass;
  score: number;
  reasons: string[];
}

interface DedupeResult {
  duplicate: boolean;
  reason?: string;
  score?: number;
}

const CACHE_TTL_MS = 2500;
const MAX_JOURNAL_CHUNK_CHARS = 560;
const JOURNAL_CHUNK_OVERLAP_CHARS = 72;
const MIN_JOURNAL_CHUNK_CHARS = 120;
const CHUNK_SENTENCE_OVERLAP = 1;
const MAX_CONTEXT_CHARS = 2200;
const MAX_CONTEXT_CHARS_HARD = 5600;
const DEFAULT_MODEL_CONTEXT_TOKENS = 8192;
const DEFAULT_RESERVED_RESPONSE_TOKENS = 1024;
const DEFAULT_CHARS_PER_TOKEN = 4;
const FEATURE_FLAG_PRODUCTION_PIPELINE = "mindscribe.rag.pipeline.production";
const FEATURE_FLAG_RRF_FUSION = "mindscribe.rag.pipeline.rrf";
const FEATURE_FLAG_RETRIEVAL_TELEMETRY = "mindscribe.rag.pipeline.telemetry";
const FEATURE_FLAG_BM25_LEXICAL = "mindscribe.rag.pipeline.lexical.bm25";
const FEATURE_FLAG_RERANKER = "mindscribe.rag.pipeline.reranker";
const FEATURE_FLAG_TELEMETRY_PERSIST = "mindscribe.rag.pipeline.telemetry.persist";
const FEATURE_FLAG_MEMORY_CLASSIFIER_DEBUG = "mindscribe.memory.classifier.debug";
const FEATURE_FLAG_MEMORY_DEDUPE_SEMANTIC = "mindscribe.memory.dedupe.semantic";
const VECTOR_FAILURE_BUDGET = 3;
const VECTOR_CIRCUIT_COOLDOWN_MS = 30_000;
const CHAT_DUPLICATE_SIMILARITY_THRESHOLD = 0.86;
const CHAT_DUPLICATE_LOOKBACK = 24;
const ROLLING_SUMMARY_MIN_INTERVAL_MS = 20_000;
const ROLLING_SHORT_MESSAGES = 10;
const ROLLING_LONG_MESSAGES = 28;
const MEMORY_CLASSIFIER_LOG_KEY = "mindscribe.memory.classifier.decisions";
const EMOTION_TERMS = [
  "anxiety",
  "anxious",
  "panic",
  "stress",
  "stressed",
  "overwhelmed",
  "burnout",
  "sad",
  "depressed",
  "hopeless",
  "lonely",
  "fear",
  "afraid",
  "angry",
  "frustrated",
  "calm",
  "happy",
  "grateful",
  "hopeful",
];
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "up",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);
const FACT_RELATION_QUERY_PATTERNS: Array<{ relation: string; pattern: RegExp }> = [
  {
    relation: "self_name",
    pattern: /\b(what(?:'s| is)\s+my\s+name|who\s+am\s+i|tell\s+me\s+my\s+name|do\s+you\s+know\s+my\s+name)\b/i,
  },
  {
    relation: "best_friend",
    pattern: /\b(best friend|bestfriend)\b.*\b(name|who)\b|\bwhat(?:'s| is)\s+my\s+best\s+friend(?:'s)?\s+name\b|\bwho is my best friend\b/i,
  },
  {
    relation: "current_goal",
    pattern: /\b(my goal|my goals|what am i trying to do|what did i say my goal is|what's my goal)\b/i,
  },
  {
    relation: "preference",
    pattern: /\b(what do i like|my preference|what did i say i like|what things i enjoy)\b/i,
  },
  {
    relation: "role",
    pattern: /\b(my role|what do i do|what did i say i do|my job|my profession)\b/i,
  },
];
const NON_NAME_WORDS = new Set([
  "afternoon",
  "amazing",
  "awesome",
  "bad",
  "best",
  "brother",
  "class",
  "college",
  "evening",
  "friend",
  "from",
  "girlfriend",
  "good",
  "guy",
  "helpful",
  "home",
  "hostel",
  "house",
  "kind",
  "lovely",
  "morning",
  "nice",
  "office",
  "person",
  "room",
  "school",
  "someone",
  "supportive",
  "team",
  "today",
  "tonight",
  "wonderful",
  "work",
  "yesterday",
]);

class DeviceMemoryService {
  private cache = new Map<string, { records: MemoryRecord[]; fetchedAt: number }>();
  private vectorFailureCount = 0;
  private vectorCircuitOpenUntil = 0;
  private rollingSummaryRefreshAt = new Map<string, number>();

  private isTauriAvailable(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  }

  private invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  private async invokeSafely<T>(
    command: string,
    args: Record<string, unknown>,
    fallback: T,
  ): Promise<T> {
    if (!this.isTauriAvailable()) {
      return fallback;
    }

    try {
      return await invoke<T>(command, args);
    } catch (error) {
      console.warn(`Device memory command failed: ${command}`, error);
      return fallback;
    }
  }

  async getUserRecords(userId: string, force = false): Promise<MemoryRecord[]> {
    if (!userId) {
      return [];
    }

    const cached = this.cache.get(userId);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.records;
    }

    const records = await this.invokeSafely<MemoryRecord[]>(
      "get_user_memory_records",
      { userId },
      [],
    );

    this.cache.set(userId, { records, fetchedAt: Date.now() });
    return records;
  }

  async upsertRecords(records: MemoryRecord[]): Promise<void> {
    if (!records.length || !this.isTauriAvailable()) {
      return;
    }

    await this.invokeSafely<number>("upsert_memory_records", { records }, 0);

    const vectorCandidateRecords = records.filter((record) => {
      if (record.source !== 'chatMessage') {
        return true;
      }

      const role = String(record.metadata.role ?? '').toLowerCase();
      return role !== 'assistant';
    });

    const recordsByUser = new Map<string, MemoryRecord[]>();
    for (const record of vectorCandidateRecords) {
      const userRecords = recordsByUser.get(record.userId) ?? [];
      userRecords.push(record);
      recordsByUser.set(record.userId, userRecords);
    }

    for (const [userId, userRecords] of recordsByUser.entries()) {
      void vectorMemoryService.upsertRecords(userId, userRecords).catch((error) => {
        console.warn('Vector upsert failed:', error);
      });
    }

    for (const userId of new Set(records.map((record) => record.userId))) {
      this.invalidateCache(userId);
    }
  }

  async deleteByPrefixes(userId: string, prefixes: string[]): Promise<void> {
    if (!userId || !prefixes.length || !this.isTauriAvailable()) {
      return;
    }

    await this.invokeSafely<number>(
      "delete_memory_records_by_prefixes",
      { userId, prefixes },
      0,
    );

    void vectorMemoryService.deleteByPrefixes(userId, prefixes).catch((error) => {
      console.warn('Vector delete failed:', error);
    });

    this.invalidateCache(userId);
  }

  async clearAllUserMemory(userId: string): Promise<void> {
    if (!userId) {
      return;
    }

    const allPrefixes = ['assessment:', 'chat:', 'summary:', 'journal:'];

    if (this.isTauriAvailable()) {
      await this.invokeSafely<number>(
        'delete_memory_records_by_prefixes',
        { userId, prefixes: allPrefixes },
        0,
      );
    }

    await vectorMemoryService.clearUserIndex(userId);
    this.invalidateCache(userId);
  }

  async upsertAssessment(userId: string, results: DASS21Results): Promise<void> {
    if (!userId || !results) {
      return;
    }

    const now = new Date().toISOString();
    const content = [
      `DASS-21 baseline for ${userId}.`,
      `Depression ${results.severityLevels.depression.level} (${results.scores.depression}/42).`,
      `Anxiety ${results.severityLevels.anxiety.level} (${results.scores.anxiety}/42).`,
      `Stress ${results.severityLevels.stress.level} (${results.scores.stress}/42).`,
    ].join(" ");

    const tags = [
      results.severityLevels.depression.level.toLowerCase(),
      results.severityLevels.anxiety.level.toLowerCase(),
      results.severityLevels.stress.level.toLowerCase(),
      "dass21",
      "assessment",
    ];

    await this.upsertRecords([
      {
        id: `assessment:${userId}`,
        userId,
        source: "assessmentProfile",
        sourceId: `assessment:${userId}`,
        sessionId: null,
        title: "DASS-21 Baseline",
        content,
        excerpt: content,
        tags,
        terms: this.extractTerms(content, tags),
        importance: 0.96,
        salience: 0.92,
        occurredAt: results.completedAt,
        createdAt: now,
        updatedAt: now,
        metadata: {
          completedAt: results.completedAt,
          scores: results.scores,
          severityLevels: results.severityLevels,
        },
      },
    ]);
  }

  async upsertChatMessage(
    userId: string,
    session: Pick<ChatSession, "id" | "title">,
    message: ChatMessage,
  ): Promise<void> {
    if (!userId || !session.id) {
      return;
    }

    const content = this.normalizeWhitespace(message.content);
    if (!content) {
      return;
    }

    const classification = this.classifyMemoryValueDetailed(content, message.role);
    if (classification.label === "noise") {
      this.logMemoryDecision({
        userId,
        sessionId: session.id,
        sourceId: message.id,
        action: "drop",
        label: classification.label,
        score: classification.score,
        reasons: classification.reasons,
      });
      return;
    }

    const dedupe = await this.isRedundantChatMemory(userId, session.id, content, message.id);
    if (dedupe.duplicate) {
      this.logMemoryDecision({
        userId,
        sessionId: session.id,
        sourceId: message.id,
        action: "drop",
        label: classification.label,
        score: classification.score,
        reasons: [...classification.reasons, dedupe.reason ? `dedupe:${dedupe.reason}` : "dedupe"],
      });
      return;
    }

    this.logMemoryDecision({
      userId,
      sessionId: session.id,
      sourceId: message.id,
      action: "keep",
      label: classification.label,
      score: classification.score,
      reasons: classification.reasons,
    });

    const tags = this.extractTags(content);
    const roleBoost = message.role === "user" ? 0.08 : 0;
    const importance = Math.min(0.92, 0.42 + roleBoost + this.estimateEmotionalSalience(content));
    const salience = Math.min(0.95, 0.35 + this.estimatePersonalSalience(content));

    const now = new Date().toISOString();
    const records: MemoryRecord[] = [
      {
        id: `chat:${session.id}:${message.id}`,
        userId,
        source: "chatMessage",
        sourceId: message.id,
        sessionId: session.id,
        title: session.title,
        content,
        excerpt: this.compactText(content, 220),
        tags,
        terms: this.extractTerms(content, tags),
        importance,
        salience,
        occurredAt: message.timestamp,
        createdAt: message.timestamp,
        updatedAt: now,
        metadata: {
          role: message.role,
          sessionTitle: session.title,
        },
      },
    ];

    if (message.role === "user") {
      records.push(
        ...this.buildFactRecords(userId, {
          idPrefix: `chat:${session.id}:${message.id}`,
          sourceId: message.id,
          sessionId: session.id,
          title: session.title,
          text: content,
          occurredAt: message.timestamp,
          createdAt: message.timestamp,
          updatedAt: now,
          metadata: {
            role: message.role,
            sourceKind: "chatMessage",
            sessionTitle: session.title,
          },
        }),
      );
    }

    await this.upsertRecords(records);

    const lastRefresh = this.rollingSummaryRefreshAt.get(userId) ?? 0;
    if (Date.now() - lastRefresh >= ROLLING_SUMMARY_MIN_INTERVAL_MS) {
      this.rollingSummaryRefreshAt.set(userId, Date.now());
      await this.refreshRollingSummaries(userId);
    }
  }

  async upsertConversationSummary(
    userId: string,
    session: Pick<ChatSession, "id" | "title">,
    summary: ConversationSummary,
  ): Promise<void> {
    if (!userId || !session.id || !summary) {
      return;
    }

    const content = [
      summary.summary,
      summary.keyTopics.length ? `Key topics: ${summary.keyTopics.join(", ")}.` : "",
      summary.emotionalThemes.length
        ? `Emotional themes: ${summary.emotionalThemes.join(", ")}.`
        : "",
      summary.userMentions.length
        ? `Important mentions: ${summary.userMentions.join("; ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    const tags = [
      ...summary.keyTopics,
      ...summary.emotionalThemes,
      ...summary.userMentions.slice(0, 4),
    ];

    await this.upsertRecords([
      {
        id: `summary:${session.id}`,
        userId,
        source: "chatSummary",
        sourceId: session.id,
        sessionId: session.id,
        title: session.title,
        content,
        excerpt: this.compactText(summary.summary, 220),
        tags,
        terms: this.extractTerms(content, tags),
        importance: 0.82,
        salience: 0.84,
        occurredAt: summary.updatedAt,
        createdAt: summary.updatedAt,
        updatedAt: summary.updatedAt,
        metadata: {
          sessionTitle: session.title,
          messageCount: summary.messageCount,
        },
      },
    ]);
  }

  async deleteChatSessionMemories(userId: string, sessionId: string): Promise<void> {
    await this.deleteByPrefixes(userId, [`chat:${sessionId}:`, `summary:${sessionId}`]);
  }

  async upsertJournalEntry(userId: string, entry: JournalEntry): Promise<void> {
    await this.deleteByPrefixes(userId, [`journal:${entry.id}:`]);
    await this.upsertRecords(this.buildJournalRecords(userId, entry));
  }

  async syncJournalEntries(userId: string, entries: JournalEntry[]): Promise<void> {
    await this.deleteByPrefixes(userId, ["journal:"]);

    if (!entries.length) {
      return;
    }

    const records = entries.flatMap((entry) => this.buildJournalRecords(userId, entry));
    await this.upsertRecords(records);
  }

  async deleteJournalEntryMemory(userId: string, entryId: string): Promise<void> {
    await this.deleteByPrefixes(userId, [`journal:${entryId}:`]);
  }

  async answerFactQuestion(userId: string, query: string): Promise<string | null> {
    const relation = this.detectFactQueryRelation(query);
    if (!userId || !relation) {
      return null;
    }

    if (relation === "self_name") {
      return `Your username is ${userId}.`;
    }

    const records = await this.getUserRecords(userId);
    const relevantFacts = records
      .filter(
        (record) =>
          record.source === "durableFact"
          && String(record.metadata.relation ?? "") === relation,
      )
      .sort((left, right) => this.compareFactRecords(left, right));

    const bestMatch = relevantFacts[0];
    if (!bestMatch) {
      const inferredFact = records
        .filter((record) => record.source === "journalEntry" || record.source === "journalChunk")
        .flatMap((record) =>
          this.extractDurableFacts(record.content)
            .filter((fact) => fact.relation === relation)
            .map((fact) => ({
              fact,
              occurredAt: record.occurredAt,
            })),
        )
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];

      return inferredFact?.fact.answer ?? null;
    }

    const answer = typeof bestMatch.metadata.answer === "string"
      ? bestMatch.metadata.answer.trim()
      : "";
    const personName = typeof bestMatch.metadata.personName === "string"
      ? bestMatch.metadata.personName.trim()
      : "";

    if (answer) {
      return answer;
    }

    if (personName && relation === "best_friend") {
      return `Your best friend's name is ${personName}.`;
    }

    return null;
  }

  async buildContextForTurn(options: BuildContextOptions): Promise<BuildContextResult> {
    const startedAt = Date.now();
    const {
      userId,
      query,
      sessionId = null,
      recentMessages = [],
      limit = 6,
      maxPromptChars,
      modelContextTokens = DEFAULT_MODEL_CONTEXT_TOKENS,
      reservedResponseTokens = DEFAULT_RESERVED_RESPONSE_TOKENS,
      charsPerToken = DEFAULT_CHARS_PER_TOKEN,
      enableSemantic = true,
      enableRrf,
      enableReranker,
      enableTelemetry,
    } = options;

    const telemetryEnabled = enableTelemetry ?? this.getFeatureFlag(FEATURE_FLAG_RETRIEVAL_TELEMETRY, true);
    const productionPipelineEnabled = this.getFeatureFlag(FEATURE_FLAG_PRODUCTION_PIPELINE, true);
    const rrfEnabled = enableRrf ?? this.getFeatureFlag(FEATURE_FLAG_RRF_FUSION, true);
    const rerankerEnabled = enableReranker ?? this.getFeatureFlag(FEATURE_FLAG_RERANKER, true);
    const telemetryPersistenceEnabled = this.getFeatureFlag(FEATURE_FLAG_TELEMETRY_PERSIST, false);
    const normalizedQuery = this.normalizeWhitespace(query);
    if (!userId || !normalizedQuery || this.isSmallTalk(normalizedQuery)) {
      return {
        prompt: "",
        items: [],
        telemetry: telemetryEnabled
          ? {
              mode: productionPipelineEnabled ? "production" : "legacy",
              intent: "general",
              recordsScanned: 0,
              vectorCandidates: 0,
              rankedCandidates: 0,
              fusedCandidates: 0,
              rerankedCandidates: 0,
              selectedCount: 0,
              promptChars: 0,
              stageCandidates: {
                lexical: 0,
                semantic: 0,
                ranked: 0,
                fused: 0,
                reranked: 0,
              },
              reranker: {
                enabled: false,
                strategy: "none",
                changedPositions: 0,
                confidence: 0,
                fallbackUsed: false,
                reason: "query_not_eligible",
              },
              timingsMs: {
                total: Date.now() - startedAt,
                fetchRecords: 0,
                vectorSearch: 0,
                ranking: 0,
                packing: 0,
              },
              degraded: {
                vectorSkipped: true,
                reason: "query_not_eligible",
              },
            }
          : undefined,
      };
    }

    const fetchStarted = Date.now();
    const records = await this.getUserRecords(userId);
    const fetchRecordsMs = Date.now() - fetchStarted;
    if (!records.length) {
      return {
        prompt: "",
        items: [],
        telemetry: telemetryEnabled
          ? {
              mode: productionPipelineEnabled ? "production" : "legacy",
              intent: "general",
              recordsScanned: 0,
              vectorCandidates: 0,
              rankedCandidates: 0,
              fusedCandidates: 0,
              rerankedCandidates: 0,
              selectedCount: 0,
              promptChars: 0,
              stageCandidates: {
                lexical: records.length,
                semantic: 0,
                ranked: 0,
                fused: 0,
                reranked: 0,
              },
              reranker: {
                enabled: false,
                strategy: "none",
                changedPositions: 0,
                confidence: 0,
                fallbackUsed: false,
                reason: "no_records",
              },
              timingsMs: {
                total: Date.now() - startedAt,
                fetchRecords: fetchRecordsMs,
                vectorSearch: 0,
                ranking: 0,
                packing: 0,
              },
              degraded: {
                vectorSkipped: true,
                reason: "no_records",
              },
            }
          : undefined,
      };
    }

    const intent = this.classifyIntent(normalizedQuery);
    const queryTerms = this.extractTerms(normalizedQuery);
    const excludedSourceIds = new Set(recentMessages.map((message) => message.id));
    const vectorStarted = Date.now();
    const vectorResult = await this.safeVectorSearch(userId, normalizedQuery, {
      topK: Math.max(limit * 4, 20),
      sessionId,
      enabled: enableSemantic,
    });
    const vectorSearchMs = Date.now() - vectorStarted;
    const vectorMatches = vectorResult.matches;
    const vectorScoreById = new Map(vectorMatches.map((match) => [match.id, match.score]));

    const rankingStarted = Date.now();
    const retrieverStrategy = this.getRetrieverStrategy(productionPipelineEnabled);
    const ranked = retrieverStrategy.retrieve({
      records,
      sessionId,
      intent,
      normalizedQuery,
      queryTerms,
      excludedSourceIds,
      vectorScoreById,
    });

    const fusionStrategy = this.getFusionStrategy({
      productionPipelineEnabled,
      rrfEnabled,
    });
    const fused = fusionStrategy.apply(ranked);

    const rerankerStrategy = this.getRerankerStrategy({
      productionPipelineEnabled,
      rerankerEnabled,
    });
    const reranked = rerankerStrategy.apply({
      ranked: fused,
      normalizedQuery,
      queryTerms,
      intent,
    });

    const changedPositions = this.calculateRankPositionChanges(fused, reranked);
    const rerankerConfidence = this.calculateRerankerConfidence(reranked);
    const rankedFinal = reranked;

    const selected = this.selectRecords(rankedFinal, limit, intent);
    const rankingMs = Date.now() - rankingStarted;

    const packingStarted = Date.now();
    const dynamicPromptBudget = this.estimatePromptBudgetChars({
      modelContextTokens,
      reservedResponseTokens,
      charsPerToken,
      maxPromptChars,
    });
    const prompt = this.formatRetrievedContext(
      selected.map(({ record }) => record),
      dynamicPromptBudget,
      intent,
      queryTerms,
    );
    const packingMs = Date.now() - packingStarted;

    const telemetry: RetrievalTelemetry | undefined = telemetryEnabled
      ? {
          mode: productionPipelineEnabled ? "production" : "legacy",
          intent,
          recordsScanned: records.length,
          vectorCandidates: vectorMatches.length,
          rankedCandidates: ranked.length,
          fusedCandidates: fused.length,
          rerankedCandidates: rankedFinal.length,
          selectedCount: selected.length,
          promptChars: prompt.length,
          stageCandidates: {
            lexical: records.length,
            semantic: vectorMatches.length,
            ranked: ranked.length,
            fused: fused.length,
            reranked: rankedFinal.length,
          },
          reranker: {
            enabled: rerankerEnabled && productionPipelineEnabled,
            strategy: rerankerStrategy.name,
            changedPositions,
            confidence: rerankerConfidence,
            fallbackUsed: rerankerStrategy.name === "none",
            reason: rerankerStrategy.name === "none"
              ? (productionPipelineEnabled ? "reranker_disabled" : "production_pipeline_disabled")
              : undefined,
          },
          timingsMs: {
            total: Date.now() - startedAt,
            fetchRecords: fetchRecordsMs,
            vectorSearch: vectorSearchMs,
            ranking: rankingMs,
            packing: packingMs,
          },
          degraded: {
            vectorSkipped: vectorResult.skipped,
            reason: vectorResult.reason,
          },
        }
      : undefined;

    if (telemetry && telemetryPersistenceEnabled) {
      this.persistTelemetrySnapshot(telemetry);
    }

    return {
      prompt,
      items: selected.map(({ record }) => record),
      telemetry,
    };
  }

  private getRetrieverStrategy(productionPipelineEnabled: boolean): RetrieverStrategy {
    const bm25Enabled = this.getFeatureFlag(FEATURE_FLAG_BM25_LEXICAL, true);
    return productionPipelineEnabled
      ? {
          name: "production",
          retrieve: (input) => this.scoreAndFilterRecords(input, 0.56, 0.44, bm25Enabled),
        }
      : {
          name: "legacy",
          retrieve: (input) => this.scoreAndFilterRecords(input, 0.64, 0.36, bm25Enabled),
        };
  }

  private getFusionStrategy(options: {
    productionPipelineEnabled: boolean;
    rrfEnabled: boolean;
  }): FusionStrategy {
    const { productionPipelineEnabled, rrfEnabled } = options;
    if (productionPipelineEnabled && rrfEnabled) {
      return {
        name: "rrf",
        apply: (ranked) => this.applyReciprocalRankFusion(ranked),
      };
    }

    return {
      name: "none",
      apply: (ranked) => ranked,
    };
  }

  private getRerankerStrategy(options: {
    productionPipelineEnabled: boolean;
    rerankerEnabled: boolean;
  }): RerankerStrategy {
    const { productionPipelineEnabled, rerankerEnabled } = options;
    if (productionPipelineEnabled && rerankerEnabled) {
      return {
        name: "heuristic",
        apply: ({ ranked, normalizedQuery, queryTerms, intent }) =>
          this.applyHeuristicReranker(ranked, normalizedQuery, queryTerms, intent),
      };
    }

    return {
      name: "none",
      apply: ({ ranked }) => ranked,
    };
  }

  private scoreAndFilterRecords(
    input: RetrievalScoringInput,
    lexicalWeight: number,
    semanticWeight: number,
    bm25Enabled: boolean,
  ): RetrievedMemory[] {
    const {
      records,
      sessionId,
      intent,
      normalizedQuery,
      queryTerms,
      excludedSourceIds,
      vectorScoreById,
    } = input;

    const bm25ById = bm25Enabled ? this.computeBm25Scores(records, queryTerms) : new Map<string, number>();

    return records
      .filter((record) => !excludedSourceIds.has(record.sourceId))
      .map((record) => {
        const heuristicLexical = this.scoreRecord(record, normalizedQuery, queryTerms, sessionId, intent);
        const bm25Score = bm25ById.get(record.id) ?? 0;
        const lexicalScore = bm25Enabled
          ? heuristicLexical * 0.4 + bm25Score * 0.6
          : heuristicLexical;
        const semanticScore = Math.max(0, vectorScoreById.get(record.id) ?? 0);
        const semanticBoost = semanticScore >= 0.55 ? 0.08 : 0;
        const score = lexicalScore * lexicalWeight + semanticScore * semanticWeight + semanticBoost;
        return {
          record,
          score,
          lexicalScore,
          semanticScore,
        };
      })
      .filter(({ score, record, semanticScore }) => {
        const baseThreshold = this.minimumScore(intent, record.source);
        const adaptedThreshold = semanticScore >= 0.62
          ? Math.max(0.14, baseThreshold - 0.08)
          : baseThreshold;
        return score >= adaptedThreshold;
      })
      .sort((left, right) => right.score - left.score);
  }

  private applyHeuristicReranker(
    ranked: RetrievedMemory[],
    normalizedQuery: string,
    queryTerms: string[],
    intent: MemoryIntent,
  ): RetrievedMemory[] {
    if (ranked.length <= 1) {
      return ranked;
    }

    const topSlice = ranked.slice(0, Math.min(18, ranked.length));
    const tailSlice = ranked.slice(topSlice.length);

    const rerankedTop = topSlice
      .map((item, index) => {
        const content = `${item.record.title ?? ""} ${item.record.content}`.toLowerCase();
        const queryLower = normalizedQuery.toLowerCase();
        const exactPhrase = queryLower.length > 2 && content.includes(queryLower) ? 1 : 0;
        const overlap = this.calculateTermOverlap(queryTerms, item.record.terms);
        const sourceAlignment = this.getSourceBoost(item.record.source, intent);
        const lexicalSignal = item.lexicalScore ?? 0;
        const semanticSignal = item.semanticScore ?? 0;
        const stabilityPenalty = index > 10 ? 0.02 : 0;
        const rerankScore =
          item.score * 0.55
          + exactPhrase * 0.16
          + overlap * 0.14
          + sourceAlignment * 0.1
          + lexicalSignal * 0.04
          + semanticSignal * 0.03
          - stabilityPenalty;

        return {
          ...item,
          score: rerankScore,
        };
      })
      .sort((left, right) => right.score - left.score);

    return [...rerankedTop, ...tailSlice];
  }

  private computeBm25Scores(records: MemoryRecord[], queryTerms: string[]): Map<string, number> {
    const normalizedQueryTerms = Array.from(
      new Set(queryTerms.map((term) => term.toLowerCase()).filter((term) => term.length > 1)),
    );

    if (!records.length || !normalizedQueryTerms.length) {
      return new Map();
    }

    const documentCount = records.length;
    const docTokensById = new Map<string, string[]>();
    const documentFrequency = new Map<string, number>();
    let totalDocLength = 0;

    for (const record of records) {
      const tokens = record.terms
        .map((term) => term.toLowerCase())
        .filter((term) => term.length > 1);
      docTokensById.set(record.id, tokens);
      totalDocLength += tokens.length;

      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      }
    }

    const averageDocLength = Math.max(1, totalDocLength / Math.max(1, documentCount));
    const k1 = 1.2;
    const b = 0.75;

    const rawScores = new Map<string, number>();
    let maxScore = 0;

    for (const record of records) {
      const tokens = docTokensById.get(record.id) ?? [];
      if (!tokens.length) {
        rawScores.set(record.id, 0);
        continue;
      }

      const termFreq = new Map<string, number>();
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
      }

      const docLen = tokens.length;
      let score = 0;

      for (const term of normalizedQueryTerms) {
        const tf = termFreq.get(term) ?? 0;
        if (tf <= 0) {
          continue;
        }

        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLen / averageDocLength));
        score += idf * (numerator / Math.max(1e-9, denominator));
      }

      rawScores.set(record.id, score);
      if (score > maxScore) {
        maxScore = score;
      }
    }

    if (maxScore <= 0) {
      return new Map();
    }

    const normalizedScores = new Map<string, number>();
    for (const [id, score] of rawScores.entries()) {
      normalizedScores.set(id, Math.max(0, Math.min(1, score / maxScore)));
    }

    return normalizedScores;
  }

  private calculateRankPositionChanges(before: RetrievedMemory[], after: RetrievedMemory[]): number {
    if (!before.length || !after.length) {
      return 0;
    }

    const beforeIndex = new Map(before.map((item, index) => [item.record.id, index]));
    let changed = 0;

    for (let i = 0; i < after.length; i += 1) {
      const id = after[i].record.id;
      const previous = beforeIndex.get(id);
      if (typeof previous === "number" && previous !== i) {
        changed += 1;
      }
    }

    return changed;
  }

  private calculateRerankerConfidence(ranked: RetrievedMemory[]): number {
    if (!ranked.length) {
      return 0;
    }

    const top = ranked[0]?.score ?? 0;
    const second = ranked[1]?.score ?? 0;
    const margin = Math.max(0, top - second);
    return Math.max(0, Math.min(1, margin));
  }

  private persistTelemetrySnapshot(telemetry: RetrievalTelemetry): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const key = "mindscribe.rag.telemetry.snapshots";
      const current = window.localStorage.getItem(key);
      const parsed = current ? JSON.parse(current) : [];
      const snapshots = Array.isArray(parsed) ? parsed : [];
      snapshots.push({ timestamp: new Date().toISOString(), ...telemetry });
      while (snapshots.length > 100) {
        snapshots.shift();
      }
      window.localStorage.setItem(key, JSON.stringify(snapshots));
    } catch (error) {
      console.warn("Failed to persist retrieval telemetry snapshot", error);
    }
  }

  private getFeatureFlag(key: string, fallback: boolean): boolean {
    if (typeof window === "undefined") {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) {
        return fallback;
      }
      if (raw === "1" || raw === "true") {
        return true;
      }
      if (raw === "0" || raw === "false") {
        return false;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  private estimatePromptBudgetChars(options: {
    modelContextTokens: number;
    reservedResponseTokens: number;
    charsPerToken: number;
    maxPromptChars?: number;
  }): number {
    const {
      modelContextTokens,
      reservedResponseTokens,
      charsPerToken,
      maxPromptChars,
    } = options;

    const availableInputTokens = Math.max(256, modelContextTokens - reservedResponseTokens);
    const estimatedChars = Math.max(900, Math.floor(availableInputTokens * Math.max(2.5, charsPerToken)));
    const target = typeof maxPromptChars === "number"
      ? Math.min(maxPromptChars, estimatedChars)
      : estimatedChars;
    return Math.max(900, Math.min(MAX_CONTEXT_CHARS_HARD, target));
  }

  private applyReciprocalRankFusion(ranked: RetrievedMemory[]): RetrievedMemory[] {
    if (ranked.length <= 1) {
      return ranked;
    }

    const rrfK = 60;
    const lexicalOrder = [...ranked].sort((left, right) => (right.lexicalScore ?? 0) - (left.lexicalScore ?? 0));
    const semanticOrder = [...ranked].sort((left, right) => (right.semanticScore ?? 0) - (left.semanticScore ?? 0));
    const lexicalRankById = new Map(lexicalOrder.map((item, index) => [item.record.id, index + 1]));
    const semanticRankById = new Map(semanticOrder.map((item, index) => [item.record.id, index + 1]));

    return ranked
      .map((item) => {
        const lexicalRank = lexicalRankById.get(item.record.id) ?? lexicalOrder.length + 1;
        const semanticRank = semanticRankById.get(item.record.id) ?? semanticOrder.length + 1;
        const lexicalRrf = 1 / (rrfK + lexicalRank);
        const semanticRrf = 1 / (rrfK + semanticRank);
        const blendedRrf = lexicalRrf * 0.52 + semanticRrf * 0.48;
        return {
          ...item,
          score: item.score * 0.65 + blendedRrf * 0.35,
        };
      })
      .sort((left, right) => right.score - left.score);
  }

  private async safeVectorSearch(
    userId: string,
    query: string,
    options: { topK: number; sessionId: string | null; enabled: boolean },
  ): Promise<{ matches: Array<{ id: string; score: number }>; skipped: boolean; reason?: string }> {
    if (!options.enabled) {
      return { matches: [], skipped: true, reason: "semantic_disabled" };
    }

    if (Date.now() < this.vectorCircuitOpenUntil) {
      return { matches: [], skipped: true, reason: "vector_circuit_open" };
    }

    try {
      const matches = await vectorMemoryService.search(userId, query, {
        topK: options.topK,
        sessionId: options.sessionId,
      });
      this.vectorFailureCount = 0;
      return { matches, skipped: false };
    } catch (error) {
      this.vectorFailureCount += 1;
      if (this.vectorFailureCount >= VECTOR_FAILURE_BUDGET) {
        this.vectorCircuitOpenUntil = Date.now() + VECTOR_CIRCUIT_COOLDOWN_MS;
      }
      console.warn("Vector search failed, falling back to lexical-only retrieval.", error);
      return { matches: [], skipped: true, reason: "vector_error" };
    }
  }

  private buildJournalRecords(userId: string, entry: JournalEntry): MemoryRecord[] {
    const chunkRecords = this.buildJournalChunkRecords(userId, entry);
    const factRecords = this.buildFactRecords(userId, {
      idPrefix: `journal:${entry.id}`,
      sourceId: entry.id,
      sessionId: null,
      title: entry.title,
      text: `${entry.title ? `${entry.title}. ` : ""}${entry.content}`,
      occurredAt: entry.updatedAt,
      createdAt: entry.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: {
        entryId: entry.id,
        sourceKind: "journalEntry",
      },
    });
    return [this.buildJournalOverviewRecord(userId, entry), ...chunkRecords, ...factRecords];
  }

  private buildJournalOverviewRecord(userId: string, entry: JournalEntry): MemoryRecord {
    const now = new Date().toISOString();
    const content = this.buildJournalContent(entry);
    const tags = this.buildJournalTags(entry);
    const emotionalSalience = entry.analysis
      ? Math.max(Math.abs(entry.analysis.moodScore), entry.analysis.stressScore / 10)
      : 0.2;

    return {
      id: `journal:${entry.id}:overview`,
      userId,
      source: "journalEntry",
      sourceId: entry.id,
      sessionId: null,
      title: entry.title,
      content,
      excerpt: this.compactText(entry.analysis?.summary || entry.content, 220),
      tags,
      terms: this.extractTerms(content, tags),
      importance: Math.min(0.98, 0.64 + emotionalSalience * 0.25 + (entry.isFavorite ? 0.08 : 0)),
      salience: Math.min(0.98, 0.6 + emotionalSalience * 0.3),
      occurredAt: entry.updatedAt,
      createdAt: entry.createdAt,
      updatedAt: now,
      metadata: {
        entryId: entry.id,
        mood: entry.analysis?.mood ?? null,
        stressLevel: entry.analysis?.stressLevel ?? null,
        sentimentScore: entry.analysis?.sentimentScore ?? null,
        stressScore: entry.analysis?.stressScore ?? null,
        tags: entry.tags,
      },
    };
  }

  private buildJournalChunkRecords(userId: string, entry: JournalEntry): MemoryRecord[] {
    const now = new Date().toISOString();
    const baseTags = this.buildJournalTags(entry);
    const chunks = this.splitIntoChunks(entry.content);

    return chunks.map((chunk, index) => {
      const titlePrefix = entry.title?.trim() ? `${entry.title}. ` : "";
      const content = `${titlePrefix}${chunk}`;

      return {
        id: `journal:${entry.id}:chunk:${index}`,
        userId,
        source: "journalChunk",
        sourceId: `${entry.id}:chunk:${index}`,
        sessionId: null,
        title: entry.title,
        content,
        excerpt: this.compactText(chunk, 200),
        tags: baseTags,
        terms: this.extractTerms(content, baseTags),
        importance: Math.min(0.9, 0.46 + (entry.analysis ? 0.14 : 0)),
        salience: Math.min(0.92, 0.4 + this.estimateEmotionalSalience(chunk)),
        occurredAt: entry.updatedAt,
        createdAt: entry.createdAt,
        updatedAt: now,
        metadata: {
          entryId: entry.id,
          parentId: entry.id,
          chunkIndex: index,
          mood: entry.analysis?.mood ?? null,
          stressLevel: entry.analysis?.stressLevel ?? null,
        },
      };
    });
  }

  private buildJournalContent(entry: JournalEntry): string {
    const analysisBits = this.buildJournalAnalysisBits(entry.analysis);
    return [
      entry.title ? `Journal title: ${entry.title}.` : "",
      `Journal content: ${this.normalizeWhitespace(entry.content)}`,
      analysisBits,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private buildJournalAnalysisBits(analysis?: JournalAnalysis): string {
    if (!analysis) {
      return "";
    }

    return [
      `Summary: ${analysis.summary}.`,
      `Mood ${analysis.mood} (${analysis.sentimentScore.toFixed(2)} sentiment).`,
      `Stress ${analysis.stressLevel} (${analysis.stressScore}/10).`,
      analysis.emotions.length ? `Emotions: ${analysis.emotions.join(", ")}.` : "",
      analysis.themes.length ? `Themes: ${analysis.themes.join(", ")}.` : "",
      analysis.suggestions.length
        ? `Helpful suggestions already offered: ${analysis.suggestions.join("; ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  private buildJournalTags(entry: JournalEntry): string[] {
    const analysis = entry.analysis;
    return [
      ...entry.tags,
      ...(analysis?.emotions ?? []),
      ...(analysis?.themes ?? []),
      analysis?.mood ?? "",
      analysis?.stressLevel ?? "",
      "journal",
    ]
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  private buildFactRecords(
    userId: string,
    options: {
      idPrefix: string;
      sourceId: string;
      sessionId: string | null;
      title?: string | null;
      text: string;
      occurredAt: string;
      createdAt: string;
      updatedAt: string;
      metadata?: Record<string, unknown>;
    },
  ): MemoryRecord[] {
    const facts = this.extractDurableFacts(options.text);

    return facts.map((fact, index) => {
      const content = `The user's ${fact.relationLabel} is ${fact.personName}.`;
      return {
        id: `${options.idPrefix}:fact:${fact.relation}:${index}`,
        userId,
        source: "durableFact",
        sourceId: options.sourceId,
        sessionId: options.sessionId,
        title: options.title ?? "Durable fact",
        content,
        excerpt: content,
        tags: fact.tags,
        terms: this.extractTerms(content, fact.tags),
        importance: 0.99,
        salience: 0.99,
        occurredAt: options.occurredAt,
        createdAt: options.createdAt,
        updatedAt: options.updatedAt,
        metadata: {
          ...options.metadata,
          relation: fact.relation,
          relationLabel: fact.relationLabel,
          personName: fact.personName,
          answer: fact.answer,
        },
      };
    });
  }

  private shouldStoreAssistantMemory(content: string): boolean {
    if (content.length < 48) {
      return false;
    }

    const lower = content.toLowerCase();
    const genericPatterns = [
      /^hello[!.\s]/,
      /^hi[!.\s]/,
      /how can i assist you today\??$/,
      /i'm here for support/,
      /how are you/,
    ];

    if (genericPatterns.some((pattern) => pattern.test(lower))) {
      return false;
    }

    const informationalSignals = [
      /\b(plan|steps|strategy|because|therefore|based on|you mentioned|last time|remember)\b/,
      /\b\d+\b/,
      /\b(journal|stress|anxiety|pattern|goal)\b/,
    ];

    return informationalSignals.some((pattern) => pattern.test(lower));
  }

  private classifyMemoryValueDetailed(
    content: string,
    role: "user" | "assistant" | "system",
  ): MemoryClassificationResult {
    if (!content || content.length < 2) {
      return { label: "noise", score: 0, reasons: ["empty_or_too_short"] };
    }

    if (this.extractDurableFacts(content).length > 0) {
      return { label: "durable", score: 0.98, reasons: ["durable_fact_detected"] };
    }

    const lower = content.toLowerCase();
    const veryShortSmallTalk = /^(hi|hello|hey|yo|ok|okay|thanks|thank you|hmm+|lol|lmao|cool|nice)$/;
    if (content.length < 22 && veryShortSmallTalk.test(lower)) {
      return { label: "noise", score: 0.05, reasons: ["short_small_talk_pattern"] };
    }

    let score = 0.2;
    const reasons: string[] = [];

    if (/\b(i am|i'm|my|i feel|i need|i want|i plan|i decided)\b/i.test(content)) {
      score += 0.28;
      reasons.push("self_reference_signal");
    }
    if (/\b(today|yesterday|tomorrow|this week|recently|lately)\b/i.test(content)) {
      score += 0.14;
      reasons.push("time_anchor_signal");
    }
    if (/\b(goal|habit|routine|progress|problem|issue|relationship|work|college|exam)\b/i.test(content)) {
      score += 0.2;
      reasons.push("contextual_topic_signal");
    }
    if (content.length >= 65) {
      score += 0.16;
      reasons.push("length_signal");
    }

    const hasSignal = role === "user"
      ? this.shouldStoreUserMemory(content)
      : this.shouldStoreAssistantMemory(content);
    if (hasSignal) {
      score += 0.22;
      reasons.push(role === "user" ? "user_memory_rule_match" : "assistant_memory_rule_match");
    }

    if (score >= 0.75) {
      return { label: "durable", score: Math.min(1, score), reasons: [...reasons, "high_confidence_signal"] };
    }

    if (score >= 0.42 && hasSignal) {
      return { label: "useful", score: Math.min(1, score), reasons: reasons.length ? reasons : ["rule_match"] };
    }

    return { label: "noise", score: Math.max(0, Math.min(1, score)), reasons: reasons.length ? reasons : ["low_signal"] };
  }

  private async isRedundantChatMemory(
    userId: string,
    sessionId: string,
    content: string,
    sourceId: string,
  ): Promise<DedupeResult> {
    const records = await this.getUserRecords(userId);
    const recent = records
      .filter(
        (record) =>
          record.source === "chatMessage"
          && record.sessionId === sessionId
          && record.sourceId !== sourceId,
      )
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, CHAT_DUPLICATE_LOOKBACK);

    if (!recent.length) {
      return { duplicate: false };
    }

    const incomingTerms = this.extractTerms(content);
    const incomingLower = content.toLowerCase();

    const lexicalDuplicate = recent.find((record) => {
      const existing = this.normalizeWhitespace(record.content).toLowerCase();
      if (!existing) {
        return false;
      }

      if (existing === incomingLower) {
        return true;
      }

      if (incomingLower.length > 24 && (existing.includes(incomingLower) || incomingLower.includes(existing))) {
        return true;
      }

      const overlap = this.calculateTermOverlap(incomingTerms, record.terms);
      return overlap >= CHAT_DUPLICATE_SIMILARITY_THRESHOLD;
    });

    if (lexicalDuplicate) {
      return { duplicate: true, reason: "lexical_similarity" };
    }

    const semanticDedupeEnabled = this.getFeatureFlag(FEATURE_FLAG_MEMORY_DEDUPE_SEMANTIC, true);
    if (!semanticDedupeEnabled) {
      return { duplicate: false };
    }

    try {
      const semanticMatches = await vectorMemoryService.search(userId, content, {
        topK: 3,
        sessionId,
      });
      const top = semanticMatches[0];
      if (top && top.score >= 0.92 && top.sourceId !== sourceId) {
        return { duplicate: true, reason: "semantic_similarity", score: top.score };
      }
    } catch {
      // Keep dedupe resilient; lexical check already applied.
    }

    return { duplicate: false };
  }

  private logMemoryDecision(payload: {
    userId: string;
    sessionId: string;
    sourceId: string;
    action: "keep" | "drop";
    label: MemoryValueClass;
    score: number;
    reasons: string[];
  }): void {
    const debugEnabled = this.getFeatureFlag(FEATURE_FLAG_MEMORY_CLASSIFIER_DEBUG, false);
    if (!debugEnabled || typeof window === "undefined") {
      return;
    }

    try {
      const current = window.localStorage.getItem(MEMORY_CLASSIFIER_LOG_KEY);
      const parsed = current ? JSON.parse(current) : [];
      const logs = Array.isArray(parsed) ? parsed : [];
      logs.push({ timestamp: new Date().toISOString(), ...payload });
      while (logs.length > 200) {
        logs.shift();
      }
      window.localStorage.setItem(MEMORY_CLASSIFIER_LOG_KEY, JSON.stringify(logs));
    } catch {
      // Avoid runtime impact if logging storage fails.
    }
  }

  private async refreshRollingSummaries(userId: string): Promise<void> {
    const records = await this.getUserRecords(userId, true);
    const chatRecords = records
      .filter((record) => record.source === "chatMessage")
      .filter((record) => String(record.metadata.role ?? "").toLowerCase() === "user")
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

    if (!chatRecords.length) {
      return;
    }

    const now = new Date().toISOString();
    const shortHorizon = chatRecords.slice(0, ROLLING_SHORT_MESSAGES).reverse();
    const longHorizon = chatRecords.slice(0, ROLLING_LONG_MESSAGES).reverse();
    const shortSummary = this.summarizeChatRecords(shortHorizon, 260);
    const longSummary = this.summarizeChatRecords(longHorizon, 360);

    const summaryRecords: MemoryRecord[] = [
      {
        id: `summary:rolling:short:${userId}`,
        userId,
        source: "chatSummary",
        sourceId: "rolling-short",
        sessionId: null,
        title: "Short-horizon chat summary",
        content: shortSummary,
        excerpt: this.compactText(shortSummary, 220),
        tags: ["rolling", "summary", "short-horizon"],
        terms: this.extractTerms(shortSummary, ["rolling", "summary", "short-horizon"]),
        importance: 0.8,
        salience: 0.78,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: {
          window: "short",
          messageCount: shortHorizon.length,
        },
      },
      {
        id: `summary:rolling:long:${userId}`,
        userId,
        source: "chatSummary",
        sourceId: "rolling-long",
        sessionId: null,
        title: "Long-horizon chat summary",
        content: longSummary,
        excerpt: this.compactText(longSummary, 240),
        tags: ["rolling", "summary", "long-horizon"],
        terms: this.extractTerms(longSummary, ["rolling", "summary", "long-horizon"]),
        importance: 0.82,
        salience: 0.8,
        occurredAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: {
          window: "long",
          messageCount: longHorizon.length,
        },
      },
    ];

    await this.upsertRecords(summaryRecords);
  }

  private summarizeChatRecords(records: MemoryRecord[], maxChars: number): string {
    if (!records.length) {
      return "No recent conversation memory available.";
    }

    const lines = records.map((record) => {
      const date = this.formatDateLabel(record.occurredAt);
      const excerpt = this.compactText(record.excerpt || record.content, 120);
      return `- [${date}] ${excerpt}`;
    });

    return this.compactText(
      `Recent conversation trajectory:\n${lines.join("\n")}`,
      maxChars,
    );
  }

  private shouldStoreUserMemory(content: string): boolean {
    const normalized = this.normalizeWhitespace(content);
    if (!normalized) {
      return false;
    }

    // Always preserve extracted durable facts (names/relations/etc.).
    if (this.extractDurableFacts(normalized).length > 0) {
      return true;
    }

    const lower = normalized.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const uniqueWords = new Set(words);

    // Ignore very short low-signal chatter.
    if (words.length <= 3 && normalized.length < 24) {
      const tinyChatter = /^(hi|hello|hey|yo|sup|hii+|he+llo+|ok|okay|kk|hmm|hmmm|lol|lmao|thanks|thank you)$/;
      if (tinyChatter.test(lower)) {
        return false;
      }
    }

    const highSignalPatterns = [
      /\b(i am|i'm|my|for me|about me|i feel|i need|i want|i plan|i will|i decided|i learned)\b/,
      /\b(today|yesterday|tomorrow|last week|this week|recently|lately|since)\b/,
      /\b(work|job|college|school|exam|deadline|project|family|friend|relationship|health)\b/,
      /\b(stress|anxiety|panic|overwhelmed|sad|depressed|angry|burnout|lonely|worried)\b/,
      /\b(goal|habit|routine|progress|improve|problem|issue|struggle)\b/,
      /\b(remember|remind|before|earlier|previous|last time)\b/,
      /\d{1,2}[:/]\d{1,2}|\b\d+\b/,
    ];

    if (highSignalPatterns.some((pattern) => pattern.test(lower))) {
      return true;
    }

    // Keep non-trivial statements that are not repetitive noise.
    const hasReasonableLength = normalized.length >= 42 || words.length >= 8;
    const lexicalDiversity = uniqueWords.size / Math.max(1, words.length);
    if (hasReasonableLength && lexicalDiversity >= 0.45) {
      return true;
    }

    return false;
  }

  private extractDurableFacts(text: string): ExtractedFact[] {
    const factDefinitions: Array<{ relation: string; relationLabel: string; patterns: RegExp[] }> = [
      {
        relation: "best_friend",
        relationLabel: "best friend",
        patterns: [
          /\bmy best friend(?:'s)? name is\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})\b/i,
          /\bmy best friend is\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})\b/i,
          /\b([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})\s+is my best friend\b/i,
          /\bmy best friend,\s*([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})\b/i,
        ],
      },
    ];

    const facts: ExtractedFact[] = [];

    for (const definition of factDefinitions) {
      for (const pattern of definition.patterns) {
        const match = text.match(pattern);
        const rawName = match?.[1];
        const personName = rawName ? this.normalizePersonName(rawName) : "";
        if (!personName || !this.isLikelyPersonName(personName)) {
          continue;
        }

        facts.push({
          relation: definition.relation,
          relationLabel: definition.relationLabel,
          personName,
          answer: `Your ${definition.relationLabel}'s name is ${personName}.`,
          tags: [
            "fact",
            definition.relation,
            definition.relationLabel.replace(/\s+/g, "-"),
            "name",
            ...personName.toLowerCase().split(/\s+/),
          ],
        });
        break;
      }
    }

    if (!facts.some((fact) => fact.relation === "best_friend")) {
      const storyFact = this.extractBestFriendStoryFact(text);
      if (storyFact) {
        facts.push(storyFact);
      }
    }

    facts.push(...this.extractPreferenceAndGoalFacts(text));

    return facts;
  }

  private extractPreferenceAndGoalFacts(text: string): ExtractedFact[] {
    const extracted: ExtractedFact[] = [];
    const cleaned = this.normalizeWhitespace(text);

    const preference = cleaned.match(/\b(i like|i love|i enjoy)\s+([a-z0-9][a-z0-9\s,'-]{2,70})\b/i)?.[2]?.trim();
    if (preference && preference.length <= 72) {
      extracted.push({
        relation: "preference",
        relationLabel: "preference",
        personName: preference,
        answer: `You said you like ${preference}.`,
        tags: ["fact", "preference", ...preference.toLowerCase().split(/\s+/).slice(0, 4)],
      });
    }

    const goal = cleaned.match(/\b(my goal is to|i want to|i plan to)\s+([a-z0-9][a-z0-9\s,'-]{3,90})\b/i)?.[2]?.trim();
    if (goal && goal.length <= 96) {
      extracted.push({
        relation: "current_goal",
        relationLabel: "current goal",
        personName: goal,
        answer: `Your current goal is to ${goal}.`,
        tags: ["fact", "goal", ...goal.toLowerCase().split(/\s+/).slice(0, 5)],
      });
    }

    const role = cleaned.match(/\b(i work as|i am a|i'm a)\s+([a-z][a-z\s-]{2,50})\b/i)?.[2]?.trim();
    if (role && role.length <= 52) {
      extracted.push({
        relation: "role",
        relationLabel: "role",
        personName: role,
        answer: `You described your role as ${role}.`,
        tags: ["fact", "role", ...role.toLowerCase().split(/\s+/).slice(0, 4)],
      });
    }

    const unique = new Map<string, ExtractedFact>();
    for (const fact of extracted) {
      unique.set(`${fact.relation}:${fact.personName.toLowerCase()}`, fact);
    }
    return [...unique.values()];
  }

  private extractBestFriendStoryFact(text: string): ExtractedFact | null {
    const storyPatterns = [
      /\bmy best friend named\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})\b/i,
      /\bmy best friend\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2})\b/i,
      /\bwith\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2}),?\s+my best friend\b/i,
      /\b([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2}),\s+my best friend\b/i,
    ];

    for (const pattern of storyPatterns) {
      const rawName = text.match(pattern)?.[1];
      const personName = rawName ? this.normalizePersonName(rawName) : "";
      if (!personName || !this.isLikelyPersonName(personName)) {
        continue;
      }

      return {
        relation: "best_friend",
        relationLabel: "best friend",
        personName,
        answer: `Your best friend's name is ${personName}.`,
        tags: ["fact", "best_friend", "best-friend", "name", ...personName.toLowerCase().split(/\s+/)],
      };
    }

    return null;
  }

  private normalizePersonName(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((part) => {
        if (!part) {
          return part;
        }
        if (/[A-Z]/.test(part)) {
          return part;
        }
        return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`;
      })
      .join(" ");
  }

  private isLikelyPersonName(value: string): boolean {
    const parts = value.split(/\s+/).filter(Boolean);
    if (!parts.length || parts.length > 3) {
      return false;
    }

    return parts.every((part) => {
      const normalized = part.toLowerCase();
      return (
        normalized.length >= 2
        && normalized.length <= 24
        && !STOP_WORDS.has(normalized)
        && !NON_NAME_WORDS.has(normalized)
      );
    });
  }

  private extractTerms(text: string, extraTags: string[] = []): string[] {
    const rawTerms = this.normalizeWhitespace(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

    return Array.from(new Set([...rawTerms, ...extraTags.map((tag) => tag.toLowerCase())]));
  }

  private extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags = EMOTION_TERMS.filter((term) => lower.includes(term));
    return Array.from(new Set(tags));
  }

  private splitIntoChunks(content: string): string[] {
    const raw = content.trim();
    if (!raw) {
      return [];
    }

    const normalized = this.normalizeWhitespace(raw);
    if (normalized.length <= MAX_JOURNAL_CHUNK_CHARS) {
      return [normalized];
    }

    const paragraphs = raw
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    const rawChunks: string[] = [];

    for (const paragraph of paragraphs.length ? paragraphs : [raw]) {
      const paragraphText = this.normalizeWhitespace(paragraph);
      if (!paragraphText) {
        continue;
      }

      if (paragraphText.length <= MAX_JOURNAL_CHUNK_CHARS) {
        rawChunks.push(paragraphText);
        continue;
      }

      const paragraphSentences = this.tokenizeSentences(paragraphText);
      if (!paragraphSentences.length) {
        rawChunks.push(...this.splitLongSegment(paragraphText, MAX_JOURNAL_CHUNK_CHARS));
        continue;
      }

      let currentChunk = "";
      for (const sentence of paragraphSentences) {
        const normalizedSentence = this.normalizeWhitespace(sentence);
        if (!normalizedSentence) {
          continue;
        }

        if (normalizedSentence.length > MAX_JOURNAL_CHUNK_CHARS) {
          const pieces = this.splitLongSegment(normalizedSentence, MAX_JOURNAL_CHUNK_CHARS);
          for (const piece of pieces) {
            if (!currentChunk) {
              currentChunk = piece;
              continue;
            }

            if (`${currentChunk} ${piece}`.length <= MAX_JOURNAL_CHUNK_CHARS) {
              currentChunk = `${currentChunk} ${piece}`;
            } else {
              rawChunks.push(currentChunk);
              currentChunk = piece;
            }
          }
          continue;
        }

        if (!currentChunk) {
          currentChunk = normalizedSentence;
          continue;
        }

        if (`${currentChunk} ${normalizedSentence}`.length <= MAX_JOURNAL_CHUNK_CHARS) {
          currentChunk = `${currentChunk} ${normalizedSentence}`;
        } else {
          rawChunks.push(currentChunk);
          currentChunk = normalizedSentence;
        }
      }

      if (currentChunk) {
        rawChunks.push(currentChunk);
      }
    }

    if (!rawChunks.length) {
      return [];
    }

    const mergedChunks: string[] = [];
    for (const chunk of rawChunks) {
      const normalizedChunk = this.normalizeWhitespace(chunk);
      if (!normalizedChunk) {
        continue;
      }

      if (
        mergedChunks.length > 0
        && normalizedChunk.length < MIN_JOURNAL_CHUNK_CHARS
        && `${mergedChunks[mergedChunks.length - 1]} ${normalizedChunk}`.length <= MAX_JOURNAL_CHUNK_CHARS
      ) {
        mergedChunks[mergedChunks.length - 1] = `${mergedChunks[mergedChunks.length - 1]} ${normalizedChunk}`;
      } else {
        mergedChunks.push(normalizedChunk);
      }
    }

    if (mergedChunks.length <= 1) {
      return mergedChunks;
    }

    const withOverlap = mergedChunks.map((chunk, index) => {
      if (index === 0) {
        return chunk;
      }

      const previous = mergedChunks[index - 1];
      const overlapPrefix = this.extractSentenceOverlap(previous, CHUNK_SENTENCE_OVERLAP);
      if (!overlapPrefix) {
        return chunk;
      }

      const combined = `${overlapPrefix} ${chunk}`.trim();
      if (combined.length <= MAX_JOURNAL_CHUNK_CHARS) {
        return combined;
      }

      return combined.slice(0, MAX_JOURNAL_CHUNK_CHARS).trimEnd();
    });

    return Array.from(new Set(withOverlap));
  }

  private tokenizeSentences(text: string): string[] {
    const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    return matches.map((sentence) => this.normalizeWhitespace(sentence)).filter(Boolean);
  }

  private splitLongSegment(text: string, maxChars: number): string[] {
    const compact = this.normalizeWhitespace(text);
    if (!compact) {
      return [];
    }

    if (compact.length <= maxChars) {
      return [compact];
    }

    const words = compact.split(/\s+/).filter(Boolean);
    const pieces: string[] = [];
    let current = "";

    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }

      if (`${current} ${word}`.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        pieces.push(current);
        current = word;
      }
    }

    if (current) {
      pieces.push(current);
    }

    return pieces;
  }

  private extractSentenceOverlap(text: string, sentenceCount: number): string {
    const sentences = this.tokenizeSentences(text);
    if (!sentences.length) {
      return this.normalizeWhitespace(text.slice(-JOURNAL_CHUNK_OVERLAP_CHARS));
    }

    return sentences.slice(-Math.max(1, sentenceCount)).join(" ").trim();
  }

  private classifyIntent(query: string): MemoryIntent {
    const lower = query.toLowerCase();

    if (/\b(remember|remind|before|earlier|last time|previous|used to)\b/.test(lower)) {
      return "remember";
    }

    if (/\b(pattern|trend|recurring|keep happening|always|lately|over time)\b/.test(lower)) {
      return "trend";
    }

    if (/\b(feel|feeling|journal|diary|entry|reflect|reflection|why am i|what am i|what did i write|i wrote)\b/.test(lower)) {
      return "reflection";
    }

    if (
      /\b(anxious|anxiety|panic|stress|stressed|overwhelmed|depressed|sad|hopeless|lonely|burnout)\b/.test(
        lower,
      )
    ) {
      return "distress";
    }

    return "general";
  }

  private scoreRecord(
    record: MemoryRecord,
    query: string,
    queryTerms: string[],
    sessionId: string | null,
    intent: MemoryIntent,
  ): number {
    const termOverlap = this.calculateTermOverlap(queryTerms, record.terms);
    const tagOverlap = this.calculateTermOverlap(queryTerms, record.tags);
    const phraseBoost = record.content.toLowerCase().includes(query.toLowerCase()) ? 0.16 : 0;
    const sameSessionBoost = sessionId && record.sessionId === sessionId ? 0.1 : 0;
    const sourceBoost = this.getSourceBoost(record.source, intent);
    const recencyBoost = this.getRecencyBoost(record, intent);
    const importanceBoost = record.importance * 0.14;
    const salienceBoost = record.salience * 0.12;

    return (
      termOverlap * 0.42 +
      tagOverlap * 0.12 +
      phraseBoost +
      sameSessionBoost +
      sourceBoost +
      recencyBoost +
      importanceBoost +
      salienceBoost
    );
  }

  private minimumScore(intent: MemoryIntent, source: MemorySource): number {
    if (source === "durableFact") {
      return 0.12;
    }

    if (source === "assessmentProfile" && intent !== "general") {
      return 0.18;
    }

    if (
      (source === "journalEntry" || source === "journalChunk")
      && (intent === "remember" || intent === "trend" || intent === "reflection" || intent === "distress")
    ) {
      return 0.16;
    }

    if (intent === "remember" || intent === "trend") {
      return 0.2;
    }

    return 0.26;
  }

  private calculateTermOverlap(queryTerms: string[], targetTerms: string[]): number {
    if (!queryTerms.length || !targetTerms.length) {
      return 0;
    }

    const targetSet = new Set(targetTerms.map((term) => term.toLowerCase()));
    const matches = queryTerms.filter((term) => targetSet.has(term.toLowerCase())).length;
    return matches / Math.max(queryTerms.length, 1);
  }

  private getSourceBoost(source: MemorySource, intent: MemoryIntent): number {
    if (source === "durableFact") {
      return intent === "remember" || intent === "general" ? 0.24 : 0.18;
    }

    if (source === "assessmentProfile") {
      return intent === "general" ? 0.02 : 0.18;
    }

    if (source === "journalEntry" || source === "journalChunk") {
      if (intent === "distress" || intent === "reflection" || intent === "trend") {
        return 0.24;
      }
      if (intent === "remember") {
        return 0.2;
      }
      return 0.08;
    }

    if (source === "chatSummary") {
      return intent === "remember" ? 0.18 : 0.08;
    }

    if (source === "chatMessage") {
      return intent === "remember" ? 0.12 : 0.04;
    }

    return 0;
  }

  private getRecencyBoost(record: MemoryRecord, intent: MemoryIntent): number {
    const occurredAt = Date.parse(record.occurredAt);
    if (Number.isNaN(occurredAt)) {
      return 0;
    }

    const ageDays = Math.max(0, (Date.now() - occurredAt) / 86_400_000);
    const decayWindow =
      record.source === "journalEntry" || record.source === "journalChunk"
        ? intent === "trend"
          ? 120
          : 45
        : 21;

    return Math.max(0, 0.12 - ageDays / decayWindow / 10);
  }

  private selectRecords(ranked: RetrievedMemory[], limit: number, intent: MemoryIntent): RetrievedMemory[] {
    const selected: RetrievedMemory[] = [];
    const familyIds = new Set<string>();
    const sourceCounts: Record<MemorySource, number> = {
      assessmentProfile: 0,
      chatMessage: 0,
      chatSummary: 0,
      journalEntry: 0,
      journalChunk: 0,
      durableFact: 0,
    };

    const maxPerSource = this.getSourceQuotaByIntent(intent, limit);

    for (const candidate of ranked) {
      if (selected.length >= limit) {
        break;
      }

      const familyId = this.getFamilyId(candidate.record);
      if (familyIds.has(familyId)) {
        continue;
      }

      if (sourceCounts[candidate.record.source] >= maxPerSource[candidate.record.source]) {
        continue;
      }

      selected.push(candidate);
      familyIds.add(familyId);
      sourceCounts[candidate.record.source] += 1;
    }

    return selected;
  }

  private getSourceQuotaByIntent(intent: MemoryIntent, limit: number): Record<MemorySource, number> {
    const base: Record<MemorySource, number> = {
      assessmentProfile: 1,
      chatMessage: 2,
      chatSummary: 2,
      journalEntry: 2,
      journalChunk: 2,
      durableFact: 2,
    };

    if (intent === "distress") {
      base.journalEntry = 3;
      base.journalChunk = 3;
      base.chatSummary = 3;
      base.chatMessage = 2;
      base.durableFact = 1;
    } else if (intent === "remember") {
      base.durableFact = 3;
      base.chatSummary = 3;
      base.chatMessage = 2;
      base.journalEntry = 2;
      base.journalChunk = 1;
    } else if (intent === "trend") {
      base.journalEntry = 3;
      base.journalChunk = 3;
      base.chatSummary = 3;
      base.chatMessage = 1;
    } else if (intent === "reflection") {
      base.journalEntry = 3;
      base.journalChunk = 2;
      base.chatSummary = 2;
      base.chatMessage = 2;
    }

    if (limit <= 4) {
      base.chatMessage = Math.min(base.chatMessage, 1);
      base.chatSummary = Math.min(base.chatSummary, 2);
      base.journalChunk = Math.min(base.journalChunk, 1);
    }

    return base;
  }

  private getFamilyId(record: MemoryRecord): string {
    if (record.source === "durableFact") {
      return `fact:${String(record.metadata.relation ?? record.id)}`;
    }

    if (record.source === "journalEntry" || record.source === "journalChunk") {
      return `journal:${String(record.metadata.entryId ?? record.sourceId)}`;
    }

    if (record.source === "chatSummary") {
      return `summary:${record.sourceId}`;
    }

    return record.id;
  }

  private formatRetrievedContext(
    records: MemoryRecord[],
    maxChars = MAX_CONTEXT_CHARS,
    intent: MemoryIntent = "general",
    queryTerms: string[] = [],
  ): string {
    if (!records.length) {
      return "";
    }

    const profile = records.filter((record) => record.source === "assessmentProfile");
    const facts = records.filter((record) => record.source === "durableFact");
    const journals = records.filter(
      (record) => record.source === "journalEntry" || record.source === "journalChunk",
    );
    const chats = records.filter(
      (record) => record.source === "chatMessage" || record.source === "chatSummary",
    );

    const sectionBudgets = this.getSectionCharBudgets(maxChars, intent);

    const sections: string[] = [];

    if (profile.length) {
      const lines = profile
        .map((record) => `- ${this.compactText(record.excerpt || record.content, 220)}`)
        .join("\n");
      sections.push(
        this.limitSectionByChars("### Stable user context", lines, sectionBudgets.profile),
      );
    }

    if (facts.length) {
      const lines = facts
        .map((record) => `- ${this.formatMemoryLine(record, queryTerms)}`)
        .join("\n");
      sections.push(
        this.limitSectionByChars("### Relevant personal facts", lines, sectionBudgets.facts),
      );
    }

    if (journals.length) {
      const lines = journals
        .map((record) => `- ${this.formatMemoryLine(record, queryTerms)}`)
        .join("\n");
      sections.push(
        this.limitSectionByChars("### Relevant journal memory", lines, sectionBudgets.journal),
      );
    }

    if (chats.length) {
      const lines = chats
        .map((record) => `- ${this.formatMemoryLine(record, queryTerms)}`)
        .join("\n");
      sections.push(
        this.limitSectionByChars("### Related conversation memory", lines, sectionBudgets.chat),
      );
    }

    const prompt = `## Retrieved memory\nUse these only when directly relevant to the user's current turn.\nPrioritize continuity with the user's own words from recent chat and journal entries.\nDo not sound clinical or robotic when using memory.\n${sections.join(
      "\n\n",
    )}`;

    return this.compactText(prompt, maxChars);
  }

  private getSectionCharBudgets(maxChars: number, intent: MemoryIntent): {
    profile: number;
    facts: number;
    journal: number;
    chat: number;
  } {
    const budget = Math.max(900, maxChars);
    let factsRatio = 0.2;
    let journalRatio = 0.28;
    let chatRatio = 0.34;
    let profileRatio = 0.18;

    if (intent === "remember") {
      factsRatio = 0.28;
      journalRatio = 0.22;
      chatRatio = 0.34;
      profileRatio = 0.16;
    } else if (intent === "trend" || intent === "reflection" || intent === "distress") {
      factsRatio = 0.16;
      journalRatio = 0.38;
      chatRatio = 0.3;
      profileRatio = 0.16;
    }

    return {
      profile: Math.floor(budget * profileRatio),
      facts: Math.floor(budget * factsRatio),
      journal: Math.floor(budget * journalRatio),
      chat: Math.floor(budget * chatRatio),
    };
  }

  private limitSectionByChars(title: string, lines: string, maxChars: number): string {
    const compactLines = this.compactText(lines, Math.max(120, maxChars));
    return `${title}\n${compactLines}`;
  }

  private formatMemoryLine(record: MemoryRecord, queryTerms: string[] = []): string {
    if (record.source === "durableFact") {
      const answer = typeof record.metadata.answer === "string"
        ? record.metadata.answer
        : record.excerpt || record.content;
      return this.compactText(answer, 180);
    }

    const dateLabel = this.formatDateLabel(record.occurredAt);
    const title = record.title?.trim() ? `"${record.title.trim()}" ` : "";
    const excerpt = this.makeQueryFocusedExcerpt(record, queryTerms, 180);
    const tagLabel = record.tags.length ? ` Tags: ${record.tags.slice(0, 4).join(", ")}.` : "";
    return `[${dateLabel}] ${title}${excerpt}.${tagLabel}`;
  }

  private makeQueryFocusedExcerpt(record: MemoryRecord, queryTerms: string[], maxChars: number): string {
    const normalizedTerms = queryTerms.map((term) => term.toLowerCase()).filter((term) => term.length > 2);
    if (!normalizedTerms.length) {
      return this.compactText(record.excerpt || record.content, maxChars);
    }

    const sentences = this.tokenizeSentences(record.content);
    const matched = sentences
      .filter((sentence) => {
        const lower = sentence.toLowerCase();
        return normalizedTerms.some((term) => lower.includes(term));
      })
      .slice(0, 2)
      .join(" ");

    const candidate = matched || record.excerpt || record.content;
    return this.compactText(candidate, maxChars);
  }

  private formatDateLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
  }

  private compactText(text: string, maxChars: number): string {
    const normalized = this.normalizeWhitespace(text);
    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private estimateEmotionalSalience(text: string): number {
    const lower = text.toLowerCase();
    const matches = EMOTION_TERMS.filter((term) => lower.includes(term)).length;
    return Math.min(0.35, matches * 0.08);
  }

  private estimatePersonalSalience(text: string): number {
    const lower = text.toLowerCase();
    let score = 0;

    if (/\b(i am|i'm|i feel|my |for me|i need|i want)\b/.test(lower)) {
      score += 0.16;
    }

    if (/\b(always|never|every time|often|usually|recently|lately)\b/.test(lower)) {
      score += 0.08;
    }

    if (/\b(friend|family|mother|father|partner|relationship|work|job|school)\b/.test(lower)) {
      score += 0.08;
    }

    return Math.min(0.35, score);
  }

  private detectFactQueryRelation(query: string): string | null {
    const lower = query.toLowerCase();
    const match = FACT_RELATION_QUERY_PATTERNS.find(({ pattern }) => pattern.test(lower));
    return match?.relation ?? null;
  }

  private compareFactRecords(left: MemoryRecord, right: MemoryRecord): number {
    const relationBoost = (
      Number(right.importance) + Number(right.salience)
      - Number(left.importance) - Number(left.salience)
    );

    if (Math.abs(relationBoost) > 0.01) {
      return relationBoost > 0 ? 1 : -1;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  }

  private isSmallTalk(query: string): boolean {
    const lower = query.toLowerCase();
    return /^(hi|hello|hey|good morning|good evening|how are you|what's up|thanks|thank you)\b/.test(
      lower,
    );
  }
}

export const deviceMemoryService = new DeviceMemoryService();
export default deviceMemoryService;
