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
  recentWindowSize: 6,
  summarizeThreshold: 4,
  maxSummaryLength: 500,
};

// =============================================================================
// SUMMARIZATION PROMPT
// =============================================================================

const SUMMARIZATION_PROMPT = `You are a conversation summarizer. Analyze the conversation and provide a concise summary.

Output format (JSON):
{
  "summary": "Brief 2-3 sentence summary of the conversation",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "emotionalThemes": ["emotion1", "emotion2"],
  "userMentions": ["important thing user mentioned"]
}

Rules:
- Keep summary under 100 words
- Extract 3-5 key topics maximum
- Note emotional themes (anxiety, hope, frustration, progress, etc.)
- Capture important user mentions (goals, concerns, achievements)
- Focus on information relevant for ongoing support

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
   * Get memory context for LLM prompt
   * Returns recent messages + summary of older ones
   */
  getMemoryContext(session: ChatSession): MemoryContext {
    const { recentWindowSize } = this.config;
    const allMessages = session.messages.filter(m => m.role !== 'system');
    
    // Split into recent and older messages
    const recentMessages = allMessages.slice(-recentWindowSize);
    const olderMessages = allMessages.slice(0, -recentWindowSize);

    // Build context prompt
    let contextPrompt = '';

    // Add summary if we have older messages
    if (session.summary && olderMessages.length > 0) {
      contextPrompt += this.formatSummaryForPrompt(session.summary);
    }

    return {
      recentMessages,
      summary: session.summary,
      contextPrompt,
    };
  }

  /**
   * Format summary for inclusion in LLM prompt
   */
  private formatSummaryForPrompt(summary: ConversationSummary): string {
    let prompt = '\n## Previous Conversation Context:\n';
    prompt += `${summary.summary}\n`;

    if (summary.keyTopics.length > 0) {
      prompt += `\nKey topics discussed: ${summary.keyTopics.join(', ')}\n`;
    }

    if (summary.emotionalThemes.length > 0) {
      prompt += `Emotional themes: ${summary.emotionalThemes.join(', ')}\n`;
    }

    if (summary.userMentions.length > 0) {
      prompt += `Important mentions: ${summary.userMentions.join('; ')}\n`;
    }

    prompt += '\n---\n';
    return prompt;
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
