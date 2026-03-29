import { webllmService } from '@/services/webllm-service';

export type InferenceProviderId = 'webllm-webgpu' | 'native-cpu';

export interface ProviderCapability {
  provider: InferenceProviderId;
  available: boolean;
  reason?: string;
}

export interface InferenceRuntimeCapabilities {
  checkedAtIso: string;
  webgpu: ProviderCapability;
  nativeCpu: ProviderCapability;
  recommendedProvider: InferenceProviderId | null;
}

class InferenceRuntimeService {
  private isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  private async detectWebGpuCapability(): Promise<ProviderCapability> {
    const supported = await webllmService.checkWebGPUSupport();
    if (supported) {
      return { provider: 'webllm-webgpu', available: true };
    }

    return {
      provider: 'webllm-webgpu',
      available: false,
      reason: 'WebGPU adapter is unavailable on this device/runtime.',
    };
  }

  // Phase 1 scaffold: native CPU runtime is not yet wired.
  // This placeholder keeps routing deterministic while backend commands are implemented.
  private async detectNativeCpuCapability(): Promise<ProviderCapability> {
    if (!this.isTauriRuntime()) {
      return {
        provider: 'native-cpu',
        available: false,
        reason: 'Native CPU inference requires desktop runtime (Tauri).',
      };
    }

    return {
      provider: 'native-cpu',
      available: false,
      reason: 'Native CPU provider is not wired yet (Phase 3 integration pending).',
    };
  }

  async getCapabilities(): Promise<InferenceRuntimeCapabilities> {
    const [webgpu, nativeCpu] = await Promise.all([
      this.detectWebGpuCapability(),
      this.detectNativeCpuCapability(),
    ]);

    const recommendedProvider = webgpu.available
      ? 'webllm-webgpu'
      : nativeCpu.available
        ? 'native-cpu'
        : null;

    return {
      checkedAtIso: new Date().toISOString(),
      webgpu,
      nativeCpu,
      recommendedProvider,
    };
  }
}

export const inferenceRuntimeService = new InferenceRuntimeService();
