import { pipeline, env } from '@huggingface/transformers';
import { deviceStoreService } from './device-store-service';

env.allowLocalModels = false;
env.useBrowserCache = true;

const VECTOR_STORE_NAME = 'vector_memory_v1';
const VECTOR_MODE_KEY = 'vector-memory-mode';
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const FALLBACK_DIMENSIONS = 384;
const MAX_QUERY_TEXT_LENGTH = 1400;
const MAX_RECORD_TEXT_LENGTH = 2400;
const LOW_MEMORY_GB_THRESHOLD = 8;
const MAX_QUERY_CACHE_ENTRIES = 32;
const MAX_INDEX_CACHE_USERS = 1;
const MAX_INDEX_ITEMS_LOW_MEMORY = 1400;
const MAX_INDEX_ITEMS_STANDARD = 3000;

export interface VectorIndexRecord {
  id: string;
  userId: string;
  source: string;
  sourceId: string;
  sessionId?: string | null;
  title?: string | null;
  content: string;
  excerpt: string;
  tags: string[];
  occurredAt: string;
  updatedAt: string;
}

interface StoredVectorItem {
  id: string;
  source: string;
  sourceId: string;
  sessionId?: string | null;
  occurredAt: string;
  updatedAt: string;
  embedding: number[];
}

interface StoredVectorIndex {
  version: 1;
  model: string;
  dimensions: number;
  updatedAt: string;
  items: StoredVectorItem[];
}

export interface VectorSearchResult {
  id: string;
  score: number;
  source: string;
  sourceId: string;
}

interface VectorSearchOptions {
  topK?: number;
  sessionId?: string | null;
}

export type VectorMemoryMode = 'performance' | 'quality';

class VectorMemoryService {
  private extractor: unknown | null = null;
  private loadingExtractor: Promise<unknown> | null = null;
  private indexCache = new Map<string, StoredVectorIndex>();
  private queryEmbeddingCache = new Map<string, { vector: number[]; timestamp: number }>();
  private lowMemoryMode: boolean;
  private memoryMode: VectorMemoryMode;

  constructor() {
    const defaultMode: VectorMemoryMode = this.detectLowMemoryMode() ? 'performance' : 'quality';
    const persistedMode = this.getPersistedMode();
    this.memoryMode = persistedMode ?? defaultMode;
    this.lowMemoryMode = this.memoryMode === 'performance';
  }

  private detectLowMemoryMode(): boolean {
    if (typeof navigator === 'undefined') {
      return true;
    }

    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (!deviceMemory) {
      return true;
    }

    return deviceMemory <= LOW_MEMORY_GB_THRESHOLD;
  }

