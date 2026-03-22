/**
 * F017-F020: Journal Service
 * 
 * Handles journal entry storage, AI analysis, and retrieval.
 * Uses encrypted storage for privacy.
 * 
 * @module services/journal-service
 */

import { webllmService } from './webllm-service';
import { deviceMemoryService } from './device-memory-service';
import { storageService } from './storage-service';

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

const POSITIVE_SENTIMENT_HINTS: Array<[string, number]> = [
  ['hopeful', 0.32],
  ['optimistic', 0.32],
  ['positive', 0.24],
  ['grateful', 0.28],
  ['thankful', 0.28],
  ['relieved', 0.24],
  ['calm', 0.22],
  ['peaceful', 0.28],
  ['better', 0.18],
  ['improving', 0.22],
  ['progress', 0.2],
  ['productive', 0.2],
  ['focused', 0.14],
  ['focus', 0.12],
  ['motivated', 0.22],
  ['proud', 0.2],
  ['supported', 0.18],
  ['happy', 0.26],
  ['joy', 0.28],
  ['good', 0.12],
  ['great', 0.18],
  ['love', 0.18],
];

const NEGATIVE_SENTIMENT_HINTS: Array<[string, number]> = [
  ['anxious', 0.28],
  ['anxiety', 0.28],
  ['stress', 0.22],
  ['stressed', 0.26],
  ['overwhelmed', 0.34],
  ['panic', 0.4],
  ['sad', 0.24],
  ['depressed', 0.4],
  ['hopeless', 0.45],
  ['lonely', 0.24],
  ['angry', 0.24],
  ['frustrated', 0.22],
  ['worried', 0.22],
  ['worry', 0.2],
  ['afraid', 0.24],
  ['fear', 0.22],
  ['tired', 0.12],
  ['exhausted', 0.26],
  ['burnout', 0.32],
  ['burned out', 0.32],
  ['cry', 0.18],
  ['bad', 0.12],
  ['terrible', 0.2],
  ['despite challenges', 0.12],
  ['challenging', 0.08],
  ['struggling', 0.26],
  ['hard', 0.08],
];

const STRESS_HINTS: Array<[string, number]> = [
  ['panic', 4],
  ['overwhelmed', 3],
  ['burnout', 3],
  ['burned out', 3],
  ['stressed', 2.5],
  ['stress', 2],
  ['anxious', 2.5],
  ['anxiety', 2.5],
  ['worried', 1.5],
  ['worry', 1.5],
  ['afraid', 1.5],
  ['exhausted', 1.5],
  ['tired', 1],
  ['frustrated', 1.5],
];

// =============================================================================
// JOURNAL SERVICE CLASS
// =============================================================================

class JournalService {
  private userId: string | null = null;

  /**
   * Set current user for scoped storage
   */
  setUserId(userId: string | null): void {
    this.userId = userId || null;
    if (this.userId) {
      void this.getAllEntries();
    }
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
      const entries = await storageService.journals.get<JournalEntry[]>(
        this.getKey(STORAGE_KEYS.ENTRIES),
      );
      const resolvedEntries = entries || [];
      const normalizedEntries = this.normalizeEntries(resolvedEntries);

      if (this.entriesChanged(resolvedEntries, normalizedEntries)) {
        await storageService.journals.save(
          this.getKey(STORAGE_KEYS.ENTRIES),
          normalizedEntries,
        );
      }

      if (this.userId && normalizedEntries.length > 0) {
        void deviceMemoryService.syncJournalEntries(this.userId, normalizedEntries);
      }

      return normalizedEntries;
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
    await storageService.journals.save(this.getKey(STORAGE_KEYS.ENTRIES), entries);
    await this.updateStats();

    console.log('📝 Journal entry created:', newEntry.id);
    if (this.userId) {
      await deviceMemoryService.upsertJournalEntry(this.userId, newEntry);
    }

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

    await storageService.journals.save(this.getKey(STORAGE_KEYS.ENTRIES), entries);
    await this.updateStats();

    if (this.userId) {
      await deviceMemoryService.upsertJournalEntry(this.userId, entries[index]);
    }

    return entries[index];
  }

