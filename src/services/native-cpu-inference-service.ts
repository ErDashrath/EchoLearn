import { invoke } from '@tauri-apps/api/core';

export interface NativeCpuInferenceStatus {
  available: boolean;
  runtime: string;
  model?: string;
  reason: string;
}

export interface NativeCpuInferenceOptions {
  maxTokens?: number;
  temperature?: number;
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
