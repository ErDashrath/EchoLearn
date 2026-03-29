declare global {
  interface Window {
    __MINDSCRIBE_NATIVE_CPU_MODEL_MAP__?: unknown;
    __MINDSCRIBE_NATIVE_CPU_RUNTIME_URL__?: string;
    __MINDSCRIBE_NATIVE_CUDA_RUNTIME_URL__?: string;
  }
}

const MODEL_MAP_STORAGE_KEY = 'mindscribe.native.model.map';
const RUNTIME_PATH_STORAGE_KEY = 'mindscribe.native.runtime.path';

type ModelMap = Record<string, string>;

function sanitizeModelMap(input: unknown): ModelMap {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const entries = Object.entries(input as Record<string, unknown>);
  const result: ModelMap = {};

  for (const [key, value] of entries) {
    if (!key || typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    result[key] = trimmed;
  }

  return result;
}

class ModelVariantService {
  getNativeModelMap(): ModelMap {
    const fromWindow = sanitizeModelMap(window.__MINDSCRIBE_NATIVE_CPU_MODEL_MAP__);
    if (Object.keys(fromWindow).length > 0) {
      return fromWindow;
    }

    const stored = localStorage.getItem(MODEL_MAP_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    try {
      return sanitizeModelMap(JSON.parse(stored));
    } catch {
      return {};
    }
  }

  getNativeModelPath(modelId?: string | null): string | undefined {
    if (!modelId) {
      return undefined;
    }

    const map = this.getNativeModelMap();
    if (map[modelId]) {
      return map[modelId];
    }

    const loweredModelId = modelId.toLowerCase();
    for (const [key, value] of Object.entries(map)) {
      if (loweredModelId.includes(key.toLowerCase())) {
        return value;
      }
    }

    return undefined;
  }

  getAnyNativeModelPath(): string | undefined {
    const map = this.getNativeModelMap();
    for (const value of Object.values(map)) {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return undefined;
  }

  setNativeModelPath(modelId: string, modelPath: string): void {
    if (!modelId || !modelPath) {
      return;
    }

    const current = this.getNativeModelMap();
    current[modelId] = modelPath;
    localStorage.setItem(MODEL_MAP_STORAGE_KEY, JSON.stringify(current));
  }

  clearNativeModelMap(): void {
    localStorage.removeItem(MODEL_MAP_STORAGE_KEY);
  }

  getNativeRuntimePath(): string | undefined {
    const value = localStorage.getItem(RUNTIME_PATH_STORAGE_KEY);
    return value && value.trim() ? value.trim() : undefined;
  }

  setNativeRuntimePath(runtimePath: string): void {
    if (!runtimePath || !runtimePath.trim()) {
      return;
    }
    localStorage.setItem(RUNTIME_PATH_STORAGE_KEY, runtimePath.trim());
  }

  clearNativeRuntimePath(): void {
    localStorage.removeItem(RUNTIME_PATH_STORAGE_KEY);
  }

  clearNativePaths(): void {
    this.clearNativeModelMap();
    this.clearNativeRuntimePath();
  }

  getNativeRuntimeUrl(): string | undefined {
    const runtimeUrl = window.__MINDSCRIBE_NATIVE_CPU_RUNTIME_URL__;
    if (typeof runtimeUrl !== 'string') {
      return undefined;
    }

    const trimmed = runtimeUrl.trim();
    return trimmed || undefined;
  }

  getNativeCudaRuntimeUrl(): string | undefined {
    const runtimeUrl = window.__MINDSCRIBE_NATIVE_CUDA_RUNTIME_URL__;
    if (typeof runtimeUrl !== 'string') {
      return undefined;
    }

    const trimmed = runtimeUrl.trim();
    return trimmed || undefined;
  }

  getPreferredNativeRuntimeUrl(hasNvidiaGpu: boolean): string | undefined {
    if (hasNvidiaGpu) {
      return this.getNativeCudaRuntimeUrl() ?? this.getNativeRuntimeUrl();
    }

    return this.getNativeRuntimeUrl();
  }
}

export const modelVariantService = new ModelVariantService();
