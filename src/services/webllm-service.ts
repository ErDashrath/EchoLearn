import { toast } from "@/hooks/use-toast";

// WebGPU type extension
declare global {
  interface Navigator {
    gpu?: any;
  }

  interface Window {
    __MINDSCRIBE_WEBLLM_MODELS__?: unknown;
  }
}

export interface WebLLMModel {
  id: string;
  name: string;
  size: string;
  sizeGB: number;
  description: string;
  parameters: string;
  native?: {
    hfUrl?: string;
  };
}

export interface WebLLMProgress {
  progress: number;
  text: string;
  loaded?: number;
  total?: number;
}

export interface WebLLMGenerationConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export type InferenceProfile = 'balanced' | 'turbo';

const INFERENCE_PROFILE_KEY = 'mindscribe.inference.profile';
const WEBLLM_MODELS_STORAGE_KEY = 'mindscribe.webllm.models';

function parseModelSizeGB(size: string): number {
  const normalized = size.trim().toLowerCase();
  const value = Number.parseFloat(normalized.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return normalized.includes('mb') ? value / 1024 : value;
}

function sanitizeModelCatalog(input: unknown): WebLLMModel[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const models: WebLLMModel[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!id || !name) {
      continue;
    }

    const size = typeof record.size === 'string' && record.size.trim()
      ? record.size.trim()
      : '1.0GB';

    const sizeGB = typeof record.sizeGB === 'number' && Number.isFinite(record.sizeGB)
      ? record.sizeGB
      : parseModelSizeGB(size);

    models.push({
      id,
      name,
      size,
      sizeGB,
      description: typeof record.description === 'string' ? record.description : 'Local model',
      parameters: typeof record.parameters === 'string' ? record.parameters : 'Unknown',
      native: (() => {
        const native = record.native;
        if (!native || typeof native !== 'object') {
          return undefined;
        }

        const nativeRecord = native as Record<string, unknown>;
        const hfUrl = typeof nativeRecord.hfUrl === 'string' ? nativeRecord.hfUrl.trim() : '';
        if (!hfUrl) {
          return undefined;
        }

        return { hfUrl };
      })(),
    });
  }

  return models;
}

interface GenerationConfigOverrides {
  task?: 'chat' | 'summary' | 'voice';
  modelId?: string | null;
}

class WebLLMService {
  private engine: any = null;
  private webllm: any = null;
  private currentModel: string | null = null;
  private activeModel: string | null = null; // Track the actively loaded model
  private isInitializing = false;
  private loadingModel: WebLLMModel | null = null;
  private downloadStartTime = 0;
  private lastBytesLoaded = 0;
  private lastProgressTimestamp = 0;
  private progressCallback: ((progress: WebLLMProgress) => void) | null = null;
  private stopCallback: (() => void) | null = null;
  private isGenerating = false;
  private inferenceProfile: InferenceProfile = 'balanced';

  private models: WebLLMModel[] = [];

  constructor() {
    this.models = this.loadConfiguredModels();

    // Test if we have any cached models on initialization
    this.checkInitialCache();
    
    // Restore active model from localStorage
    this.restoreActiveModel();
    this.restoreInferenceProfile();
  }

  private loadConfiguredModels(): WebLLMModel[] {
    const fromWindow = sanitizeModelCatalog(window.__MINDSCRIBE_WEBLLM_MODELS__);
    if (fromWindow.length > 0) {
      return fromWindow;
    }

    const stored = localStorage.getItem(WEBLLM_MODELS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const fromStorage = sanitizeModelCatalog(parsed);
        if (fromStorage.length > 0) {
          return fromStorage;
        }
      } catch (error) {
        console.warn('Invalid webllm model catalog in storage:', error);
      }
    }

