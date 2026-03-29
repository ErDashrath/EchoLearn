import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface NativeCpuInferenceStatus {
  available: boolean;
  runtime: string;
  model?: string;
  selectedModelId?: string;
  runtimeSha256?: string;
  modelSha256?: string;
  profile?: string;
  effectiveThreads?: number;
  maxTokensCap?: number;
  reason: string;
}

export interface NativeCpuInferenceOptions {
  modelId?: string;
  modelPath?: string;
  runtimePath?: string;
  maxTokens?: number;
  temperature?: number;
}

interface NativeCpuStreamEventPayload {
  requestId: string;
  chunk: string;
  done: boolean;
  error?: string;
}

export interface NativeCpuModelDownloadResult {
  modelId: string;
  modelPath: string;
  sha256: string;
  sizeBytes: number;
}

export interface NativeCpuRuntimeDownloadResult {
  runtimePath: string;
  sha256: string;
  sizeBytes: number;
}

class NativeCpuInferenceService {
  private isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  async getStatus(modelId?: string, modelPath?: string, runtimePath?: string): Promise<NativeCpuInferenceStatus> {
    if (!this.isTauriRuntime()) {
      return {
        available: false,
        runtime: '',
        reason: 'Native CPU inference requires desktop runtime (Tauri).',
      };
    }

    try {
      return await invoke<NativeCpuInferenceStatus>('native_inference_status', {
        modelId,
        modelPath,
        runtimePath,
      });
    } catch (error) {
      return {
        available: false,
        runtime: '',
        reason: `Failed to query native CPU status: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async generate(prompt: string, options: NativeCpuInferenceOptions = {}): Promise<string> {
    if (!this.isTauriRuntime()) {
      throw new Error('Native CPU inference requires desktop runtime (Tauri).');
    }

    return invoke<string>('native_inference_generate', {
      prompt,
      modelId: options.modelId,
      modelPath: options.modelPath,
      runtimePath: options.runtimePath,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }

  async *generateStream(
    prompt: string,
    options: NativeCpuInferenceOptions = {},
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isTauriRuntime()) {
      throw new Error('Native CPU inference requires desktop runtime (Tauri).');
    }

    const requestId = `native-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const queue: string[] = [];
    let done = false;
    let streamError: Error | null = null;
    let wake: (() => void) | null = null;

    const notify = () => {
      if (wake) {
        const resolver = wake;
        wake = null;
        resolver();
      }
    };

    const unlisten = await listen<NativeCpuStreamEventPayload>(
      'native-inference-stream',
      (event) => {
        const payload = event.payload;
        if (!payload || payload.requestId !== requestId) {
          return;
        }

        if (payload.chunk) {
          queue.push(payload.chunk);
        }

        if (payload.error) {
          streamError = new Error(payload.error);
          done = true;
        } else if (payload.done) {
          done = true;
        }

        notify();
      },
    );

    try {
      await invoke<boolean>('native_inference_generate_stream', {
        requestId,
        prompt,
        modelId: options.modelId,
        modelPath: options.modelPath,
        runtimePath: options.runtimePath,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });

      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift() as string;
          continue;
        }

        if (streamError) {
          throw streamError;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }

      if (streamError) {
        throw streamError;
      }
    } finally {
      await unlisten();
    }
  }

  async stop(): Promise<boolean> {
    if (!this.isTauriRuntime()) {
      return false;
    }

    try {
      return await invoke<boolean>('native_inference_stop');
    } catch {
      return false;
    }
  }

  async downloadModelFromUrl(modelId: string, hfUrl: string): Promise<NativeCpuModelDownloadResult | null> {
    if (!this.isTauriRuntime()) {
      return null;
    }

    return invoke<NativeCpuModelDownloadResult>('native_inference_download_model', {
      modelId,
      hfUrl,
    });
  }

  async downloadRuntimeFromUrl(runtimeUrl: string): Promise<NativeCpuRuntimeDownloadResult | null> {
    if (!this.isTauriRuntime()) {
      return null;
    }

    return invoke<NativeCpuRuntimeDownloadResult>('native_inference_download_runtime', {
      runtimeUrl,
    });
  }
}

export const nativeCpuInferenceService = new NativeCpuInferenceService();
