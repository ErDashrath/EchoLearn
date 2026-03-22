import { toast } from "@/hooks/use-toast";

// WebGPU type extension
declare global {
  interface Navigator {
    gpu?: any;
  }
}

export interface WebLLMModel {
  id: string;
  name: string;
  size: string;
  sizeGB: number;
  description: string;
  parameters: string;
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

// Event types that can be subscribed to
export type WebLLMEvent = 'modelChange' | 'cacheChange';
type WebLLMEventListener = (data?: any) => void;

class WebLLMService {
  private engine: any = null;
  private webllm: any = null;
  private currentModel: string | null = null;
  private activeModel: string | null = null; // Track the actively loaded model
  private isInitializing = false;
  private downloadStartTime = 0;
  private lastBytesLoaded = 0;
  private progressCallback: ((progress: WebLLMProgress) => void) | null = null;
  private stopCallback: (() => void) | null = null;
  private isGenerating = false;
  private eventListeners: Map<WebLLMEvent, Set<WebLLMEventListener>> = new Map();

  private models: WebLLMModel[] = [
    {
      id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
      name: "Llama 3.2 1B",
      size: "1.2GB",
      sizeGB: 1.2,
      description: "Fast and efficient, great for quick responses",
      parameters: "1B"
    },
    {
      id: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
      name: "Llama 3.2 3B",
      size: "2.0GB",
      sizeGB: 2.0,
      description: "Balanced performance and quality",
      parameters: "3B"
    },
    {
      id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
      name: "Phi-3 Mini",
      size: "2.2GB",
      sizeGB: 2.2,
      description: "Microsoft's efficient model",
      parameters: "3.8B"
    },
    {
      id: "gemma-2-2b-it-q4f16_1-MLC",
      name: "Gemma 2 2B",
      size: "1.6GB", 
      sizeGB: 1.6,
      description: "Google's compact model",
      parameters: "2B"
    },
    {
      id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      name: "Qwen2.5 0.5B",
      size: "0.6GB",
      sizeGB: 0.6,
      description: "Ultra-lightweight model",
      parameters: "0.5B"
    },
    {
      id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      name: "Qwen2.5 1.5B",
      size: "1.1GB",
      sizeGB: 1.1,
      description: "Efficient Chinese-English model",
      parameters: "1.5B"
    }
  ];

  constructor() {
    // Test if we have any cached models on initialization
    this.checkInitialCache();
    
    // Restore active model from localStorage
    this.restoreActiveModel();
  }

  // ===========================================================================
  // EVENT SYSTEM — subscribe to model & cache changes instead of polling
  // ===========================================================================

  on(event: WebLLMEvent, listener: WebLLMEventListener): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return () => this.eventListeners.get(event)?.delete(listener);
  }

  private emit(event: WebLLMEvent, data?: any): void {
    this.eventListeners.get(event)?.forEach(listener => listener(data));
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
      // Only auto-add test model in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: Adding test model for debugging...');
        this.addTestModel();
      } else {
        console.log('Production mode: No test models will be added automatically.');
      }
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
    this.emit('modelChange', { modelId: null, loaded: false });
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
      // Use locally bundled @mlc-ai/web-llm (works offline after first install)
      const module = await import('@mlc-ai/web-llm');
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
      
      // Store download timestamp for recent model tracking
      const timestamps = this.getModelTimestamps();
      timestamps[modelId] = Date.now();
      localStorage.setItem('webllm-model-timestamps', JSON.stringify(timestamps));
      