  /**
   * Delete an entry
   */
  async deleteEntry(id: string): Promise<boolean> {
    const entries = await this.getAllEntries();
    const filtered = entries.filter(e => e.id !== id);
    
    if (filtered.length === entries.length) return false;

    await storageService.journals.save(this.getKey(STORAGE_KEYS.ENTRIES), filtered);
    await this.updateStats();

    console.log('🗑️ Journal entry deleted:', id);
    if (this.userId) {
      await deviceMemoryService.deleteJournalEntryMemory(this.userId, id);
    }

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
Do not default to 0 for reflective entries. If the entry shows noticeable hope, relief, gratitude, progress, or productive focus, sentimentScore should usually be above 0.15. If the entry shows noticeable distress, hopelessness, panic, or overwhelm, sentimentScore should usually be below -0.15.

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
      const analysis = this.normalizeAnalysis(entry, {
        ...parsed,
        analyzedAt: new Date().toISOString(),
      });

      // Save analysis to entry
      await this.updateEntry(id, { analysis });

      console.log('✅ Analysis complete:', analysis.mood, analysis.stressLevel);
      return analysis;
    } catch (error) {
      console.error('Analysis failed:', error);
      
      // Return basic analysis on failure
      const basicAnalysis = this.createFallbackAnalysis(entry);

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

  private normalizeEntries(entries: JournalEntry[]): JournalEntry[] {
    return entries.map((entry) => {
      if (!entry.analysis) {
        return entry;
      }

      const normalizedAnalysis = this.normalizeAnalysis(entry, entry.analysis);
      if (JSON.stringify(entry.analysis) === JSON.stringify(normalizedAnalysis)) {
        return entry;
      }

      return {
        ...entry,
        analysis: normalizedAnalysis,
      };
    });
  }

  private entriesChanged(original: JournalEntry[], normalized: JournalEntry[]): boolean {
    return JSON.stringify(original) !== JSON.stringify(normalized);
  }

  private normalizeAnalysis(
    entry: JournalEntry,
    rawAnalysis: Partial<JournalAnalysis>,
  ): JournalAnalysis {
    const sentimentProfile = this.estimateSentimentProfile([
      entry.title,
      entry.content,
      typeof rawAnalysis.summary === 'string' ? rawAnalysis.summary : '',
      ...this.normalizeStringArray(rawAnalysis.emotions),
      ...this.normalizeStringArray(rawAnalysis.themes),
    ]);

    const inferredSentiment = this.roundUnitScore(sentimentProfile.score);
    const moodHintScore = this.sentimentFromMood(rawAnalysis.mood);
    const sentimentScore = this.pickDirectionalScore(
      this.coerceUnitScore(rawAnalysis.sentimentScore),
      inferredSentiment,
      moodHintScore,
    );
    const moodScore = this.pickDirectionalScore(
      this.coerceUnitScore(rawAnalysis.moodScore),
      inferredSentiment,
      sentimentScore,
    );
    const stressScore = this.normalizeStressScore(
      rawAnalysis.stressScore,
      rawAnalysis.stressLevel,
      entry.content,
      typeof rawAnalysis.summary === 'string' ? rawAnalysis.summary : '',
    );

    return {
      mood: this.normalizeMood(rawAnalysis.mood, sentimentScore, sentimentProfile),
      moodScore,
      sentimentScore,
      emotions: this.normalizeStringArray(rawAnalysis.emotions),
      stressLevel: this.normalizeStressLevel(rawAnalysis.stressLevel, stressScore),
      stressScore,
      themes: this.normalizeStringArray(rawAnalysis.themes),
      summary: this.normalizeSummary(rawAnalysis.summary, entry, sentimentScore),
      suggestions: this.normalizeSuggestions(rawAnalysis.suggestions, stressScore),
      analyzedAt: this.normalizeAnalyzedAt(rawAnalysis.analyzedAt),
    };
  }

  private createFallbackAnalysis(entry: JournalEntry): JournalAnalysis {
    const sentimentProfile = this.estimateSentimentProfile([entry.title, entry.content]);
    const sentimentScore = this.roundUnitScore(sentimentProfile.score);
    const stressScore = this.normalizeStressScore(null, null, entry.content, '');
    const mood = this.deriveMood(sentimentScore, sentimentProfile);

    return {
      mood,
      moodScore: sentimentScore,
      sentimentScore,
      emotions: ['reflective'],
      stressLevel: this.normalizeStressLevel(null, stressScore),
      stressScore,
      themes: ['personal reflection'],
      summary: this.normalizeSummary('', entry, sentimentScore),
      suggestions: this.normalizeSuggestions([], stressScore),
      analyzedAt: new Date().toISOString(),
    };
  }

  private normalizeMood(
    rawMood: unknown,
    sentimentScore: number,
    sentimentProfile: { positive: number; negative: number; score: number },
  ): JournalAnalysis['mood'] {
    const validMoods: JournalAnalysis['mood'][] = ['positive', 'neutral', 'negative', 'mixed'];
    const derivedMood = this.deriveMood(sentimentScore, sentimentProfile);

    if (typeof rawMood !== 'string' || !validMoods.includes(rawMood as JournalAnalysis['mood'])) {
      return derivedMood;
    }

    const normalizedMood = rawMood as JournalAnalysis['mood'];
    if (normalizedMood === 'neutral' && Math.abs(sentimentScore) >= 0.22) {
      return derivedMood;
    }

    if (normalizedMood === 'positive' && sentimentScore < -0.15) {
      return derivedMood;
    }

    if (normalizedMood === 'negative' && sentimentScore > 0.15) {
      return derivedMood;
    }

    if (
      normalizedMood === 'mixed'
      && sentimentProfile.positive < 0.18
      && sentimentProfile.negative < 0.18
    ) {
      return derivedMood;
    }

    return normalizedMood;
  }

  private deriveMood(
    sentimentScore: number,
    sentimentProfile: { positive: number; negative: number; score: number },
  ): JournalAnalysis['mood'] {
    if (sentimentProfile.positive >= 0.2 && sentimentProfile.negative >= 0.2) {
      return 'mixed';
    }

    if (sentimentScore >= 0.18) {
      return 'positive';
    }

    if (sentimentScore <= -0.18) {
      return 'negative';
    }

    return 'neutral';
  }

  private sentimentFromMood(rawMood: unknown): number {
    switch (rawMood) {
      case 'positive':
        return 0.32;
      case 'negative':
        return -0.32;
      case 'mixed':
        return 0.08;
      default:
        return 0;
    }
  }

  private pickDirectionalScore(
    rawScore: number | null,
    inferredScore: number,
    fallbackScore: number,
  ): number {
    const directionalFallback = Math.abs(inferredScore) >= 0.08 ? inferredScore : fallbackScore;

    if (rawScore === null) {
      return this.roundUnitScore(directionalFallback);
    }

    if (Math.abs(rawScore) < 0.05 && Math.abs(directionalFallback) >= 0.12) {
      return this.roundUnitScore(directionalFallback);
    }

    if (
      Math.sign(rawScore || 0) !== Math.sign(directionalFallback || 0)
      && Math.abs(rawScore) <= 0.15
      && Math.abs(directionalFallback) >= 0.2
    ) {
      return this.roundUnitScore(directionalFallback);
    }

    return this.roundUnitScore(rawScore);
  }

  private normalizeStressScore(
    rawStressScore: unknown,
    rawStressLevel: unknown,
    ...texts: string[]
  ): number {
    const parsedStressScore = this.coerceBoundedNumber(rawStressScore, 0, 10);
    const inferredStressScore = this.estimateStressScore(texts, rawStressLevel);

    if (parsedStressScore === null) {
      return inferredStressScore;
    }

    if (parsedStressScore <= 0.5 && inferredStressScore >= 2.5) {
      return inferredStressScore;
    }

    return this.roundDecimal(parsedStressScore);
  }

  private normalizeStressLevel(
    rawStressLevel: unknown,
    stressScore: number,
  ): JournalAnalysis['stressLevel'] {
    const validLevels: JournalAnalysis['stressLevel'][] = ['low', 'moderate', 'high', 'severe'];
    if (typeof rawStressLevel === 'string' && validLevels.includes(rawStressLevel as JournalAnalysis['stressLevel'])) {
      return rawStressLevel as JournalAnalysis['stressLevel'];
    }

    if (stressScore >= 8) return 'severe';
    if (stressScore >= 6) return 'high';
    if (stressScore >= 3) return 'moderate';
    return 'low';
  }

  private normalizeSummary(rawSummary: unknown, entry: JournalEntry, sentimentScore: number): string {
    if (typeof rawSummary === 'string' && rawSummary.trim()) {
      return rawSummary.trim();
    }

    if (sentimentScore >= 0.18) {
      return 'This entry reflects a generally positive emotional tone with personal reflection.';
    }

    if (sentimentScore <= -0.18) {
      return 'This entry reflects emotional strain and would benefit from supportive reflection.';
    }

    return `This entry captures a reflective moment about ${entry.title.toLowerCase()}.`;
  }

  private normalizeSuggestions(rawSuggestions: unknown, stressScore: number): string[] {
    const suggestions = this.normalizeStringArray(rawSuggestions);
    if (suggestions.length > 0) {
      return suggestions;
    }

    if (stressScore >= 6) {
      return [
        'Take a short pause to breathe and reset before continuing.',
        'Break the current problem into one smaller next step.',
      ];
    }

    return ['Continue journaling regularly to notice emotional patterns over time.'];
  }

  private normalizeAnalyzedAt(rawAnalyzedAt: unknown): string {
    if (typeof rawAnalyzedAt === 'string' && rawAnalyzedAt.trim()) {
      return rawAnalyzedAt;
    }

    return new Date().toISOString();
  }

  private normalizeStringArray(rawValue: unknown): string[] {
    if (!Array.isArray(rawValue)) {
      return [];
    }

    return Array.from(
      new Set(
        rawValue
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean),
      ),
    );
  }

