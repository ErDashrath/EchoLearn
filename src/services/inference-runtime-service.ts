import { webllmService } from '@/services/webllm-service';
import { nativeCpuInferenceService } from '@/services/native-cpu-inference-service';

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
  private async detectNativeCpuCapability(): Promise<ProviderCapability> {
    const status = await nativeCpuInferenceService.getStatus();

    return {
      provider: 'native-cpu',
      available: status.available,
      reason: status.reason || undefined,
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