      console.log('Model marked as cached with timestamp. Updated list:', cachedModels);
      this.emit('cacheChange', cachedModels);
    }
  }

  private getModelTimestamps(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem('webllm-model-timestamps') || '{}');
    } catch {
      return {};
    }
  }

  getMostRecentModel(): string | null {
    const cachedModels = this.getCachedModels();
    if (cachedModels.length === 0) return null;
    
    const timestamps = this.getModelTimestamps();
    let mostRecentModel = cachedModels[0];
    let mostRecentTime = timestamps[mostRecentModel] || 0;
    
    for (const modelId of cachedModels) {
      const timestamp = timestamps[modelId] || 0;
      if (timestamp > mostRecentTime) {
        mostRecentTime = timestamp;
        mostRecentModel = modelId;
      }
    }
    
    return mostRecentModel;
  }

  getCachedModelsWithTimestamps(): Array<{modelId: string, timestamp: number}> {
    const cachedModels = this.getCachedModels();
    const timestamps = this.getModelTimestamps();
    
    return cachedModels.map(modelId => ({
      modelId,
      timestamp: timestamps[modelId] || 0
    })).sort((a, b) => b.timestamp - a.timestamp); // Most recent first
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
  addTestModel(modelId: string = "Llama-3.2-1B-Instruct-q4f32_1-MLC"): void {
    console.log('Adding test model to cache:', modelId);
    this.markModelAsCached(modelId);
  }

  private handleProgress(progress: any, isModelCached: boolean) {
    const percentage = Math.round(progress.progress * 100);
    
    if (isModelCached) {
      this.progressCallback?.({
        progress: progress.progress,
        text: `Loading cached model: ${percentage}%`,
        loaded: progress.loaded,
        total: progress.total
      });
    } else {
      const downloadInfo = this.calculateDownloadDetails(progress);
      const speedText = downloadInfo.speed > 0 ? ` @ ${downloadInfo.speed}MB/s` : '';
      const etaText = this.calculateETA(downloadInfo);
      
      this.progressCallback?.({
        progress: progress.progress,
        text: `Downloading: ${percentage}% (${downloadInfo.downloaded}MB / ${downloadInfo.total}MB)${speedText}${etaText}`,
        loaded: progress.loaded,
        total: progress.total
      });
    }
  }

  private calculateETA(downloadInfo: {total: number, downloaded: number, speed: number}): string {
    if (downloadInfo.speed <= 0 || downloadInfo.downloaded >= downloadInfo.total) return '';
    
    const remainingMB = downloadInfo.total - downloadInfo.downloaded;
    const etaSeconds = Math.round(remainingMB / downloadInfo.speed);
    
    if (etaSeconds < 60) return ` • ${etaSeconds}s remaining`;
    if (etaSeconds < 3600) return ` • ${Math.round(etaSeconds / 60)}m remaining`;
    return ` • ${Math.round(etaSeconds / 3600)}h remaining`;
  }

  private calculateDownloadDetails(progress: any) {
    const currentTime = Date.now();
    const totalMB = progress.total ? Math.round(progress.total / (1024 * 1024)) : 0;
    const downloadedMB = progress.loaded ? Math.round(progress.loaded / (1024 * 1024)) : 0;
    
    const timeDiff = (currentTime - this.downloadStartTime) / 1000;
    const bytesDiff = (progress.loaded || 0) - this.lastBytesLoaded;
    const speedMBps = timeDiff > 0 ? Math.round((bytesDiff / timeDiff) / (1024 * 1024) * 10) / 10 : 0;
    
    this.lastBytesLoaded = progress.loaded || 0;
    
    return {
      total: totalMB,
      downloaded: downloadedMB,
      speed: speedMBps
    };
  }

  async loadModel(modelId: string, progressCallback?: (progress: WebLLMProgress) => void, maxRetries: number = 3): Promise<boolean> {
    if (this.isInitializing) return false;
    
    if (this.currentModel === modelId && this.engine) {
      return true;
    }

    const model = this.models.find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    this.progressCallback = progressCallback || null;
    const isModelCached = this.isModelCached(modelId);
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.isInitializing = true;
        this.downloadStartTime = Date.now();
        this.lastBytesLoaded = 0;

        await this.loadWebLLM();

        this.progressCallback?.({
          progress: 0,
          text: isModelCached ? 'Loading cached model...' : (attempt > 1 ? `Retrying download (${attempt}/${maxRetries})...` : 'Starting download...')
        });

        this.engine = new this.webllm.MLCEngine();
        this.engine.setInitProgressCallback((progress: any) => {
          this.handleProgress(progress, isModelCached);
        });

        await this.engine.reload(modelId);

        this.currentModel = modelId;
        this.activeModel = modelId; // Set as active model
        localStorage.setItem('webllm-active-model', modelId);
        this.markModelAsCached(modelId);
        
        this.progressCallback?.({
          progress: 1,
          text: `${model.name} loaded successfully`
        });

        // Notify subscribers that model state changed
        this.emit('modelChange', { modelId, loaded: true });
        
        console.log(`Model ${modelId} loaded successfully on attempt ${attempt}`);
        return true;

      } catch (error) {
        lastError = error as Error;
        console.error(`Model loading attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          this.progressCallback?.({
            progress: 0,
            text: `Attempt ${attempt} failed, retrying in 2 seconds...`
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } finally {
        this.isInitializing = false;
      }
    }

    // All retries failed
    this.progressCallback?.({
      progress: 0,
      text: `Download failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    });
    
    throw lastError || new Error(`Failed to load model ${modelId} after ${maxRetries} attempts`);
  }

  async autoLoadMostRecentModel(): Promise<boolean> {
    const mostRecentModel = this.getMostRecentModel();
    if (!mostRecentModel) {
      console.log('No cached models found for auto-loading');
      return false;
    }

    const currentActive = this.getActiveModel();
    if (currentActive === mostRecentModel) {
      console.log('Most recent model is already active:', mostRecentModel);
      return true;
    }

    try {
      console.log('Auto-loading most recent model:', mostRecentModel);
      const success = await this.loadModel(mostRecentModel);
      if (success) {
        console.log('Successfully auto-loaded:', mostRecentModel);
        return true;
      }
    } catch (error) {
      console.error('Failed to auto-load recent model:', error);
    }
    
    return false;
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
          // Split into small render units so UI updates look token-by-token.
          const units = content.match(/\s+|[^\s]+/g) ?? [content];
          for (const unit of units) {
            yield unit;
          }
        }
      }
    } catch (error) {
      console.error('Error generating response:', error);
      throw error;
    } finally {
      this.isGenerating = false;
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

  clearModelCache(): void {
    console.log('Clearing model cache...');
    localStorage.removeItem('webllm-cached-models');
    localStorage.removeItem('webllm-model-timestamps');
    localStorage.removeItem('webllm-active-model');
    
    // Reset internal state
    this.activeModel = null;
    this.currentModel = null;
    this.engine = null;
    
    // Clear WebLLM's IndexedDB cache if possible
    this.clearWebLLMIndexedDB().catch(console.error);
    
    // Notify subscribers
    this.emit('cacheChange', []);
    this.emit('modelChange', { modelId: null, loaded: false });
    
    console.log('Model cache cleared successfully');
  }

  private async clearWebLLMIndexedDB(): Promise<void> {
    try {
      const databases = await indexedDB.databases();
      const webllmDbs = databases.filter(db => 
        db.name?.includes('webllm') || 
        db.name?.includes('mlc') || 
        db.name?.includes('cache')
      );
      
      for (const db of webllmDbs) {
        if (db.name) {
          console.log('Deleting WebLLM database:', db.name);
          await new Promise<void>((resolve, reject) => {
            const deleteReq = indexedDB.deleteDatabase(db.name!);
            deleteReq.onerror = () => reject(deleteReq.error);
            deleteReq.onsuccess = () => resolve();
          });
        }
      }
    } catch (error) {
      console.error('Error clearing WebLLM IndexedDB:', error);
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