  private getPersistedMode(): VectorMemoryMode | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(VECTOR_MODE_KEY);
      if (raw === 'performance' || raw === 'quality') {
        return raw;
      }
    } catch (error) {
      console.warn('Failed to read vector memory mode from localStorage.', error);
    }

    return null;
  }

  private persistMode(mode: VectorMemoryMode): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(VECTOR_MODE_KEY, mode);
    } catch (error) {
      console.warn('Failed to persist vector memory mode to localStorage.', error);
    }
  }

  getMode(): VectorMemoryMode {
    return this.memoryMode;
  }

  setMode(mode: VectorMemoryMode): void {
    if (mode === this.memoryMode) {
      return;
    }

    this.memoryMode = mode;
    this.lowMemoryMode = mode === 'performance';
    this.persistMode(mode);

    if (this.lowMemoryMode) {
      this.extractor = null;
      this.loadingExtractor = null;
    }

    this.queryEmbeddingCache.clear();
  }

  private clampCacheSize<T>(map: Map<string, T>, maxEntries: number): void {
    while (map.size > maxEntries) {
      const oldest = map.keys().next().value;
      if (!oldest) {
        break;
      }
      map.delete(oldest);
    }
  }

  private getMaxIndexItems(): number {
    return this.lowMemoryMode ? MAX_INDEX_ITEMS_LOW_MEMORY : MAX_INDEX_ITEMS_STANDARD;
  }

  private quantizeEmbedding(embedding: number[]): number[] {
    // Trim precision to reduce memory and disk footprint.
    return embedding.map((value) => Math.round(value * 1000) / 1000);
  }

  private rankSourcePriority(source: string): number {
    if (source === 'durableFact') return 5;
    if (source === 'assessmentProfile') return 4;
    if (source === 'chatSummary') return 3;
    if (source === 'journalEntry') return 2;
    if (source === 'journalChunk') return 1;
    return 0;
  }

  private pruneItems(items: StoredVectorItem[]): StoredVectorItem[] {
    const maxItems = this.getMaxIndexItems();
    if (items.length <= maxItems) {
      return items;
    }

    const protectedItems = items
      .filter((item) => this.rankSourcePriority(item.source) >= 3)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, Math.min(320, Math.floor(maxItems * 0.25)));

    const protectedIds = new Set(protectedItems.map((item) => item.id));
    const remaining = items
      .filter((item) => !protectedIds.has(item.id))
      .sort((left, right) => {
        const sourceDelta = this.rankSourcePriority(right.source) - this.rankSourcePriority(left.source);
        if (sourceDelta !== 0) {
          return sourceDelta;
        }
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      })
      .slice(0, Math.max(0, maxItems - protectedItems.length));

    return [...protectedItems, ...remaining];
  }

  private async getExtractor(): Promise<unknown | null> {
    if (this.lowMemoryMode) {
      return null;
    }

    if (this.extractor) {
      return this.extractor;
    }

    if (this.loadingExtractor) {
      return this.loadingExtractor;
    }

    this.loadingExtractor = (async () => {
      try {
        const featureExtractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
        this.extractor = featureExtractor;
        return featureExtractor;
      } catch (error) {
        console.warn('Vector embedding model unavailable, using fallback embeddings.', error);
        this.extractor = null;
        return null;
      } finally {
        this.loadingExtractor = null;
      }
    })();

    return this.loadingExtractor;
  }

  private normalizeText(text: string, maxChars: number): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxChars) {
      return compact;
    }
    return compact.slice(0, maxChars);
  }

  private hashEmbedding(text: string, dimensions = FALLBACK_DIMENSIONS): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    const normalized = this.normalizeText(text.toLowerCase(), MAX_RECORD_TEXT_LENGTH);
    if (!normalized) {
      return vector;
    }

    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      const index = code % dimensions;
      const sign = (code + i) % 2 === 0 ? 1 : -1;
      vector[index] += sign * (1 + (code % 7) * 0.1);
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm <= 0) {
      return vector;
    }

    return vector.map((value) => value / norm);
  }

  private async embedText(text: string): Promise<number[]> {
    const normalized = this.normalizeText(text, MAX_RECORD_TEXT_LENGTH);
    if (!normalized) {
      return new Array<number>(FALLBACK_DIMENSIONS).fill(0);
    }

    const extractor = await this.getExtractor();
    if (!extractor) {
      return this.hashEmbedding(normalized);
    }

    try {
      const result = await (extractor as any)(normalized, {
        pooling: 'mean',
        normalize: true,
      });

      const data = result?.data;
      if (data && typeof data.length === 'number' && data.length > 0) {
        return this.quantizeEmbedding(Array.from(data as Iterable<number>));
      }

      return this.hashEmbedding(normalized);
    } catch (error) {
      console.warn('Embedding generation failed, using fallback embedding.', error);
      return this.hashEmbedding(normalized);
    }
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    if (!left.length || !right.length) {
      return 0;
    }

    const length = Math.min(left.length, right.length);
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let i = 0; i < length; i++) {
      dot += left[i] * right[i];
      leftNorm += left[i] * left[i];
      rightNorm += right[i] * right[i];
    }

    if (leftNorm <= 0 || rightNorm <= 0) {
      return 0;
    }

    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  }

  private buildRecordText(record: VectorIndexRecord): string {
    const titlePart = record.title?.trim() ? `${record.title.trim()}. ` : '';
    const tagsPart = record.tags.length ? `Tags: ${record.tags.join(', ')}. ` : '';
    const excerptPart = record.excerpt?.trim() ? `${record.excerpt.trim()}. ` : '';
    return this.normalizeText(`${titlePart}${tagsPart}${excerptPart}${record.content}`, MAX_RECORD_TEXT_LENGTH);
  }

  private async getStoredIndex(userId: string): Promise<StoredVectorIndex> {
    const cached = this.indexCache.get(userId);
    if (cached) {
      return cached;
    }

    const stored = await deviceStoreService.get<StoredVectorIndex>(VECTOR_STORE_NAME, userId);
    const index = stored && Array.isArray(stored.items)
      ? stored
      : {
          version: 1 as const,
          model: EMBEDDING_MODEL,
          dimensions: FALLBACK_DIMENSIONS,
          updatedAt: new Date().toISOString(),
          items: [],
        };

    this.indexCache.set(userId, index);
    this.clampCacheSize(this.indexCache, MAX_INDEX_CACHE_USERS);
    return index;
  }

  private async saveIndex(userId: string, index: StoredVectorIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    index.items = this.pruneItems(index.items);
    this.indexCache.set(userId, index);
    this.clampCacheSize(this.indexCache, MAX_INDEX_CACHE_USERS);
    await deviceStoreService.set(VECTOR_STORE_NAME, userId, index);
  }

  async upsertRecords(userId: string, records: VectorIndexRecord[]): Promise<void> {
    if (!userId || !records.length) {
      return;
    }

    const index = await this.getStoredIndex(userId);
    const byId = new Map(index.items.map((item) => [item.id, item]));

    for (const record of records) {
      const text = this.buildRecordText(record);
      if (!text) {
        continue;
      }

      const embedding = await this.embedText(text);
      const previous = byId.get(record.id);

      byId.set(record.id, {
        id: record.id,
        source: record.source,
        sourceId: record.sourceId,
        sessionId: record.sessionId ?? null,
        occurredAt: record.occurredAt,
        updatedAt: record.updatedAt,
        embedding: this.quantizeEmbedding(embedding),
      });

      if (!index.dimensions && embedding.length > 0) {
        index.dimensions = embedding.length;
      }

      if (previous && previous.embedding.length !== embedding.length) {
        index.dimensions = embedding.length;
      }
    }

    index.items = Array.from(byId.values());
    if (!index.dimensions && index.items.length > 0) {
      index.dimensions = index.items[0].embedding.length || FALLBACK_DIMENSIONS;
    }

    await this.saveIndex(userId, index);
  }

  async deleteByPrefixes(userId: string, prefixes: string[]): Promise<void> {
    if (!userId || !prefixes.length) {
      return;
    }

    const index = await this.getStoredIndex(userId);
    index.items = index.items.filter((item) => !prefixes.some((prefix) => item.id.startsWith(prefix)));
    await this.saveIndex(userId, index);
  }

  async clearUserIndex(userId: string): Promise<void> {
    if (!userId) {
      return;
    }

    this.indexCache.delete(userId);
    const keysToDelete = Array.from(this.queryEmbeddingCache.keys()).filter((key) => key.startsWith(`${userId}::`));
    for (const key of keysToDelete) {
      this.queryEmbeddingCache.delete(key);
    }

    await deviceStoreService.delete(VECTOR_STORE_NAME, userId);
  }

  async search(userId: string, query: string, options: VectorSearchOptions = {}): Promise<VectorSearchResult[]> {
    if (!userId) {
      return [];
    }

    const normalizedQuery = this.normalizeText(query, MAX_QUERY_TEXT_LENGTH);
    if (!normalizedQuery) {
      return [];
    }

    const cacheKey = `${userId}::${normalizedQuery}`;
    const cached = this.queryEmbeddingCache.get(cacheKey);
    const now = Date.now();

    let queryEmbedding: number[];
    if (cached && now - cached.timestamp < 5000) {
      queryEmbedding = cached.vector;
    } else {
      queryEmbedding = await this.embedText(normalizedQuery);
      this.queryEmbeddingCache.set(cacheKey, { vector: queryEmbedding, timestamp: now });
      this.clampCacheSize(this.queryEmbeddingCache, MAX_QUERY_CACHE_ENTRIES);
    }

    const topK = Math.max(1, Math.min(options.topK ?? 20, 80));
    const index = await this.getStoredIndex(userId);
    if (!index.items.length) {
      return [];
    }

    const scored = index.items
      .map((item) => {
        let score = this.cosineSimilarity(queryEmbedding, item.embedding);

        if (options.sessionId && item.sessionId && item.sessionId === options.sessionId) {
          score += 0.035;
        }

        return {
          id: item.id,
          source: item.source,
          sourceId: item.sourceId,
          score,
        };
      })
      .filter((item) => item.score > 0.08)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    return scored;
  }
}

export const vectorMemoryService = new VectorMemoryService();
export default vectorMemoryService;
