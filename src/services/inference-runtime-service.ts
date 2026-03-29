import { webllmService } from '@/services/webllm-service';
import {
  nativeCpuInferenceService,
  type NativeCpuInferenceStatus,
} from '@/services/native-cpu-inference-service';

export type InferenceProviderId = 'webllm-webgpu' | 'native-cpu';
export type InferenceSelectionMode = 'auto' | InferenceProviderId;

const INFERENCE_SELECTION_MODE_KEY = 'mindscribe.inference.selection.mode';

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
  getSelectionMode(): InferenceSelectionMode {
    const value = localStorage.getItem(INFERENCE_SELECTION_MODE_KEY);
    if (value === 'webllm-webgpu' || value === 'native-cpu' || value === 'auto') {
      return value;
    }
    return 'auto';
  }

  setSelectionMode(mode: InferenceSelectionMode): void {
    localStorage.setItem(INFERENCE_SELECTION_MODE_KEY, mode);
  }

  resolveProvider(
    capabilities: InferenceRuntimeCapabilities,
    mode: InferenceSelectionMode,
  ): InferenceProviderId | null {
    if (mode === 'auto') {
      return capabilities.recommendedProvider;
    }

    if (mode === 'webllm-webgpu') {
      return capabilities.webgpu.available
        ? 'webllm-webgpu'
        : capabilities.recommendedProvider;
    }

    return capabilities.nativeCpu.available
      ? 'native-cpu'
      : capabilities.recommendedProvider;
  }

  getUnavailableReason(
    capabilities: InferenceRuntimeCapabilities,
    mode: InferenceSelectionMode,
  ): string {
    if (mode === 'webllm-webgpu') {
      return capabilities.webgpu.reason || 'WebGPU provider is unavailable.';
    }

    if (mode === 'native-cpu') {
      return capabilities.nativeCpu.reason || 'Native CPU provider is unavailable.';
    }

    return [capabilities.webgpu.reason, capabilities.nativeCpu.reason]
      .filter((reason): reason is string => !!reason)
      .join(' ');
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

  private async getNativeCpuStatus(
    modelId?: string,
    modelPath?: string,
    runtimePath?: string,
  ): Promise<NativeCpuInferenceStatus> {
    return nativeCpuInferenceService.getStatus(modelId, modelPath, runtimePath);
  }

  private getNativeCpuCapability(status: NativeCpuInferenceStatus): ProviderCapability {
    return {
      provider: 'native-cpu',
      available: status.available,
      reason: status.reason || undefined,
    };
  }

  async getCapabilities(
    modelId?: string,
    modelPath?: string,
    runtimePath?: string,
  ): Promise<InferenceRuntimeCapabilities> {
    const [webgpu, nativeCpuStatus] = await Promise.all([
      this.detectWebGpuCapability(),
      this.getNativeCpuStatus(modelId, modelPath, runtimePath),
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