  private estimateSentimentProfile(texts: string[]): { positive: number; negative: number; score: number } {
    const lowerText = texts.join(' ').toLowerCase();
    const positive = this.sumWeightedHints(lowerText, POSITIVE_SENTIMENT_HINTS);
    const negative = this.sumWeightedHints(lowerText, NEGATIVE_SENTIMENT_HINTS);
    const score = Math.max(-1, Math.min(1, positive - negative));

    return {
      positive,
      negative,
      score,
    };
  }

  private estimateStressScore(texts: string[], rawStressLevel: unknown): number {
    const lowerText = texts.join(' ').toLowerCase();
    const inferredFromText = this.sumWeightedHints(lowerText, STRESS_HINTS);
    const inferredFromLevel = (() => {
      switch (rawStressLevel) {
        case 'low':
          return 2;
        case 'moderate':
          return 5;
        case 'high':
          return 7;
        case 'severe':
          return 9;
        default:
          return 3;
      }
    })();

    return this.roundDecimal(Math.max(inferredFromLevel, Math.min(10, inferredFromText || inferredFromLevel)));
  }

  private sumWeightedHints(text: string, hints: Array<[string, number]>): number {
    return hints.reduce((total, [term, weight]) => {
      return text.includes(term) ? total + weight : total;
    }, 0);
  }

