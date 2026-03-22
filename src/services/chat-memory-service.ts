/**
 * F010: Chat Memory Service
 * 
 * Smart conversation memory management for efficient LLM context.
 * Keeps recent messages in full, summarizes older ones.
 * 
 * Strategy:
 * - Recent Window: Last N messages kept in full (default: 6)
 * - Rolling Summary: Condensed version of older conversations
 * - Key Topics: Extracted themes and important mentions
 * - Auto-Update: Summary refreshes every X new messages
 * 
 * @module services/chat-memory-service
 */

import { storageService } from './storage-service';

// =============================================================================
// INTENT DETECTION  (Layer 1 — lightweight regex, zero LLM calls)
// =============================================================================

export type MessageIntent =
  | 'crisis'
  | 'distress'
  | 'question'
  | 'positive'
  | 'goal'
  | 'neutral';

const CRISIS_PATTERN =
  /\b(suicide|kill myself|end my life|not worth living|want to die|no reason to live|self.harm|hurt myself)\b/i;
const DISTRESS_PATTERN =
  /\b(anxious|anxiety|depressed|depression|overwhelmed|can'?t cope|hopeless|helpless|stressed|exhausted|numb|empty|panic|scared|terrified|crying|breakdown)\b/i;
const POSITIVE_PATTERN =
  /\b(better|improving|grateful|thankful|happy|hopeful|progress|achieved|accomplished|proud|calm|peaceful|feeling good)\b/i;
const GOAL_PATTERN =
  /\b(want to|trying to|working on|planning to|my goal|I aim|I hope to|I need to)\b/i;
const QUESTION_PATTERN = /\?\s*$|\b(how do I|what should|why do|can you help|what is|how can)\b/i;

/**
 * Classify user message intent without any LLM call.
 * Used to tag stored messages and adapt retrieval/response tone.
 */
export function detectIntent(content: string): MessageIntent {
  if (CRISIS_PATTERN.test(content)) return 'crisis';
  if (DISTRESS_PATTERN.test(content)) return 'distress';
  if (QUESTION_PATTERN.test(content)) return 'question';
  if (POSITIVE_PATTERN.test(content)) return 'positive';
  if (GOAL_PATTERN.test(content)) return 'goal';
  return 'neutral';
}

// =============================================================================
// ENTITY / PINNED MEMORY  (Layer 2 — always-present user facts)
// =============================================================================

export interface EntityMemory {
  /** User's first name if mentioned */
  name: string | null;
  /** Most recently stated goal */
  currentGoal: string | null;
  /** Most recently stated concern */
  primaryConcern: string | null;
  /** Mood derived from recent intent signals */
  recentMood: 'positive' | 'distressed' | 'neutral';
  lastUpdatedAt: string;
}

const NAME_PATTERNS = [
  /\bmy name is ([A-Z][a-z]+)/i,
  /\bcall me ([A-Z][a-z]+)/i,
  /\bI am ([A-Z][a-z]{2,})\b/i,
];
const GOAL_EXTRACT =
  /\b(?:my goal is|I want to|I'?m trying to|I'?m working on|I need to)\s+([^.!?\n]{5,60})/i;
const CONCERN_EXTRACT =
  /\b(?:worried about|struggling with|anxious about|stressed about|concerned about|dealing with)\s+([^.!?\n]{5,60})/i;

/**
 * Update entity memory from recent messages. Pure function — no side effects.
 * Call on every new message; cost is negligible (regex only).
 */
export function extractEntities(
  existing: EntityMemory | null,
  messages: ChatMessage[],
): EntityMemory {
  const base: EntityMemory = existing ?? {
    name: null,
    currentGoal: null,
    primaryConcern: null,
    recentMood: 'neutral',
    lastUpdatedAt: new Date().toISOString(),
  };

  const userMessages = messages.filter(m => m.role === 'user').slice(-10);
  const combined = userMessages.map(m => m.content).join(' ');

  // Name extraction — only once; don't overwrite once known
  if (!base.name) {
    for (const pat of NAME_PATTERNS) {
      const m = combined.match(pat);
      if (m && m[1].length <= 20) {
        base.name = m[1];
        break;
      }
    }
  }

  // Goal — always update to most recent
  const goalMatch = combined.match(GOAL_EXTRACT);
  if (goalMatch) base.currentGoal = goalMatch[1].trim().slice(0, 60);

  // Concern — always update to most recent
  const concernMatch = combined.match(CONCERN_EXTRACT);
  if (concernMatch) base.primaryConcern = concernMatch[1].trim().slice(0, 60);

  // Mood from last 3 intents
  const recentIntents = userMessages.slice(-3).map(m => detectIntent(m.content));
  if (recentIntents.includes('crisis') || recentIntents.includes('distress')) {
    base.recentMood = 'distressed';
  } else if (recentIntents.filter(i => i === 'positive').length >= 2) {
    base.recentMood = 'positive';
  } else {
    base.recentMood = 'neutral';
  }

  base.lastUpdatedAt = new Date().toISOString();
  return base;
}

/**
 * Render entity memory as a compact 1-line string (~40 tokens).
 * Returns empty string if no facts have been extracted yet.
 */
export function formatEntityMemory(entity: EntityMemory): string {
  const parts: string[] = [];
  if (entity.name) parts.push(`name: ${entity.name}`);
  if (entity.currentGoal) parts.push(`goal: ${entity.currentGoal}`);
  if (entity.primaryConcern) parts.push(`concern: ${entity.primaryConcern}`);
  if (parts.length === 0) return '';
  const moodNote = entity.recentMood !== 'neutral' ? `, mood: ${entity.recentMood}` : '';
  return `[User — ${parts.join(', ')}${moodNote}]`;
}

// =============================================================================
// TYPES
// =============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ConversationSummary {
  /** Condensed summary of conversation history */
  summary: string;
  /** Key topics discussed */
  keyTopics: string[];
  /** Emotional themes detected */
  emotionalThemes: string[];
  /** Important user mentions (goals, concerns, etc.) */
  userMentions: string[];
  /** Number of messages summarized */
  messageCount: number;
  /** Last updated timestamp */
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  summary: ConversationSummary | null;
  /** Lightweight pinned user facts — always included in every prompt */
  entityMemory?: EntityMemory;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryContext {
  /** Recent messages to include in full */
  recentMessages: ChatMessage[];
  /** Summary of older conversation */
  summary: ConversationSummary | null;
  /** Formatted context string for LLM */
  contextPrompt: string;
}

export interface MemoryConfig {
  /** Number of recent messages to keep in full (default: 6) */
  recentWindowSize: number;
  /** Summarize after this many new messages (default: 4) */
  summarizeThreshold: number;
  /** Max tokens for summary (approximate) */
  maxSummaryLength: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_CONFIG: MemoryConfig = {
  recentWindowSize: 4,      // 4 turns ≈ 300 tokens — was 6; saves tokens for generation
  summarizeThreshold: 4,
  maxSummaryLength: 200,    // compact summaries for small LLMs — was 500
};

// =============================================================================
// CONTEXT TOKEN BUDGET  (≈ 4 English chars per token)
// Target: keep total memory overhead ≤ 600 tokens so small LLMs (2048 ctx)
// have ≥ 1400 tokens available for the actual conversation + generation.
// =============================================================================

const CONTEXT_BUDGET = {
  ENTITY_CHARS: 160,   // ~40  tokens — pinned user facts
  SUMMARY_CHARS: 280,  // ~70  tokens — rolling session summary
  RAG_CHARS: 480,      // ~120 tokens — semantic retrieval (conditional, deduped)
} as const;

// =============================================================================
// SUMMARIZATION PROMPT
// =============================================================================

const SUMMARIZATION_PROMPT = `Summarize this mental health conversation in 1-2 short sentences and list up to 3 key topics.
Output only valid JSON (no markdown):
{
  "summary": "1-2 sentences under 50 words",
  "keyTopics": ["topic1", "topic2"],
  "emotionalThemes": [],
  "userMentions": []
}

Conversation to summarize:
`;

// =============================================================================
// SERVICE CLASS
// =============================================================================

class ChatMemoryService {
  private config: MemoryConfig;
  private messagesSinceSummary: number = 0;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new chat session
   */
  async createSession(userId: string, title?: string): Promise<ChatSession> {
    const session: ChatSession = {
      id: this.generateId(),
      userId,
      title: title || `Chat ${new Date().toLocaleDateString()}`,
      messages: [],
      summary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<ChatSession[]> {
    try {
      const allItems = await storageService.chats.getAll();
      const sessions = allItems
        .map(item => item.value as ChatSession)
        .filter(s => s && s.userId === userId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return sessions;
    } catch (error) {
      console.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Get a specific session
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      return await storageService.chats.get(sessionId);
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Save a session
   */
  async saveSession(session: ChatSession): Promise<boolean> {
    try {
      session.updatedAt = new Date().toISOString();
      await storageService.chats.save(session.id, session);
      return true;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await storageService.chats.remove(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  // ===========================================================================
  // MESSAGE MANAGEMENT
  // ===========================================================================

  /**
   * Add a message to a session
   */
  async addMessage(
    session: ChatSession,
    role: 'user' | 'assistant',
    content: string
  ): Promise<ChatSession> {
    const message: ChatMessage = {
      id: this.generateId(),
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    session.messages.push(message);
    this.messagesSinceSummary++;

    // Auto-generate title from first user message
    if (session.messages.length === 1 && role === 'user') {
      session.title = this.generateTitle(content);
    }

    await this.saveSession(session);
    return session;
  }

  /**
   * Generate a title from the first message
   */
  private generateTitle(content: string): string {
    // Take first 50 chars, cut at word boundary
    const maxLength = 50;
    if (content.length <= maxLength) return content;
    
    const truncated = content.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  // ===========================================================================
  // MEMORY CONTEXT
  // ===========================================================================

  /**
   * Get memory context for LLM prompt.
   * Assembles: entity memory + rolling summary/fallback, within token budget.
   */
  getMemoryContext(session: ChatSession): MemoryContext {
    const { recentWindowSize } = this.config;
    const allMessages = session.messages.filter(m => m.role !== 'system');

    const recentMessages = allMessages.slice(-recentWindowSize);
    const olderMessages = allMessages.slice(0, -recentWindowSize);

    const contextParts: string[] = [];

    // Layer 1: Pinned entity memory (~40 tokens — always present if available)
    if (session.entityMemory) {
      const entityStr = formatEntityMemory(session.entityMemory);
      if (entityStr) contextParts.push(entityStr.slice(0, CONTEXT_BUDGET.ENTITY_CHARS));
    }

    // Layer 2: Rolling summary or fallback hints
    if (olderMessages.length > 0) {
      if (session.summary) {
        contextParts.push(
          this.formatCompactSummary(session.summary).slice(0, CONTEXT_BUDGET.SUMMARY_CHARS),
        );
      } else {
        const fallback = this.buildFallbackHints(olderMessages);
        if (fallback) contextParts.push(fallback);
      }
    }

    return {
      recentMessages,
      summary: session.summary,
      contextPrompt: contextParts.join('\n'),
    };
  }

  /**
   * Build a complete, token-budget-aware context packet for the system prompt.
   * Includes entity memory + summary + optional RAG block in priority order.
   *
   * @param session     Current chat session
   * @param ragContext  Pre-formatted RAG string (already deduped & capped)
   */
  buildContextPacket(session: ChatSession, ragContext?: string): string {
    const parts: string[] = [];

    // Layer 1: Entity memory
    if (session.entityMemory) {
      const entityStr = formatEntityMemory(session.entityMemory);
      if (entityStr) parts.push(entityStr.slice(0, CONTEXT_BUDGET.ENTITY_CHARS));
    }

    // Layer 2: Summary or fallback
    const { recentWindowSize } = this.config;
    const allMessages = session.messages.filter(m => m.role !== 'system');
    const olderMessages = allMessages.slice(0, -recentWindowSize);

    if (olderMessages.length > 0) {
      if (session.summary) {
        parts.push(
          this.formatCompactSummary(session.summary).slice(0, CONTEXT_BUDGET.SUMMARY_CHARS),
        );
      } else {
        const fallback = this.buildFallbackHints(olderMessages);
        if (fallback) parts.push(fallback);
      }
    }

    // Layer 3: Semantic RAG context (conditional — caller handles dedup & scoring)
    if (ragContext && ragContext.trim()) {
      parts.push(ragContext.slice(0, CONTEXT_BUDGET.RAG_CHARS));
    }

    return parts.join('\n');
  }

  /** Compact 1-line summary for injection into system prompt */
  private formatCompactSummary(summary: ConversationSummary): string {
    let text = `[Prior context: ${summary.summary}`;
    if (summary.keyTopics.length > 0) {
      text += ` Topics: ${summary.keyTopics.slice(0, 3).join(', ')}.`;
    }
    text += ']';
    return text;
  }

  /**
   * Lightweight continuity hints from older messages before first summary.
   * Extracts at most 2 recent user snippets (~80 chars each).
   */
  private buildFallbackHints(olderMessages: ChatMessage[]): string {
    const userMsgs = olderMessages.filter(m => m.role === 'user').slice(-2);
    if (userMsgs.length === 0) return '';
    const hints = userMsgs.map(m => m.content.replace(/\s+/g, ' ').slice(0, 80)).join('; ');
    return `[Earlier: ${hints}]`;
  }

  /**
   * @deprecated Use buildContextPacket() instead. Kept for backward compat.
   */
  private formatSummaryForPrompt(summary: ConversationSummary): string {
    return this.formatCompactSummary(summary) + '\n';
  }

  /**
   * Check if summary update is needed
   */
  needsSummaryUpdate(session: ChatSession): boolean {
    const { recentWindowSize, summarizeThreshold } = this.config;
    const totalMessages = session.messages.filter(m => m.role !== 'system').length;
    
    // Need at least enough messages to have some older ones
    if (totalMessages <= recentWindowSize) return false;

    // Check if enough new messages since last summary
    const olderMessageCount = totalMessages - recentWindowSize;
    const summarizedCount = session.summary?.messageCount || 0;
    const unsummarizedCount = olderMessageCount - summarizedCount;

    return unsummarizedCount >= summarizeThreshold;
  }

  /**
   * Generate summary of older messages (to be called with LLM)
   * Returns the prompt to send to LLM for summarization
   */
  generateSummaryPrompt(session: ChatSession): string | null {
    const { recentWindowSize } = this.config;
    const allMessages = session.messages.filter(m => m.role !== 'system');
    const olderMessages = allMessages.slice(0, -recentWindowSize);

    if (olderMessages.length === 0) return null;

    // Format messages for summarization
    let conversationText = '';
    
    // Include previous summary if exists
    if (session.summary) {
      conversationText += `Previous summary: ${session.summary.summary}\n\n`;
      conversationText += 'New messages to incorporate:\n';
    }

    // Add older messages that haven't been summarized
    const startIndex = session.summary?.messageCount || 0;
    const messagesToSummarize = olderMessages.slice(startIndex);

    messagesToSummarize.forEach(msg => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      conversationText += `${role}: ${msg.content}\n\n`;
    });

    return SUMMARIZATION_PROMPT + conversationText;
  }

  /**
   * Update session with new summary
   */
  async updateSummary(
    session: ChatSession,
    summaryResponse: string
  ): Promise<ChatSession> {
    try {
      // Parse LLM response
      const parsed = this.parseSummaryResponse(summaryResponse);
      
      const { recentWindowSize } = this.config;
      const olderMessageCount = session.messages.filter(m => m.role !== 'system').length - recentWindowSize;

      session.summary = {
        ...parsed,
        messageCount: Math.max(0, olderMessageCount),
        updatedAt: new Date().toISOString(),
      };

      this.messagesSinceSummary = 0;
      await this.saveSession(session);
      return session;
    } catch (error) {
      console.error('Failed to update summary:', error);
      return session;
    }
  }

  /**
   * Parse LLM summary response
   */
  private parseSummaryResponse(response: string): Omit<ConversationSummary, 'messageCount' | 'updatedAt'> {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Conversation in progress.',
          keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
          emotionalThemes: Array.isArray(parsed.emotionalThemes) ? parsed.emotionalThemes : [],
          userMentions: Array.isArray(parsed.userMentions) ? parsed.userMentions : [],
        };
      }
    } catch (e) {
      console.warn('Failed to parse summary JSON, using fallback');
    }

    // Fallback: use the response as the summary
    return {
      summary: response.substring(0, 500),
      keyTopics: [],
      emotionalThemes: [],
      userMentions: [],
    };
  }

  /**
   * Create a quick local summary without LLM (fallback)
   * Uses simple extraction for when LLM is not available
   */
  createQuickSummary(session: ChatSession): ConversationSummary {
    const { recentWindowSize } = this.config;
    const allMessages = session.messages.filter(m => m.role !== 'system');
    const olderMessages = allMessages.slice(0, -recentWindowSize);

    if (olderMessages.length === 0) {
      return {
        summary: 'New conversation.',
        keyTopics: [],
        emotionalThemes: [],
        userMentions: [],
        messageCount: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    // Extract key information
    const userMessages = olderMessages.filter(m => m.role === 'user');
    const topics = this.extractTopics(userMessages);
    const emotions = this.extractEmotions(userMessages);

    // Create simple summary
    const messageCount = olderMessages.length;
    const summary = `Previous conversation with ${messageCount} messages. ` +
      `User discussed: ${topics.slice(0, 3).join(', ') || 'various topics'}.`;

    return {
      summary,
      keyTopics: topics,
      emotionalThemes: emotions,
      userMentions: [],
      messageCount: olderMessages.length,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract topics from messages (simple keyword extraction)
   */
  private extractTopics(messages: ChatMessage[]): string[] {
    const topicKeywords = [
      'work', 'job', 'career', 'boss', 'colleague',
      'family', 'parent', 'child', 'partner', 'friend',
      'anxiety', 'stress', 'depression', 'worry', 'fear',
      'sleep', 'health', 'exercise', 'diet',
      'relationship', 'love', 'breakup', 'marriage',
      'school', 'study', 'exam', 'college',
      'money', 'finance', 'debt', 'budget',
      'future', 'goal', 'dream', 'plan',
    ];

    const foundTopics = new Set<string>();
    const text = messages.map(m => m.content.toLowerCase()).join(' ');

    topicKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        foundTopics.add(keyword);
      }
    });

    return Array.from(foundTopics).slice(0, 5);
  }

  /**
   * Extract emotional themes from messages
   */
  private extractEmotions(messages: ChatMessage[]): string[] {
    const emotionKeywords: Record<string, string> = {
      'happy': 'happiness', 'glad': 'happiness', 'joy': 'happiness',
      'sad': 'sadness', 'unhappy': 'sadness', 'depressed': 'sadness',
      'anxious': 'anxiety', 'worried': 'anxiety', 'nervous': 'anxiety',
      'angry': 'anger', 'frustrated': 'frustration', 'annoyed': 'frustration',
      'scared': 'fear', 'afraid': 'fear', 'terrified': 'fear',
      'hopeful': 'hope', 'optimistic': 'hope', 'better': 'hope',
      'tired': 'exhaustion', 'exhausted': 'exhaustion', 'drained': 'exhaustion',
      'lonely': 'loneliness', 'alone': 'loneliness', 'isolated': 'loneliness',
      'overwhelmed': 'overwhelm', 'stressed': 'stress', 'pressure': 'stress',
    };

    const foundEmotions = new Set<string>();
    const text = messages.map(m => m.content.toLowerCase()).join(' ');

    Object.entries(emotionKeywords).forEach(([keyword, emotion]) => {
      if (text.includes(keyword)) {
        foundEmotions.add(emotion);
      }
    });

    return Array.from(foundEmotions).slice(0, 4);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryConfig {
    return { ...this.config };
  }

  /**
   * Format messages for display (with truncation for long messages)
   */
  formatMessagePreview(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const chatMemoryService = new ChatMemoryService();
export default chatMemoryService;
