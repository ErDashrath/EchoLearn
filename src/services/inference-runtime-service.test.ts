import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { InferenceRuntimeCapabilities } from '@/services/inference-runtime-service';

vi.mock('@/services/webllm-service', () => ({
  webllmService: {
    checkWebGPUSupport: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/services/native-cpu-inference-service', () => ({
  nativeCpuInferenceService: {
    getStatus: vi.fn().mockResolvedValue({
      available: false,
      runtime: '',
      model: '',
      selectedModelId: '',
      runtimeSha256: '',
      modelSha256: '',
      profile: 'balanced',
      effectiveThreads: 0,
      maxTokensCap: 0,
      reason: 'Native unavailable',
    }),
  },
}));

let inferenceRuntimeService: (typeof import('@/services/inference-runtime-service'))['inferenceRuntimeService'];

beforeAll(async () => {
  ({ inferenceRuntimeService } = await import('@/services/inference-runtime-service'));
});

function buildCapabilities(overrides: Partial<InferenceRuntimeCapabilities> = {}): InferenceRuntimeCapabilities {
  return {
    checkedAtIso: new Date().toISOString(),
    webgpu: {
      provider: 'webllm-webgpu',
      available: true,
    },
    nativeCpu: {
      provider: 'native-cpu',
      available: false,
      reason: 'Native unavailable',
    },
    nativeCpuStatus: {
      available: false,
      runtime: '',
      model: '',
      selectedModelId: '',
      runtimeSha256: '',
      modelSha256: '',
      profile: 'balanced',
      effectiveThreads: 0,
      maxTokensCap: 0,
      reason: 'Native unavailable',
    },
    recommendedProvider: 'webllm-webgpu',
    ...overrides,
  };
}

describe('inferenceRuntimeService', () => {
  it('prefers recommended provider in auto mode', () => {
    const capabilities = buildCapabilities({ recommendedProvider: 'native-cpu' });
    expect(inferenceRuntimeService.resolveProvider(capabilities, 'auto')).toBe('native-cpu');
  });

  it('returns null when explicit webgpu mode is unavailable', () => {
    const capabilities = buildCapabilities({
      webgpu: {
        provider: 'webllm-webgpu',
        available: false,
        reason: 'No adapter',
      },
      nativeCpu: {
        provider: 'native-cpu',
        available: true,
      },
      recommendedProvider: 'native-cpu',
    });

    expect(inferenceRuntimeService.resolveProvider(capabilities, 'webllm-webgpu')).toBeNull();
  });

  it('returns null when explicit native mode is unavailable', () => {
    const capabilities = buildCapabilities({
      webgpu: {
        provider: 'webllm-webgpu',
        available: true,
      },
      nativeCpu: {
        provider: 'native-cpu',
        available: false,
        reason: 'Runtime missing',
      },
      recommendedProvider: 'webllm-webgpu',
    });

    expect(inferenceRuntimeService.resolveProvider(capabilities, 'native-cpu')).toBeNull();
  });

  it('returns combined reason text in auto mode', () => {
    const capabilities = buildCapabilities({
      webgpu: {
        provider: 'webllm-webgpu',
        available: false,
        reason: 'No WebGPU adapter',
      },
      nativeCpu: {
        provider: 'native-cpu',
        available: false,
        reason: 'Native runtime missing',
      },
      recommendedProvider: null,
    });

    expect(inferenceRuntimeService.getUnavailableReason(capabilities, 'auto')).toContain('No WebGPU adapter');
    expect(inferenceRuntimeService.getUnavailableReason(capabilities, 'auto')).toContain('Native runtime missing');
  });
});
