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
}

type MemoryIntent = "distress" | "reflection" | "remember" | "trend" | "general";

interface BuildContextOptions {
  userId: string;
  query: string;
  sessionId?: string | null;
  recentMessages?: ChatMessage[];
  limit?: number;
}

interface BuildContextResult {
  prompt: string;
  items: MemoryRecord[];
}

interface ExtractedFact {
  relation: string;
  relationLabel: string;
  personName: string;
  answer: string;
  tags: string[];
}

const CACHE_TTL_MS = 2500;
const MAX_JOURNAL_CHUNK_CHARS = 560;
const JOURNAL_CHUNK_OVERLAP_CHARS = 72;
const MIN_JOURNAL_CHUNK_CHARS = 120;
const CHUNK_SENTENCE_OVERLAP = 1;
const MAX_CONTEXT_CHARS = 2200;
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
    relation: "best_friend",
    pattern: /\b(best friend|bestfriend)\b.*\b(name|who)\b|\bwhat(?:'s| is)\s+my\s+best\s+friend(?:'s)?\s+name\b|\bwho is my best friend\b/i,
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

    // Keep memory focused on durable context; skip generic filler.
    if (message.role === "user" && !this.shouldStoreUserMemory(content)) {
      return;
    }

    if (message.role === "assistant" && !this.shouldStoreAssistantMemory(content)) {
      return;
    }

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
    const {
      userId,
      query,
      sessionId = null,
      recentMessages = [],
      limit = 6,
    } = options;

    const normalizedQuery = this.normalizeWhitespace(query);
    if (!userId || !normalizedQuery || this.isSmallTalk(normalizedQuery)) {
      return { prompt: "", items: [] };
    }

    const records = await this.getUserRecords(userId);
    if (!records.length) {
      return { prompt: "", items: [] };
    }

    const intent = this.classifyIntent(normalizedQuery);
    const queryTerms = this.extractTerms(normalizedQuery);
    const excludedSourceIds = new Set(recentMessages.map((message) => message.id));
    const vectorMatches = await vectorMemoryService.search(userId, normalizedQuery, {
      topK: Math.max(limit * 4, 20),
      sessionId,
    });
    const vectorScoreById = new Map(vectorMatches.map((match) => [match.id, match.score]));

    const ranked = records
      .filter((record) => !excludedSourceIds.has(record.sourceId))
      .map((record) => {
        const lexicalScore = this.scoreRecord(record, normalizedQuery, queryTerms, sessionId, intent);
        const semanticScore = Math.max(0, vectorScoreById.get(record.id) ?? 0);
        const semanticBoost = semanticScore >= 0.55 ? 0.08 : 0;
        const score = lexicalScore * 0.64 + semanticScore * 0.36 + semanticBoost;
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

    const selected = this.selectRecords(ranked, limit);
    const prompt = this.formatRetrievedContext(selected.map(({ record }) => record));

    return {
      prompt,
      items: selected.map(({ record }) => record),
    };
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

    return facts;
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

  private selectRecords(ranked: RetrievedMemory[], limit: number): RetrievedMemory[] {
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

    const maxPerSource: Record<MemorySource, number> = {
      assessmentProfile: 1,
      chatMessage: 3,
      chatSummary: 3,
      journalEntry: 3,
      journalChunk: 3,
      durableFact: 2,
    };

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

  private formatRetrievedContext(records: MemoryRecord[]): string {
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

    const sections: string[] = [];

    if (profile.length) {
      sections.push(
        `### Stable user context\n${profile
          .map((record) => `- ${this.compactText(record.excerpt || record.content, 220)}`)
          .join("\n")}`,
      );
    }

    if (facts.length) {
      sections.push(
        `### Relevant personal facts\n${facts
          .map((record) => `- ${this.formatMemoryLine(record)}`)
          .join("\n")}`,
      );
    }

    if (journals.length) {
      sections.push(
        `### Relevant journal memory\n${journals
          .map((record) => `- ${this.formatMemoryLine(record)}`)
          .join("\n")}`,
      );
    }

    if (chats.length) {
      sections.push(
        `### Related conversation memory\n${chats
          .map((record) => `- ${this.formatMemoryLine(record)}`)
          .join("\n")}`,
      );
    }

    const prompt = `## Retrieved memory\nUse these only when directly relevant to the user's current turn.\nPrioritize continuity with the user's own words from recent chat and journal entries.\nDo not sound clinical or robotic when using memory.\n${sections.join(
      "\n\n",
    )}`;

    return this.compactText(prompt, MAX_CONTEXT_CHARS);
  }

  private formatMemoryLine(record: MemoryRecord): string {
    if (record.source === "durableFact") {
      const answer = typeof record.metadata.answer === "string"
        ? record.metadata.answer
        : record.excerpt || record.content;
      return this.compactText(answer, 180);
    }

    const dateLabel = this.formatDateLabel(record.occurredAt);
    const title = record.title?.trim() ? `"${record.title.trim()}" ` : "";
    const excerpt = this.compactText(record.excerpt || record.content, 180);
    const tagLabel = record.tags.length ? ` Tags: ${record.tags.slice(0, 4).join(", ")}.` : "";
    return `[${dateLabel}] ${title}${excerpt}.${tagLabel}`;
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
