/**
 * Tauri Provider — calls Rust backend via Tauri IPC for native inference
 * 
 * This provider is used when EchoLearn runs as a Tauri desktop app.
 * All heavy computation (LLM, embeddings, vector search) happens in Rust.
 * 
 * @module services/providers/tauri-provider
 */

import type {
  AIProvider,
  AIProviderType,
  AIProviderEvent,
  AIModel,
  AIGenerationConfig,
  AIProgress,
  ChatMessage,
  RAGContext,
} from './ai-provider';

type EventListener = (data?: any) => void;

// Tauri v2 API imports (lazy loaded)
let invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;
let listen: (event: string, handler: (event: any) => void) => Promise<() => void>;

class TauriProvider implements AIProvider {
  readonly type: AIProviderType = 'tauri';
  private eventListeners: Map<AIProviderEvent, Set<EventListener>> = new Map();
  private unsubscribers: Array<() => void> = [];
  private _isReady = false;
  private _isGenerating = false;
  private _isInitializing = false;
  private _activeModel: string | null = null;
  private _models: AIModel[] = [];

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  async initialize(): Promise<boolean> {
    try {
      const tauriCore = await import('@tauri-apps/api/core');
      const tauriEvent = await import('@tauri-apps/api/event');
      invoke = tauriCore.invoke;
      listen = tauriEvent.listen;

      // Get backend status (fields arrive as camelCase from Rust serde)
      const status = await invoke('get_status') as {
        llmLoaded: boolean;
        activeModel: string | null;
        embeddingsReady: boolean;
        cachedModels: string[];
        modelsDir: string;
      };

      // Get the available model definitions
      this._models = await invoke('get_available_models') as AIModel[];
      this._isReady = true;
      this._activeModel = status.activeModel;

      this.emit('ready');
      console.log('✅ Tauri provider initialized, models:', this._models.length);
      return true;
    } catch (err) {
      console.error('❌ Tauri provider initialization failed:', err);
      this._isReady = false;
      return false;
    }
  }

  isReady(): boolean {
    return this._isReady;
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
    return this._models;
  }

  getCachedModels(): string[] {
    return this._models.filter(m => m.sizeGB > 0).map(m => m.id);
  }

  async getCachedModelsAsync(): Promise<string[]> {
    try {
      const cached: string[] = await invoke('get_cached_models');
      return cached;
    } catch {
      return this.getCachedModels();
    }
  }

  getActiveModel(): string | null {
    return this._activeModel;
  }

  async loadModel(
    modelId: string,
    onProgress?: (progress: AIProgress) => void,
  ): Promise<boolean> {
    if (this._isInitializing) return false;
    this._isInitializing = true;

    const unlisteners: (() => void)[] = [];

    try {
      // ── Step 1: Download the GGUF file if it isn't on disk yet ───────────
      const cached = await this.getCachedModelsAsync();

      if (!cached.includes(modelId)) {
        onProgress?.({ progress: 0, text: 'Starting GGUF download…' });

        const unlistenDownload = await listen(
          'model_download_progress',
          (event: any) => {
            const p = event.payload as {
              modelId: string;
              progress: number;
              downloadedBytes: number;
              totalBytes: number;
              speedMbps: number;
            };
            if (p.modelId !== modelId || !onProgress) return;

            const dlMB = (p.downloadedBytes / (1024 * 1024)).toFixed(0);
            const totMB = (p.totalBytes / (1024 * 1024)).toFixed(0);
            const speedText =
              p.speedMbps > 0 ? ` @ ${p.speedMbps.toFixed(1)} MB/s` : '';
            const pct = Math.round(p.progress * 100);
            const etaText = this._calcETA(
              p.downloadedBytes,
              p.totalBytes,
              p.speedMbps,
            );

            onProgress({
              progress: p.progress * 0.9, // reserve last 10% for in-memory load
              text: `Downloading: ${pct}% (${dlMB} MB / ${totMB} MB)${speedText}${etaText}`,
              loaded: p.downloadedBytes,
              total: p.totalBytes,
            });
          },
        ) as unknown as () => void;
        unlisteners.push(unlistenDownload);

        // This awaits the full GGUF file download; throws on error
        await this.invokeDownloadModel(modelId);

        // Track download timestamp in localStorage for recency sorting
        const timestamps = JSON.parse(
          localStorage.getItem('gguf-model-timestamps') ?? '{}',
        ) as Record<string, number>;
        timestamps[modelId] = Date.now();
        localStorage.setItem(
          'gguf-model-timestamps',
          JSON.stringify(timestamps),
        );
      }

      // ── Step 2: Load the GGUF file into memory ───────────────────────────
      onProgress?.({ progress: 0.9, text: 'Loading model into memory…' });

      const unlistenLoad = await listen(
        'model_load_progress',
        (event: any) => {
          onProgress?.(event.payload as AIProgress);
        },
      ) as unknown as () => void;
      unlisteners.push(unlistenLoad);

      await invoke('load_model', { modelId });

      this._activeModel = modelId;
      this.emit('modelChange', { modelId, loaded: true });
      onProgress?.({ progress: 1, text: 'Model ready!' });
      return true;
    } catch (err) {
      console.error('Failed to load/download model:', err);
      onProgress?.({ progress: 0, text: `Error: ${err}` });
      return false;
    } finally {
      this._isInitializing = false;
      unlisteners.forEach(u => u());
    }
  }

