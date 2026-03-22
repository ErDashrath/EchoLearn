/**
 * AI Service — drop-in replacement for direct webllmService usage
 *
 * Routes calls through the AIProvider abstraction, so the same
 * hook code works whether the backend is WebLLM or Rust/llama.cpp.
 *
 * @module services/ai-service
 */

import aiProviderRegistry, {
  type AIProvider,
  type AIGenerationConfig,
  type AIProgress,
  type AIProviderEvent,
} from './providers/ai-provider';

// =============================================================================
// AI SERVICE FACADE
// =============================================================================

class AIService {
  private provider: AIProvider | null = null;
  private initializing = false;
  private static readonly DEFAULT_CONFIG: AIGenerationConfig = {
    temperature: 0.5,
    maxTokens: 180,
    topP: 0.85,
  };
  private static readonly STYLE_INSTRUCTION = [
    'Response style requirements:',
    '- Keep replies short and focused (usually 1-4 sentences).',
    '- Sound natural, conversational, and calm.',
    '- Be polite and practical; avoid unnecessary verbosity.',
    '- Only provide long explanations when the user explicitly asks for detail.',
    '- Do not repeat sentences, phrases, or closing lines.',
    '- Do not echo or quote the user message unless the user asks for a recap.',
    '- Do not output separators, transcript markers, role labels, or bracketed stage directions.',
    '- Output only the final assistant reply.',
  ].join('\n');

  /**
   * Ensure a provider is ready; lazy-init on first call.
   */
  private async ensureProvider(): Promise<AIProvider> {
    if (this.provider) return this.provider;

    if (this.initializing) {
      // Wait for in-flight init
      while (this.initializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (this.provider) return this.provider;
    }

    this.initializing = true;
    try {
      this.provider = await aiProviderRegistry.getProvider();
      return this.provider;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Keep output compact by default, while preserving caller overrides.
   */
  private normalizeConfig(config?: AIGenerationConfig): AIGenerationConfig {
    const resolved = config ?? AIService.DEFAULT_CONFIG;
    return {
      ...resolved,
      maxTokens: Math.min(resolved.maxTokens, AIService.DEFAULT_CONFIG.maxTokens),
    };
  }

  /**
   * Enforce concise, well-mannered style across all providers.
   */
  private buildSystemPrompt(systemPrompt?: string): string {
    if (!systemPrompt?.trim()) {
      return AIService.STYLE_INSTRUCTION;
    }
    if (systemPrompt.includes('Response style requirements:')) {
      return systemPrompt;
    }
    return `${systemPrompt}\n\n${AIService.STYLE_INSTRUCTION}`;
  }

  // ─── Model Management ───────────────────────────────────────────────

  async getAvailableModels() {
    const p = await this.ensureProvider();
    return p.getAvailableModels();
  }

  getCachedModels(): string[] {
    return this.provider?.getCachedModels() ?? [];
  }

  async getCachedModelsAsync(): Promise<string[]> {
    const p = await this.ensureProvider();
    return p.getCachedModelsAsync();
  }

  async getCachedModelsWithTimestamps(): Promise<Array<{modelId: string, timestamp: number}>> {
    const p = await this.ensureProvider();
    return p.getCachedModelsWithTimestamps?.() ?? [];
  }

  async autoLoadMostRecentModel(): Promise<boolean> {
    const p = await this.ensureProvider();
    return p.autoLoadMostRecentModel?.() ?? false;
  }

  isModelLoaded(): boolean {
    return this.provider?.isModelLoaded() ?? false;
  }

  isModelCached(modelId: string): boolean {
    return this.getCachedModels().includes(modelId);
  }

  getActiveModel(): string | null {
    return this.provider?.getActiveModel() ?? null;
  }

  async loadModel(
    modelId: string,
    onProgress?: (progress: AIProgress) => void,
    _maxRetries?: number, // accepted but handled internally by each provider
  ): Promise<boolean> {
    const p = await this.ensureProvider();
    return p.loadModel(modelId, onProgress);
  }

  async deleteModel(modelId: string): Promise<boolean> {
    const p = await this.ensureProvider();
    return p.deleteModel(modelId);
  }

  setActiveModel(modelId: string): void {
    this.provider?.setActiveModel?.(modelId);
  }

  async deactivateModel(): Promise<void> {
    const p = await this.ensureProvider();
    await p.deactivateModel?.();
  }

  clearModelCache(): void {
    this.provider?.clearModelCache?.();
  }

  // ─── Generation ─────────────────────────────────────────────────────

  async *generateResponse(
    messages: Array<{ role: string; content: string }>,
    config?: AIGenerationConfig,
    systemPrompt?: string,
    sessionId?: string,
    useRag?: boolean,
  ): AsyncGenerator<string, void, unknown> {
    const p = await this.ensureProvider();
    const normalizedConfig = this.normalizeConfig(config);
    const normalizedPrompt = this.buildSystemPrompt(systemPrompt);
    const chatMessages = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
    yield* p.generateResponse(
      chatMessages,
      normalizedConfig,
      normalizedPrompt,
      sessionId,
      useRag,
    );
  }

  stopGeneration(): void {
    this.provider?.stopGeneration();
  }

  isGenerating(): boolean {
    return this.provider?.isGenerating() ?? false;
  }

  // ─── Embeddings & RAG ───────────────────────────────────────────────

  supportsEmbeddings(): boolean {
    return this.provider?.supportsEmbeddings() ?? false;
  }

  supportsRAG(): boolean {
    return this.provider?.supportsRAG() ?? false;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const p = await this.ensureProvider();
    if (!p.generateEmbedding) throw new Error('Embeddings not supported');
    return p.generateEmbedding(text);
  }

  async searchSimilar(query: string, userId: string, limit = 5) {
    const p = await this.ensureProvider();
    if (!p.searchSimilar) throw new Error('RAG not supported');
    return p.searchSimilar(query, userId, limit);
  }

  async storeMessage(
    userId: string,
    sessionId: string,
    role: string,
    content: string,
    intent?: string,
  ) {
    const p = await this.ensureProvider();
    if (p.storeMessage) {
      await p.storeMessage(userId, sessionId, role, content, intent);
    }
  }

  async storeSummary(
    sessionId: string,
    summary: string,
    keyTopics?: string[],
  ) {
    const p = await this.ensureProvider();
    if (p.storeSummary) {
      await p.storeSummary(sessionId, summary, keyTopics);
    }
  }

  // ─── Events ─────────────────────────────────────────────────────────

  on(event: AIProviderEvent, listener: (data?: any) => void): () => void {
    if (this.provider) {
      return this.provider.on(event, listener);
    }
    // If provider not yet initialized, schedule listener attachment
    let unsub: (() => void) | null = null;
    this.ensureProvider().then((p) => {
      unsub = p.on(event, listener);
    });
    return () => unsub?.();
  }

  // ─── Provider info ──────────────────────────────────────────────────

  getProviderType(): string | null {
    return aiProviderRegistry.getCurrentType();
  }

  isTauri(): boolean {
    return aiProviderRegistry.isTauri();
  }
}

export const aiService = new AIService();
export default aiService;
