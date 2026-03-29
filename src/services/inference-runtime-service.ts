import { webllmService } from '@/services/webllm-service';
import {
  nativeCpuInferenceService,
  type NativeCpuInferenceStatus,
} from '@/services/native-cpu-inference-service';

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
  nativeCpuStatus: NativeCpuInferenceStatus;
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

  private async getNativeCpuStatus(): Promise<NativeCpuInferenceStatus> {
    return nativeCpuInferenceService.getStatus();
  }

  private getNativeCpuCapability(status: NativeCpuInferenceStatus): ProviderCapability {
    return {
      provider: 'native-cpu',
      available: status.available,
      reason: status.reason || undefined,
    };
  }

  async getCapabilities(): Promise<InferenceRuntimeCapabilities> {
    const [webgpu, nativeCpuStatus] = await Promise.all([
      this.detectWebGpuCapability(),
      this.getNativeCpuStatus(),
    ]);
    const nativeCpu = this.getNativeCpuCapability(nativeCpuStatus);

    const recommendedProvider = webgpu.available
      ? 'webllm-webgpu'
      : nativeCpu.available
        ? 'native-cpu'
        : null;

    return {
      checkedAtIso: new Date().toISOString(),
      webgpu,
      nativeCpu,
      nativeCpuStatus,
      recommendedProvider,
    };
  }
}

export const inferenceRuntimeService = new InferenceRuntimeService();
