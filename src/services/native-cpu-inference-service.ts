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
  systemPrompt?: string;
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

export interface NativeCpuDownloadsClearResult {
  modelsCleared: boolean;
  runtimeCleared: boolean;
}

class NativeCpuInferenceService {
  private static readonly STREAM_IDLE_TIMEOUT_MS = 3000;
  private static readonly STREAM_START_TIMEOUT_LIMIT = 4;

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((resolve) => {
          timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

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
      return await this.withTimeout(
        invoke<NativeCpuInferenceStatus>('native_inference_status', {
          modelId,
          modelPath,
          runtimePath,
        }),
        2500,
        {
          available: false,
          runtime: '',
          reason: 'Native CPU status check timed out.',
        },
      );
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
      systemPrompt: options.systemPrompt,
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
    let sawAnyChunk = false;
    let streamStartTimeouts = 0;

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
          sawAnyChunk = true;
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
        systemPrompt: options.systemPrompt,
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

        const idleTimedOut = await new Promise<boolean>((resolve) => {
          let settled = false;
          const timeoutId = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            wake = null;
            resolve(true);
          }, NativeCpuInferenceService.STREAM_IDLE_TIMEOUT_MS);

          wake = () => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timeoutId);
            wake = null;
            resolve(false);
          };
        });

        if (idleTimedOut && !done && queue.length === 0) {
          if (sawAnyChunk) {
            done = true;
            await this.stop();
            break;
          }

          streamStartTimeouts += 1;
          if (streamStartTimeouts >= NativeCpuInferenceService.STREAM_START_TIMEOUT_LIMIT) {
            throw new Error('Native CPU generation timed out before response started.');
          }
        }
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

  async hasNvidiaGpu(): Promise<boolean> {
    if (!this.isTauriRuntime()) {
      return false;
    }

    try {
      return await this.withTimeout(
        invoke<boolean>('native_inference_has_nvidia_gpu'),
        1500,
        false,
      );
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

  async clearDownloads(clearRuntime = true, clearModels = true): Promise<NativeCpuDownloadsClearResult | null> {
    if (!this.isTauriRuntime()) {
      return null;
    }

    return this.withTimeout(
      invoke<NativeCpuDownloadsClearResult>('native_inference_clear_downloads', {
        clearRuntime,
        clearModels,
      }),
      4000,
      {
        modelsCleared: false,
        runtimeCleared: false,
      },
    );
  }
}

export const nativeCpuInferenceService = new NativeCpuInferenceService();
