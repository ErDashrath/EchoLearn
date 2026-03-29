import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface NativeCpuInferenceStatus {
  available: boolean;
  runtime: string;
  model?: string;
  runtimeSha256?: string;
  modelSha256?: string;
  reason: string;
}

export interface NativeCpuInferenceOptions {
  maxTokens?: number;
  temperature?: number;
}

interface NativeCpuStreamEventPayload {
  requestId: string;
  chunk: string;
  done: boolean;
  error?: string;
}

class NativeCpuInferenceService {
  private isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  async getStatus(): Promise<NativeCpuInferenceStatus> {
    if (!this.isTauriRuntime()) {
      return {
        available: false,
        runtime: '',
        reason: 'Native CPU inference requires desktop runtime (Tauri).',
      };
    }

    try {
      return await invoke<NativeCpuInferenceStatus>('native_inference_status');
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
}

export const nativeCpuInferenceService = new NativeCpuInferenceService();