  private async invokeDownloadModel(modelId: string): Promise<void> {
    try {
      await invoke('download_model', { modelId });
      return;
    } catch (primaryError) {
      const message = String(primaryError);
      const commandNotFound =
        message.includes('not found') ||
        message.includes('unknown command') ||
        message.includes('download_model');

      if (!commandNotFound) {
        throw primaryError;
      }

      // Backward-compat fallback for older command naming.
      try {
        await invoke('downloadModel', { modelId });
        return;
      } catch (secondaryError) {
        throw new Error(
          'Backend command download_model is unavailable. Restart Tauri dev/build so the updated Rust backend is loaded.'
        );
      }
    }
  }

  /** ETA helper used by the download progress handler */
  private _calcETA(
    downloadedBytes: number,
    totalBytes: number,
    speedMbps: number,
  ): string {
    if (speedMbps <= 0 || totalBytes <= 0) return '';
    const remainingMB = (totalBytes - downloadedBytes) / (1024 * 1024);
    const etaSec = Math.round(remainingMB / speedMbps);
    if (etaSec <= 0) return '';
    return etaSec < 60
      ? ` • ${etaSec}s left`
      : ` • ${Math.round(etaSec / 60)}m left`;
  }

  /** Returns downloaded models with their last-used timestamps, newest first */
  async getCachedModelsWithTimestamps(): Promise<
    Array<{ modelId: string; timestamp: number }>
  > {
    const cached = await this.getCachedModelsAsync();
    const timestamps = JSON.parse(
      localStorage.getItem('gguf-model-timestamps') ?? '{}',
    ) as Record<string, number>;
    return cached
      .map(modelId => ({ modelId, timestamp: timestamps[modelId] ?? 0 }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Silently loads the most-recently-used downloaded model on startup */
  async autoLoadMostRecentModel(): Promise<boolean> {
    try {
      const cached = await this.getCachedModelsWithTimestamps();
      if (cached.length === 0) return false;
      const mostRecent = cached[0].modelId;
      if (this._activeModel === mostRecent) return true;
      return await this.loadModel(mostRecent);
    } catch {
      return false;
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
    try {
      return await invoke('delete_model', { modelId });
    } catch {
      return false;
    }
  }

  isModelLoaded(): boolean {
    return !!this._activeModel;
  }

  isInitializingModel(): boolean {
    return this._isInitializing;
  }

  setActiveModel(modelId: string): void {
    this._activeModel = modelId;
  }

  async deactivateModel(): Promise<void> {
    try {
      await invoke('unload_model');
    } catch { /* ignore */ }
    this._activeModel = null;
    this.emit('modelChange', { modelId: null, loaded: false });
  }

  clearModelCache(): void {
    this._models.forEach(m => {
      invoke('delete_model', { modelId: m.id }).catch(() => {});
    });
    this._activeModel = null;
    this.emit('cacheChange');
  }

  // =========================================================================
  // GENERATION — streaming via Tauri events
  // =========================================================================

  private splitRenderUnits(text: string): string[] {
    if (!text) return [];
    // Keep whitespace as separate units so typing looks natural in the UI.
    const units = text.match(/\s+|[^\s]+/g);
    return units ?? [text];
  }

  async *generateResponse(
    messages: ChatMessage[],
    config?: AIGenerationConfig,
    systemPrompt?: string,
    sessionId?: string,
    useRag?: boolean,
  ): AsyncGenerator<string, void, unknown> {
    if (!this._activeModel) {
      throw new Error('No model loaded');
    }

    this._isGenerating = true;
    const genConfig = config ?? { temperature: 0.7, maxTokens: 512, topP: 0.9 };

    const tokenQueue: string[] = [];
    let done = false;
    let error: Error | null = null;
    let resolve: (() => void) | null = null;

    const wake = () => {
      if (resolve) { resolve(); resolve = null; }
    };

    // Listen for individual tokens (Rust emits plain string payload)
    const unlistenToken = await listen('llm_token', (event: any) => {
      tokenQueue.push(event.payload as string);
      wake();
    });

    // Listen for completion signal (separate event from Rust)
    const unlistenDone = await listen('llm_done', () => {
      done = true;
      wake();
    });

    try {
      // Start generation — wrap args in `request` struct for Rust
      const allMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      invoke('generate_response', {
        request: {
          messages: allMessages,
          config: {
            temperature: genConfig.temperature,
            maxTokens: genConfig.maxTokens,
            topP: genConfig.topP,
          },
          sessionId: sessionId ?? null,
          useRag: useRag ?? true,
          ragConfig: {
            topK: 3,
            minSimilarity: 0.6,
            contextWindow: 600,
            includeSources: ['message', 'journal', 'summary'],
          },
        },
      }).catch((err) => {
        error = err instanceof Error ? err : new Error(String(err));
        done = true;
        wake();
      });

      // Yield tokens as they arrive
      while (!done || tokenQueue.length > 0) {
        if (tokenQueue.length > 0) {
          const nextChunk = tokenQueue.shift()!;
          for (const unit of this.splitRenderUnits(nextChunk)) {
            yield unit;
          }
        } else if (!done) {
          await new Promise<void>((r) => { resolve = r; });
        }
      }

      if (error) throw error;
    } finally {
      this._isGenerating = false;
      unlistenToken();
      unlistenDone();
    }
  }

  async stopGeneration(): Promise<void> {
    try {
      await invoke('stop_generation');
    } catch { /* ignore */ }
    this._isGenerating = false;
  }

  isGenerating(): boolean {
    return this._isGenerating;
  }

  // =========================================================================
  // EMBEDDINGS
  // =========================================================================

  supportsEmbeddings(): boolean {
    return true;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return await invoke('generate_embedding', { text });
  }

  // =========================================================================
  // RAG
  // =========================================================================

  supportsRAG(): boolean {
    return true;
  }

  async searchSimilar(
    query: string,
    _userId: string,
    limit = 5,
  ): Promise<RAGContext> {
    const results = await invoke('search_similar', {
      query,
      topK: limit,
      minScore: 0.6,
    }) as Array<{ id: string; sourceType: string; content: string; score: number }>;

    return {
      relevantMessages: results
        .filter(r => r.sourceType === 'message')
        .map(r => ({ content: r.content, role: 'assistant', similarity: r.score, timestamp: '' })),
      relevantJournals: results
        .filter(r => r.sourceType === 'journal')
        .map(r => ({ content: r.content, similarity: r.score, timestamp: '' })),
    };
  }

  async storeMessage(
    _userId: string,
    sessionId: string,
    role: string,
    content: string,
    intent?: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await invoke('store_message', { id, sessionId, role, content, intent: intent ?? null });
  }

  async storeSummary(
    sessionId: string,
    summary: string,
    keyTopics?: string[],
  ): Promise<void> {
    const topicsStr = keyTopics && keyTopics.length > 0 ? keyTopics.join(', ') : null;
    await invoke('store_summary', { sessionId, summary, keyTopics: topicsStr });
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

export async function createTauriProvider(): Promise<AIProvider> {
  return new TauriProvider();
}
