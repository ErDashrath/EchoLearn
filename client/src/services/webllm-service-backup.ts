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

class WebLLMService {
  private engine: any = null;
  private webllm: any = null;
  private currentModel: string | null = null;
  private isInitializing = false;
  private downloadStartTime = 0;
  private lastBytesLoaded = 0;
  private progressCallback: ((progress: WebLLMProgress) => void) | null = null;
  private stopCallback: (() => void) | null = null;
  private isGenerating = false;

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
  }

  private checkInitialCache() {
    const cached = this.getCachedModels();
    console.log('WebLLMService initialized. Found cached models:', cached);
    
    // Add test models if none exist (for debugging)
    if (cached.length === 0) {
      console.log('No cached models found. You can manually test by calling webllmService.addTestModel()');
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

  isModelCached(modelId: string): boolean {
    return this.getCachedModels().includes(modelId);
  }

  getCurrentModel(): string | null {
    return this.currentModel;
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
        text: `Loading cached model: ${percentage}%`
      });
    } else {
      const downloadInfo = this.calculateDownloadDetails(progress);
      this.progressCallback?.({
        progress: progress.progress,
        text: `Downloading: ${percentage}% (${downloadInfo.downloaded}MB / ${downloadInfo.total}MB)`,
        loaded: progress.loaded,
        total: progress.total
      });
    }
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
      this.downloadStartTime = Date.now();
      this.lastBytesLoaded = 0;

      await this.loadWebLLM();

      this.progressCallback?.({
        progress: 0,
        text: isModelCached ? 'Loading cached model...' : 'Starting download...'
      });

      this.engine = new this.webllm.MLCEngine();
      this.engine.setInitProgressCallback((progress: any) => {
        this.handleProgress(progress, isModelCached);
      });

      await this.engine.reload(modelId);

      this.currentModel = modelId;
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
    }
  }

  async *generateResponse(
    prompt: string, 
    config: WebLLMGenerationConfig = { temperature: 0.7, maxTokens: 512, topP: 0.9 }
  ): AsyncGenerator<string, void, unknown> {
    if (!this.engine || !this.currentModel) {
      throw new Error('No model loaded');
    }

    try {
      this.isGenerating = true;
      
      const asyncChunkGenerator = await this.engine.chat.completions.create({
        messages: [
          { role: "system", content: "You are a helpful AI assistant." },
          { role: "user", content: prompt }
        ],
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
