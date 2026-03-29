declare global {
  interface Window {
    __MINDSCRIBE_NATIVE_CPU_MODEL_MAP__?: unknown;
    __MINDSCRIBE_NATIVE_CPU_RUNTIME_URL__?: string;
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

  setNativeModelPath(modelId: string, modelPath: string): void {
    if (!modelId || !modelPath) {
      return;
    }

    const current = this.getNativeModelMap();
    current[modelId] = modelPath;
    localStorage.setItem(MODEL_MAP_STORAGE_KEY, JSON.stringify(current));
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

  getNativeRuntimeUrl(): string | undefined {
    const runtimeUrl = window.__MINDSCRIBE_NATIVE_CPU_RUNTIME_URL__;
    if (typeof runtimeUrl !== 'string') {
      return undefined;
    }

    const trimmed = runtimeUrl.trim();
    return trimmed || undefined;
  }
}

export const modelVariantService = new ModelVariantService();
