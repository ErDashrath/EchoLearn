/**
 * AI Provider Abstraction Layer
 * 
 * Unified interface that the frontend talks to. Implementations:
 * - WebLLMProvider: In-browser inference via WebGPU (web fallback)
 * - TauriProvider:  Rust-native inference via llama.cpp (desktop, faster)
 * 
 * The frontend never knows which backend is running — it just calls
 * the provider methods.
 * 
 * @module services/providers/ai-provider
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AIModel {
  id: string;
  name: string;
  size: string;
  sizeGB: number;
  description: string;
  parameters: string;
}

export interface AIGenerationConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface AIProgress {
  progress: number;
  text: string;
  loaded?: number;
  total?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

export interface RAGContext {
  relevantMessages: Array<{
    content: string;
    role: string;
    similarity: number;
    timestamp: string;
  }>;
  relevantJournals: Array<{
    content: string;
    similarity: number;
    timestamp: string;
    mood?: string;
  }>;
}

export type AIProviderType = 'webllm' | 'tauri';
export type AIProviderEvent = 'modelChange' | 'cacheChange' | 'ready' | 'error';
type AIProviderEventListener = (data?: any) => void;

// =============================================================================
// PROVIDER INTERFACE
// =============================================================================

export interface AIProvider {
  readonly type: AIProviderType;

  // Lifecycle
  initialize(): Promise<boolean>;
  isReady(): boolean;
  dispose(): void;

  // Model management
  getAvailableModels(): AIModel[];
  getCachedModels(): string[];
  getCachedModelsAsync(): Promise<string[]>;
  getCachedModelsWithTimestamps?(): Promise<Array<{modelId: string, timestamp: number}>>;
  autoLoadMostRecentModel?(): Promise<boolean>;
  getActiveModel(): string | null;
  loadModel(modelId: string, onProgress?: (progress: AIProgress) => void): Promise<boolean>;
  deleteModel(modelId: string): Promise<boolean>;
  isModelLoaded(): boolean;
  isInitializingModel(): boolean;

  // Model state
  setActiveModel?(modelId: string): void;
  deactivateModel?(): Promise<void>;
  clearModelCache?(): void;

  // Generation
  generateResponse(
    messages: ChatMessage[],
    config?: AIGenerationConfig,
    systemPrompt?: string,
    sessionId?: string,
    useRag?: boolean,
  ): AsyncGenerator<string, void, unknown>;
  stopGeneration(): Promise<void>;
  isGenerating(): boolean;

  // Embeddings (optional — WebLLM doesn't support this)
  supportsEmbeddings(): boolean;
  generateEmbedding?(text: string): Promise<number[]>;

  // RAG (optional — only Tauri provider)
  supportsRAG(): boolean;
  searchSimilar?(
    query: string,
    userId: string,
    limit?: number,
  ): Promise<RAGContext>;
  storeMessage?(
    userId: string,
    sessionId: string,
    role: string,
    content: string,
    intent?: string,
  ): Promise<void>;
  storeSummary?(
    sessionId: string,
    summary: string,
    keyTopics?: string[],
  ): Promise<void>;

  // Events
  on(event: AIProviderEvent, listener: AIProviderEventListener): () => void;
}

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

class AIProviderRegistry {
  private currentProvider: AIProvider | null = null;
  private providers: Map<AIProviderType, () => Promise<AIProvider>> = new Map();

  /**
   * Register a provider factory
   */
  register(type: AIProviderType, factory: () => Promise<AIProvider>): void {
    this.providers.set(type, factory);
  }

  /**
   * Get the current active provider, or initialize the best available one
   */
  async getProvider(): Promise<AIProvider> {
    if (this.currentProvider) return this.currentProvider;

    // Prefer Tauri if running inside a Tauri window
    if (this.isTauri() && this.providers.has('tauri')) {
      try {
        const factory = this.providers.get('tauri')!;
        this.currentProvider = await factory();
        const ok = await this.currentProvider.initialize();
        if (ok) {
          console.log('✅ Using Tauri (Rust) AI provider');
          return this.currentProvider;
        }
      } catch (err) {
        console.warn('Tauri provider failed, falling back to WebLLM:', err);
        this.currentProvider = null;
      }
    }

    // Fallback to WebLLM
    if (this.providers.has('webllm')) {
      const factory = this.providers.get('webllm')!;
      this.currentProvider = await factory();
      await this.currentProvider.initialize();
      console.log('✅ Using WebLLM (browser) AI provider');
      return this.currentProvider;
    }

    throw new Error('No AI provider available');
  }

  /**
   * Force switch to a specific provider
   */
  async switchProvider(type: AIProviderType): Promise<AIProvider> {
    if (this.currentProvider) {
      this.currentProvider.dispose();
      this.currentProvider = null;
    }

    const factory = this.providers.get(type);
    if (!factory) throw new Error(`Provider ${type} not registered`);

    this.currentProvider = await factory();
    await this.currentProvider.initialize();
    return this.currentProvider;
  }

  /**
   * Check if running inside Tauri
   */
  isTauri(): boolean {
    return !!(window as any).__TAURI_INTERNALS__;
  }

  /**
   * Get current provider type
   */
  getCurrentType(): AIProviderType | null {
    return this.currentProvider?.type ?? null;
  }
}

export const aiProviderRegistry = new AIProviderRegistry();
export default aiProviderRegistry;
