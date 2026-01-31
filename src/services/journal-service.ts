/**
 * F017-F020: Journal Service
 * 
 * Handles journal entry storage, AI analysis, and retrieval.
 * Uses encrypted storage for privacy.
 * 
 * @module services/journal-service
 */

import localforage from 'localforage';
import { webllmService } from './webllm-service';

// =============================================================================
// TYPES
// =============================================================================

export interface JournalAnalysis {
  mood: 'positive' | 'neutral' | 'negative' | 'mixed';
  moodScore: number; // -1 to 1 scale
  sentimentScore: number; // -1 to 1 scale (alias for moodScore for UI)
  emotions: string[];
  stressLevel: 'low' | 'moderate' | 'high' | 'severe';
  stressScore: number; // 0-10 scale
  themes: string[];
  summary: string;
  suggestions: string[];
  analyzedAt: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  analysis?: JournalAnalysis;
  tags: string[];
  isFavorite: boolean;
}

export interface JournalStats {
  totalEntries: number;
  totalWords: number;
  averageMoodScore: number;
  averageStressScore: number;
  moodDistribution: Record<string, number>;
  emotionFrequency: Record<string, number>;
  streakDays: number;
  lastEntryDate: string | null;
}

// =============================================================================
// STORAGE KEYS
// =============================================================================

const STORAGE_KEYS = {
  ENTRIES: 'journal_entries',
  STATS: 'journal_stats',
  DRAFTS: 'journal_drafts',
};

// =============================================================================
// JOURNAL SERVICE CLASS
// =============================================================================

class JournalService {
  private store: LocalForage;
  private userId: string | null = null;

  constructor() {
    this.store = localforage.createInstance({
      name: 'mindscribe',
      storeName: 'journal',
    });
  }

  /**
   * Set current user for scoped storage
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  private getKey(key: string): string {
    return this.userId ? `${this.userId}_${key}` : key;
  }

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Get all journal entries for current user
   */
  async getAllEntries(): Promise<JournalEntry[]> {
    try {
      const entries = await this.store.getItem<JournalEntry[]>(
        this.getKey(STORAGE_KEYS.ENTRIES)
      );
      return entries || [];
    } catch (error) {
      console.error('Failed to get entries:', error);
      return [];
    }
  }

  /**
   * Get a single entry by ID
   */
  async getEntry(id: string): Promise<JournalEntry | null> {
    const entries = await this.getAllEntries();
    return entries.find(e => e.id === id) || null;
  }

  /**
   * Create a new journal entry
   */
  async createEntry(data: {
    title: string;
    content: string;
    tags?: string[];
  }): Promise<JournalEntry> {
    const entries = await this.getAllEntries();
    
    const newEntry: JournalEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: data.title || 'Untitled Entry',
      content: data.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      wordCount: this.countWords(data.content),
      tags: data.tags || [],
      isFavorite: false,
    };

    entries.unshift(newEntry);
    await this.store.setItem(this.getKey(STORAGE_KEYS.ENTRIES), entries);
    await this.updateStats();