    return [];
  }

  private restoreInferenceProfile() {
    const stored = localStorage.getItem(INFERENCE_PROFILE_KEY);
    if (stored === 'turbo' || stored === 'balanced') {
      this.inferenceProfile = stored;
    }
  }

  getInferenceProfile(): InferenceProfile {
    return this.inferenceProfile;
  }

  setInferenceProfile(profile: InferenceProfile): void {
    this.inferenceProfile = profile;
    localStorage.setItem(INFERENCE_PROFILE_KEY, profile);
  }

  isTurboModeEnabled(): boolean {
    return this.inferenceProfile === 'turbo';
  }

  getFastModelRecommendations(): WebLLMModel[] {
    return [...this.models]
      .filter((model) => /q4/i.test(model.id))
      .sort((left, right) => left.sizeGB - right.sizeGB)
      .slice(0, 3);
  }

  getFastestCachedModelId(): string | null {
    const cached = new Set(this.getCachedModels());
    const fastest = this.getFastModelRecommendations().find((model) => cached.has(model.id));
    return fastest?.id ?? null;
  }

  getOptimizedGenerationConfig(
    base: WebLLMGenerationConfig,
    overrides: GenerationConfigOverrides = {},
  ): WebLLMGenerationConfig {
    const profile = this.inferenceProfile;
    const modelId = overrides.modelId ?? this.currentModel ?? this.activeModel;
    const task = overrides.task ?? 'chat';

    if (profile !== 'turbo') {
      return base;
    }

    const isSmallModel = !!modelId && /(0\.5b|1b|1\.5b|2b)/i.test(modelId);
    const fastTokenCap = task === 'summary'
      ? 180
      : task === 'voice'
        ? 96
        : isSmallModel
          ? 220
          : 256;

    return {
      temperature: Math.min(base.temperature, 0.6),
      maxTokens: Math.min(base.maxTokens, fastTokenCap),
      topP: Math.min(base.topP, 0.88),
    };
  }

  private restoreActiveModel() {
    const storedActive = localStorage.getItem('webllm-active-model');
    if (storedActive) {
      console.log('Restoring active model from localStorage:', storedActive);
      this.activeModel = storedActive;
    }
  }

  private async checkInitialCache() {
    console.log('WebLLMService initializing...');
    
    // Check localStorage first
    const cached = this.getCachedModels();
    console.log('Found in localStorage:', cached);
    
    // Check IndexedDB for actual WebLLM cache
    const indexedDBCached = await this.checkIndexedDBCache();
    console.log('Found in IndexedDB:', indexedDBCached);
    
    // Try WebLLM native method
    try {
      const nativeCached = await this.getCachedModelsAsync();
      console.log('Found via WebLLM native:', nativeCached);
    } catch (error) {
      console.log('WebLLM native check failed:', error);
    }
    
    // Add test models if none exist (for debugging)
    const totalCached = [...new Set([...cached, ...indexedDBCached])];
    if (totalCached.length === 0) {
      console.log('No cached models found.');
    } else {
      console.log('Total cached models found:', totalCached);
    }
  }

  getAvailableModels(): WebLLMModel[] {
    return this.models;
  }

  getCachedModels(): string[] {
    const cached = JSON.parse(localStorage.getItem('webllm-cached-models') || '[]');
    console.log('getCachedModels called:', cached);
    return cached;
  }

  // Async method to detect models using WebLLM's native cache detection
  async getCachedModelsAsync(): Promise<string[]> {
    try {
      await this.loadWebLLM();
      
      if (this.webllm?.hasModelInCache) {
        const cachedModels: string[] = [];
        
        // Check each model against WebLLM's cache
        for (const model of this.models) {
          try {
            const isCached = await this.webllm.hasModelInCache(model.id);
            if (isCached) {
              cachedModels.push(model.id);
            }
          } catch (error) {
            console.log(`Could not check cache for ${model.id}:`, error);
          }
        }
        
        // Update localStorage to match WebLLM's actual cache
        if (cachedModels.length > 0) {
          localStorage.setItem('webllm-cached-models', JSON.stringify(cachedModels));
          console.log('Updated localStorage cache from WebLLM:', cachedModels);
        }
        
        return cachedModels;
      }
    } catch (error) {
      console.error('Error checking WebLLM native cache:', error);
    }
    
    // Fallback to localStorage
    return this.getCachedModels();
  }

  isModelCached(modelId: string): boolean {
    return this.getCachedModels().includes(modelId);
  }

  getCurrentModel(): string | null {
    return this.currentModel;
  }

  getActiveModel(): string | null {
    // Check memory first, then localStorage as fallback
    if (this.activeModel !== null) {
      return this.activeModel;
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem('webllm-active-model');
    if (stored && this.isModelCached(stored)) {
      this.activeModel = stored;
      return stored;
    }
    
    return null;
  }

  setActiveModel(modelId: string | null): void {
    this.activeModel = modelId;
    console.log('Active model set to:', modelId);
    
    // Persist the active model state in localStorage
    if (modelId) {
      localStorage.setItem('webllm-active-model', modelId);
    } else {
      localStorage.removeItem('webllm-active-model');
    }
  }

  async deactivateModel(): Promise<void> {
    console.log('Deactivating current model...');
    this.activeModel = null;
    localStorage.removeItem('webllm-active-model');
    
    // Don't unload the engine, just mark as inactive
    // This keeps the model in memory but marks it as not actively selected
    console.log('Model deactivated successfully');
  }

  isModelLoaded(): boolean {
    return !!(this.engine && this.currentModel);
  }

  isInitializingModel(): boolean {
    return this.isInitializing;
  }

  getIsGenerating(): boolean {
    return this.isGenerating;
  }

  setProgressCallback(callback: (progress: WebLLMProgress) => void) {
    this.progressCallback = callback;
  }

  clearProgressCallback() {
    this.progressCallback = null;
  }

  setStopCallback(callback: () => void) {
    this.stopCallback = callback;
  }

  private async loadWebLLM() {
    if (this.webllm) return;
    
    try {
      // @ts-ignore - Dynamic import from CDN
      const module = await import('https://esm.run/@mlc-ai/web-llm');
      this.webllm = module;
    } catch (error) {
      throw new Error(`Failed to load WebLLM: ${error}`);
    }
  }

  private markModelAsCached(modelId: string) {
    console.log('markModelAsCached called with:', modelId);
    const cachedModels = this.getCachedModels();
    if (!cachedModels.includes(modelId)) {
      cachedModels.push(modelId);
      localStorage.setItem('webllm-cached-models', JSON.stringify(cachedModels));
      console.log('Model marked as cached. Updated list:', cachedModels);
    }
  }

  // Add method to directly check IndexedDB for WebLLM models
  async checkIndexedDBCache(): Promise<string[]> {
    try {
      // WebLLM typically stores models in IndexedDB under databases starting with 'webllm'
      const databases = await indexedDB.databases();
      const webllmDbs = databases.filter(db => db.name?.includes('webllm') || db.name?.includes('mlc'));
      
      console.log('Found WebLLM databases:', webllmDbs);
      
      if (webllmDbs.length > 0) {
        // Check if any of our models are stored
        const cachedModels: string[] = [];
        
        for (const model of this.models) {
          // Check if model files exist in browser cache
          try {
            const response = await fetch(`/models/${model.id}`, { method: 'HEAD' });
            if (response.ok) {
              cachedModels.push(model.id);
            }
          } catch (error) {
            // Ignore fetch errors
          }
        }
        
        if (cachedModels.length > 0) {
          console.log('Found cached models in browser:', cachedModels);
          localStorage.setItem('webllm-cached-models', JSON.stringify(cachedModels));
          return cachedModels;
        }
      }
    } catch (error) {
      console.error('Error checking IndexedDB:', error);
    }
    
    return [];
  }

  // Debug method to check all storage locations
  async debugStorageCheck(): Promise<void> {
    console.log('=== WebLLM Storage Debug ===');
    
    // Check localStorage
    console.log('localStorage keys:', Object.keys(localStorage));
    console.log('webllm-cached-models:', localStorage.getItem('webllm-cached-models'));
    
    // Check sessionStorage
    console.log('sessionStorage keys:', Object.keys(sessionStorage));
    
    // Check IndexedDB
    try {
      const databases = await indexedDB.databases();
      console.log('IndexedDB databases:', databases);
      
      const webllmDbs = databases.filter(db => 
        db.name?.toLowerCase().includes('webllm') || 
        db.name?.toLowerCase().includes('mlc') ||
        db.name?.toLowerCase().includes('tvm')
      );
      console.log('WebLLM-related databases:', webllmDbs);
    } catch (error) {
      console.error('IndexedDB check failed:', error);
    }
    
    // Check WebLLM native
    try {
      await this.loadWebLLM();
      if (this.webllm) {
        console.log('WebLLM loaded successfully');
        
        // Try to check cache for each model
        for (const model of this.models) {
          try {
            if (this.webllm.hasModelInCache) {
              const isCached = await this.webllm.hasModelInCache(model.id);
              console.log(`${model.id} cached:`, isCached);
            }
          } catch (error) {
            console.log(`Error checking ${model.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('WebLLM native check failed:', error);
    }
    
    console.log('=== End Debug ===');
  }

  // Test method to manually add models for debugging
  addTestModel(modelId: string = ''): void {
    const fallbackModelId = modelId || this.models[0]?.id;
    if (!fallbackModelId) {
      return;
    }

    console.log('Adding test model to cache:', fallbackModelId);
    this.markModelAsCached(fallbackModelId);
  }

  private handleProgress(progress: any, isModelCached: boolean) {
    const progressRatio = this.getProgressRatio(progress);
    const percentage = Math.round(progressRatio * 100);
    const statusText = this.getProgressStatus(progress, isModelCached);
    
    if (isModelCached) {
      this.progressCallback?.({
        progress: progressRatio,
        text: `${statusText}: ${percentage}%`
      });
    } else {
      const downloadInfo = this.calculateDownloadDetails(progress, progressRatio);
      const transferText = downloadInfo.totalBytes > 0
        ? `${downloadInfo.downloadedText} / ${downloadInfo.totalText}`
        : `${downloadInfo.downloadedText} downloaded`;
      const speedText = downloadInfo.speedText ? ` at ${downloadInfo.speedText}` : '';

      this.progressCallback?.({
        progress: progressRatio,
        text: `${statusText}: ${percentage}% (${transferText}${speedText})`,
        loaded: downloadInfo.loadedBytes,
        total: downloadInfo.totalBytes || undefined
      });
    }
  }

  private calculateDownloadDetails(progress: any, progressRatio: number) {
    const expectedTotalBytes = this.loadingModel
      ? Math.round(this.loadingModel.sizeGB * 1024 * 1024 * 1024)
      : 0;
    const totalBytes = this.getNumericValue(progress.total) ?? expectedTotalBytes;
    const loadedFromProgress = this.getNumericValue(progress.loaded);
    const estimatedLoadedBytes = totalBytes > 0
      ? Math.min(totalBytes, Math.max(0, Math.round(totalBytes * progressRatio)))
      : 0;
    const loadedBytes = loadedFromProgress ?? estimatedLoadedBytes;
    const currentTime = Date.now();
    let speedBytesPerSecond = 0;

    if (this.lastProgressTimestamp > 0) {
      const timeDiffSeconds = Math.max(0.25, (currentTime - this.lastProgressTimestamp) / 1000);
      const bytesDiff = Math.max(0, loadedBytes - this.lastBytesLoaded);
      speedBytesPerSecond = bytesDiff > 0 ? bytesDiff / timeDiffSeconds : 0;
    }

    this.lastBytesLoaded = loadedBytes;
    this.lastProgressTimestamp = currentTime;

    return {
      totalBytes,
      loadedBytes,
      downloadedText: this.formatBytes(loadedBytes),
      totalText: totalBytes > 0 ? this.formatBytes(totalBytes) : 'Unknown size',
      speedText: speedBytesPerSecond > 0 ? this.formatSpeed(speedBytesPerSecond) : '',
    };
  }

  private getProgressRatio(progress: any): number {
    const rawProgress = this.getNumericValue(progress?.progress);
    if (rawProgress !== null) {
      const normalized = rawProgress > 1 ? rawProgress / 100 : rawProgress;
      return Math.min(1, Math.max(0, normalized));
    }

    const loaded = this.getNumericValue(progress?.loaded);
    const total = this.getNumericValue(progress?.total);
    if (loaded !== null && total && total > 0) {
      return Math.min(1, Math.max(0, loaded / total));
    }

    return 0;
  }

  private getProgressStatus(progress: any, isModelCached: boolean): string {
    const status = [
      progress?.text,
      progress?.message,
      progress?.status,
    ].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();

    if (status) {
      return status.replace(/\.$/, '');
    }

    return isModelCached ? 'Loading cached model' : 'Downloading model';
  }

  private getNumericValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 * 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
    }

    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }

  async loadModel(modelId: string): Promise<boolean> {
    if (this.isInitializing) return false;
    
    if (this.currentModel === modelId && this.engine) {
      return true;
    }

    const model = this.models.find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    const isModelCached = this.isModelCached(modelId);
    
    try {
      this.isInitializing = true;
      this.loadingModel = model;
      this.downloadStartTime = Date.now();
      this.lastBytesLoaded = 0;
      this.lastProgressTimestamp = 0;

      await this.loadWebLLM();

      this.progressCallback?.({
        progress: 0,
        text: isModelCached ? 'Loading cached model...' : `Starting download (${model.size})...`
      });

      this.engine = new this.webllm.MLCEngine();
      this.engine.setInitProgressCallback((progress: any) => {
        this.handleProgress(progress, isModelCached);
      });

      await this.engine.reload(modelId);

      this.currentModel = modelId;
      this.activeModel = modelId; // Set as active model
      this.markModelAsCached(modelId);
      
      this.progressCallback?.({
        progress: 1,
        text: `${model.name} loaded successfully`
      });

      toast({
        title: "Model Loaded",
        description: `${model.name} is ready for use`
      });

      return true;
    } catch (error) {
      console.error('Error loading model:', error);
      this.progressCallback?.({
        progress: 0,
        text: `Error loading ${model.name}`
      });

      toast({
        title: "Error Loading Model",
        description: `Failed to load ${model.name}. Please try again.`,
        variant: "destructive"
      });

      return false;
    } finally {
      this.isInitializing = false;
      this.loadingModel = null;
      this.lastBytesLoaded = 0;
      this.lastProgressTimestamp = 0;
    }
  }

  async *generateResponse(
    conversationHistory: Array<{role: string, content: string}>, 
    config: WebLLMGenerationConfig = { temperature: 0.7, maxTokens: 512, topP: 0.9 },
    systemPrompt?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine || !this.currentModel) {
      throw new Error('No model loaded');
    }

    try {
      this.isGenerating = true;
      
      // Use custom system prompt if provided, otherwise use default
      const defaultSystemPrompt = "You are a friendly and helpful AI assistant. Have natural conversations while being helpful, engaging, and supportive. Feel free to ask questions, share insights, and express curiosity. Be conversational and personable.";
      
      // Convert conversation history to WebLLM format
      const messages = [
        { role: "system", content: systemPrompt || defaultSystemPrompt },
        ...conversationHistory
      ];

      const asyncChunkGenerator = await this.engine.chat.completions.create({
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        stream: true
      });

      for await (const chunk of asyncChunkGenerator) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('Error generating response:', error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  async *generateResponseWithFallback(
    conversationHistory: Array<{ role: string; content: string }>,
    config: WebLLMGenerationConfig = { temperature: 0.7, maxTokens: 512, topP: 0.9 },
    systemPrompt?: string,
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine || !this.currentModel) {
      throw new Error('No local WebLLM model loaded. Download and select a local model first.');
    }

    try {
      for await (const chunk of this.generateResponse(conversationHistory, config, systemPrompt)) {
        yield chunk;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAdapterIssue = /adapter-unavailable|webgpu|gpu|adapter/i.test(message);

      if (!isAdapterIssue) {
        throw error;
      }

      const hasWebGPU = !!navigator.gpu;
      const adapter = hasWebGPU ? await navigator.gpu.requestAdapter().catch(() => null) : null;
      const compatibilityReason = !hasWebGPU
        ? 'WebGPU is not available in this browser.'
        : !adapter
          ? 'No compatible GPU adapter was found for WebGPU.'
          : 'The GPU driver/browser could not initialize WebGPU for this model.';

      throw new Error(
        `${compatibilityReason} This device cannot run local WebLLM inference. Try newer GPU drivers, Edge/Chrome 113+, or another device with WebGPU support.`,
      );
    }
  }

  async stopGeneration(): Promise<void> {
    if (this.engine && this.isGenerating) {
      try {
        await this.engine.interruptGenerate();
        this.isGenerating = false;
        this.stopCallback?.();
      } catch (error) {
        console.error('Error stopping generation:', error);
      }
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
    try {
      // Remove from localStorage cache
      const cachedModels = this.getCachedModels();
      const updated = cachedModels.filter(id => id !== modelId);
      
      if (updated.length < cachedModels.length) {
        localStorage.setItem('webllm-cached-models', JSON.stringify(updated));
      } else {
        localStorage.removeItem('webllm-cached-models');
      }

      // If this was the current model, clear it
      if (this.currentModel === modelId) {
        this.currentModel = null;
        this.activeModel = null;
        this.engine = null;
      }

      toast({
        title: "Model Deleted",
        description: `${modelId} has been removed from cache`
      });

      return true;
    } catch (error) {
      console.error('Error deleting model:', error);
      toast({
        title: "Error",
        description: "Failed to delete model",
        variant: "destructive"
      });
      return false;
    }
  }

  private isLikelyWebLLMStorageName(name: string): boolean {
    const value = name.toLowerCase();
    return (
      value.includes('webllm') ||
      value.includes('mlc') ||
      value.includes('tvm') ||
      value.includes('wasm-cache')
    );
  }

  private async deleteIndexedDb(name: string): Promise<void> {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }

  private async clearIndexedDbCaches(): Promise<void> {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
      return;
    }

    const databases = await indexedDB.databases();
    const targets = databases
      .map((entry) => entry.name)
      .filter((name): name is string => !!name)
      .filter((name) => this.isLikelyWebLLMStorageName(name));

    for (const dbName of targets) {
      await this.deleteIndexedDb(dbName);
    }
  }

  private async clearCacheStorage(): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
      return;
    }

    try {
      const keys = await caches.keys();
      for (const key of keys) {
        if (this.isLikelyWebLLMStorageName(key)) {
          await caches.delete(key);
        }
      }
    } catch (error) {
      console.warn('CacheStorage cleanup failed:', error);
    }
  }

  async clearModelCache(): Promise<void> {
    await this.stopGeneration();

    this.currentModel = null;
    this.activeModel = null;
    this.engine = null;
    this.isInitializing = false;

    localStorage.setItem('webllm-cached-models', JSON.stringify([]));
    localStorage.removeItem('webllm-active-model');

    try {
      await this.clearIndexedDbCaches();
      await this.clearCacheStorage();
      console.log('All WebLLM models and caches cleared');
    } catch (error) {
      console.warn('Some WebLLM cache entries could not be removed:', error);
    }
  }

  async checkWebGPUSupport(): Promise<boolean> {
    if (!navigator.gpu) {
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch (error) {
      console.error('WebGPU check failed:', error);
      return false;
    }
  }
}

export const webllmService = new WebLLMService();