  private coerceUnitScore(rawValue: unknown): number | null {
    return this.coerceBoundedNumber(rawValue, -1, 1);
  }

  private coerceBoundedNumber(rawValue: unknown, min: number, max: number): number | null {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return Math.max(min, Math.min(max, rawValue));
    }

    if (typeof rawValue === 'string') {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        return Math.max(min, Math.min(max, parsed));
      }
    }

    return null;
  }

  private roundUnitScore(value: number): number {
    return this.roundDecimal(Math.max(-1, Math.min(1, value)));
  }

  private roundDecimal(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async updateStats(): Promise<void> {
    const stats = await this.getStats();
    await storageService.journals.save(this.getKey(STORAGE_KEYS.STATS), stats);
  }

  // ===========================================================================
  // DRAFT MANAGEMENT
  // ===========================================================================

  /**
   * Save draft (auto-save)
   */
  async saveDraft(content: string, title?: string): Promise<void> {
    await storageService.journals.save(this.getKey(STORAGE_KEYS.DRAFTS), {
      content,
      title: title || '',
      savedAt: new Date().toISOString(),
    });
  }

  /**
   * Get current draft
   */
  async getDraft(): Promise<{ content: string; title: string; savedAt: string } | null> {
    return storageService.journals.get(this.getKey(STORAGE_KEYS.DRAFTS));
  }

  /**
   * Clear draft
   */
  async clearDraft(): Promise<void> {
    await storageService.journals.remove(this.getKey(STORAGE_KEYS.DRAFTS));
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
