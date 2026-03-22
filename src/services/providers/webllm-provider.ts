/**
 * WebLLM Provider — wraps the existing webllm-service as an AIProvider
 * 
 * This is the browser-based fallback. It works when:
 * - Running as a web app (not Tauri)
 * - WebGPU is available
 * - Model weights have been downloaded
 * 
 * @module services/providers/webllm-provider
 */

import type {
  AIProvider,
  AIProviderType,
  AIProviderEvent,
  AIModel,
  AIGenerationConfig,
  AIProgress,
  ChatMessage,
} from './ai-provider';
import { webllmService } from '../webllm-service';

type EventListener = (data?: any) => void;

class WebLLMProvider implements AIProvider {
  readonly type: AIProviderType = 'webllm';
  private eventListeners: Map<AIProviderEvent, Set<EventListener>> = new Map();
  private unsubscribers: Array<() => void> = [];

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  async initialize(): Promise<boolean> {
    // Forward events from underlying webllmService
    this.unsubscribers.push(
      webllmService.on('modelChange', (data) => this.emit('modelChange', data)),
      webllmService.on('cacheChange', (data) => this.emit('cacheChange', data)),
    );
    this.emit('ready');
    return true;
  }

  isReady(): boolean {
    return true; // WebLLM is always "ready" (model might not be loaded yet)
  }

  dispose(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.eventListeners.clear();
  }

  // =========================================================================
  // MODEL MANAGEMENT
  // =========================================================================

  getAvailableModels(): AIModel[] {
    return webllmService.getAvailableModels();
  }

  getCachedModels(): string[] {
    return webllmService.getCachedModels();
  }

  async getCachedModelsAsync(): Promise<string[]> {
    return webllmService.getCachedModelsAsync();
  }

  async getCachedModelsWithTimestamps(): Promise<Array<{modelId: string, timestamp: number}>> {
    return webllmService.getCachedModelsWithTimestamps();
  }

  async autoLoadMostRecentModel(): Promise<boolean> {
    return webllmService.autoLoadMostRecentModel();
  }

  getActiveModel(): string | null {
    return webllmService.getActiveModel();
  }

  async loadModel(
    modelId: string,
    onProgress?: (progress: AIProgress) => void,
  ): Promise<boolean> {
    if (onProgress) {
      webllmService.setProgressCallback(onProgress);
    }
    try {
      const ok = await webllmService.loadModel(modelId, onProgress, 3); // 3 retry attempts
      if (ok) {
        webllmService.setActiveModel(modelId);
      }
      return ok;
    } finally {
      webllmService.clearProgressCallback();
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
    return webllmService.deleteModel(modelId);
  }

  isModelLoaded(): boolean {
    return webllmService.isModelLoaded();
  }

  isInitializingModel(): boolean {
    return webllmService.isInitializingModel();
  }

  setActiveModel(modelId: string): void {
    webllmService.setActiveModel(modelId);
  }

  async deactivateModel(): Promise<void> {
    await webllmService.deactivateModel();
  }

  clearModelCache(): void {
    webllmService.clearModelCache();
  }

  // =========================================================================
  // GENERATION
  // =========================================================================

  async *generateResponse(
    messages: ChatMessage[],
    config?: AIGenerationConfig,
    systemPrompt?: string,
    _sessionId?: string,
    _useRag?: boolean,
  ): AsyncGenerator<string, void, unknown> {
    const genConfig = config ?? { temperature: 0.7, maxTokens: 512, topP: 0.9 };
    yield* webllmService.generateResponse(messages, genConfig, systemPrompt);
  }

  async stopGeneration(): Promise<void> {
    await webllmService.stopGeneration();
  }

  isGenerating(): boolean {
    return webllmService.getIsGenerating();
  }

  // =========================================================================
  // EMBEDDINGS & RAG — not supported in WebLLM
  // =========================================================================

  supportsEmbeddings(): boolean {
    return false;
  }

  supportsRAG(): boolean {
    return false;
  }

  // =========================================================================
  // EVENTS
  // =========================================================================

  on(event: AIProviderEvent, listener: EventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return () => this.eventListeners.get(event)?.delete(listener);
  }

  private emit(event: AIProviderEvent, data?: any): void {
    this.eventListeners.get(event)?.forEach(listener => listener(data));
  }
}

export async function createWebLLMProvider(): Promise<AIProvider> {
  return new WebLLMProvider();
}