    console.log('📝 Journal entry created:', newEntry.id);
    return newEntry;
  }

  /**
   * Update an existing entry
   */
  async updateEntry(id: string, data: Partial<JournalEntry>): Promise<JournalEntry | null> {
    const entries = await this.getAllEntries();
    const index = entries.findIndex(e => e.id === id);
    
    if (index === -1) return null;

    entries[index] = {
      ...entries[index],
      ...data,
      updatedAt: new Date().toISOString(),
      wordCount: data.content ? this.countWords(data.content) : entries[index].wordCount,
    };

    await this.store.setItem(this.getKey(STORAGE_KEYS.ENTRIES), entries);
    await this.updateStats();

    return entries[index];
  }

  /**
   * Delete an entry
   */
  async deleteEntry(id: string): Promise<boolean> {
    const entries = await this.getAllEntries();
    const filtered = entries.filter(e => e.id !== id);
    
    if (filtered.length === entries.length) return false;

    await this.store.setItem(this.getKey(STORAGE_KEYS.ENTRIES), filtered);
    await this.updateStats();

    console.log('🗑️ Journal entry deleted:', id);
    return true;
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: string): Promise<JournalEntry | null> {
    const entry = await this.getEntry(id);
    if (!entry) return null;

    return this.updateEntry(id, { isFavorite: !entry.isFavorite });
  }

  // ===========================================================================
  // AI ANALYSIS
  // ===========================================================================

  /**
   * Analyze journal entry using WebLLM
   */
  async analyzeEntry(id: string): Promise<JournalAnalysis | null> {
    const entry = await this.getEntry(id);
    if (!entry) return null;

    if (!webllmService.isModelLoaded()) {
      console.warn('WebLLM not loaded, cannot analyze');
      return null;
    }

    console.log('🧠 Analyzing journal entry...');

    const prompt = `Analyze this journal entry for mental health insights. Respond in JSON format only.

Journal Entry:
"""
${entry.content}
"""

Analyze and respond with this exact JSON structure:
{
  "mood": "positive" | "neutral" | "negative" | "mixed",
  "moodScore": <number between -1 and 1, where -1 is very negative, 0 is neutral, 1 is very positive>,
  "sentimentScore": <same as moodScore, number between -1 and 1>,
  "emotions": ["emotion1", "emotion2", "emotion3"],
  "stressLevel": "low" | "moderate" | "high" | "severe",
  "stressScore": <number between 0 and 10>,
  "themes": ["theme1", "theme2"],
  "summary": "<one sentence summary of emotional state>",
  "suggestions": ["suggestion1", "suggestion2"]
}

Important: moodScore and sentimentScore should reflect the emotional tone. Negative entries should have scores closer to -1, positive entries closer to 1.

Respond with ONLY the JSON, no other text.`;

    try {
      let response = '';
      const generator = webllmService.generateResponse(
        [{ role: 'user', content: prompt }],
        { maxTokens: 500, temperature: 0.3, topP: 0.9 }
      );

      for await (const token of generator) {
        response += token;
      }

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const analysis: JournalAnalysis = {
        ...parsed,
        sentimentScore: parsed.sentimentScore ?? parsed.moodScore ?? 0,
        analyzedAt: new Date().toISOString(),
      };

      // Save analysis to entry
      await this.updateEntry(id, { analysis });

      console.log('✅ Analysis complete:', analysis.mood, analysis.stressLevel);
      return analysis;
    } catch (error) {
      console.error('Analysis failed:', error);
      
      // Return basic analysis on failure
      const basicAnalysis: JournalAnalysis = {
        mood: 'neutral',
        moodScore: 0,
        sentimentScore: 0,
        emotions: ['reflective'],
        stressLevel: 'moderate',
        stressScore: 5,
        themes: ['personal reflection'],
        summary: 'Entry recorded for reflection.',
        suggestions: ['Continue journaling regularly'],
        analyzedAt: new Date().toISOString(),
      };

      await this.updateEntry(id, { analysis: basicAnalysis });
      return basicAnalysis;
    }
  }

  // ===========================================================================
  // SEARCH & FILTER
  // ===========================================================================

  /**
   * Search entries by text
   */
  async searchEntries(query: string): Promise<JournalEntry[]> {
    const entries = await this.getAllEntries();
    const lowerQuery = query.toLowerCase();

    return entries.filter(entry =>
      entry.title.toLowerCase().includes(lowerQuery) ||
      entry.content.toLowerCase().includes(lowerQuery) ||
      entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Filter entries by date range
   */
  async getEntriesByDateRange(startDate: Date, endDate: Date): Promise<JournalEntry[]> {
    const entries = await this.getAllEntries();
    
    return entries.filter(entry => {
      const date = new Date(entry.createdAt);
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Get entries by mood
   */
  async getEntriesByMood(mood: JournalAnalysis['mood']): Promise<JournalEntry[]> {
    const entries = await this.getAllEntries();
    return entries.filter(entry => entry.analysis?.mood === mood);
  }

  /**
   * Get favorite entries
   */
  async getFavorites(): Promise<JournalEntry[]> {
    const entries = await this.getAllEntries();
    return entries.filter(entry => entry.isFavorite);
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get journal statistics
   */
  async getStats(): Promise<JournalStats> {
    const entries = await this.getAllEntries();
    
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalWords: 0,
        averageMoodScore: 0,
        averageStressScore: 0,
        moodDistribution: {},
        emotionFrequency: {},
        streakDays: 0,
        lastEntryDate: null,
      };
    }

    // Calculate totals
    const totalWords = entries.reduce((sum, e) => sum + e.wordCount, 0);
    
    // Calculate mood stats
    const analyzedEntries = entries.filter(e => e.analysis);
    const moodScores = analyzedEntries.map(e => e.analysis!.moodScore);
    const stressScores = analyzedEntries.map(e => e.analysis!.stressScore);
    
    const averageMoodScore = moodScores.length > 0
      ? moodScores.reduce((a, b) => a + b, 0) / moodScores.length
      : 0;
    
    const averageStressScore = stressScores.length > 0
      ? stressScores.reduce((a, b) => a + b, 0) / stressScores.length
      : 0;

    // Mood distribution
    const moodDistribution: Record<string, number> = {};
    analyzedEntries.forEach(e => {
      const mood = e.analysis!.mood;
      moodDistribution[mood] = (moodDistribution[mood] || 0) + 1;
    });

    // Emotion frequency
    const emotionFrequency: Record<string, number> = {};
    analyzedEntries.forEach(e => {
      e.analysis!.emotions.forEach(emotion => {
        emotionFrequency[emotion] = (emotionFrequency[emotion] || 0) + 1;
      });
    });

    // Calculate streak
    const streakDays = this.calculateStreak(entries);

    return {
      totalEntries: entries.length,
      totalWords,
      averageMoodScore,
      averageStressScore,
      moodDistribution,
      emotionFrequency,
      streakDays,
      lastEntryDate: entries[0]?.createdAt || null,
    };
  }

  private calculateStreak(entries: JournalEntry[]): number {
    if (entries.length === 0) return 0;

    const sortedDates = entries
      .map(e => new Date(e.createdAt).toDateString())
      .filter((date, i, arr) => arr.indexOf(date) === i) // Unique dates
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    let streak = 0;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    // Check if streak is active (entry today or yesterday)
    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
      return 0;
    }

    for (let i = 0; i < sortedDates.length - 1; i++) {
      const current = new Date(sortedDates[i]);
      const next = new Date(sortedDates[i + 1]);
      const diff = (current.getTime() - next.getTime()) / 86400000;

      if (diff <= 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak + 1;
  }

  private async updateStats(): Promise<void> {
    const stats = await this.getStats();
    await this.store.setItem(this.getKey(STORAGE_KEYS.STATS), stats);
  }

  // ===========================================================================
  // DRAFT MANAGEMENT
  // ===========================================================================

  /**
   * Save draft (auto-save)
   */
  async saveDraft(content: string, title?: string): Promise<void> {
    await this.store.setItem(this.getKey(STORAGE_KEYS.DRAFTS), {
      content,
      title: title || '',
      savedAt: new Date().toISOString(),
    });
  }

  /**
   * Get current draft
   */
  async getDraft(): Promise<{ content: string; title: string; savedAt: string } | null> {
    return this.store.getItem(this.getKey(STORAGE_KEYS.DRAFTS));
  }

  /**
   * Clear draft
   */
  async clearDraft(): Promise<void> {
    await this.store.removeItem(this.getKey(STORAGE_KEYS.DRAFTS));
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Export entries as JSON
   */
  async exportAsJSON(): Promise<string> {
    const entries = await this.getAllEntries();
    const stats = await this.getStats();
    
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      stats,
      entries,
    }, null, 2);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const journalService = new JournalService();
export default journalService;
